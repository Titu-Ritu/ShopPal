// ShopPal frontend: plain JS, no build step. Shared by the web app and the Electron panel.
const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const scroller = $("#scroller");
const input = $("#input");
const sendBtn = $("#send");
const desktop = window.shoppal || null; // exposed by electron/preload.cjs

let sessionId = crypto.randomUUID();
let busy = false;
let cfg = { mock: {}, paypalClientId: null };
let paypalSdk = null;

// ── Utils ──
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(Number(n));
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const scrollDown = () => requestAnimationFrame(() => (scroller.scrollTop = scroller.scrollHeight));

// Minimal, safe markdown: escape first, then **bold**, *italic*, bullet lists, paragraphs.
function md(text) {
  const lines = esc(text).split("\n");
  let html = "", list = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\W)\*(?!\s)(.+?)\*(?=\W|$)/g, "$1<i>$2</i>");
    const li = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (li) { if (!list) { html += "<ul>"; list = true; } html += `<li>${li[1]}</li>`; continue; }
    if (list) { html += "</ul>"; list = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (list ? "</ul>" : "");
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ── Message rendering ──
function addUser(text) {
  $("#welcome").hidden = true;
  messagesEl.append(el(`<div class="msg user"><div class="bubble-text">${esc(text)}</div></div>`));
  scrollDown();
}
function addBot({ text, error } = {}) {
  $("#welcome").hidden = true;
  const node = el(`<div class="msg bot${error ? " error" : ""}"><div class="avatar">🛍️</div><div class="body"></div></div>`);
  if (text) node.querySelector(".body").append(el(`<div class="bubble-text">${md(text)}</div>`));
  messagesEl.append(node);
  scrollDown();
  return node.querySelector(".body");
}

const TYPING_STEPS = ["Thinking", "Searching stores", "Comparing options", "Picking the best"];
function showTyping() {
  const body = addBot();
  const t = el(`<div class="bubble-text"><span class="typing"><span class="dots"><i></i><i></i><i></i></span><span class="lbl">Thinking…</span></span></div>`);
  body.append(t);
  let i = 0;
  const timer = setInterval(() => { i = Math.min(i + 1, TYPING_STEPS.length - 1); t.querySelector(".lbl").textContent = TYPING_STEPS[i] + "…"; }, 1600);
  return () => { clearInterval(timer); body.closest(".msg").remove(); };
}

function productCard(p, recommended) {
  const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🛍️',style:'font-size:40px'}))">` : `<span style="font-size:40px">🛍️</span>`;
  const sale = p.compareAt && p.compareAt > p.price ? `<s>${fmt(p.compareAt, p.currency)}</s>` : "";
  const card = el(`
    <article class="card${recommended ? " recommended" : ""}">
      ${recommended ? `<span class="badge">★ Top pick</span>` : ""}
      <div class="img">${img}</div>
      <div class="info">
        ${p.brand ? `<div class="brandname">${esc(p.brand)}</div>` : ""}
        <div class="title" title="${esc(p.title)}">${esc(p.title)}</div>
        <div class="price"><b>${fmt(p.price, p.currency)}</b>${sale}</div>
        <div class="merchant">${p.merchant ? `at ${esc(p.merchant)}` : ""}${p.offerCount > 1 ? ` · ${p.offerCount} offers` : ""}</div>
        <div class="btns">
          <button class="buy-btn" type="button">Buy with <span class="pp">Pay<em>Pal</em></span></button>
          ${p.url ? `<a class="view-btn" href="${esc(p.url)}" target="_blank" rel="noopener" title="View at store" aria-label="View at store">↗</a>` : ""}
        </div>
      </div>
    </article>`);
  card.querySelector(".buy-btn").addEventListener("click", () => buyFromCard(p));
  return card;
}

function renderProducts(body, products, recommendedId) {
  if (!products?.length) return;
  const row = el(`<div class="products"></div>`);
  products.forEach((p) => row.append(productCard(p, p.id === recommendedId)));
  body.append(row);
}

// ── Checkout card ──
function renderCheckout(body, c) {
  let qty = c.quantity || 1;
  const card = el(`
    <section class="checkout">
      <header><span>Checkout</span><span class="pill sandbox">Sandbox demo</span></header>
      <div class="item">
        <img src="${esc(c.image || "")}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">
        <div><div class="t">${esc(c.title)}</div><div class="m">${c.merchant ? "Sold by " + esc(c.merchant) : ""}</div></div>
      </div>
      <div class="rows">
        <div class="row"><span>Price</span><span>${fmt(c.unitPrice, c.currency)}</span></div>
        <div class="row"><span>Quantity</span><span class="qty"><button type="button" data-d="-1" aria-label="Decrease">−</button><span class="q">${qty}</span><button type="button" data-d="1" aria-label="Increase">+</button></span></div>
        <div class="row total"><span>Total</span><span class="tot">${fmt(c.unitPrice * qty, c.currency)}</span></div>
      </div>
      <div class="pp-container"></div>
      <div class="status-line" hidden></div>
      <div class="note">🔒 Sandbox demo: payment goes to ShopPal's PayPal <b>sandbox</b> merchant account, so no real money moves and the store won't ship. Real fulfillment would need a merchant / agentic-commerce integration.
        ${desktop ? `<br><button class="link-btn ext" type="button">Trouble with the popup? Pay in your browser</button>` : ""}</div>
    </section>`);
  const getQty = () => qty;
  card.querySelectorAll(".qty button").forEach((b) =>
    b.addEventListener("click", () => {
      if (card.dataset.paid) return;
      qty = Math.min(10, Math.max(1, qty + Number(b.dataset.d)));
      card.querySelector(".q").textContent = qty;
      card.querySelector(".tot").textContent = fmt(c.unitPrice * qty, c.currency);
    }),
  );
  body.append(card);
  mountPayPal(card, c, getQty);
  card.querySelector(".ext")?.addEventListener("click", () => payInBrowser(card, c, getQty));
  scrollDown();
}

function setStatus(card, text) {
  const s = card.querySelector(".status-line");
  s.hidden = !text;
  s.textContent = text || "";
}

async function createOrder(c, qty, external = false) {
  const order = await api("/api/paypal/create-order", { productId: c.productId, quantity: qty, sessionId, external });
  return order;
}

async function onPaid(card, receipt) {
  card.dataset.paid = "1";
  card.querySelector(".pp-container").classList.add("locked");
  card.querySelector(".pp-container").hidden = true;
  card.querySelector(".qty").style.pointerEvents = "none";
  setStatus(card, "");
  const body = addBot({ text: `Payment complete! 🎉 Your order for **${receipt.title}** went through.` });
  body.append(
    el(`<section class="receipt">
      <header><span>✓ Payment captured</span><span>${receipt.mock ? "Mock sandbox" : "PayPal sandbox"}</span></header>
      <div class="item"><img src="${esc(receipt.image || "")}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'"><div><div class="t">${esc(receipt.title)}</div><div class="m">Qty ${receipt.quantity}${receipt.merchant ? " · " + esc(receipt.merchant) : ""}</div></div></div>
      <dl>
        <dt>Amount</dt><dd><b>${fmt(receipt.amount, receipt.currency)}</b></dd>
        <dt>Order ID</dt><dd>${esc(receipt.orderId)}</dd>
        <dt>Capture ID</dt><dd>${esc(receipt.captureId || "–")}</dd>
        <dt>Status</dt><dd>${esc(receipt.status)}</dd>
        <dt>Payer</dt><dd>${esc(receipt.payer)}</dd>
      </dl>
      <div class="note">Sandbox demo: no real money moved and nothing will ship.</div>
    </section>`),
  );
  scrollDown();
}

async function loadPayPalSdk() {
  if (paypalSdk) return paypalSdk;
  paypalSdk = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK unavailable")));
    s.onerror = () => { paypalSdk = null; reject(new Error("Couldn't load the PayPal SDK. Check your connection.")); };
    document.head.append(s);
  });
  return paypalSdk;
}

async function mountPayPal(card, c, getQty) {
  const box = card.querySelector(".pp-container");
  if (cfg.mock.paypal || !cfg.paypalClientId) return mountMockPayPal(card, c, getQty);
  box.innerHTML = `<div class="status-line">Loading PayPal…</div>`;
  try {
    const paypal = await loadPayPalSdk();
    box.innerHTML = "";
    await paypal
      .Buttons({
        style: { layout: "vertical", color: "gold", shape: "pill", label: "paypal", height: 44 },
        createOrder: async () => (await createOrder(c, getQty())).id,
        onApprove: async (data) => {
          setStatus(card, "Capturing payment…");
          try {
            const receipt = await api(`/api/paypal/capture-order/${encodeURIComponent(data.orderID)}`, {});
            await onPaid(card, receipt);
          } catch (err) {
            setStatus(card, "⚠️ " + err.message);
          }
        },
        onCancel: () => setStatus(card, "Payment cancelled. You can try again anytime."),
        onError: (err) => setStatus(card, "⚠️ PayPal error: " + (err?.message || err)),
      })
      .render(box);
  } catch (err) {
    box.innerHTML = "";
    setStatus(card, "⚠️ " + err.message);
  }
}

// Fake PayPal buttons + approval dialog so the demo works without keys.
function mountMockPayPal(card, c, getQty) {
  const box = card.querySelector(".pp-container");
  box.innerHTML = `<div class="mock-pp">
      <button class="pp-btn" type="button">Pay<em>Pal</em></button>
      <button class="card-btn" type="button">Debit or Credit Card</button>
    </div>`;
  box.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        const order = await createOrder(c, getQty());
        const ok = await mockApprove(c.unitPrice * getQty(), c.currency);
        if (!ok) return setStatus(card, "Payment cancelled. You can try again anytime.");
        setStatus(card, "Capturing payment…");
        const receipt = await api(`/api/paypal/capture-order/${encodeURIComponent(order.id)}`, {});
        await onPaid(card, receipt);
      } catch (err) {
        setStatus(card, "⚠️ " + err.message);
      }
    }),
  );
}
function mockApprove(amount, currency) {
  return new Promise((resolve) => {
    const m = $("#mockPaypal");
    $("#mockAmount").textContent = fmt(amount, currency);
    m.hidden = false;
    const done = (v) => { m.hidden = true; $("#mockPay").onclick = $("#mockCancel").onclick = null; resolve(v); };
    $("#mockPay").onclick = () => done(true);
    $("#mockCancel").onclick = () => done(false);
  });
}

// Desktop fallback: open PayPal approval in the default browser, then poll until captured.
async function payInBrowser(card, c, getQty) {
  try {
    const order = await createOrder(c, getQty(), true);
    if (!order.approveUrl) throw new Error("PayPal didn't return an approval link.");
    desktop?.openExternal ? desktop.openExternal(order.approveUrl) : window.open(order.approveUrl, "_blank");
    setStatus(card, "Waiting for you to approve in your browser…");
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await api(`/api/paypal/order-status/${encodeURIComponent(order.id)}`).catch(() => null);
      if (s?.receipt) return onPaid(card, s.receipt);
      if (s?.status === "CANCELLED") return setStatus(card, "Payment cancelled in the browser.");
      if (s?.status === "FAILED") return setStatus(card, "⚠️ " + (s.error || "Payment failed."));
    }
    setStatus(card, "Timed out waiting for PayPal. Try again.");
  } catch (err) {
    setStatus(card, "⚠️ " + err.message);
  }
}

// ── Actions ──
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  autosize();
  addUser(text);
  const stop = showTyping();
  try {
    const r = await api("/api/chat", { sessionId, message: text });
    stop();
    const body = addBot({ text: r.reply || (r.products ? "Here's what I found:" : "Done.") });
    renderProducts(body, r.products, r.recommendedId);
    if (r.checkout) renderCheckout(body, r.checkout);
  } catch (err) {
    stop();
    addBot({ text: `Sorry, something went wrong: ${err.message}`, error: true });
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
    scrollDown();
  }
}

async function buyFromCard(p) {
  if (busy) return;
  busy = true;
  addUser(`Buy ${p.title}`);
  try {
    const r = await api("/api/checkout/propose", { sessionId, productId: p.id, quantity: 1 });
    const body = addBot({ text: r.reply });
    renderCheckout(body, r.checkout);
  } catch (err) {
    addBot({ text: `Couldn't start checkout: ${err.message}`, error: true });
  } finally {
    busy = false;
  }
}

async function newChat() {
  api("/api/reset", { sessionId }).catch(() => {});
  sessionId = crypto.randomUUID();
  messagesEl.innerHTML = "";
  $("#welcome").hidden = false;
  input.focus();
}

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

// ── Wiring ──
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
});
input.addEventListener("input", autosize);
$("#chips").addEventListener("click", (e) => { if (e.target.matches(".chip")) send(e.target.textContent); });
$("#newChat").addEventListener("click", newChat);

api("/api/config")
  .then((c) => {
    cfg = c;
    const mocks = Object.entries(c.mock || {}).filter(([, v]) => v).map(([k]) => k);
    if (mocks.length) {
      const pill = $("#mockPill");
      pill.hidden = false;
      pill.textContent = mocks.length === 3 ? "Mock mode" : `Mock: ${mocks.join(", ")}`;
      pill.title = `Running with mock ${mocks.join(", ")}. Add API keys to .env for live data.`;
    }
  })
  .catch(() => {});

// ── Desktop (Electron) panel controls ──
if (desktop) {
  document.body.classList.add("desktop");
  const applyState = (s) => {
    document.body.classList.toggle("mode-compact", s.mode === "compact");
    document.body.classList.toggle("mode-expanded", s.mode === "expanded");
    document.body.classList.toggle("bubble-mode", s.mode === "bubble");
    $("#pinBtn").classList.toggle("active", !!s.alwaysOnTop);
    $("#pinBtn").title = s.alwaysOnTop ? "Always on top: on" : "Always on top: off";
    $("#opacityBtn").classList.toggle("active", s.opacity < 1);
    $("#opacityBtn").title = `Opacity ${Math.round(s.opacity * 100)}%`;
    $("#modeBtn").title = s.mode === "expanded" ? "Compact panel" : "Expand window";
  };
  desktop.onState(applyState);
  desktop.getState().then(applyState);
  $("#pinBtn").addEventListener("click", () => desktop.togglePin());
  $("#opacityBtn").addEventListener("click", () => desktop.toggleOpacity());
  $("#modeBtn").addEventListener("click", () => desktop.toggleMode());
  $("#bubbleBtn").addEventListener("click", () => desktop.toBubble());
  $("#closeBtn").addEventListener("click", () => desktop.hide());

  // Bubble: drag to move, click (without moving) to expand.
  const bubble = $("#bubble");
  let drag = null;
  bubble.addEventListener("pointerdown", (e) => {
    drag = { x: e.screenX, y: e.screenY, moved: false };
    bubble.setPointerCapture(e.pointerId);
  });
  bubble.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    desktop.dragBy(dx, dy);
    drag.x = e.screenX; drag.y = e.screenY;
  });
  bubble.addEventListener("pointerup", () => {
    if (drag && !drag.moved) desktop.fromBubble();
    drag = null;
  });
}

input.focus();
