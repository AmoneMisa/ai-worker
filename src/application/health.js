// Pure configuration check (mirrors how vision health already works — no live
// probing of external providers, since they're stateless HTTP APIs we don't
// own and can't meaningfully "ping" for readiness).
export function evaluateHealth({ enabled, textEnabled, textProvidersConfigured }) {
  const textRequired = Boolean(enabled && textEnabled);
  const textHealthy = !textRequired || Boolean(textProvidersConfigured);

  return {
    ok: textHealthy,
    textHealthy,
  };
}
