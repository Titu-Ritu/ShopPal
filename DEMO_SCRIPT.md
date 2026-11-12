# ShopPal: 90-second demo script

**Before recording:** fill in all keys in `.env` and run `npm run desktop` (or `npm run dev`). Log in to the PayPal sandbox buyer account once beforehand so the popup is fast. Open a code editor full-screen behind the panel. Do one warm-up query so the first answer isn't slow.

| Time | On screen | Voiceover |
|---|---|---|
| **0:00–0:10** | The code editor fills the screen. Press **⌘⇧Space**, and the compact ShopPal panel floats in at the top right. | "I'm in the middle of coding and I need new hiking boots. I'm not opening twelve tabs. I'll just ask ShopPal." |
| **0:10–0:30** | Click the chip **"Waterproof hiking boots under $120, size 10"**. The typing indicator shows "Searching stores…", then 3 stacked product cards appear with a ★ Top pick. | "ShopPal is an AI agent built on Claude. It turns my request into a real product search with Channel3, filters to my budget, and picks the top three, with a reason for each and one recommendation. Every price comes from live data. Nothing is made up." |
| **0:30–0:42** | Type **"compare the top two"**. A short tradeoff answer appears. | "I can keep talking to it like a person. It pulls the details and explains the tradeoffs." |
| **0:42–0:50** | Click **⤢**, and the panel expands into the full window with horizontal product cards. | "Want more room? One click expands it. One codebase serves both the web app and this desktop panel." |
| **0:50–1:15** | Click **Buy with PayPal** on the top pick. The checkout card appears (Sandbox demo label). Bump quantity if you like. Click the PayPal button, approve in the sandbox popup, and the ✓ receipt with order and capture IDs appears in the chat. | "When I'm ready, the agent prepares a checkout, but it never charges me on its own. I confirm with PayPal. The server looks up the price itself, so the client can't tamper with it, then creates and captures a PayPal order. This is sandbox, so the money goes to our test merchant account." |
| **1:15–1:25** | Click **○**, and the panel shrinks to the floating bubble. Drag it to a corner and go back to the code. | "Then it gets out of my way: a little bubble that stays on top of everything, across every desktop." |
| **1:25–1:30** | Title card: *ShopPal: describe it, compare it, buy it. Claude + Channel3 + PayPal.* | "ShopPal. Shopping without leaving your flow." |

**Backup plan:** if Wi-Fi or an API fails on stage, run `npm run mock` (or set `MOCK_MODE=true`). The whole flow still works with mock products and a mock PayPal dialog.

**Honesty line (say it if judges ask):** "Payments go to our PayPal sandbox merchant account. Shipping a real order would need a merchant or agentic-commerce integration with the retailer. That's the next step."
