import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { paintViews } from './gemini.js';
import { classifyConstruction, loadRegistry, matchStyle, resolveStyle } from './construction_classifier.js';
import { validateAndExport } from './svg_export.js';
import { buildManifest } from './manifest.js';
import sharp from 'sharp';

let PY = process.env.PYTHON_BIN || 'python3';
if (PY.includes('/') || PY.includes('\\')) PY = path.resolve(process.cwd(), PY);
const PY_DIR = path.join(process.cwd(), 'py');

// Exactly what Gemini handed back, untouched, in one predictable place. The
// work directory keeps its own copy, but it is buried among the cut-outs and
// masks -- this is the folder to open when you just want to see what came back.
const GEMINI_IMAGES = path.join(process.cwd(), 'gemini_images');

export const jobs = new Map();

export function createJob() {
  const id = randomUUID().slice(0, 8);
  const job = {
    id,
    status: 'queued',       // queued | running | done | failed
    stage: null,            // prep | render | views | bake
    log: [],
    stats: {},              // iou per view, coverage, palette, islands
    files: {},              // label -> absolute path
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function logger(job) {
  return (line) => {
    job.log.push(line);
    if (job.log.length > 800) job.log.shift();
  };
}

function run(cmd, args, { cwd, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = '';
    let stderr = '';
    const pump = (buf, sink) => {
      const text = buf.toString();
      sink(text);
      text.split('\n').filter(Boolean).forEach(onLine);
    };
    child.stdout.on('data', (b) => pump(b, (t) => { stdout += t; }));
    child.stderr.on('data', (b) => pump(b, (t) => { stderr += t; }));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim().split('\n').slice(-4).join('\n') || `exit ${code}`));
    });
  });
}

/**
 * Pull the numbers that decide whether the bake is trustworthy out of
 * retexture.py's stdout. These are the diagnostics, not decoration -- a low IoU
 * means the geometry never aligned and everything downstream is landing in the
 * wrong place.
 */
function parseDiagnostics(stdout) {
  const stats = { views: [], palette: [], warnings: [] };
  let pending = null;

  for (const line of stdout.split('\n')) {
    let m;
    if ((m = line.match(/^\s{2}(\w+):\s+(.+?)\s+(\d+)x(\d+)\s*$/))) {
      pending = { view: m[1], file: m[2] };
    } else if ((m = line.match(/silhouette IoU\s+([\d.]+)/))) {
      stats.views.push({
        ...(pending ?? { view: '?' }),
        iou: parseFloat(m[1]),
        locked: /camera locked/.test(line),
      });
      pending = null;
    } else if ((m = line.match(/coverage:\s+([\d.]+)%/))) {
      stats.coverage = parseFloat(m[1]);
    } else if ((m = line.match(/^mesh (\S+): (\d+) tris, (\d+) verts/))) {
      stats.mesh = { name: m[1], tris: +m[2], verts: +m[3] };
    } else if ((m = line.match(/^UV islands:\s+(\d+)/))) {
      stats.islands = +m[1];
    } else if ((m = line.match(/^atlas (\d+)x(\d+)/))) {
      stats.atlas = `${m[1]}x${m[2]}`;
    } else if ((m = line.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)\s+([\d.]+)%/))) {
      stats.palette.push({ rgb: [+m[1], +m[2], +m[3]], share: parseFloat(m[4]) });
    } else if ((m = line.match(/island\s+(\d+):.*->\s+keeps pixels/))) {
      (stats.keepIslands ??= []).push(+m[1]);
    } else if (line.includes('WARNING')) {
      stats.warnings.push(line.trim());
    }
  }

  const worst = stats.views.length ? Math.min(...stats.views.map((v) => v.iou)) : null;
  stats.verdict =
    worst === null ? 'unknown'
      : worst >= 0.85 ? 'good'
      : worst >= 0.75 ? 'usable'
      : 'poor';
  return stats;
}

export async function runPipeline(job, opts) {
  const {
    workDir, glbPath, referencePath, manualViews, mode, useGemini, geminiViews,
    tier, size, colors, keep, backText, sleeveMarks, viewIslandMap,
  } = opts;
  const log = logger(job);
  job.status = 'running';

  try {
    if (mode === 'augusta') {
      // ======================================================================
      // Augusta pipeline: image → classify → match → prep → synth → bake
      //                   → vectorize → validate SVG → manifest
      // ======================================================================

      // -- Step 1: Classify garment construction from the reference image ----
      job.stage = 'classifying';
      log('Step 1/9: Classifying garment construction...');
      let classification;
      try {
        classification = await classifyConstruction({
          apiKey: process.env.GEMINI_API_KEY,
          imagePath: referencePath,
        });
        log(`  Sport: ${classification.sport}`);
        log(`  Neckline: ${classification.neckline}`);
        log(`  Sleeves: ${classification.sleeves}`);
        log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
        log(`  Evidence: ${(classification.evidence || []).join('; ')}`);
      } catch (err) {
        throw new Error(`Construction classification failed: ${err.message}`);
      }

      // -- Step 2: Match to a style in the registry -------------------------
      job.stage = 'resolving';
      log('Step 2/9: Matching to Augusta style catalog...');
      const registry = await loadRegistry();
      const matchResult = matchStyle(classification, registry);

      if (matchResult.confidence === 'rejected') {
        throw new Error(
          `No matching style found. Classification: ${classification.sport} / ${classification.neckline} / ${classification.sleeves}. `
          + `Best candidate scored ${(matchResult.score * 100).toFixed(0)}%.`
        );
      }

      log(`  Matched: ${matchResult.matched} — ${matchResult.matchedName}`);
      log(`  Confidence: ${matchResult.confidence} (${(matchResult.score * 100).toFixed(0)}%)`);
      if (matchResult.confidence === 'needs_review') {
        log('  ⚠ Low confidence — would normally require human review');
      }
      for (const m of matchResult.evidence.matches) log(`    ✓ ${m}`);
      for (const m of matchResult.evidence.mismatches) log(`    ✗ ${m}`);

      job.stats.classification = classification;
      job.stats.matchResult = matchResult;

      // -- Step 3: Resolve the model from the registry ----------------------
      const style = resolveStyle(matchResult.matched, registry);
      if (!style?.model?.glb) {
        throw new Error(`Style ${matchResult.matched} has no GLB model configured`);
      }

      // Use the registry model instead of the user-uploaded GLB
      const registryGlb = path.resolve(process.cwd(), style.model.glb);
      try {
        await fs.access(registryGlb);
      } catch {
        throw new Error(`Registry model not found: ${registryGlb}`);
      }
      const modelGlb = registryGlb;
      log(`  Model: ${style.model.glb} (mesh: ${style.model.mesh}, material: ${style.model.material})`);

      // -- Step 4: Prep — background removal on all supplied views ----------
      job.stage = 'prepping';
      log('Step 3/9: Preparing reference views...');
      const cutPath = path.join(workDir, 'front.png');
      const { stdout: prepOut } = await run(
        PY, [path.join(PY_DIR, 'prep.py'), '--in', referencePath, '--out', cutPath],
        { cwd: workDir, onLine: () => {} },
      );
      const prep = JSON.parse(prepOut.trim().split('\n').pop());
      if (!prep.ok) throw new Error(prep.error);
      log(`  Front: cut via ${prep.method}, ${(prep.foreground * 100).toFixed(0)}% coverage`);
      job.files.reference = cutPath;

      const suppliedViews = { front: { path: cutPath, originalName: path.basename(referencePath) } };
      const views = [];

      // Prep manual back/side views
      for (const [vName, vPath] of Object.entries(manualViews || {})) {
        log(`  Preparing manual ${vName} view...`);
        const vCutPath = path.join(workDir, `${vName}.png`);
        const { stdout: vPrepOut } = await run(
          PY, [path.join(PY_DIR, 'prep.py'), '--in', vPath, '--out', vCutPath],
          { cwd: workDir, onLine: () => {} },
        );
        const vPrep = JSON.parse(vPrepOut.trim().split('\n').pop());
        if (!vPrep.ok) throw new Error(vPrep.error);
        log(`  ${vName}: cut via ${vPrep.method}`);
        job.files[vName] = vCutPath;
        // Use the supplied view's own label (back/left/right) rather than
        // "auto" -- "auto" tells retexture.py to run pick_axis and search
        // every camera direction for whichever silhouette fits best, which
        // for a garment is dominated by the front/back outline being nearly
        // identical. That let a back photo win the *front* axis and get
        // baked onto the front-facing texels, leaving the true back UV
        // island with zero coverage (hence the flat fallback colour). The
        // customer already told us which view this is; use it.
        views.push(`${vName}:${vCutPath}`);
        suppliedViews[vName] = { path: vCutPath, originalName: path.basename(vPath) };
      }

      // -- Step 5: Synthesize missing views with Gemini ---------------------
      const generatedViews = {};
      const neededGeminiViews = (geminiViews || ['back', 'left']).filter(v => !(manualViews || {})[v]);

      if (useGemini && neededGeminiViews.length) {
        job.stage = 'synthesizing';
        log(`Step 4/9: Synthesizing ${neededGeminiViews.join(', ')} views...`);

        // Render the model to get silhouettes for Gemini to paint onto
        const need = ['front', ...neededGeminiViews];
        const { stdout: renderOut } = await run(
          PY, [path.join(PY_DIR, 'render_views.py'), '--glb', modelGlb,
               '--out-dir', workDir, '--views', need.join(',')],
          { cwd: workDir, onLine: () => {} },
        );
        const rendered = JSON.parse(renderOut.trim().split('\n').pop());
        if (!rendered.ok) throw new Error(rendered.error);

        const camsPath = path.join(workDir, 'cams.json');
        const cams = JSON.parse(await fs.readFile(camsPath, 'utf8'));

        // Paint the reference design onto the rendered silhouettes
        const renders = Object.fromEntries(
          rendered.views.map((v) => [v, path.join(workDir, cams.views[v].render)]));
        const painted = await paintViews({
          apiKey: process.env.GEMINI_API_KEY,
          referencePath: cutPath,
          renders, tier, backText, sleeveMarks, log,
        });

        const geminiDir = path.join(GEMINI_IMAGES, job.id);
        await fs.mkdir(geminiDir, { recursive: true });

        for (const [view, png] of Object.entries(painted)) {
          const raw = path.join(workDir, `${view}.raw.png`);
          await fs.writeFile(raw, png);
          await fs.writeFile(path.join(geminiDir, `${view}.png`), png);

          const full = path.join(workDir, `${view}.full.png`);
          const clean = path.join(workDir, `${view}.painted.png`);
          try {
            await run(PY, [path.join(PY_DIR, 'prep.py'), '--in', raw,
                           '--out', clean, '--full', full],
              { cwd: workDir, onLine: () => {} });
            cams.views[view].painted = path.basename(full);
            views.push(`${view}:${full}`);
            job.files[view] = clean;
            generatedViews[view] = {
              path: clean,
              provenance: 'synthesized',
              model: tier === 'quality' ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image',
            };
            log(`  ${view}: synthesized ✓ (provenance: AI-generated, requires approval)`);
          } catch (e) {
            log(`  ${view}: synthesis failed — ${e.message}`);
          }
        }
        await fs.writeFile(camsPath, JSON.stringify(cams, null, 2));
      } else {
        log('Step 4/9: Skipping view synthesis (all views supplied or Gemini disabled)');
      }

      // Ensure front is always in the view list. cutPath is the customer's
      // own front reference photo, so label it 'front' rather than 'auto' --
      // 'auto' triggers an axis search that can lose a close silhouette tie
      // to another axis (see the manual back/left/right fix above).
      if (!views.some((v) => v.startsWith('front:'))) {
        views.unshift(`front:${cutPath}`);
      }

      // -- Step 6: Bake views into UV atlas ---------------------------------
      job.stage = 'baking';
      log(`Step 5/9: Baking ${views.length} view(s) into UV atlas...`);
      const outGlb = path.join(workDir, 'retextured.glb');
      const bakeArgs = [
        path.join(PY_DIR, 'retexture.py'),
        '--glb', modelGlb,
        '--out', outGlb,
        '--size', String(size),
        '--colors', String(colors),
        '--preview',
      ];
      const camsPath2 = path.join(workDir, 'cams.json');
      if (await fs.stat(camsPath2).catch(() => null)) {
        bakeArgs.push('--cams', camsPath2);
      }
      if (keep && keep !== 'auto') bakeArgs.push('--keep', keep);
      for (const v of views) bakeArgs.push('--view', v);

      const { stdout: bakeStdout } = await run(PY, bakeArgs, { cwd: workDir, onLine: log });
      job.stats = { ...job.stats, ...parseDiagnostics(bakeStdout) };

      const atlasPath = path.join(workDir, 'retextured.png');
      job.files.glb = outGlb;
      job.files.atlas = atlasPath;

      // -- Step 7: Vectorize the baked atlas into Illustrator SVG -----------
      job.stage = 'vectorizing';
      log('Step 6/9: Vectorizing atlas into editable SVG...');
      const svgPath = path.join(workDir, 'uv-placement.svg');
      const vecJsonPath = path.join(workDir, 'vectorize-output.json');
      await run(PY, [
        path.join(PY_DIR, 'vectorize_atlas.py'),
        '--atlas', atlasPath,
        '--glb', modelGlb,
        '--out', svgPath,
        '--json', vecJsonPath,
        '--style', matchResult.matched,
        '--design', job.id,
        '--colors', String(colors),
      ], { cwd: workDir, onLine: log });

      job.files.svg = svgPath;

      // -- Step 8: Validate SVG for Illustrator safety ----------------------
      job.stage = 'exporting';
      log('Step 7/9: Validating SVG for Illustrator compatibility...');
      const validatedSvgPath = path.join(workDir, 'uv-placement-validated.svg');
      const svgValidation = await validateAndExport({
        svgPath,
        outputPath: validatedSvgPath,
        profile: 'illustrator-compatible',
        log,
      });

      if (svgValidation.valid) {
        log('  SVG validation: PASSED ✓');
        log(`  ${svgValidation.stats.paths} paths, ${svgValidation.stats.textNodes} text nodes`);
        job.files.svg = validatedSvgPath;
      } else {
        log('  SVG validation: FAILED');
        for (const err of svgValidation.errors) log(`    ✗ ${err}`);
        log('  Using unvalidated SVG (review required)');
      }

      // -- Step 9: Build manifest with full provenance ---------------------
      job.stage = 'manifesting';
      log('Step 8/9: Building provenance manifest...');
      const { manifest, path: manifestPath } = await buildManifest({
        jobId: job.id,
        workDir,
        classification,
        matchResult,
        style,
        sourceAssets: suppliedViews,
        generatedViews,
        artifacts: {
          atlas: atlasPath,
          glb: outGlb,
          svg: job.files.svg,
        },
        svgValidation,
        log,
      });

      job.files.manifest = manifestPath;

      // -- Done -------------------------------------------------------------
      job.status = 'done';
      job.stage = null;
      log('Step 9/9: Complete!');
      log(`  Style: ${matchResult.matched} — ${matchResult.matchedName}`);
      log(`  Artifacts: GLB, atlas, SVG (${svgValidation.valid ? 'validated' : 'needs review'}), manifest`);
      log(`  Sizes: ${style.sizes.join(', ')} (all BLOCKED pending graded templates)`);
      return;
    }

    // ---- 1. clean the reference -------------------------------------------
    job.stage = 'prep';
    log('Cutting the garment out of the reference');
    const cutPath = path.join(workDir, 'front.png');
    const { stdout: prepOut } = await run(
      PY, [path.join(PY_DIR, 'prep.py'), '--in', referencePath, '--out', cutPath],
      { cwd: workDir, onLine: () => {} },
    );
    const prep = JSON.parse(prepOut.trim().split('\n').pop());
    if (!prep.ok) throw new Error(prep.error);
    log(`  cut via ${prep.method}, garment fills ${(prep.foreground * 100).toFixed(0)}% of frame`);
    log(`  reference is now ${prep.width}x${prep.height}`);
    job.files.reference = cutPath;

    const views = [];
    let camsPath = null;

    // Prep manual views
    for (const [vName, vPath] of Object.entries(manualViews || {})) {
      log(`Cutting the garment out of the manual ${vName} view`);
      const vCutPath = path.join(workDir, `${vName}.png`);
      const { stdout: vPrepOut } = await run(
        PY, [path.join(PY_DIR, 'prep.py'), '--in', vPath, '--out', vCutPath],
        { cwd: workDir, onLine: () => {} },
      );
      const vPrep = JSON.parse(vPrepOut.trim().split('\n').pop());
      if (!vPrep.ok) throw new Error(vPrep.error);
      log(`  cut manual ${vName} via ${vPrep.method}`);
      job.files[vName] = vCutPath;
      // Use the supplied view's own label (back/left/right), not "auto" --
      // see the matching comment in the augusta branch above for why "auto"
      // silently mis-routes a manual back/side photo onto the front axis.
      views.push(`${vName}:${vCutPath}`);
    }

    const neededGeminiViews = geminiViews.filter(v => !(manualViews || {})[v]);

    if (useGemini && neededGeminiViews.length) {
      // ---- 2. photograph the model itself ---------------------------------
      // The model, not the reference, decides the garment's shape. Rendering
      // first is what lets a reference of a different cut still be usable:
      // Gemini paints onto our silhouette instead of inventing its own.
      job.stage = 'render';
      const need = mode === 'transfer' ? ['front', ...neededGeminiViews] : neededGeminiViews;
      log(`Rendering the model from ${need.join(', ')}`);
      const { stdout: renderOut } = await run(
        PY, [path.join(PY_DIR, 'render_views.py'), '--glb', glbPath,
             '--out-dir', workDir, '--views', need.join(',')],
        { cwd: workDir, onLine: () => {} },
      );
      const rendered = JSON.parse(renderOut.trim().split('\n').pop());
      if (!rendered.ok) throw new Error(rendered.error);
      log(`  ${rendered.views.length} views at ${rendered.res}px off mesh `
        + `${rendered.mesh} (${rendered.tris.toLocaleString()} tris)`);

      camsPath = path.join(workDir, 'cams.json');
      const cams = JSON.parse(await fs.readFile(camsPath, 'utf8'));
      for (const v of rendered.views) {
        job.files[`render-${v}`] = path.join(workDir, cams.views[v].render);
      }

      // ---- 3. paint the design onto those renders --------------------------
      job.stage = 'views';
      log(`Painting the reference design onto ${rendered.views.length} render`
        + `${rendered.views.length > 1 ? 's' : ''}`);
      const renders = Object.fromEntries(
        rendered.views.map((v) => [v, path.join(workDir, cams.views[v].render)]));
      const painted = await paintViews({
        apiKey: process.env.GEMINI_API_KEY,
        referencePath: cutPath,
        renders, tier, backText, sleeveMarks, log,
      });

      // One folder per job so successive runs do not overwrite each other.
      const geminiDir = path.join(GEMINI_IMAGES, job.id);
      await fs.mkdir(geminiDir, { recursive: true });

      for (const [view, png] of Object.entries(painted)) {
        const raw = path.join(workDir, `${view}.raw.png`);
        await fs.writeFile(raw, png);
        // Written before the cut-out runs, so a view that later fails to be
        // cut out is still there to look at.
        await fs.writeFile(path.join(geminiDir, `${view}.png`), png);
        // The render it was painted over, so the pair can be compared directly.
        await fs.copyFile(path.join(workDir, cams.views[view].render),
                          path.join(geminiDir, `${view}.render.png`));
        // Painted views come back on "white" that is rarely pure, so the mask
        // has to be an alpha channel rather than a brightness guess. --full
        // keeps a copy at the original framing: cropping to the garment would
        // destroy the registration against the render that makes the lock work.
        const full = path.join(workDir, `${view}.full.png`);
        const clean = path.join(workDir, `${view}.painted.png`);
        try {
          await run(PY, [path.join(PY_DIR, 'prep.py'), '--in', raw,
                         '--out', clean, '--full', full],
            { cwd: workDir, onLine: () => {} });
          cams.views[view].painted = path.basename(full);
          views.push(`${view}:${full}`);
          job.files[view] = clean;
        } catch (e) {
          log(`  ${view} view discarded, could not be cut out: ${e.message}`);
        }
      }
      const missingGeneratedViews = neededGeminiViews.filter((view) => !views.some((entry) => entry.startsWith(`${view}:`)));
      if (missingGeneratedViews.length) {
        throw new Error(`Required generated view(s) unavailable: ${missingGeneratedViews.join(", ")}. The preview was stopped to avoid showing a partial mockup.`);
      }
      await fs.writeFile(camsPath, JSON.stringify(cams, null, 2));
      log(`  Gemini's images saved to gemini_images/${job.id}/`);
    }

    // In transfer mode the reference is design-only and never projected -- but
    // if painting the front failed there is nothing else to carry it, so fall
    // back to fitting the real photograph rather than losing the front panel.
    // cutPath is known to be the front reference photo, so label it 'front'
    // rather than 'auto' (see the manual back/left/right fix above for why
    // 'auto' is unsafe here -- a close silhouette tie can route it onto the
    // wrong axis instead of using the axis we already know is correct).
    if (!views.some((v) => v.startsWith('front:'))) {
      views.unshift(`front:${cutPath}`);
      if (mode === 'transfer' && useGemini) {
        log('  front was not painted; fitting the reference photo directly instead');
      }
    }

    // ---- 4. bake -----------------------------------------------------------
    job.stage = 'bake';
    log(`Baking ${views.length} view${views.length > 1 ? 's' : ''} into the atlas`);
    const outGlb = path.join(workDir, 'retextured.glb');
    const args = [
      path.join(PY_DIR, 'retexture.py'),
      '--glb', glbPath,
      '--out', outGlb,
      '--size', String(size),
      '--colors', String(colors),
      '--preview',
    ];
    if (camsPath) args.push('--cams', camsPath);
    for (const [view, islands] of Object.entries(viewIslandMap || {})) {
      if (Array.isArray(islands) && islands.length) args.push('--view-islands', view + ':' + islands.join(','));
    }
    if (keep && keep !== 'auto') args.push('--keep', keep);
    for (const v of views) args.push('--view', v);

    const { stdout } = await run(PY, args, { cwd: workDir, onLine: log });
    job.stats = parseDiagnostics(stdout);

    job.files.glb = outGlb;
    job.files.atlas = path.join(workDir, 'retextured.png');
    job.files.preview = path.join(workDir, 'retextured.preview.png');
    for (const [k, p] of Object.entries(job.files)) {
      if (!(await fs.stat(p).catch(() => null))) delete job.files[k];
    }

    job.status = 'done';
    job.stage = null;
    log('Done');
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    log(`FAILED: ${err.message}`);
  }
}
