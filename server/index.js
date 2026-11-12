import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config, describeModes } from "./config.js";
import { chat, proposeFromCard, resetSession, recordPurchase } from "./agent.js";
import { createOrder, captureOrder, orderStatus, markOrder } from "./paypal.js";
import { mockImageSvg } from "./mock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  const wrap = (fn) => (req, res) =>
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(`[${req.method} ${req.path}]`, err.message);
      res.status(err.status && err.status < 500 ? err.status : 500).json({ error: friendlyError(err) });
    });

  // Only the PayPal client id is exposed to the browser (it is public by design).
  app.get("/api/config", (req, res) => {
    res.json({
      paypalClientId: config.paypal.mock ? null : config.paypal.clientId,
      paypalEnv: config.paypal.env,
      mock: { claude: config.anthropic.mock, products: config.channel3.mock, paypal: config.paypal.mock },
      model: config.anthropic.mock ? "mock agent" : config.anthropic.model,
    });
  });

  app.post("/api/chat", wrap(async (req, res) => {
    const { sessionId, message } = req.body || {};
    if (!sessionId || typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "sessionId and message are required" });
    res.json(await chat(String(sessionId), message.trim().slice(0, 2000)));
  }));

  app.post("/api/checkout/propose", wrap(async (req, res) => {
    const { sessionId, productId, quantity } = req.body || {};
    res.json(proposeFromCard(String(sessionId), productId, quantity));
  }));

  app.post("/api/reset", (req, res) => {
    resetSession(String(req.body?.sessionId));
    res.json({ ok: true });
  });

  // ── PayPal ──
  app.post("/api/paypal/create-order", wrap(async (req, res) => {
    const { productId, quantity, sessionId, external } = req.body || {};
    const returnBase = external ? `${req.protocol}://${req.get("host")}` : null;
    const order = await createOrder({ productId, quantity, sessionId, returnBase });
    if (external && order.mock) order.approveUrl = `${returnBase}/paypal/mock-approve?token=${order.id}`;
    res.json(order);
  }));

  app.post("/api/paypal/capture-order/:id", wrap(async (req, res) => {
    const receipt = await captureOrder(req.params.id);
    recordPurchase(receipt.sessionId, receipt);
    delete receipt.sessionId;
    res.json(receipt);
  }));

  app.get("/api/paypal/order-status/:id", (req, res) => {
    const s = orderStatus(req.params.id);
    s ? res.json(s) : res.status(404).json({ error: "Unknown order" });
  });

  // Return URL for the open-in-browser flow (desktop fallback).
  app.get("/paypal/return", wrap(async (req, res) => {
    const id = String(req.query.token || "");
    try {
      const receipt = await captureOrder(id);
      recordPurchase(receipt.sessionId, receipt);
      res.send(page("Payment complete ✅", `Order <b>${esc(receipt.orderId)}</b> for <b>${esc(receipt.title)}</b> ($${receipt.amount}) was captured in PayPal sandbox. You can close this tab and return to ShopPal.`));
    } catch (err) {
      markOrder(id, { status: "FAILED", error: friendlyError(err) });
      res.status(500).send(page("Payment failed", esc(friendlyError(err))));
    }
  }));
  app.get("/paypal/cancel", (req, res) => {
    markOrder(String(req.query.token || ""), { status: "CANCELLED" });
    res.send(page("Payment cancelled", "No money was moved. You can close this tab and return to ShopPal."));
  });
  app.get("/paypal/mock-approve", (req, res) => {
    const t = encodeURIComponent(String(req.query.token || ""));
    res.send(page("PayPal (mock sandbox)", `Approve this mock payment?<br><br><a class="btn" href="/paypal/return?token=${t}">Pay now</a> &nbsp; <a href="/paypal/cancel?token=${t}">Cancel</a>`));
  });

  app.get("/mock-img/:id.svg", (req, res) => {
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(mockImageSvg(req.params.id));
  });

  return app;
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (err?.status === 401 || /authentication_error|invalid x-api-key/i.test(msg)) return "The AI service rejected the API key. Check ANTHROPIC_API_KEY in .env.";
  if (err?.status === 429) return "The AI service is rate limiting us. Please try again in a few seconds.";
  if (err?.status === 529 || /overloaded/i.test(msg)) return "The AI service is overloaded right now. Please try again.";
  return msg;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShopPal</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#1a1d29;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.c{background:#fff;padding:32px;border-radius:16px;max-width:420px;box-shadow:0 8px 30px #0001;text-align:center;line-height:1.5}
.btn{display:inline-block;background:#ffc439;color:#111;padding:10px 22px;border-radius:999px;font-weight:700;text-decoration:none}
small{color:#888}</style><div class="c"><h2>${title}</h2><p>${body}</p><small>ShopPal · Sandbox demo</small></div>`;

// Electron passes host "127.0.0.1"; hosted deploys (Render) need 0.0.0.0.
export function startServer(port = config.port, host = process.env.HOST || "0.0.0.0") {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(port, host, () => {
      const actual = server.address().port;
      console.log(`\n🛍️  ShopPal running at http://localhost:${actual}\n   ${describeModes()}\n`);
      resolve({ server, port: actual });
    });
    server.on("error", reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err) => {
    console.error("Failed to start ShopPal:", err.message);
    process.exit(1);
  });
}
