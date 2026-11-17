// Shared by the server and the browser.

/** Times are positioned as stated (no timezone conversion): parse ISO parts as UTC. */
export function parseStated(iso: string): number | null {
  const m = iso.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo = "01", d = "01", hh = "00", mm = "00", ss = "00"] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}
