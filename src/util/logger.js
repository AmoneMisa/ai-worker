// Minimal structured-ish logger. Keep dependency-free; swap for the app's logger
// if this ever merges into one (spec §61 — don't duplicate infra needlessly).
function line(level, msg, extra) {
  const ts = new Date().toISOString();
  const tail = extra ? ' ' + JSON.stringify(extra) : '';
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[${ts}] ${level.toUpperCase()} ${msg}${tail}`);
}

export const log = {
  info: (msg, extra) => line('info', msg, extra),
  warn: (msg, extra) => line('warn', msg, extra),
  error: (msg, extra) => line('error', msg, extra),
};
