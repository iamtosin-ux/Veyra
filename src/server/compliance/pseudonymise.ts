// Data minimisation before text leaves Veyra: direct identifiers that the
// analysis doesn't need are swapped for stable placeholders, and swapped back
// in the response so quotes still match their sources. Names, times and places
// are kept: they're what the analysis is about. Images, audio and PDFs sent as
// files can't be masked this way.

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "EMAIL", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "NI_NUMBER", re: /\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi },
  { kind: "CARD", re: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: "SORT_CODE", re: /\b\d{2}-\d{2}-\d{2}\b/g },
  { kind: "ACCOUNT", re: /\b(?:account|acct|a\/c)(?:\s+(?:no\.?|number))?[:\s]+\d{8}\b/gi },
  { kind: "PHONE", re: /(?:\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b|(?:\+44\s?|\b0)(?:1|2|3)\d{2,3}\s?\d{3}\s?\d{3,4}\b/g },
  { kind: "NHS_NUMBER", re: /\b\d{3}\s\d{3}\s\d{4}\b/g },
];

// Luhn check keeps ordinary long numbers (timestamps, references) from being treated as cards.
function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export class Pseudonymiser {
  private forward = new Map<string, string>();
  private back = new Map<string, string>();
  private counts = new Map<string, number>();

  get replaced(): number {
    return this.forward.size;
  }

  mask(text: string): string {
    let out = text;
    for (const { kind, re } of PATTERNS) {
      out = out.replace(re, (m) => {
        if (kind === "CARD") {
          const digits = m.replace(/\D/g, "");
          if (digits.length < 13 || !luhn(digits)) return m;
        }
        const existing = this.forward.get(m);
        if (existing) return existing;
        const n = (this.counts.get(kind) ?? 0) + 1;
        this.counts.set(kind, n);
        const token = `[${kind}_${n}]`;
        this.forward.set(m, token);
        this.back.set(token, m);
        return token;
      });
    }
    return out;
  }

  unmask(text: string): string {
    return this.back.size ? text.replace(/\[[A-Z_]+_\d+\]/g, (t) => this.back.get(t) ?? t) : text;
  }

  /** Restore originals in every string inside a parsed response. */
  unmaskDeep<T>(value: T): T {
    if (typeof value === "string") return this.unmask(value) as T;
    if (Array.isArray(value)) return value.map((v) => this.unmaskDeep(v)) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.unmaskDeep(v)])) as T;
    return value;
  }
}
