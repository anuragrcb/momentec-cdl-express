import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJob, jobs, runPipeline } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORK_ROOT = path.join(__dirname, 'work');
const PORT = process.env.PORT || 3000;

await fs.mkdir(WORK_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, req.workDir),
    filename: (req, file, cb) => cb(null, file.fieldname + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 120 * 1024 * 1024 },
});

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// The work directory has to exist before multer writes into it, so the job is
// created on the way in rather than after the upload lands.
app.use('/api/jobs', async (req, res, next) => {
  if (req.method !== 'POST') return next();
  req.job = createJob();
  req.workDir = path.join(WORK_ROOT, req.job.id);
  await fs.mkdir(req.workDir, { recursive: true });
  next();
});

app.post('/api/jobs',
  upload.fields([
    { name: 'glb', maxCount: 1 },
    { name: 'reference', maxCount: 1 },
    { name: 'backImg', maxCount: 1 },
    { name: 'leftImg', maxCount: 1 },
    { name: 'rightImg', maxCount: 1 }
  ]),
  async (req, res) => {
    const glb = req.files?.glb?.[0];
    const reference = req.files?.reference?.[0];
    if (!glb || !reference) {
      return res.status(400).json({ error: 'Upload both a .glb model and a reference image.' });
    }
    if (!/\.(glb|gltf)$/i.test(glb.originalname)) {
      return res.status(400).json({ error: 'The model must be a .glb or .gltf file.' });
    }

    const wantsGemini = req.body.gemini === 'true';
    if (wantsGemini && !process.env.GEMINI_API_KEY) {
      return res.status(400).json({
        error: 'Generated views need GEMINI_API_KEY in your .env file. Turn them off to bake the front view alone.',
      });
    }

    // Transfer mode never projects the reference, so without generated views
    // there would be nothing to bake at all.
    const mode = ['transfer', 'augusta'].includes(req.body.mode) ? req.body.mode : 'match';
    if (mode === 'transfer' && !wantsGemini) {
      return res.status(400).json({
        error: 'Transferring a design onto the model requires generated views — '
             + 'that is what redraws the design at the model\'s shape. Switch to '
             + '"Match this garment" to project the reference directly.',
      });
    }

    const manualViews = {};
    if (req.files?.backImg?.[0]) manualViews.back = req.files.backImg[0].path;
    if (req.files?.leftImg?.[0]) manualViews.left = req.files.leftImg[0].path;
    if (req.files?.rightImg?.[0]) manualViews.right = req.files.rightImg[0].path;

    const opts = {
      workDir: req.workDir,
      glbPath: glb.path,
      referencePath: reference.path,
      manualViews,
      mode,
      useGemini: wantsGemini,
      geminiViews: String(req.body.views || 'back,left')
        .split(',').map((s) => s.trim()).filter((v) => ['back', 'left', 'right'].includes(v)),
      tier: req.body.tier === 'quality' ? 'quality' : 'fast',
      size: Math.min(Math.max(parseInt(req.body.size, 10) || 2048, 512), 4096),
      colors: Math.min(Math.max(parseInt(req.body.colors, 10) || 6, 2), 16),
      keep: req.body.keep || 'auto',
      backText: String(req.body.backText || '').trim().slice(0, 40) || null,
      viewIslandMap: (() => { try { const map = JSON.parse(String(req.body.viewIslandMap || '{}')); return Object.fromEntries(Object.entries(map).filter(([view, ids]) => ['front', 'back', 'left', 'right'].includes(view) && Array.isArray(ids)).map(([view, ids]) => [view, ids.map(Number).filter((id) => Number.isInteger(id) && id >= 0 && id < 64)])); } catch { return {}; } })(),
      sleeveMarks: (() => { try { const marks = JSON.parse(String(req.body.sleeveMarks || '{}')); return { left: String(marks.left || '').trim().slice(0, 12), right: String(marks.right || '').trim().slice(0, 12) }; } catch { return {}; } })(),
    };

    res.status(202).json({ id: req.job.id });
    runPipeline(req.job, opts);   // fire and forget; the client polls
  });

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No such job.' });
  res.json({
    id: job.id,
    status: job.status,
    stage: job.stage,
    error: job.error,
    stats: job.stats,
    log: job.log,
    files: Object.keys(job.files),
  });
});

app.get('/api/jobs/:id/files/:name', (req, res) => {
  const job = jobs.get(req.params.id);
  const file = job?.files?.[req.params.name];
  if (!file) return res.status(404).send('Not found');
  const download = req.query.download === '1';
  res.sendFile(file, {
    headers: download
      ? { 'Content-Disposition': `attachment; filename="${path.basename(file)}"` }
      : {},
  });
});

app.listen(PORT, () => {
  console.log(`garment-bake listening on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY is not set - generated views will be unavailable.');
  }
});
