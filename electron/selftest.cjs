// Dev-only smoke test: SHOPPAL_SELFTEST=<dir> npm run desktop
// Cycles through the window modes, runs a mock chat + checkout, and saves screenshots to <dir>.
const { BrowserWindow, app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function selftest({ win, applyMode, togglePin, setOpacity, state }) {
  const out = process.env.SHOPPAL_SELFTEST;
  fs.mkdirSync(out, { recursive: true });
  const log = (...a) => console.log("[selftest]", ...a);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win().webContents.executeJavaScript(code);
  const shot = async (name) => {
    await wait(400);
    const img = await win().webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    log(name, JSON.stringify(win().getBounds()), "onTop=" + win().isAlwaysOnTop(), "opacity=" + win().getOpacity());
  };
  try {
    await new Promise((r) => (win().webContents.isLoading() ? win().webContents.once("did-finish-load", r) : r()));
    await wait(800);
    log("desktop bridge:", await js("JSON.stringify({desktop: document.body.classList.contains('desktop'), node: typeof require})"));
    if (state.mode !== "compact") applyMode("compact");
    await shot("1-compact-welcome");

    await js(`document.querySelector('.chip').click()`);
    await wait(2500);
    await shot("2-compact-results");

    await js(`document.querySelector('.recommended .buy-btn').click()`);
    await wait(1200);
    await shot("3-compact-checkout");

    applyMode("expanded");
    await wait(600);
    await shot("4-expanded");

    applyMode("bubble");
    await wait(600);
    await shot("5-bubble");
    log("bubble class:", await js("document.body.classList.contains('bubble-mode')"));

    // Click the bubble (pointerdown/up without moving) -> back to the last panel mode.
    await js(`(() => { const b = document.getElementById('bubble'); const o = {bubbles:true, pointerId:1, screenX:10, screenY:10};
      b.dispatchEvent(new PointerEvent('pointerdown', o)); b.dispatchEvent(new PointerEvent('pointerup', o)); })()`);
    await wait(800);
    log("after bubble click mode:", state.mode);

    togglePin(); log("pin toggled ->", state.alwaysOnTop, win().isAlwaysOnTop());
    togglePin();
    setOpacity(0.85); await shot("6-opacity-85");
    setOpacity(1);

    // PayPal popups must open as child windows; other links must not.
    const before = BrowserWindow.getAllWindows().length;
    await js(`window.open('https://www.sandbox.paypal.com/checkoutnow', '_blank', 'width=400,height=600'); 1`);
    await wait(1500);
    const afterPP = BrowserWindow.getAllWindows().length;
    log("paypal popup opened child window:", afterPP === before + 1);
    BrowserWindow.getAllWindows().filter((w) => w !== win()).forEach((w) => w.destroy());

    applyMode("compact");
    await wait(500);
    log("state:", JSON.stringify(state));
  } catch (err) {
    log("FAILED", err.stack || err);
  } finally {
    await wait(500);
    app.exit(0);
  }
};
