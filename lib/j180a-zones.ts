/**
 * J180A decoration zones, in UV space.
 *
 * WHY THIS EXISTS
 * ---------------
 * Placement used to be guessed: detect UV islands on the mesh, sort them by
 * face count, and decide front-vs-back from the sign of the mean face normal.
 * That produced a different wrong answer on every SKU and needed a hand-tuned
 * rotation flag per style. All of that is obsolete, because Augusta publishes
 * the real answer.
 *
 * `prod-J180A-decorations.svg` is Augusta's own production placement spec. It
 * contains, per garment size XS..4XL:
 *   - the real sewn panels, named: Part:lfront, Part:rfront, Part:back,
 *     Part:lsleeve, Part:rsleeve, Part:collar, Part:lplacket, Part:rplacket
 *   - named decoration zones (location:LC, location:BK, ...) positioned
 *     inside those panels
 *   - SEWING_* and REGLAS_POR_TALLA ("rules by size") groups
 *
 * THE MAPPING, AND HOW IT WAS VERIFIED
 * ------------------------------------
 * The SVG viewBox is square (6485.3398438 x 6485.3398438) and maps onto the
 * GLB's UV space by plain division, with no flip and no rotation:
 *
 *     u = svg_x / 6485.3398438
 *     v = svg_y / 6485.3398438
 *
 * Verified by extracting every Part:* bounding box from the real SVG with the
 * browser's own getBBox()+getCTM() (not a hand-written path parser - two
 * earlier hand-rolled parsers gave wrong numbers), converting with the formula
 * above, and comparing against the real UV ranges read out of J180A.glb's
 * TEXCOORD_0 accessors:
 *
 *   panel     glb material        predicted UV              actual UV                 err
 *   back      Fabric_2664.003     U.662-.940 V.359-.751     U.687-.917 V.363-.719     .032
 *   lfront    Fabric_2664.004     U.410-.565 V.379-.731     U.413-.540 V.386-.709     .025
 *   rfront    Fabric_2664.005     U.244-.399 V.379-.731     U.269-.396 V.386-.709     .025
 *   lsleeve   Fabric2_2670.002    U.673-.929 V.207-.336     U.689-.911 V.222-.328     .018
 *   rsleeve   Fabric2_2670.003    U.276-.532 V.207-.336     U.294-.516 V.222-.328     .018
 *
 * All five panels match. The GLB sits consistently *inside* the SVG rectangle,
 * which is the sewing seam allowance - the sewn panel is smaller than the cut
 * piece, exactly as it should be in real garment construction.
 *
 * WHAT IS AND ISN'T CONFIRMED
 * ---------------------------
 * The geometry is measured and exact. The `meaning` strings below are my
 * reading of each code from its size and position on the garment and are NOT
 * confirmed against an Augusta code table - treat them as labels for humans,
 * not as contract. Everything else here is measured data.
 *
 * Coordinates are for Garment_x5F_L. Every zone also exists per size in the
 * SVG (location:BK_x5F_XS ... _4XL) as genuinely different placements, not one
 * box scaled - wiring the other sizes is a matter of reading those groups the
 * same way, not new logic.
 */

export const J180A_SVG_SPAN = 6485.3398438;

/** Panels, keyed by the SVG's own Part: name, with the GLB material each maps to. */
export interface J180APanel {
  part: string;
  /** substring that identifies this panel's materials in J180A.glb (there is a
   *  _FRONT_ and a _BACK_ material per panel - both share these UVs) */
  materialKey: string;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export const J180A_PANELS: J180APanel[] = [
  { part: "back",    materialKey: "2664.003",  u0: 0.6620, u1: 0.9401, v0: 0.3587, v1: 0.7507 },
  { part: "lfront",  materialKey: "2664.004",  u0: 0.4098, u1: 0.5649, v0: 0.3786, v1: 0.7313 },
  { part: "rfront",  materialKey: "2664.005",  u0: 0.2436, u1: 0.3987, v0: 0.3786, v1: 0.7313 },
  { part: "lsleeve", materialKey: "2670.002",  u0: 0.6729, u1: 0.9291, v0: 0.2072, v1: 0.3362 },
  { part: "rsleeve", materialKey: "2670.003",  u0: 0.2761, u1: 0.5323, v0: 0.2072, v1: 0.3362 },
];

export interface J180AZone {
  /** Augusta's own location code, e.g. "BK" */
  code: string;
  /** the Part: this zone sits on */
  panel: string;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** human label - inferred, NOT from an Augusta code table (see file header) */
  meaning: string;
}

/** All 19 placed zones for size L, already converted to UV. */
export const J180A_ZONES: J180AZone[] = [
  // ---- front ----
  { code: "UF", panel: "lfront",  u0: 0.3502, u1: 0.5057, v0: 0.4537, v1: 0.5092, meaning: "Upper Front - full chest band, spans both fronts" },
  { code: "LC", panel: "lfront",  u0: 0.4491, u1: 0.5046, v0: 0.4540, v1: 0.5095, meaning: "Left Chest - classic logo/crest" },
  { code: "RC", panel: "rfront",  u0: 0.3038, u1: 0.3593, v0: 0.4540, v1: 0.5095, meaning: "Right Chest" },
  { code: "LF", panel: "lfront",  u0: 0.4480, u1: 0.4924, v0: 0.5218, v1: 0.5662, meaning: "Left Front - lower" },
  { code: "RF", panel: "rfront",  u0: 0.3161, u1: 0.3605, v0: 0.5217, v1: 0.5662, meaning: "Right Front - lower" },
  { code: "JH", panel: "lfront",  u0: 0.4760, u1: 0.5204, v0: 0.6227, v1: 0.6671, meaning: "low front / hem area" },
  { code: "UL", panel: "lfront",  u0: 0.4713, u1: 0.4824, v0: 0.4426, v1: 0.4537, meaning: "tiny mark - brand-tag scale" },
  { code: "UR", panel: "rfront",  u0: 0.3260, u1: 0.3371, v0: 0.4426, v1: 0.4537, meaning: "tiny mark - brand-tag scale" },
  // ---- back ----
  { code: "UB", panel: "back",    u0: 0.7400, u1: 0.8621, v0: 0.4154, v1: 0.4598, meaning: "Upper Back - name arc" },
  { code: "BK", panel: "back",    u0: 0.7345, u1: 0.8677, v0: 0.4430, v1: 0.5540, meaning: "largest zone - the big back number" },
  { code: "BL", panel: "back",    u0: 0.7400, u1: 0.8621, v0: 0.5998, v1: 0.6442, meaning: "lower back row" },
  { code: "BT", panel: "back",    u0: 0.7400, u1: 0.8621, v0: 0.6380, v1: 0.6824, meaning: "lowest back row" },
  { code: "UN", panel: "back",    u0: 0.7788, u1: 0.8232, v0: 0.3847, v1: 0.4014, meaning: "Under Neck - inner neck label" },
  // ---- sleeves ----
  { code: "US", panel: "lsleeve", u0: 0.7844, u1: 0.8177, v0: 0.2281, v1: 0.2614, meaning: "Upper Sleeve (left)" },
  { code: "MS", panel: "lsleeve", u0: 0.7678, u1: 0.8344, v0: 0.2529, v1: 0.2973, meaning: "Mid Sleeve (left)" },
  { code: "LW", panel: "lsleeve", u0: 0.7622, u1: 0.8399, v0: 0.2696, v1: 0.3140, meaning: "Lower Sleeve (left)" },
  { code: "UG", panel: "rsleeve", u0: 0.3876, u1: 0.4209, v0: 0.2281, v1: 0.2614, meaning: "Upper Sleeve (right)" },
  { code: "MR", panel: "rsleeve", u0: 0.3709, u1: 0.4375, v0: 0.2529, v1: 0.2973, meaning: "Mid Sleeve (right)" },
  { code: "LG", panel: "rsleeve", u0: 0.3654, u1: 0.4431, v0: 0.2696, v1: 0.3140, meaning: "Lower Sleeve (right)" },
];

/** Convert a coordinate in the decorations SVG straight to UV. */
export function svgToUv(x: number, y: number): { u: number; v: number } {
  return { u: x / J180A_SVG_SPAN, v: y / J180A_SVG_SPAN };
}

export function getZone(code: string): J180AZone | undefined {
  return J180A_ZONES.find((z) => z.code === code);
}

export function zonesForPanel(part: string): J180AZone[] {
  return J180A_ZONES.filter((z) => z.panel === part);
}

/**
 * Which panel a J180A.glb material belongs to. Its materials are named
 * Fabric_FRONT_2664.003 / Fabric_BACK_2664.003 / Fabric 2_FRONT_2670.002 etc,
 * so the numeric suffix is the discriminator, and FRONT/BACK here refers to
 * the two faces of the same cloth panel - not the front/back of the garment.
 */
export function panelForMaterial(materialName: string): J180APanel | undefined {
  return J180A_PANELS.find((p) => materialName.includes(p.materialKey));
}

/**
 * How the front of the garment divides across its two front panels.
 *
 * MEASURED, NOT ASSUMED. From the size-L geometry in the decorations SVG:
 *   back   width 1804.3  <- the full garment width, one piece
 *   lfront width 1005.8
 *   rfront width 1005.8
 *   1005.8 + 1005.8 = 2011.6, which EXCEEDS the back by 207.3 units.
 *
 * That excess is the button overlap: the two front halves lap over each other
 * at the placket, exactly as a real button-front jersey is constructed. The
 * GLB confirms it independently - lfront occupies x -23.7..221.6 and rfront
 * x -221.3..30.0, overlapping by ~54 units through the centre.
 *
 * Consequences for texturing, both of which earlier versions got wrong:
 *   - Splitting a front photo 50/50 is wrong. Each panel carries 55.75% of the
 *     garment width (1005.8/1804.3), not 50%.
 *   - Painting both panels as ONE continuous span is also wrong, because the
 *     centre band belongs to BOTH panels rather than being divided between
 *     them. They must be painted separately, from overlapping source regions.
 */
export const J180A_FRONT_PANEL_FRACTION = 1005.8 / 1804.3; // 0.5575

/** Source x-range (0..1 across the trimmed garment) for each front panel. */
export const J180A_FRONT_SOURCE_SPLIT = {
  /** wearer's right = viewer's LEFT, so it takes the left of the photo */
  rfront: { from: 0, to: J180A_FRONT_PANEL_FRACTION },
  /** wearer's left = viewer's RIGHT, so it takes the right of the photo */
  lfront: { from: 1 - J180A_FRONT_PANEL_FRACTION, to: 1 },
} as const;

/**
 * The "Button" material is not buttons - it is the placket band. Mesh.016
 * carries 5050 vertices spanning x -3.81..8.43, a narrow full-height strip
 * down the centre front. Leaving it unpainted is what renders as a bare white
 * stripe over the design. Its UV island sits well away from the fabric panels,
 * so it needs its own paint pass.
 */
export const J180A_PLACKET_UV = { u0: 0.326, u1: 0.420, v0: 0.754, v1: 0.850 };
