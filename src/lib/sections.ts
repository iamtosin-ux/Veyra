// The case pack's sections. Each can be tagged for human review and can take approved web sources.
export const PACK_SECTIONS = {
  evidence: "Evidence",
  findings: "Key findings",
  discrepancies: "Potential discrepancies",
  chronology: "Chronology",
  questions: "Missing information and open questions",
  notes: "Information provided by the reviewer",
} as const;

export type SectionKey = keyof typeof PACK_SECTIONS;
export const SECTION_KEYS = Object.keys(PACK_SECTIONS) as SectionKey[];
export const isSectionKey = (s: string): s is SectionKey => s in PACK_SECTIONS;
