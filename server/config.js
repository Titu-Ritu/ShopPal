// Central config. Each external service falls back to mock mode independently
// when its keys are missing, so the demo always works end to end.
const env = process.env;
const forceMock = String(env.MOCK_MODE || "").toLowerCase() === "true" || process.argv.includes("--mock");
const has = (v) => typeof v === "string" && v.trim().length > 0;

export const config = {
  port: Number(env.PORT) || 3000,
  forceMock,
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    effort: (env.ANTHROPIC_EFFORT ?? "low").trim(),
    mock: forceMock || !has(env.ANTHROPIC_API_KEY),
  },
  channel3: {
    apiKey: env.CHANNEL3_API_KEY,
    mock: forceMock || !has(env.CHANNEL3_API_KEY),
  },
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    env: (env.PAYPAL_ENV || "sandbox").toLowerCase(),
    mock: forceMock || !has(env.PAYPAL_CLIENT_ID) || !has(env.PAYPAL_CLIENT_SECRET),
  },
};

export function describeModes() {
  const m = (b) => (b ? "MOCK" : "LIVE");
  return `Claude: ${m(config.anthropic.mock)} (${config.anthropic.model}) · Channel3: ${m(config.channel3.mock)} · PayPal: ${m(config.paypal.mock)} (${config.paypal.env})`;
}
