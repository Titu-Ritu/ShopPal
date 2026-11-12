import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { buildCheckout } from "./agent.js";

const BASE = config.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const orders = new Map(); // orderId -> { checkout, sessionId, status, receipt }

let tokenCache = { token: null, expires: 0 };
async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires - 60_000) return tokenCache.token;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${data.error_description || data.error || "check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET"}`);
  tokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function paypalFetch(path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.details?.[0]?.description || data.message || res.statusText;
    throw new Error(`PayPal ${path} failed (${res.status}): ${detail}`);
  }
  return data;
}

const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

// Price is always looked up server-side from the product cache; the client only sends an id.
export async function createOrder({ productId, quantity, sessionId, returnBase }) {
  const checkout = buildCheckout(productId, quantity);
  if (config.paypal.mock) {
    const id = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;
    orders.set(id, { checkout, sessionId, status: "CREATED" });
    return { id, mock: true };
  }

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: checkout.productId.slice(0, 256),
        description: `ShopPal sandbox demo: ${checkout.title}`.slice(0, 127),
        amount: {
          currency_code: checkout.currency,
          value: money(checkout.total),
          breakdown: { item_total: { currency_code: checkout.currency, value: money(checkout.total) } },
        },
        items: [
          {
            name: checkout.title.slice(0, 127),
            quantity: String(checkout.quantity),
            unit_amount: { currency_code: checkout.currency, value: money(checkout.unitPrice) },
            category: "PHYSICAL_GOODS",
          },
        ],
      },
    ],
  };
  // Redirect flow (used by the desktop app's "open in browser" fallback).
  if (returnBase) {
    body.payment_source = {
      paypal: {
        experience_context: {
          brand_name: "ShopPal (Sandbox demo)",
          user_action: "PAY_NOW",
          shipping_preference: "GET_FROM_FILE",
          return_url: `${returnBase}/paypal/return`,
          cancel_url: `${returnBase}/paypal/cancel`,
        },
      },
    };
  }
  const order = await paypalFetch("/v2/checkout/orders", body);
  orders.set(order.id, { checkout, sessionId, status: order.status });
  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { id: order.id, approveUrl };
}

export async function captureOrder(orderId) {
  const record = orders.get(orderId);
  if (!record) throw Object.assign(new Error("Unknown order id"), { status: 404 });
  if (record.receipt) return record.receipt; // idempotent

  let receipt;
  if (config.paypal.mock) {
    receipt = {
      orderId,
      captureId: `MOCKCAP-${randomUUID().slice(0, 10).toUpperCase()}`,
      status: "COMPLETED",
      payer: "Sandbox Buyer (mock)",
      payerEmail: "buyer@example.com",
    };
  } else {
    const data = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`);
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    receipt = {
      orderId: data.id,
      captureId: capture?.id,
      status: capture?.status || data.status,
      payer: [data.payer?.name?.given_name, data.payer?.name?.surname].filter(Boolean).join(" ") || "PayPal buyer",
      payerEmail: data.payer?.email_address,
    };
  }
  Object.assign(receipt, {
    title: record.checkout.title,
    image: record.checkout.image,
    quantity: record.checkout.quantity,
    amount: money(record.checkout.total),
    currency: record.checkout.currency,
    merchant: record.checkout.merchant,
    mock: config.paypal.mock,
    time: new Date().toISOString(),
  });
  record.status = "COMPLETED";
  record.receipt = receipt;
  return { ...receipt, sessionId: record.sessionId };
}

export function orderStatus(orderId) {
  const r = orders.get(orderId);
  if (!r) return null;
  return { status: r.status, receipt: r.receipt || null, error: r.error || null };
}
export function markOrder(orderId, patch) {
  const r = orders.get(orderId);
  if (r) Object.assign(r, patch);
}
