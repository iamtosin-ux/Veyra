import type { Category } from "@/lib/compliance";

// Staged, privacy-preserving classification. Stage 1 uses only what the
// uploader declared and the file name/type; no content is read and nothing is
// sent anywhere. A hint of sensitive content without a declaration is treated
// as uncertain, so the restrictive route applies until a person confirms it.

const HINTS: { category: Category; pattern: RegExp }[] = [
  { category: "medical", pattern: /(medical|doctor|gp[\s_-]?(letter|note)|fit[\s_-]?note|sick[\s_-]?note|hospital|diagnos|prescription|nhs|clinic|patient|mental[\s_-]?health)/i },
  { category: "criminal", pattern: /(police|arrest|caution|conviction|criminal|offence|crime[\s_-]?ref|charge[\s_-]?sheet|dbs[\s_-]?check|court[\s_-]?record)/i },
  { category: "children", pattern: /(child|minor|school[\s_-]?report|safeguarding|nursery|pupil)/i },
  { category: "identity_document", pattern: /(passport|driv(ing|er'?s?)[\s_-]*licen[cs]e|national[\s_-]?id|id[\s_-]?card|birth[\s_-]?certificate|residence[\s_-]?permit|brp)/i },
  { category: "financial", pattern: /(bank[\s_-]?statement|payslip|p60|p45|invoice|salary|tax[\s_-]?return|credit|loan|mortgage)/i },
  { category: "employment", pattern: /(contract[\s_-]?of[\s_-]?employment|disciplinary|grievance|shift|rota|timesheet|clocking|appraisal|hr[\s_-])/i },
  { category: "legal", pattern: /(witness[\s_-]?statement|claim[\s_-]?form|tribunal|solicitor|court|tenancy|agreement|letter[\s_-]?before[\s_-]?action)/i },
  { category: "communications", pattern: /(whatsapp|sms|text[\s_-]?message|email|chat[\s_-]?export|voicemail)/i },
];

const SENSITIVE: Category[] = ["medical", "criminal", "children", "identity_document", "financial"];

export interface Classification {
  category: Category;
  source: "declared" | "local" | "default";
  /** False when the category is a guess that may be sensitive: route restrictively until confirmed. */
  confirmed: boolean;
}

export function classifyIntake(filename: string, evidenceType: string, declared?: Category | null): Classification {
  if (declared) return { category: declared, source: "declared", confirmed: true };
  const hit = HINTS.find((h) => h.pattern.test(filename));
  if (hit) return { category: hit.category, source: "local", confirmed: !SENSITIVE.includes(hit.category) };
  if (evidenceType === "video" || evidenceType === "image") return { category: "photo_video", source: "local", confirmed: true };
  return { category: "general", source: "default", confirmed: true };
}
