export function evaluateHealth({ enabled, textEnabled, translationFallbackToQwen, ai, translator }) {
  const textRequired = Boolean(enabled && textEnabled);
  const textHealthy = !textRequired || Boolean(ai);
  const translationHealthy = !textRequired
    || Boolean(translator)
    || Boolean(translationFallbackToQwen && ai);

  return {
    ok: textHealthy && translationHealthy,
    textHealthy,
    translationHealthy,
  };
}
