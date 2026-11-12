// Realistic mock catalog used when CHANNEL3_API_KEY is missing or MOCK_MODE=true.
// Images are generated SVGs served by /mock-img/:id.svg so nothing depends on the network.

const RAW = [
  // Hiking boots
  ["mk-boot-1", "Merrell Moab 3 Mid Waterproof Hiking Boot", "Merrell", 109.95, 145, "rei.com", "boots", "🥾", "#7c5a3a", ["GORE-TEX waterproof membrane", "Vibram TC5+ outsole", "Sizes 7–15, wide available"], 4.6],
  ["mk-boot-2", "Columbia Newton Ridge Plus II Waterproof Boot", "Columbia", 89.99, null, "columbia.com", "boots", "🥾", "#5b6b3a", ["Seam-sealed waterproof construction", "Omni-Grip rubber outsole", "Lightweight at 1 lb 2 oz"], 4.4],
  ["mk-boot-3", "KEEN Targhee III Mid Waterproof", "KEEN", 119.95, 165, "zappos.com", "boots", "🥾", "#4a5a6a", ["KEEN.DRY breathable membrane", "Wide toe box", "4mm multi-directional lugs"], 4.7],
  ["mk-boot-4", "Timberland Mt. Maddsen Mid Waterproof", "Timberland", 99.0, 130, "timberland.com", "boots", "🥾", "#8a6a2a", ["TimberDry waterproof membrane", "Anti-fatigue footbed", "Recycled laces & lining"], 4.3],
  ["mk-boot-5", "Salomon X Ultra 4 Mid GTX", "Salomon", 164.95, null, "salomon.com", "boots", "🥾", "#2f3f5f", ["GORE-TEX", "Advanced Chassis stability", "Contagrip MA outsole"], 4.8],
  // Coffee gifts
  ["mk-cof-1", "Fellow Stagg EKG Electric Pour-Over Kettle", "Fellow", 165.0, null, "fellowproducts.com", "coffee", "🫖", "#222", ["Precision temperature control", "Gooseneck pour spout"], 4.8],
  ["mk-cof-2", "AeroPress Original Coffee Maker", "AeroPress", 39.95, null, "aeropress.com", "coffee", "☕", "#3a2a1f", ["Brews in 1 minute", "Travel friendly, nearly unbreakable", "Includes 350 filters"], 4.8],
  ["mk-cof-3", "Hario V60 Pour-Over Starter Kit", "Hario", 34.5, 42, "amazon.com", "coffee", "☕", "#b33a2a", ["Ceramic dripper + glass server", "Includes 40 paper filters"], 4.6],
  ["mk-cof-4", "Ember Mug 2, 10 oz Temperature Control Mug", "Ember", 99.95, 129.95, "bestbuy.com", "coffee", "☕", "#1f2f3f", ["Keeps coffee at the exact temperature", "80 min battery"], 4.3],
  ["mk-cof-5", "Counter Culture Coffee Sampler Gift Box (4 bags)", "Counter Culture", 48.0, null, "counterculturecoffee.com", "coffee", "🎁", "#6a3a2a", ["Four single-origin whole-bean coffees", "Tasting notes card"], 4.7],
  ["mk-cof-6", "Baratza Encore Conical Burr Grinder", "Baratza", 149.0, null, "baratza.com", "coffee", "⚙️", "#333", ["40 grind settings", "Ideal for pour-over and drip"], 4.6],
  ["mk-cof-7", "Stanley Classic Legendary Camp Mug 12 oz", "Stanley", 25.0, null, "stanley1913.com", "coffee", "☕", "#2f5f3a", ["Double-wall vacuum insulation", "Dishwasher safe"], 4.7],
  // Keyboards
  ["mk-kb-1", "Keychron K2 Pro Wireless Mechanical Keyboard", "Keychron", 99.0, 119, "keychron.com", "keyboard", "⌨️", "#3a3f4a", ["QMK/VIA programmable", "Hot-swappable switches", "Mac & Windows layouts"], 4.6],
  ["mk-kb-2", "Logitech MX Mechanical Mini", "Logitech", 149.99, null, "logitech.com", "keyboard", "⌨️", "#2a2a2a", ["Low-profile tactile switches", "Multi-device Bluetooth", "Smart backlighting"], 4.5],
  ["mk-kb-3", "Keychron Q1 Max QMK Custom Keyboard", "Keychron", 219.0, null, "keychron.com", "keyboard", "⌨️", "#4a4f5a", ["Full aluminum body", "Gasket mount, very quiet", "2.4 GHz + Bluetooth"], 4.8],
  ["mk-kb-4", "Royal Kludge RK84 Wireless 75% Keyboard", "Royal Kludge", 59.99, 79.99, "amazon.com", "keyboard", "⌨️", "#5a4a6a", ["Hot-swappable", "Tri-mode connection", "Great budget pick"], 4.4],
  ["mk-kb-5", "NuPhy Air75 V2 Low-Profile Mechanical", "NuPhy", 129.0, null, "nuphy.com", "keyboard", "⌨️", "#6a5a4a", ["Slim low-profile design", "QMK/VIA support", "Fits in a laptop bag"], 4.6],
  // Misc / gifts / headphones
  ["mk-hp-1", "Sony WH-1000XM5 Noise Canceling Headphones", "Sony", 329.99, 399.99, "bestbuy.com", "headphones", "🎧", "#1f1f1f", ["Industry-leading ANC", "30 hour battery"], 4.7],
  ["mk-hp-2", "Anker Soundcore Space Q45", "Anker", 89.99, 149.99, "amazon.com", "headphones", "🎧", "#2a3a5a", ["Adaptive noise canceling", "50 hour battery"], 4.4],
  ["mk-bp-1", "Osprey Daylite Plus 20L Daypack", "Osprey", 75.0, null, "rei.com", "backpack", "🎒", "#3a6a5a", ["Padded laptop sleeve", "Hydration compatible"], 4.7],
  ["mk-bp-2", "The North Face Borealis Backpack", "The North Face", 99.0, null, "thenorthface.com", "backpack", "🎒", "#2a2a3a", ["FlexVent suspension", "Fits 15\" laptop"], 4.6],
  ["mk-ls-1", "Lodge 10.25\" Pre-Seasoned Cast Iron Skillet", "Lodge", 19.9, 29.95, "target.com", "kitchen", "🍳", "#2a2a2a", ["Made in the USA", "Oven, stove, grill and campfire safe"], 4.8],
  ["mk-ls-2", "Yeti Rambler 20 oz Tumbler with MagSlider Lid", "YETI", 35.0, null, "yeti.com", "coffee", "🥤", "#3a5a7a", ["Keeps drinks hot or cold", "Dishwasher safe"], 4.8],
  // Costumes
  ["mk-cos-1", "Adult Chicken Onesie Plush Hooded Pajama Costume", "Silver Lilly", 39.99, 49.99, "amazon.com", "costume", "🐔", "#d9a62e", ["Soft fleece one-piece with hood, beak and comb", "Unisex adult sizes S–XL", "Doubles as cozy pajamas"], 4.6],
  ["mk-cos-2", "Chicken Costume Jumpsuit with Hood and Feet Covers", "Spooktacular Creations", 34.99, null, "walmart.com", "costume", "🐓", "#c0392b", ["Includes jumpsuit, hood and shoe covers", "Adult sizes S–XXL", "Machine washable"], 4.4],
  ["mk-cos-3", "Inflatable Chicken Costume for Adults", "Rubie's", 44.99, 59.99, "spirithalloween.com", "costume", "🐥", "#e6c229", ["Battery-powered fan inflates in seconds", "One size fits most adults"], 4.3],
  ["mk-cos-4", "Kids' Chicken Onesie Costume", "Morph", 27.99, null, "target.com", "costume", "🐣", "#f0b429", ["Sizes 3T–10", "Soft plush with feathered tail"], 4.5],
  ["mk-cos-6", "Vampire Cape and Fangs Costume Set", "Rubie's", 29.99, null, "spirithalloween.com", "costume", "🧛", "#7a1f2b", ["Satin-lined high-collar cape", "Glow-in-the-dark fangs", "Adult one size"], 4.4],
  ["mk-cos-7", "Witch Costume with Dress and Pointed Hat", "Leg Avenue", 36.5, 45.0, "amazon.com", "costume", "🧙", "#4b2a6b", ["Tattered velvet dress", "Wide-brim pointed hat", "Women's sizes XS–XL"], 4.5],
  ["mk-cos-8", "Pirate Captain Costume with Hat and Sash", "California Costumes", 42.0, null, "partycity.com", "costume", "🏴‍☠️", "#3a2a1a", ["Coat, shirt front, sash and tricorn hat", "Men's sizes S–XXL"], 4.3],
  ["mk-cos-9", "Glow-in-the-Dark Skeleton Onesie", "Tipsy Elves", 54.95, 64.95, "tipsyelves.com", "costume", "💀", "#222", ["Bones glow after a few minutes of light", "Zip-front fleece one-piece", "Unisex adult sizes"], 4.7],
  ["mk-cos-10", "Inflatable T-Rex Dinosaur Costume", "Morph", 49.99, 69.99, "target.com", "costume", "🦖", "#3f7a3a", ["Battery-powered fan inflates in seconds", "One size fits most adults", "Clear visor to see out"], 4.6],
  ["mk-cos-11", "Classic Ghost Sheet Costume with Hood", "Fun World", 19.99, null, "walmart.com", "costume", "👻", "#9aa0a8", ["Lightweight polyester", "Built-in eye holes", "Kids and adult sizes"], 4.1],
  ["mk-cos-5", "Retro Surfboard Costume Prop, 4 ft", "Fun World", 24.99, null, "partycity.com", "costume", "🏄", "#2a7ab0", ["Lightweight foam", "Pairs with any beach or surfer costume"], 4.2],
];

const KEYWORDS = {
  boots: ["boot", "boots", "hiking", "hike", "waterproof", "trail", "shoe", "shoes"],
  coffee: ["coffee", "espresso", "latte", "barista", "brew", "mug", "kettle", "caffeine"],
  keyboard: ["keyboard", "mechanical", "typing", "coding", "programmer", "keys", "switch"],
  headphones: ["headphones", "headphone", "noise", "audio", "music", "earbuds"],
  backpack: ["backpack", "bag", "daypack", "pack"],
  kitchen: ["cook", "kitchen", "skillet", "pan", "cast"],
  costume: ["costume", "halloween", "cosplay", "dress", "party", "outfit", "spooky", "trick"],
};

export const MOCK_PRODUCTS = RAW.map(([id, title, brand, price, compareAt, merchant, cat, emoji, color, features, rating]) => ({
  id,
  title,
  brand,
  image: `/mock-img/${id}.svg`,
  price,
  compareAt,
  currency: "USD",
  merchant,
  url: `https://${merchant}/`,
  offerCount: 1 + (id.charCodeAt(id.length - 1) % 3),
  features,
  description: `${title} by ${brand}. ${features.join(". ")}.`,
  category: cat,
  rating,
  _emoji: emoji,
  _color: color,
}));

// Whole words, lightly stemmed so "onesies" matches "onesie" and "costumes" matches "costume".
const stem = (text) =>
  String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));

// Generic or filler words that shouldn't decide which product wins.
const STOP = new Set(("a an and are any best buy can cheap cool costume costumes cute find for from get gift good great "
  + "halloween help i idea ideas in is it kid kids lover me men my need new nice of on or please recommend show size some "
  + "something that the this to under up want wear what with women adult adults looking outfit").split(" "));

export function mockSearch({ query = "", min_price, max_price, limit = 6 }) {
  const words = stem(query).filter((w) => w.length > 2);
  const specific = words.filter((w) => !STOP.has(w));
  const inBudget = (p) => (max_price == null || p.price <= Number(max_price)) && (min_price == null || p.price >= Number(min_price));

  const scored = MOCK_PRODUCTS.filter(inBudget).map((p) => {
    const hay = new Set(stem(`${p.title} ${p.brand} ${p.features.join(" ")}`));
    const cat = new Set(stem((KEYWORDS[p.category] || []).join(" ")));
    const specificHits = specific.filter((w) => hay.has(w) || cat.has(w)).length;
    const genericHits = words.filter((w) => cat.has(w) || (STOP.has(w) && w.length > 4 && hay.has(w))).length;
    return { p, specificHits, genericHits };
  });

  // If the shopper named something specific ("vampire", "keyboard"), only products that match it count.
  // Only a fully generic request ("halloween costume") falls back to the whole category.
  const pool = specific.length
    ? scored.filter((x) => x.specificHits > 0)
    : scored.filter((x) => x.genericHits > 0);
  return pool
    .sort((a, b) => b.specificHits - a.specificHits || b.genericHits - a.genericHits || b.p.rating - a.p.rating)
    .slice(0, limit)
    .map(({ p }) => publicProduct(p));
}

function publicProduct(p) {
  const { _emoji, _color, ...rest } = p;
  return { ...rest };
}

export function mockImageSvg(id) {
  const p = MOCK_PRODUCTS.find((x) => x.id === id);
  const emoji = p?._emoji || "🛍️";
  const color = p?._color || "#444";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
<defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${color}" stop-opacity="0.35"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<text x="200" y="245" font-size="170" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
</svg>`;
}

// ── Mock agent (used when ANTHROPIC_API_KEY is missing) ─────────────────
// A tiny rule-based stand-in that exercises the same tools as the Claude agent.
export function parseBudget(text) {
  const m = text.match(/(?:under|below|less than|max|<|up to)\s*\$?\s*(\d+(?:\.\d+)?)/i) || text.match(/\$\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function reasonFor(p, budget) {
  const bits = [];
  if (p.compareAt && p.compareAt > p.price) bits.push(`on sale (${Math.round((1 - p.price / p.compareAt) * 100)}% off)`);
  if (p.rating >= 4.7) bits.push(`top rated at ${p.rating}★`);
  if (budget && p.price <= budget * 0.75) bits.push("leaves room in your budget");
  const f = p.features[0];
  bits.push(/^[A-Z][a-z]/.test(f) ? f.charAt(0).toLowerCase() + f.slice(1) : f);
  return bits.slice(0, 2).join(", ");
}
