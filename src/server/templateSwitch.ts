import { CANVAS_TEMPLATES, type TemplateSectionKey } from "@/lib/canvasTemplates";
import { HttpError, type User } from "./auth";
import { updateCase } from "./cases";
import { postMessage } from "./assistant/assistant";
import { findingsList } from "./assistant/knowledge";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Change the canvas template and say so in the conversation: which sections the
 * case now has and what each holds. Nothing in the case changes, only its layout.
 */
export function switchTemplate(user: User, caseId: string, key: string, ms: number) {
  const t = CANVAS_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new HttpError(400, "Unknown template");
  updateCase(user, caseId, { canvas_template: t.key });

  const findings = findingsList(caseId).filter((f) => f.review_status !== "rejected");
  const pools: Partial<Record<TemplateSectionKey, typeof findings>> = {
    findings: findings.filter((f) => !["potential_discrepancy", "missing_information", "question"].includes(f.finding_type)),
    discrepancies: findings.filter((f) => f.finding_type === "potential_discrepancy"),
    questions: findings.filter((f) => f.finding_type === "missing_information" || f.finding_type === "question"),
  };
  const counted = t.sections
    .filter((s) => pools[s.key])
    .map((s) => ({ title: s.title, n: pools[s.key]!.filter((f) => !s.types || (s.types as string[]).includes(f.finding_type)).length }));
  const placed = counted.reduce((a, c) => a + c.n, 0);

  postMessage(caseId, "user", { text: `Use the ${t.label} template` }, user.id);
  postMessage(
    caseId,
    "assistant",
    {
      mode: "offline",
      text: [
        `Switched the canvas to **${t.label}**${t.basis ? `, following ${t.basis}` : ""}. Nothing in the case changed, only how it's laid out.`,
        ...counted.map((c) => `- ${c.title}: ${plural(c.n, "item")}`),
      ].join("\n"),
      trace: {
        steps: [
          { label: `Read the ${t.label} template`, detail: plural(t.sections.length, "section") },
          { label: "Sorted the findings into its sections", detail: plural(placed, "finding") },
          { label: "Laid out the canvas" },
        ],
        ms: Math.max(0, Math.min(ms, 60_000)),
      },
    },
    null,
  );
  return t;
}
