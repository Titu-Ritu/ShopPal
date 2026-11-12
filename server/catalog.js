// Server-side product cache. Every product the agent has seen is stored here so
// checkout can look prices up server-side instead of trusting the client.
const products = new Map();

export function remember(list) {
  for (const p of list) products.set(p.id, p);
  return list;
}
export function getProduct(id) {
  return products.get(String(id));
}
