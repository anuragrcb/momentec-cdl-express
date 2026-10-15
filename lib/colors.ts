export type BrandColor = {
  name: string;
  brand: string;
  hex: string;
  rgb: [number, number, number];
};

const BRAND_COLORS: BrandColor[] = [
  { "name": "CCM ORANGE", "brand": "CCM", "hex": "#F2672A", "rgb": [242, 103, 42] },
  { "name": "CCM RED", "brand": "CCM", "hex": "#B9182F", "rgb": [185, 24, 47] },
  { "name": "CCM ROYAL", "brand": "CCM", "hex": "#082852", "rgb": [8, 40, 82] },
  { "name": "CCM NAVY", "brand": "CCM", "hex": "#001630", "rgb": [0, 22, 48] },
  { "name": "CCM SKY BLUE", "brand": "CCM", "hex": "#46A0BC", "rgb": [70, 160, 188] },
  { "name": "CCM KELLY GREEN", "brand": "CCM", "hex": "#00AC4E", "rgb": [0, 172, 78] },
  { "name": "CCM BLACK", "brand": "CCM", "hex": "#000000", "rgb": [0, 0, 0] },
  { "name": "CCM DARK GREEN", "brand": "CCM", "hex": "#00461C", "rgb": [0, 70, 28] },
  { "name": "CCM SUNFLOWER", "brand": "CCM", "hex": "#FAA53A", "rgb": [250, 165, 58] },
  { "name": "CCM PINK", "brand": "CCM", "hex": "#BD3A5E", "rgb": [189, 58, 94] },
  { "name": "CCM MEDIUM GREEN", "brand": "CCM", "hex": "#006739", "rgb": [0, 103, 57] },
  { "name": "CCM SPECIAL ORANGE", "brand": "CCM", "hex": "#F2632C", "rgb": [242, 99, 44] },
  { "name": "CCM HARVARD", "brand": "CCM", "hex": "#5C031E", "rgb": [92, 3, 30] },
  { "name": "CCM STORM", "brand": "CCM", "hex": "#36322B", "rgb": [54, 50, 43] },
  { "name": "CCM ST LOUIS ROYAL", "brand": "CCM", "hex": "#00537B", "rgb": [0, 83, 123] },
  { "name": "CCM TURQUOISE BLUE", "brand": "CCM", "hex": "#009588", "rgb": [0, 149, 136] },
  { "name": "CCM CANADIENS RED", "brand": "CCM", "hex": "#9F1434", "rgb": [159, 20, 52] },
  { "name": "CCM MYSTIC GREY", "brand": "CCM", "hex": "#56574F", "rgb": [86, 87, 79] },
  { "name": "CCM VIOLET", "brand": "CCM", "hex": "#32368B", "rgb": [50, 54, 139] },
  { "name": "CCM WHITE", "brand": "CCM", "hex": "#FFFFFF", "rgb": [255, 255, 255] },
  { "name": "CCM STORM GREY", "brand": "CCM", "hex": "#595C5B", "rgb": [89, 92, 91] },
  { "name": "CCM BROWN", "brand": "CCM", "hex": "#360C00", "rgb": [54, 12, 0] },
  { "name": "CCM YELLOW", "brand": "CCM", "hex": "#FFD416", "rgb": [255, 212, 22] },
  { "name": "CCM PURE GOLD", "brand": "CCM", "hex": "#8E682F", "rgb": [142, 104, 47] },
  { "name": "CCM ANTIQUE GOLD", "brand": "CCM", "hex": "#AE9161", "rgb": [174, 145, 97] },
  { "name": "CCM BEIGE", "brand": "CCM", "hex": "#D9BF97", "rgb": [217, 191, 151] },
  { "name": "CCM MAROON", "brand": "CCM", "hex": "#52040D", "rgb": [82, 4, 13] },
  { "name": "CCM ORANGE GLOVES", "brand": "CCM", "hex": "#E63A25", "rgb": [230, 58, 37] },
  { "name": "CCM ICE BLUE", "brand": "CCM", "hex": "#AAD8CF", "rgb": [170, 216, 207] },
  { "name": "CCM CAPITAL BLUE", "brand": "CCM", "hex": "#00536D", "rgb": [0, 83, 109] },
  { "name": "CCM BRIGHT GREEN", "brand": "CCM", "hex": "#B0D363", "rgb": [176, 211, 99] },
  { "name": "WHITE", "brand": "Holloway", "hex": "#FFFFFF", "rgb": [255, 255, 255] },
  { "name": "BLACK", "brand": "Holloway", "hex": "#000000", "rgb": [0, 0, 0] },
  { "name": "BLUE GREY", "brand": "Holloway", "hex": "#97A3AE", "rgb": [151, 163, 174] },
  { "name": "KELLY", "brand": "Holloway", "hex": "#006A45", "rgb": [0, 106, 69] },
  { "name": "LIME", "brand": "Holloway", "hex": "#8EEC10", "rgb": [142, 236, 16] },
  { "name": "TEAL", "brand": "Holloway", "hex": "#00897B", "rgb": [0, 137, 123] },
  { "name": "UNIVERSITY BLUE", "brand": "Holloway", "hex": "#1E8EC3", "rgb": [30, 142, 195] },
  { "name": "CAROLINA BLUE", "brand": "Holloway", "hex": "#8AB7E9", "rgb": [138, 183, 233] },
  { "name": "BRIGHT BLUE", "brand": "Holloway", "hex": "#0078BA", "rgb": [0, 120, 186] },
  { "name": "ROYAL", "brand": "Holloway", "hex": "#033391", "rgb": [3, 51, 145] },
  { "name": "NAVY", "brand": "Holloway", "hex": "#011E41", "rgb": [1, 30, 65] },
  { "name": "PURPLE", "brand": "Holloway", "hex": "#2A0A5F", "rgb": [42, 10, 95] },
  { "name": "NEON PINK", "brand": "Holloway", "hex": "#FF33A8", "rgb": [255, 51, 168] },
  { "name": "POWER PINK", "brand": "Holloway", "hex": "#B32572", "rgb": [179, 37, 114] },
  { "name": "CARDINAL", "brand": "Holloway", "hex": "#601B22", "rgb": [96, 27, 34] },
  { "name": "SCARLET", "brand": "Holloway", "hex": "#A31F2D", "rgb": [163, 31, 45] },
  { "name": "BURNT ORANGE", "brand": "Holloway", "hex": "#D53523", "rgb": [213, 53, 35] },
  { "name": "TEXAS ORANGE", "brand": "Holloway", "hex": "#A04519", "rgb": [160, 69, 25] },
  { "name": "ORANGE", "brand": "Holloway", "hex": "#FF4713", "rgb": [255, 71, 19] },
  { "name": "BRIGHT ORANGE", "brand": "Holloway", "hex": "#FF6F1E", "rgb": [255, 111, 30] },
  { "name": "LT GOLD", "brand": "Holloway", "hex": "#FFA400", "rgb": [255, 164, 0] },
  { "name": "NEON YELLOW", "brand": "Holloway", "hex": "#DDE61E", "rgb": [221, 230, 30] },
  { "name": "VEGAS GOLD", "brand": "Holloway", "hex": "#BDB279", "rgb": [189, 178, 121] },
  { "name": "SILVER GREY", "brand": "Holloway", "hex": "#AFAFA5", "rgb": [175, 175, 165] },
  { "name": "GRAPHITE", "brand": "Holloway", "hex": "#525759", "rgb": [82, 87, 89] },
  { "name": "BROWN", "brand": "Holloway", "hex": "#2C0200", "rgb": [44, 2, 0] },
  { "name": "CARBON", "brand": "Holloway", "hex": "#34312A", "rgb": [52, 49, 42] },
  { "name": "SLATE", "brand": "Holloway", "hex": "#2D3535", "rgb": [45, 53, 53] },
  { "name": "ARMY GREEN", "brand": "Holloway", "hex": "#3F4727", "rgb": [63, 71, 39] },
  { "name": "FOREST", "brand": "Holloway", "hex": "#003115", "rgb": [0, 49, 21] },
  { "name": "MAROON", "brand": "Holloway", "hex": "#371E24", "rgb": [55, 30, 36] },
  { "name": "BLACK TONAL", "brand": "Holloway", "hex": "#504B4B", "rgb": [80, 75, 75] },
  { "name": "ARMY GREEN TONAL", "brand": "Holloway", "hex": "#2D2C1F", "rgb": [45, 44, 31] },
  { "name": "TEXAS ORANGE TONAL", "brand": "Holloway", "hex": "#5F2116", "rgb": [95, 33, 22] },
  { "name": "CARBON TONAL", "brand": "Holloway", "hex": "#181B11", "rgb": [24, 27, 17] },
  { "name": "LIME TONAL", "brand": "Holloway", "hex": "#7ED739", "rgb": [126, 215, 57] },
  { "name": "BROWN TONAL", "brand": "Holloway", "hex": "#502C1F", "rgb": [80, 44, 31] },
  { "name": "NEON PINK TONAL", "brand": "Holloway", "hex": "#FF55BA", "rgb": [255, 85, 186] },
  { "name": "BRIGHT ORANGE TONAL", "brand": "Holloway", "hex": "#F68924", "rgb": [246, 137, 36] },
  { "name": "BLUE GREY TONAL", "brand": "Holloway", "hex": "#64696B", "rgb": [100, 105, 107] },
  { "name": "BRIGHT BLUE TONAL", "brand": "Holloway", "hex": "#009CAE", "rgb": [0, 156, 174] },
  { "name": "CARDINAL TONAL", "brand": "Holloway", "hex": "#6C272F", "rgb": [108, 39, 47] },
  { "name": "FOREST TONAL", "brand": "Holloway", "hex": "#0F6136", "rgb": [15, 97, 54] },
  { "name": "GRAPHITE TONAL", "brand": "Holloway", "hex": "#373935", "rgb": [55, 57, 53] },
  { "name": "KELLY TONAL", "brand": "Holloway", "hex": "#31B562", "rgb": [49, 181, 98] },
  { "name": "LT GOLD TONAL", "brand": "Holloway", "hex": "#BF7824", "rgb": [191, 120, 36] },
  { "name": "MAROON TONAL", "brand": "Holloway", "hex": "#7E313E", "rgb": [126, 49, 62] },
  { "name": "NAVY TONAL", "brand": "Holloway", "hex": "#2D3B58", "rgb": [45, 59, 88] },
  { "name": "ORANGE TONAL", "brand": "Holloway", "hex": "#C42B20", "rgb": [196, 43, 32] },
  { "name": "POWER PINK TONAL", "brand": "Holloway", "hex": "#DA6AA9", "rgb": [218, 106, 169] },
  { "name": "PURPLE TONAL", "brand": "Holloway", "hex": "#5B54A0", "rgb": [91, 84, 160] },
  { "name": "ROYAL TONAL", "brand": "Holloway", "hex": "#2E70A0", "rgb": [46, 112, 160] },
  { "name": "SCARLET TONAL", "brand": "Holloway", "hex": "#740F19", "rgb": [116, 15, 25] },
  { "name": "SILVER GREY TONAL", "brand": "Holloway", "hex": "#6A6E6A", "rgb": [106, 110, 106] },
  { "name": "TEAL TONAL", "brand": "Holloway", "hex": "#5FBA8F", "rgb": [95, 186, 143] },
  { "name": "UNIVERSITY BLUE TONAL", "brand": "Holloway", "hex": "#7CC6EE", "rgb": [124, 198, 238] },
  { "name": "VEGAS GOLD TONAL", "brand": "Holloway", "hex": "#AE8C56", "rgb": [174, 140, 86] },
  { "name": "WHITE TONAL", "brand": "Holloway", "hex": "#D2CCCC", "rgb": [210, 204, 204] },
  { "name": "BURNT ORANGE TONAL", "brand": "Holloway", "hex": "#AC1B24", "rgb": [172, 27, 36] },
  { "name": "CAROLINA BLUE TONAL", "brand": "Holloway", "hex": "#58ABDF", "rgb": [88, 171, 223] },
  { "name": "CLASSIC RED", "brand": "Holloway", "hex": "#B9182F", "rgb": [185, 24, 47] },
  { "name": "CLASSIC RED TONAL", "brand": "Holloway", "hex": "#8E090F", "rgb": [142, 9, 15] },
  { "name": "SPRING GREEN", "brand": "Holloway", "hex": "#9CCD63", "rgb": [156, 205, 99] },
  { "name": "SPRING GREEN TONAL", "brand": "Holloway", "hex": "#73C054", "rgb": [115, 192, 84] },
  { "name": "LASER YELLOW", "brand": "Holloway", "hex": "#FDF14C", "rgb": [253, 241, 76] },
  { "name": "GIANTS CREAM", "brand": "Holloway", "hex": "#F4ECDE", "rgb": [244, 236, 222] },
  { "name": "LASER YELLOW TONAL", "brand": "Holloway", "hex": "#CEC131", "rgb": [206, 193, 49] },
  { "name": "GIANTS CREAM TONAL", "brand": "Holloway", "hex": "#C7BFB2", "rgb": [199, 191, 178] },
  { "name": "TURQUOISE", "brand": "Holloway", "hex": "#008598", "rgb": [0, 133, 152] },
  { "name": "TURQUOISE TONAL", "brand": "Holloway", "hex": "#339DAD", "rgb": [51, 157, 173] },
  { "name": "SLATE TONAL", "brand": "Holloway", "hex": "#46463E", "rgb": [70, 70, 62] },
  { "name": "BRIGHT YELLOW", "brand": "Holloway", "hex": "#FFF327", "rgb": [255, 243, 39] },
  { "name": "BRIGHT YELLOW TONAL", "brand": "Holloway", "hex": "#ECDA3A", "rgb": [236, 218, 58] },
  { "name": "MINT GREEN", "brand": "Holloway", "hex": "#69CCB3", "rgb": [105, 204, 179] },
  { "name": "RA BLACK TONAL", "brand": "Russell", "hex": "#4D555B", "rgb": [77, 85, 91] },
  { "name": "RA BURNT ORANGE TONAL", "brand": "Russell", "hex": "#B5321E", "rgb": [181, 50, 30] },
  { "name": "RA COLUMBIA BLUE TONAL", "brand": "Russell", "hex": "#2F7CA2", "rgb": [47, 124, 162] },
  { "name": "RA CARDINAL TONAL", "brand": "Russell", "hex": "#54030F", "rgb": [84, 3, 15] },
  { "name": "RA DARK GREEN TONAL", "brand": "Russell", "hex": "#36674F", "rgb": [54, 103, 79] },
  { "name": "RA DIAMOND PINK TONAL", "brand": "Russell", "hex": "#B88997", "rgb": [184, 137, 151] },
  { "name": "RA ELECTRIC GREEN TONAL", "brand": "Russell", "hex": "#9CB93B", "rgb": [156, 185, 59] },
  { "name": "RA GT GOLD TONAL", "brand": "Russell", "hex": "#BA9F5F", "rgb": [186, 159, 95] },
  { "name": "RA GIANTS CREAM TONAL", "brand": "Russell", "hex": "#C7BFB2", "rgb": [199, 191, 178] },
  { "name": "RA GOLD TONAL", "brand": "Russell", "hex": "#CC8822", "rgb": [204, 136, 34] },
  { "name": "RA GRIDIRON SILVER TONAL", "brand": "Russell", "hex": "#ADBBAF", "rgb": [173, 187, 175] },
  { "name": "RA KELLY TONAL", "brand": "Russell", "hex": "#006434", "rgb": [0, 100, 52] },
  { "name": "RA LASER YELLOW TONAL", "brand": "Russell", "hex": "#CEC131", "rgb": [206, 193, 49] },
  { "name": "RA LAVENDAR HAZE TONAL", "brand": "Russell", "hex": "#9088A9", "rgb": [144, 136, 169] },
  { "name": "RA LIGHT OLD GOLD TONAL", "brand": "Russell", "hex": "#B68E2A", "rgb": [182, 142, 42] },
  { "name": "RA LIGHT ORANGE TONAL", "brand": "Russell", "hex": "#CA5D23", "rgb": [202, 93, 35] },
  { "name": "RA MAROON TONAL", "brand": "Russell", "hex": "#4E1D30", "rgb": [78, 29, 48] },
  { "name": "RA NAVY TONAL", "brand": "Russell", "hex": "#00305D", "rgb": [0, 48, 93] },
  { "name": "RA PURPLE TONAL", "brand": "Russell", "hex": "#343982", "rgb": [52, 57, 130] },
  { "name": "RA ROYAL TONAL", "brand": "Russell", "hex": "#0064A7", "rgb": [0, 100, 167] },
  { "name": "RA SEAL BROWN TONAL", "brand": "Russell", "hex": "#571E02", "rgb": [87, 30, 2] },
  { "name": "RA SOUL BLUE TONAL", "brand": "Russell", "hex": "#0094AB", "rgb": [0, 148, 171] },
  { "name": "RA STEALTH TONAL", "brand": "Russell", "hex": "#4A5052", "rgb": [74, 80, 82] },
  { "name": "RA TRUE RED TONAL", "brand": "Russell", "hex": "#860714", "rgb": [134, 7, 20] },
  { "name": "RA TECHNO GREEN TONAL", "brand": "Russell", "hex": "#BCB672", "rgb": [188, 182, 114] },
  { "name": "RA TEXAS ORANGE TONAL", "brand": "Russell", "hex": "#731300", "rgb": [115, 19, 0] },
  { "name": "RA WATERMELON PINK TONAL", "brand": "Russell", "hex": "#B32067", "rgb": [179, 32, 103] },
  { "name": "RA WHITE TONAL", "brand": "Russell", "hex": "#E6E7E8", "rgb": [230, 231, 232] },
  { "name": "RA AQUA", "brand": "Russell", "hex": "#009292", "rgb": [0, 146, 146] },
  { "name": "RA ARMY CAMO GREEN", "brand": "Russell", "hex": "#AEA980", "rgb": [174, 169, 128] },
  { "name": "RA ARMY CAMO GREY", "brand": "Russell", "hex": "#666D5A", "rgb": [102, 109, 90] },
  { "name": "RA ARMY CAMO TAN", "brand": "Russell", "hex": "#DCD0B0", "rgb": [220, 208, 176] },
  { "name": "RA BASEBALL GREY", "brand": "Russell", "hex": "#9EA8AF", "rgb": [158, 168, 175] },
  { "name": "RA BLAZER GOLD", "brand": "Russell", "hex": "#ECD1AB", "rgb": [236, 209, 171] },
  { "name": "RA BLACK", "brand": "Russell", "hex": "#231E1F", "rgb": [35, 30, 31] },
  { "name": "RA BURNT ORANGE", "brand": "Russell", "hex": "#DA5021", "rgb": [218, 80, 33] },
  { "name": "RA COLUMBIA BLUE", "brand": "Russell", "hex": "#4A98C9", "rgb": [74, 152, 201] },
  { "name": "RA CARDINAL", "brand": "Russell", "hex": "#6B0920", "rgb": [107, 9, 32] },
  { "name": "RA DARK GREEN", "brand": "Russell", "hex": "#1A5A43", "rgb": [26, 90, 67] },
  { "name": "RA DIAMOND PINK", "brand": "Russell", "hex": "#DFAEBD", "rgb": [223, 174, 189] },
  { "name": "RA ELECTRIC GREEN", "brand": "Russell", "hex": "#B0CF36", "rgb": [176, 207, 54] },
  { "name": "RA GT GOLD", "brand": "Russell", "hex": "#E4C77C", "rgb": [228, 199, 124] },
  { "name": "RA GIANTS CREAM", "brand": "Russell", "hex": "#F4ECDE", "rgb": [244, 236, 222] },
  { "name": "RA GOLD", "brand": "Russell", "hex": "#F7AE1B", "rgb": [247, 174, 27] },
  { "name": "RA GRIDIRON SILVER", "brand": "Russell", "hex": "#CFD6D6", "rgb": [207, 214, 214] },
  { "name": "RA KELLY", "brand": "Russell", "hex": "#007F3D", "rgb": [0, 127, 61] },
  { "name": "RA LASER YELLOW", "brand": "Russell", "hex": "#FDF14C", "rgb": [253, 241, 76] },
  { "name": "RA LAVENDAR HAZE", "brand": "Russell", "hex": "#B0ACD5", "rgb": [176, 172, 213] },
  { "name": "RA LIGHT OLD GOLD", "brand": "Russell", "hex": "#A37F24", "rgb": [163, 127, 36] },
  { "name": "RA LIGHT ORANGE", "brand": "Russell", "hex": "#E07C25", "rgb": [224, 124, 37] },
  { "name": "RA MAROON", "brand": "Russell", "hex": "#3A0227", "rgb": [58, 2, 39] },
  { "name": "RA NAVY", "brand": "Russell", "hex": "#00083B", "rgb": [0, 8, 59] },
  { "name": "RA PURPLE", "brand": "Russell", "hex": "#1F1754", "rgb": [31, 23, 84] },
  { "name": "RA ROYAL", "brand": "Russell", "hex": "#004E92", "rgb": [0, 78, 146] },
  { "name": "RA SEAL BROWN", "brand": "Russell", "hex": "#492E28", "rgb": [73, 46, 40] },
  { "name": "RA SOUL BLUE", "brand": "Russell", "hex": "#00B7D3", "rgb": [0, 183, 211] },
  { "name": "RA STEALTH", "brand": "Russell", "hex": "#393F41", "rgb": [57, 63, 65] },
  { "name": "RA TRUE RED", "brand": "Russell", "hex": "#9A0C26", "rgb": [154, 12, 38] },
  { "name": "RA TECHNO GREEN", "brand": "Russell", "hex": "#E5DF92", "rgb": [229, 223, 146] },
  { "name": "RA TEXAS ORANGE", "brand": "Russell", "hex": "#903006", "rgb": [144, 48, 6] },
  { "name": "RA WATERMELON PINK", "brand": "Russell", "hex": "#D64483", "rgb": [214, 68, 131] },
  { "name": "RA WHITE", "brand": "Russell", "hex": "#FFFFFF", "rgb": [255, 255, 255] },
  { "name": "RA AQUA TONAL", "brand": "Russell", "hex": "#007579", "rgb": [0, 117, 121] },
  { "name": "RA ARMY CAMO GREEN TONAL", "brand": "Russell", "hex": "#96A075", "rgb": [150, 160, 117] },
  { "name": "RA ARMY CAMO GREY TONAL", "brand": "Russell", "hex": "#484F3E", "rgb": [72, 79, 62] },
  { "name": "RA ARMY CAMO TAN TONAL", "brand": "Russell", "hex": "#C7D4AB", "rgb": [199, 212, 171] },
  { "name": "RA BASEBALL GREY TONAL", "brand": "Russell", "hex": "#7E8386", "rgb": [126, 131, 134] },
  { "name": "RA BLAZER GOLD TONAL", "brand": "Russell", "hex": "#CAB392", "rgb": [202, 179, 146] }
];

const COLOR_WORD =
  "(?:ra|ccm|lt|gt|st|louis|light|dark|deep|bright|pale|neon|vivid|rich|muted|soft|warm|cool|dusty|royal|navy|sky|baby|powder|midnight|cobalt|sapphire|slate|steel|ice|electric|athletic|vegas|old|columbia|carolina|university|capital|cardinal|scarlet|crimson|maroon|burgundy|wine|brick|ruby|cherry|canadiens|harvard|coral|salmon|rust|burnt|texas|special|true|red|orange|amber|peach|apricot|sunflower|laser|yellow|gold|golden|mustard|lemon|canary|blazer|giants|cream|ivory|beige|tan|khaki|sand|camel|taupe|brown|seal|chocolate|coffee|espresso|bronze|copper|green|kelly|forest|hunter|olive|army|camo|sage|mint|spring|techno|lime|emerald|jade|pine|seafoam|teal|aqua|turquoise|soul|cyan|blue|indigo|denim|cerulean|periwinkle|purple|violet|plum|eggplant|lavender|lavendar|haze|lilac|mauve|magenta|fuchsia|pink|power|diamond|watermelon|rose|blush|hot|white|off-white|snow|pearl|silver|gridiron|baseball|mystic|platinum|grey|gray|charcoal|graphite|carbon|ash|heather|smoke|stealth|storm|black|jet|onyx|ebony)";

const COLOR_HEX_RE = new RegExp(
  `(?:\\b${COLOR_WORD}(?:[\\s/-]+${COLOR_WORD}){0,4}\\s+)?(?:\\(\\s*(#[0-9a-fA-F]{6})\\s*\\)|(#[0-9a-fA-F]{6}))`,
  "gi",
);

export function snapToBrandColorLocal(
  input: { name: string; hex: string },
  brand?: string,
): { name: string; hex: string } {
  const rgb = parseHex(input.hex);
  if (!rgb) return input;

  const paletteBrand = normalizePaletteBrand(brand) ?? "Holloway";
  const brandPool = BRAND_COLORS.filter((c) => c.brand.toUpperCase() === paletteBrand.toUpperCase());
  const pool = brandPool.length > 0 ? brandPool : BRAND_COLORS.filter((c) => c.brand === "Holloway");
  const nonTonalPool = pool.filter((c) => !/TONAL|TOANL/i.test(c.name));
  const candidates = nonTonalPool.length > 0 ? nonTonalPool : pool;

  let best = candidates[0];
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = deltaE(rgb, candidate.rgb);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best ? { name: best.name, hex: best.hex } : input;
}

export async function snapToBrandColor(
  input: { name: string; hex: string },
  brand?: string,
): Promise<{ name: string; hex: string }> {
  const rgb = parseHex(input.hex);
  if (!rgb) return input;

  const remote = await queryNearestColorRemote(input.hex, brand).catch(() => null);
  if (remote) return remote;

  return snapToBrandColorLocal(input, brand);
}

export function replaceSnappedColors(
  text: string,
  hexMap: ReadonlyMap<string, { name: string; hex: string }>,
): string {
  return text.replace(COLOR_HEX_RE, (full, parenHex?: string, bareHex?: string) => {
    const rawHex = (parenHex || bareHex || "").toUpperCase();
    const snapped = hexMap.get(rawHex);
    if (!snapped) return full;
    return `${snapped.name} (${snapped.hex})`;
  });
}

export async function snapPlanColors<
  T extends {
    colorZoneMapping: string[];
    logoMapping: string[];
    textMapping: string[];
    viewPlan: { front: string; back: string; left: string; right: string };
  },
>(plan: T, brand?: string): Promise<T> {
  const allStrings = [
    ...plan.colorZoneMapping,
    ...plan.logoMapping,
    ...plan.textMapping,
    plan.viewPlan.front,
    plan.viewPlan.back,
    plan.viewPlan.left,
    plan.viewPlan.right,
  ];
  const uniqueHexes = new Set<string>();
  for (const str of allStrings) {
    for (const match of str.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      uniqueHexes.add(match[0].toUpperCase());
    }
  }
  if (uniqueHexes.size === 0) return plan;

  const entries = await Promise.all(
    Array.from(uniqueHexes).map(async (hex) => {
      const snapped = await snapToBrandColor({ name: hex, hex }, brand);
      return [hex, snapped] as const;
    }),
  );
  const hexMap = new Map(entries);

  return {
    ...plan,
    colorZoneMapping: plan.colorZoneMapping.map((line) => replaceSnappedColors(line, hexMap)),
    logoMapping: plan.logoMapping.map((line) => replaceSnappedColors(line, hexMap)),
    textMapping: plan.textMapping.map((line) => replaceSnappedColors(line, hexMap)),
    viewPlan: {
      front: replaceSnappedColors(plan.viewPlan.front, hexMap),
      back: replaceSnappedColors(plan.viewPlan.back, hexMap),
      left: replaceSnappedColors(plan.viewPlan.left, hexMap),
      right: replaceSnappedColors(plan.viewPlan.right, hexMap),
    },
  };
}

export function filterPlanToAllowedCatalog<
  T extends {
    colorZoneMapping: string[];
    logoMapping: string[];
    textMapping: string[];
    viewPlan: { front: string; back: string; left: string; right: string };
  },
>(
  plan: T,
  row: {
    logo_locations: { code?: string; name?: string; legacy?: boolean }[];
    text_locations: { code?: string; name?: string; legacy?: boolean }[];
    color_zones: { code?: string; name?: string }[];
  },
): T {
  const activeLogos = row.logo_locations.filter((l) => !l.legacy && (l.code || l.name));
  const activeTexts = row.text_locations.filter((t) => !t.legacy && (t.code || t.name));
  const activeZones = row.color_zones.filter((z) => z.code || z.name);

  return {
    ...plan,
    colorZoneMapping:
      activeZones.length > 0
        ? plan.colorZoneMapping.filter((line) => matchesCatalogSlot(line, activeZones))
        : plan.colorZoneMapping,
    logoMapping: plan.logoMapping.filter((line) => matchesCatalogSlot(line, activeLogos)),
    textMapping: plan.textMapping.filter((line) => matchesCatalogSlot(line, activeTexts)),
  };
}

function matchesCatalogSlot(line: string, allowed: { code?: string; name?: string }[]): boolean {
  if (allowed.length === 0) return false;
  const lower = line.toLowerCase();
  return allowed.some((slot) => {
    const code = (slot.code ?? "").trim().toLowerCase();
    const name = (slot.name ?? "").trim().toLowerCase();
    if (code && new RegExp(`\\b${escapeRegExp(code)}\\b`, "i").test(line)) return true;
    if (name && lower.includes(name)) return true;
    return false;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function queryNearestColorRemote(
  hex: string,
  brand?: string,
): Promise<{ name: string; hex: string } | null> {
  const rawUrl =
    process.env.MOMENTEC_CATALOG_SEARCH_URL ||
    process.env["momentec-catalog-search-url"] ||
    process.env.CATALOG_SEARCH_URL;
  const apiKey = process.env.CATALOG_API_KEY || process.env["X-API-Key"];
  if (!rawUrl || !apiKey) return null;

  const baseUrl = rawUrl.replace(/\/search\/?$/, "");
  const endpoint = `${baseUrl.replace(/\/$/, "")}/colors/nearest`;
  const normalizedBrand = normalizePaletteBrand(brand);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      color: hex,
      top_k: 20,
      ...(normalizedBrand ? { brand: normalizedBrand } : {}),
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { results?: Array<{ name?: string; hex?: string; tonal?: boolean }> };
  const results = Array.isArray(payload.results) ? payload.results : [];
  const chosen =
    results.find((r) => !r.tonal && r.name && !/TONAL|TOANL/i.test(r.name) && r.hex) ?? results[0];
  if (!chosen || typeof chosen.name !== "string" || typeof chosen.hex !== "string") return null;
  return { name: chosen.name.trim().toUpperCase(), hex: chosen.hex.trim().toUpperCase() };
}

function normalizePaletteBrand(brand?: string): string | null {
  const b = (brand ?? "").trim().toUpperCase();
  if (b === "RUSSELL") return "Russell";
  if (b === "CCM") return "CCM";
  if (
    b === "HOLLOWAY" ||
    b === "AUGUSTA" ||
    b === "HIGH FIVE" ||
    b === "ALL VOLLEYBALL" ||
    b === "PG" ||
    b === "NEW ERA"
  ) {
    return "Holloway";
  }
  return null;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return null;
  const h = match[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function srgbToLab(rgb: [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(rgb[0]);
  const g = lin(rgb[1]);
  const b = lin(rgb[2]);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: [number, number, number], b: [number, number, number]): number {
  const [l1, a1, b1] = srgbToLab(a);
  const [l2, a2, b2] = srgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
