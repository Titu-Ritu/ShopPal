import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { searchProducts } from "./channel3.js";
import { getProduct } from "./catalog.js";
import { parseBudget, reasonFor } from "./mock.js";

const client = config.anthropic.mock ? null : new Anthropic({ apiKey: config.anthropic.apiKey });

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5-2"]);

const SYSTEM_PROMPT = `You are ShopPal, a friendly, efficient AI shopping assistant inside a chat app.

How to work:
- Ask a clarifying question ONLY if something essential is missing and can't be guessed (e.g. shoe size for footwear when not given). Otherwise search right away.
- Use search_products to find real products. Turn budgets like "under $120" into max_price. Write focused search queries (product type + key attributes).
- After searching, pick the best 3 results and call show_products with their ids and your recommended_id. The app renders these as product cards.
- Then reply with a short message: one line per product ("**Title** ($price at merchant): reason"), then "My pick: ..." with one sentence why.
- Use compare_products when the user asks to compare or wants more detail on tradeoffs.
- When the user wants to buy something, call propose_checkout. This only shows a checkout card; it never charges. The user pays by clicking the PayPal button themselves. Then tell them to review and confirm with PayPal.
- Never invent products, prices, ratings or merchants. Only use data returned by tools. If a search returns nothing useful, say so and try one broader search.
- Keep replies concise and skimmable (under ~120 words). Use **bold** for product names. No headings, no tables.
- Payments run in PayPal SANDBOX mode for this demo: money goes to the ShopPal demo merchant account, and the retailer does not ship anything. Mention this only if asked.`;

const TOOLS = [
  {
    name: "search_products",
    description: "Search the live product catalog (Channel3). Returns in-stock products with id, title, brand, price (USD), merchant and key features.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, e.g. 'waterproof hiking boots men'" },
        max_price: { type: "number", description: "Maximum price in USD" },
        min_price: { type: "number", description: "Minimum price in USD" },
        limit: { type: "integer", description: "Number of results, 1-10 (default 6)" },
      },
      required: ["query"],
    },
  },
  {
    name: "compare_products",
    description: "Get full details for 2-5 previously found products so you can explain tradeoffs.",
    input_schema: {
      type: "object",
      properties: { product_ids: { type: "array", items: { type: "string" } } },
      required: ["product_ids"],
    },
  },
  {
    name: "show_products",
    description: "Display product cards in the chat UI. Call once per answer with your top picks (usually 3), best first.",
    input_schema: {
      type: "object",
      properties: {
        product_ids: { type: "array", items: { type: "string" } },
        recommended_id: { type: "string", description: "The id of the product you recommend" },
      },
      required: ["product_ids"],
    },
  },
  {
    name: "propose_checkout",
    description: "Show a checkout card with a PayPal button for one product. Does NOT charge anything; the user must confirm by paying with PayPal.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "integer", description: "1-10, default 1" },
      },
      required: ["product_id"],
    },
  },
];

// ── Sessions (in-memory) ────────────────────────────────────────────────
const sessions = new Map();
function getSession(id) {
  if (!sessions.has(id)) sessions.set(id, { messages: [], lastSearch: [] });
  return sessions.get(id);
}
export function resetSession(id) {
  sessions.delete(id);
}

// Appends a user turn, merging into a trailing user message so roles always alternate.
function pushUser(messages, content) {
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
  const last = messages[messages.length - 1];
  if (last && last.role === "user") {
    const prev = typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content;
    last.content = [...prev, ...blocks];
  } else {
    messages.push({ role: "user", content: blocks });
  }
}

const brief = (p) => ({
  id: p.id,
  title: p.title,
  brand: p.brand,
  price: p.price,
  compare_at_price: p.compareAt,
  currency: p.currency,
  merchant: p.merchant,
  features: p.features,
  ...(p.rating ? { rating: p.rating } : {}),
});

export function buildCheckout(productId, quantity = 1) {
  const p = getProduct(productId);
  if (!p) throw Object.assign(new Error(`Unknown product id ${productId}. Search for it first.`), { status: 400 });
  const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 10);
  return {
    productId: p.id,
    title: p.title,
    brand: p.brand,
    image: p.image,
    merchant: p.merchant,
    unitPrice: p.price,
    quantity: qty,
    total: Math.round(p.price * qty * 100) / 100,
    currency: p.currency || "USD",
  };
}

// Executes one tool call; mutates `ui` with what the frontend should render.
async function runTool(name, input, session, ui) {
  switch (name) {
    case "search_products": {
      const results = await searchProducts(input);
      session.lastSearch = results;
      return { count: results.length, products: results.map(brief) };
    }
    case "compare_products": {
      const ids = (input.product_ids || []).slice(0, 5);
      return {
        products: ids.map((id) => {
          const p = getProduct(id);
          return p ? { ...brief(p), description: p.description, offer_count: p.offerCount, category: p.category } : { id, error: "not found" };
        }),
      };
    }
    case "show_products": {
      const list = (input.product_ids || []).map(getProduct).filter(Boolean).slice(0, 6);
      ui.products = list;
      ui.recommendedId = input.recommended_id || list[0]?.id || null;
      return { shown: list.length };
    }
    case "propose_checkout": {
      ui.checkout = buildCheckout(input.product_id, input.quantity);
      return { status: "checkout_card_shown", note: "Nothing charged. User must confirm with PayPal.", ...ui.checkout };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

async function claudeTurn(session, userText) {
  const messages = session.messages;
  const startLen = messages.length;
  pushUser(messages, userText);
  const ui = { products: null, recommendedId: null, checkout: null };
  let reply = "";

  try {
    for (let i = 0; i < 8; i++) {
      const params = {
        model: config.anthropic.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      };
      if (config.anthropic.effort) params.output_config = { effort: config.anthropic.effort };
      if (FALLBACK_MODELS.has(config.anthropic.model)) {
        params.betas = ["server-side-fallback-2026-07-01"];
        params.fallbacks = "default";
      }
      const response = await client.beta.messages.create(params);
      messages.push({ role: "assistant", content: response.content });

      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (text) reply = text;

      if (response.stop_reason === "refusal") {
        reply = reply || "Sorry, I can't help with that request.";
        break;
      }
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") break;

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      const results = await Promise.all(
        toolUses.map(async (t) => {
          try {
            const out = await runTool(t.name, t.input || {}, session, ui);
            return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(out) };
          } catch (err) {
            return { type: "tool_result", tool_use_id: t.id, content: String(err.message || err), is_error: true };
          }
        }),
      );
      pushUser(messages, results);
    }
  } catch (err) {
    messages.length = startLen; // roll back the failed turn so history stays valid
    throw err;
  }

  // If Claude searched but forgot to call show_products, show the top results anyway.
  if (!ui.products && !ui.checkout && reply && session.lastSearch.length && /\$\d/.test(reply)) {
    const mentioned = session.lastSearch.filter((p) => reply.includes(p.title.slice(0, 18)));
    ui.products = (mentioned.length ? mentioned : session.lastSearch).slice(0, 3);
    ui.recommendedId = ui.products[0]?.id;
  }
  return { reply, ...ui };
}

// ── Mock agent ──────────────────────────────────────────────────────────
async function mockTurn(session, userText) {
  const text = userText.toLowerCase();
  const ui = { products: null, recommendedId: null, checkout: null };
  session.messages.push({ role: "user", content: userText });

  let reply;
  const ordinal = text.match(/\b(first|second|third|1st|2nd|3rd|#?[123])\b/);
  if (/\b(buy|purchase|checkout|check out|order|get (it|that|the))\b/.test(text) && session.lastShown?.length) {
    const idx = ordinal ? { first: 0, "1st": 0, "1": 0, "#1": 0, second: 1, "2nd": 1, "2": 1, "#2": 1, third: 2, "3rd": 2, "3": 2, "#3": 2 }[ordinal[1]] ?? 0 : null;
    const p = idx !== null ? session.lastShown[idx] : session.lastShown.find((x) => x.id === session.recommendedId) || session.lastShown[0];
    ui.checkout = buildCheckout(p.id, 1);
    reply = `Great choice! Here's your checkout for **${p.title}**. Nothing has been charged yet. Review it and confirm with PayPal when you're ready.`;
  } else if (/compar|differen|versus|\bvs\b/.test(text) && session.lastShown?.length) {
    const [a, b] = session.lastShown;
    reply = `**${a.title}** ($${a.price}) vs **${b.title}** ($${b.price}):\n- ${a.brand}: ${a.features.join(", ")}\n- ${b.brand}: ${b.features.join(", ")}\n\nIf you value ${a.features[0].toLowerCase()}, go with the ${a.brand}. To save $${Math.abs(a.price - b.price).toFixed(2)}, pick the ${a.price > b.price ? b.brand : a.brand}.`;
  } else {
    const budget = parseBudget(userText);
    const query = userText.replace(/(under|below|less than|max|up to)\s*\$?\s*\d+(\.\d+)?/gi, "").replace(/size\s*\d+(\.\d+)?/gi, "");
    let results = await searchProducts({ query, max_price: budget, limit: 6 });
    if (!results.length) results = await searchProducts({ query, limit: 6 });
    if (!results.length) {
      reply = "I couldn't find that in my demo catalog. ShopPal is in **mock mode** (no API keys set), so it only knows a small set of sample products: hiking boots, coffee gear, mechanical keyboards, headphones, backpacks, and Halloween costumes (chicken, vampire, witch, pirate, skeleton, dinosaur, ghost). Add **CHANNEL3_API_KEY** and **ANTHROPIC_API_KEY** to the .env file to search real stores.";
    } else {
      const top = results.slice(0, 3);
      const value = (p) => (p.rating || 4) * 10 - p.price / 50; // quality-for-money score
      const pick = [...top].sort((x, y) => value(y) - value(x))[0];
      ui.products = top;
      ui.recommendedId = pick.id;
      session.lastShown = top;
      session.recommendedId = pick.id;
      const size = userText.match(/size\s*(\d+(\.\d+)?)/i);
      reply =
        (top.length === 1 ? "Here's the best match" : `Here are my top ${top.length}`) +
        `${budget ? ` under $${budget}` : ""}:\n` +
        top.map((p) => `- **${p.title}** ($${p.price.toFixed(2)} at ${p.merchant}): ${reasonFor(p, budget)}`).join("\n") +
        (top.length === 1 ? "" : `\n\nMy pick: **${pick.title}**, the best value for the money.`) +
        (size ? ` I'll note size ${size[1]} for your order.` : "");
    }
  }
  session.messages.push({ role: "assistant", content: reply });
  await new Promise((r) => setTimeout(r, 600)); // feel like a real agent
  return { reply, ...ui };
}

export async function chat(sessionId, userText) {
  const session = getSession(sessionId);
  const result = config.anthropic.mock ? await mockTurn(session, userText) : await claudeTurn(session, userText);
  if (result.products) {
    session.lastShown = result.products;
    session.recommendedId = result.recommendedId;
  }
  return result;
}

// "Buy with PayPal" on a product card: runs propose_checkout directly (instant,
// deterministic) and records it in the history so the agent keeps context.
export function proposeFromCard(sessionId, productId, quantity = 1) {
  const session = getSession(sessionId);
  const checkout = buildCheckout(productId, quantity);
  const reply = `Here's your checkout for **${checkout.title}**. Nothing has been charged yet. Review it and confirm with PayPal.`;
  pushUser(session.messages, `I'd like to buy "${checkout.title}" (id ${checkout.productId}), quantity ${checkout.quantity}.`);
  session.messages.push({ role: "assistant", content: [{ type: "text", text: `[Checkout card shown for ${checkout.productId}, total $${checkout.total}. Awaiting PayPal confirmation.] ${reply}` }] });
  return { reply, checkout };
}

export function recordPurchase(sessionId, receipt) {
  if (!sessionId || !sessions.has(sessionId)) return;
  const s = sessions.get(sessionId);
  pushUser(s.messages, `[System note: PayPal payment completed. Order ${receipt.orderId}, ${receipt.title}, $${receipt.amount} ${receipt.currency}.]`);
  s.messages.push({ role: "assistant", content: [{ type: "text", text: "Payment confirmed. Thanks for shopping with ShopPal!" }] });
}
