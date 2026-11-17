// Canvas templates: which sections a case's canvas shows, in what order and
// under what names, for each kind of work. Choosing one changes only how the
// canvas is laid out; the evidence, findings and notes underneath stay the same.

import { caseType } from "./caseTypes";

/**
 * The sections a template can place. Each draws on one part of the case pack:
 * the summary, the findings, potential discrepancies, open questions or the
 * reviewer's notes. A chronology, evidence list or map is added only on request.
 */
export type TemplateSectionKey = "summary" | "findings" | "discrepancies" | "questions" | "notes";

/** Kinds of finding a section can be narrowed to. */
export type SectionFindingType = "observation" | "supporting_relationship" | "chronological_relationship" | "potential_discrepancy" | "missing_information" | "question";

export interface TemplateSection {
  key: TemplateSectionKey;
  title: string;
  /** Only these kinds of finding; all of the section's kinds when left out. */
  types?: SectionFindingType[];
  /** What the section is for, shown while it's empty. */
  empty: string;
}

export interface CanvasTemplate {
  key: string;
  label: string;
  /** The practice the layout follows, named in the conversation when it's chosen. */
  basis: string | null;
  /** The sector it's for. */
  industry: string | null;
  /** A single case type the template is built around. */
  caseType: string | null;
  sections: TemplateSection[];
}

const FACTS: SectionFindingType[] = ["observation", "supporting_relationship", "chronological_relationship"];

const summary: TemplateSection = { key: "summary", title: "Summary", empty: "A summary appears once the case has been analysed." };
const notes = (who = "the reviewer"): TemplateSection => ({
  key: "notes",
  title: `Information provided by ${who}`,
  empty: "Details you tell Veyra are recorded here, attributed to you and kept separate from the original evidence.",
});

export const GENERAL_TEMPLATE: CanvasTemplate = {
  key: "general",
  label: "General",
  basis: null,
  industry: null,
  caseType: null,
  sections: [
    summary,
    { key: "findings", title: "Key findings", empty: "Findings appear once the evidence has been compared." },
    { key: "questions", title: "Missing information and open questions", empty: "Gaps and open questions appear once the evidence has been compared." },
    notes(),
  ],
};

// Each sector's layout follows the document its practitioners work towards:
// the letter of claim for disrepair and civil claims, the investigation report
// for HR, and the injunction or case review file for anti-social behaviour.
export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  GENERAL_TEMPLATE,
  {
    key: "social_housing",
    label: "Social housing",
    basis: "the Pre-Action Protocol for Housing Conditions Claims (England) and Awaab's Law",
    industry: "Social housing",
    caseType: null,
    sections: [
      summary,
      { key: "findings", title: "Defects and their history", types: FACTS, empty: "Each defect, where it is and how long it has been there, as a letter of claim sets out." },
      { key: "discrepancies", title: "When the landlord was told", empty: "Conflicting accounts of when and how the landlord was told. Notice is central to a disrepair claim." },
      { key: "questions", title: "Needed before the landlord responds", empty: "Records still to obtain, such as the tenancy file, repair logs and inspection reports. A landlord has 20 working days to respond to a letter of claim." },
      notes(),
    ],
  },
  {
    key: "legal_services",
    label: "Legal services",
    basis: "the Practice Direction on Pre-Action Conduct",
    industry: "Legal services",
    caseType: null,
    sections: [
      summary,
      { key: "findings", title: "Facts relied on", types: FACTS, empty: "The facts the claim rests on, each tied to its source." },
      { key: "discrepancies", title: "Issues in dispute", empty: "Where the accounts or documents disagree, so the issues can be narrowed before a claim is issued." },
      { key: "questions", title: "Evidence still needed", empty: "Documents and answers still needed for the other side to assess liability." },
      notes(),
    ],
  },
  {
    key: "hr_investigations",
    label: "HR investigations",
    basis: "the Acas Code of Practice and its guide to workplace investigations",
    industry: "HR investigations",
    caseType: null,
    sections: [
      summary,
      { key: "findings", title: "Allegations and evidence", types: FACTS, empty: "What the evidence shows on each allegation, for the investigator to weigh on the balance of probabilities." },
      { key: "discrepancies", title: "Conflicting accounts", empty: "Where witnesses or records disagree. Each party's account is kept separate." },
      { key: "questions", title: "Follow-up questions", types: ["question", "missing_information"], empty: "Questions for further interviews and records still to request." },
      notes("the investigator"),
    ],
  },
  {
    key: "anti_social_behaviour",
    label: "Anti-social behaviour",
    basis: "the Anti-social Behaviour, Crime and Policing Act 2014",
    industry: "Social housing",
    caseType: "anti_social_behaviour",
    sections: [
      summary,
      { key: "findings", title: "Pattern of incidents", types: FACTS, empty: "Incidents, who was affected and how they connect, as an injunction application would set out." },
      { key: "discrepancies", title: "Conflicting accounts", empty: "Where reports from residents, staff or partners disagree." },
      { key: "questions", title: "Gaps before action", empty: "Witness statements, logs or partner consultation still needed. A civil injunction must be proved on the balance of probabilities." },
      notes("the case officer"),
    ],
  },
  {
    key: "healthcare",
    label: "Healthcare",
    basis: "the NHS Patient Safety Incident Response Framework (PSIRF)",
    industry: "Healthcare",
    caseType: null,
    sections: [
      summary,
      { key: "findings", title: "What happened", types: FACTS, empty: "Care given, observations and decisions in order, each tied to its record." },
      { key: "discrepancies", title: "Where accounts and records differ", empty: "Differences between staff accounts, the clinical record and what patients or families say." },
      { key: "questions", title: "Questions for the learning response", empty: "Records still to gather, such as rotas, escalation logs and the family's questions. PSIRF looks for learning, not blame." },
      notes(),
    ],
  },
  {
    key: "financial_services",
    label: "Financial services",
    basis: "the FCA's complaint handling rules (DISP)",
    industry: "Financial services",
    caseType: null,
    sections: [
      summary,
      { key: "findings", title: "Transactions and events", types: FACTS, empty: "Payments, warnings and contacts in order, each tied to its record." },
      { key: "discrepancies", title: "Where the customer and records differ", empty: "Differences between the customer's account and the bank's logs, warnings and call records." },
      { key: "questions", title: "Needed for the final response", empty: "Records still needed. Payment complaints usually need a final response within 15 business days, others within 8 weeks." },
      notes(),
    ],
  },
  {
    key: "energy",
    label: "Energy",
    basis: "Ofgem's standards of conduct and back-billing rules",
    industry: "Energy",
    caseType: null,
    sections: [
      summary,
      { key: "findings", title: "Metering and billing facts", types: FACTS, empty: "Readings, bills, meter faults and visits in order, each tied to its source." },
      { key: "discrepancies", title: "Where the customer and records differ", empty: "Differences between the customer's account and the supplier's billing and contact records." },
      { key: "questions", title: "Needed before the final response", empty: "Records still needed. After 8 weeks without a resolution, the customer can go to the Energy Ombudsman." },
      notes(),
    ],
  },
];

/**
 * The template a case uses: the one chosen for it, else the one for its case
 * type (its own template if it has one, else its sector's), else its
 * industry's, else General.
 */
export function templateFor(chosen: string | null | undefined, type: string | null | undefined, industry?: string | null): CanvasTemplate {
  const picked = CANVAS_TEMPLATES.find((t) => t.key === chosen);
  if (picked) return picked;
  const t = caseType(type);
  const sector = t?.industry ?? industry;
  return (t && CANVAS_TEMPLATES.find((x) => x.caseType === t.key)) ?? CANVAS_TEMPLATES.find((x) => !x.caseType && sector && x.industry === sector) ?? GENERAL_TEMPLATE;
}

export const isTemplateKey = (key: string) => CANVAS_TEMPLATES.some((t) => t.key === key);
