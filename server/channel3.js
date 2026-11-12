import { config } from "./config.js";
import { remember } from "./catalog.js";
import { mockSearch } from "./mock.js";

const ENDPOINT = "https://api.trychannel3.com/v1/search";

// Maps a Channel3 product to the flat shape the agent and UI use.
// Channel3 keeps price/merchant on offers[], so we pick the cheapest in-stock offer.
export function normalizeProduct(p) {
  const offers = Array.isArray(p.offers) ? p.offers : [];
  const priced = offers
    .map((o) => ({
      o,
      amount: Number(o?.price?.price ?? o?.price?.amount ?? o?.price),
      currency: o?.price?.currency || "USD",
    }))
    .filter((x) => Number.isFinite(x.amount) && x.amount > 0);
  const inStock = priced.filter((x) => !x.o.availability || /instock|limited/i.test(x.o.availability));
  const best = (inStock.length ? inStock : priced).sort((a, b) => a.amount - b.amount)[0];

  const images = Array.isArray(p.images) ? p.images : [];
  const main = images.find((i) => i.is_main_image) || images[0];
  const image = main ? main.cleaned_url || main.url : typeof p.image_url === "string" ? p.image_url : null;
  const brand = Array.isArray(p.brands) && p.brands.length ? p.brands[0].name : p.brand_name || p.brand || null;

  return {
    id: String(p.id),
    title: p.title,
    brand,
    image,
    price: best ? Math.round(best.amount * 100) / 100 : null,
    compareAt: best?.o?.price?.compare_at_price ?? null,
    currency: best?.currency || "USD",
    merchant: best?.o?.domain || null,
    url: best?.o?.url || p.url || null,
    offerCount: priced.length,
    features: (p.key_features || []).slice(0, 4),
    description: p.description ? String(p.description).slice(0, 400) : null,
    category: p.category?.title || null,
  };
}

export async function searchProducts({ query, min_price, max_price, limit = 6 }) {
  limit = Math.min(Math.max(Number(limit) || 6, 1), 10);
  if (config.channel3.mock) return remember(mockSearch({ query, min_price, max_price, limit }));

  const price = {};
  if (Number.isFinite(Number(min_price)) && min_price !== null) price.min_price = Number(min_price);
  if (Number.isFinite(Number(max_price)) && max_price !== null) price.max_price = Number(max_price);
  const filters = { availability: ["InStock"] };
  if (Object.keys(price).length) filters.price = price;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-api-key": config.channel3.apiKey, "Content-Type": "application/json" },
    // No locale fields: Channel3 defaults to US / en / USD, which matches PayPal's USD checkout.
    body: JSON.stringify({ query, limit, filters }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Channel3 search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const list = (data.products || []).map(normalizeProduct).filter((p) => p.price !== null && p.title);
  return remember(list);
}
