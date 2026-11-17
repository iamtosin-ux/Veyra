// Things that happen in a case, as opposed to what the evidence shows: filings,
// hearings, police attendance, notices. Each sector offers the kinds relevant to it.

export interface ActivityKind {
  key: string;
  label: string;
  /** Sectors this kind is offered for; none means every sector. */
  industries?: string[];
}

export const ACTIVITY_KINDS: ActivityKind[] = [
  { key: "police_attendance", label: "Police attendance", industries: ["Social housing", "Health and social care", "Insurance claims", "Property management", "Legal services"] },
  { key: "police_report", label: "Police report or crime reference", industries: ["Social housing", "Insurance claims", "Property management", "HR investigations", "Legal services"] },
  { key: "notice_served", label: "Notice served", industries: ["Social housing", "Property management"] },
  { key: "warning_issued", label: "Warning issued", industries: ["Social housing", "HR investigations"] },
  { key: "inspection", label: "Inspection or survey", industries: ["Social housing", "Property management", "Construction disputes", "Insurance claims", "Legal services"] },
  { key: "repair_works", label: "Repair works", industries: ["Social housing", "Property management"] },
  { key: "court_application", label: "Court application or filing", industries: ["Social housing", "Legal services", "Construction disputes", "Insurance claims", "Property management"] },
  { key: "court_hearing", label: "Court hearing", industries: ["Social housing", "Legal services", "Construction disputes", "Insurance claims", "Property management"] },
  { key: "court_order", label: "Court order", industries: ["Social housing", "Legal services", "Construction disputes", "Property management"] },
  { key: "tribunal_claim", label: "Tribunal claim", industries: ["HR investigations", "Legal services"] },
  { key: "suspension", label: "Suspension", industries: ["HR investigations"] },
  { key: "investigation_meeting", label: "Investigation meeting", industries: ["HR investigations", "Legal services"] },
  { key: "hearing", label: "Disciplinary or grievance hearing", industries: ["HR investigations", "Legal services"] },
  { key: "appeal", label: "Appeal", industries: ["HR investigations", "Legal services", "Insurance claims"] },
  { key: "safeguarding_referral", label: "Safeguarding referral", industries: ["Health and social care", "Social housing"] },
  { key: "regulator_notification", label: "Regulator notification", industries: ["Health and social care", "Construction disputes", "Social housing"] },
  { key: "claim_notified", label: "Claim notified", industries: ["Insurance claims", "Legal services"] },
  { key: "loss_adjuster_visit", label: "Loss adjuster visit", industries: ["Insurance claims"] },
  { key: "letter_sent", label: "Letter sent" },
  { key: "letter_received", label: "Letter received" },
  { key: "meeting", label: "Meeting or call" },
  { key: "other", label: "Other" },
];

export const activityKind = (key: string | null | undefined) => ACTIVITY_KINDS.find((k) => k.key === key) ?? null;
export const kindsFor = (industry: string | null | undefined) => ACTIVITY_KINDS.filter((k) => !k.industries || (industry ? k.industries.includes(industry) : true));
