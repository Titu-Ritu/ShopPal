# 🛍️ ShopPal

**An AI shopping agent you can chat with.** Describe what you want in plain words. ShopPal searches real products, compares the best options, recommends one, and lets you check out with PayPal. It runs in the browser or as a small floating desktop panel you can keep open while you work.

> **Sandbox demo.** Payments use PayPal **sandbox**, so no real money moves. In this demo the payment goes to *our* sandbox merchant account, and the retailer does not receive an order or ship anything. Real fulfillment would need a merchant or agentic-commerce integration (for example, a retailer checkout API or a merchant-of-record partner). The UI labels every checkout "Sandbox demo".

---

## How it works

```
 Chat UI (web or Electron panel)
   │  POST /api/chat
   ▼
 Express server ── Claude tool-use loop ──► search_products  ──► Channel3 /v1/search
                                       ├──► compare_products ──► server-side product cache
                                       ├──► show_products    ──► product cards in the chat
                                       └──► propose_checkout ──► checkout card (charges nothing)
   │
   │  PayPal Smart Button in the checkout card
   ├─ POST /api/paypal/create-order   → OAuth token → POST /v2/checkout/orders (intent CAPTURE)
   └─ POST /api/paypal/capture-order  → POST /v2/checkout/orders/{id}/capture → receipt in chat
```

### How the AI is used
- **Claude** (Anthropic API, tool use; model set by `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) runs an agent loop on the server with four tools: `search_products`, `compare_products`, `show_products` and `propose_checkout`.
- The system prompt tells it to search right away, ask a clarifying question only when it has to (size, budget), show the top 3 with a short reason for each, and recommend one. It may only quote products and prices returned by tools, never invent them.
- Conversation history is kept on the server for each session (in memory).
- For Claude 5-series models, server-side refusal fallbacks are turned on (`fallbacks: "default"`).

### How PayPal is used
- `propose_checkout` only renders a checkout card. **The agent never charges anything.** You confirm by clicking the PayPal button yourself.
- The server looks up the price from its own product cache. The client only sends a product id and a quantity (1–10), so a tampered client can't change the price.
- The frontend uses the PayPal JS SDK Smart Buttons. `createOrder` calls our `/api/paypal/create-order` and `onApprove` calls `/api/paypal/capture-order/:id`. After the capture, a receipt shows up in the chat with the order ID, capture ID, payer and amount.

### Robustness
- **Mock mode**: if a key is missing, that service switches to a realistic mock on its own. The mocks are a rule-based agent, a 23-product catalog with generated images, and a fake PayPal approval dialog. `MOCK_MODE=true` (or `npm run mock`) forces mock mode for everything. The header shows a "Mock" pill whenever any mock is active.
- Errors show up as clear chat messages. Bad API keys, rate limits and PayPal failures each get their own message.
- The only secret the browser ever sees is the PayPal **client id**, which is public by design.

---

## Setup

Requires **Node.js 22.9+** ([nodejs.org](https://nodejs.org)).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Then open http://localhost:3000. With no keys at all, it runs fully in mock mode, so you can try the whole flow right away.

| Script | What it does |
|---|---|
| `npm run dev` | Web app with auto-restart on server changes |
| `npm start` | Web app (production) |
| `npm run mock` | Web app with everything mocked |
| `npm run desktop` | Electron floating panel (dev) |
| `npm run package` | Build desktop installers for macOS + Windows into `dist/` |

### Getting keys

**Anthropic (Claude)**: sign in at [console.anthropic.com](https://console.anthropic.com), open **API Keys**, and create a key. Put it in `ANTHROPIC_API_KEY`. If you switch `ANTHROPIC_MODEL` to an older model such as `claude-sonnet-4-5`, leave `ANTHROPIC_EFFORT` blank.

**Channel3 (products)**: sign up at [trychannel3.com](https://trychannel3.com), copy your API key from the dashboard, and put it in `CHANNEL3_API_KEY`. Docs: [docs.trychannel3.com](https://docs.trychannel3.com). It's sent as the `x-api-key` header to `POST https://api.trychannel3.com/v1/search`.

**PayPal sandbox**
1. Log in at [developer.paypal.com](https://developer.paypal.com) and go to **Apps & Credentials**. Make sure the toggle says **Sandbox**.
2. Click **Create App** (type: Merchant). Copy the **Client ID** into `PAYPAL_CLIENT_ID` and the **Secret** into `PAYPAL_CLIENT_SECRET`. Keep `PAYPAL_ENV=sandbox`.
3. Under **Testing Tools → Sandbox Accounts** there is a default **Personal** (buyer) account. Click ⋯ → *View/Edit account* to see its email and password. Use that account to log in inside the PayPal popup during the demo.

---

## Desktop floating panel (Electron)

```bash
npm run desktop
```

The same codebase serves both versions: Electron starts the Express server inside the app on `127.0.0.1` with a random port and loads the same frontend.

- **Compact panel** (380×560): frameless, rounded, always on top, draggable by the title bar, resizable from 340×420 up to 560×1000. Product cards stack vertically.
- **Expanded window** (1100×750): the full layout with horizontal product rows. Switch with the ⤢ button.
- **Mini bubble**: the ○ button collapses ShopPal into a 64px round button that stays on top. Drag it anywhere and click it to reopen the panel.
- **Remembers** position, size and mode for each mode, plus the pin and opacity settings, in `window-state.json` in the app's userData folder.
- **Global shortcut**: `Cmd/Ctrl + Shift + Space` shows or hides the panel from any app.
- **Tray / menu bar icon** with Show, Hide, Always on top, Opacity (100% / 85%), Mode, and Quit.
- **Pin** (📌) turns always-on-top on or off. **Opacity** (◐) switches between 100% and 85%.
- **Works across desktops/Spaces**, including over full-screen apps on macOS (`setVisibleOnAllWorkspaces`).
- **PayPal in Electron**: `setWindowOpenHandler` lets PayPal popups (`about:blank` → `*.paypal.com`) open as child windows that stay above the panel. Every other link opens in your default browser. If the popup misbehaves, the checkout card has a **"Pay in your browser"** link. It creates the order with a return URL, opens PayPal approval in your default browser, captures the order when PayPal redirects back to `/paypal/return`, and the panel polls until the receipt appears. Either way, the checkout completes.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A small preload script exposes only the window controls through `contextBridge`. The panel can't navigate away from the app.
- **Keys for the packaged app**: put a `.env` in the app's userData folder (macOS: `~/Library/Application Support/ShopPal/.env`, Windows: `%APPDATA%\ShopPal\.env`). With no `.env`, it runs in mock mode.

Packaging: `npm run package:mac` builds a `.dmg` and a `.zip`, and `npm run package:win` builds an NSIS installer and a portable `.exe`. Builds are unsigned, so on macOS you open the app the first time with right-click → Open. If npm warns that `electron-winstaller`'s install script was skipped, run `npm install-scripts approve electron-winstaller` before building for Windows.

Dev smoke test: `SHOPPAL_SELFTEST=/tmp/shots MOCK_MODE=true npm run desktop` steps through every mode, runs a chat and a checkout, checks that the PayPal popup opens as a child window, saves screenshots to that folder, and then quits.

---

## Deploy on Render

`render.yaml` is included. Push the repo to GitHub, then on Render choose **New → Blueprint** and pick the repo. Fill in the secret env vars when prompted. Any key you leave out falls back to mock mode.

---

## Project layout

```
server/
  index.js     Express app + routes (exports startServer for Electron)
  agent.js     Claude tool-use loop, tools, sessions, mock agent
  channel3.js  Channel3 search + normalizer → {id,title,brand,image,price,currency,merchant,url}
  paypal.js    PayPal OAuth, create/capture order, mock flow, return-URL flow
  catalog.js   server-side product cache (source of truth for prices)
  mock.js      mock catalog, images, helpers
  config.js    env + per-service mock switches
public/        index.html, styles.css, app.js (no build step)
electron/      main.cjs, preload.cjs, tray icons, selftest.cjs
build/         app icon for electron-builder
```
