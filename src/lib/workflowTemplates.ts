import type { IconName } from "@/components/Icon";

// Ready-made starting points. Using one copies it into your workflows to edit and save.
export const TEMPLATES: { key: string; icon: IconName; name: string; description: string; steps: string[]; instructions: string }[] = [
  { key: "tamper", icon: "shield", name: "Tamper and AI check", description: "Check every item for editing, re-encoding and AI-generation indicators.", steps: ["integrity"], instructions: "Report items with indicators first, with what to request to verify provenance." },
  { key: "statements", icon: "humanReview", name: "Witness statement comparison", description: "Compare accounts against each other and the recorded evidence.", steps: ["extract", "compare"], instructions: "Focus on where accounts agree and differ on time, place and who did what." },
  { key: "chronology", icon: "timeline", name: "Chronology builder", description: "Build a sourced timeline from every item, with stated times only.", steps: ["extract", "compare"], instructions: "Prioritise the sequence of events. Never infer dates the evidence does not state." },
  { key: "hearing", icon: "review", name: "Pre-hearing validity check", description: "Find anything that could undermine the case before it is relied on.", steps: ["integrity", "review"], instructions: "Lead with critical issues. Note what would resolve each one." },
  { key: "disrepair", icon: "folder", name: "Disrepair claim check", description: "Match photos, reports and letters to the repair history.", steps: ["extract", "integrity", "compare"], instructions: "Look for dates of reports, inspections and repairs, and gaps between them." },
  { key: "contributions", icon: "request", name: "Contributor upload triage", description: "Check and extract newly contributed evidence from invite links.", steps: ["integrity", "extract"], instructions: "Flag anonymous or unattributed uploads." },
  { key: "grievance", icon: "findings", name: "Workplace grievance review", description: "Compare the complaint, responses, logs and footage, then review gaps.", steps: ["extract", "compare", "review"], instructions: "Keep each party's account separate; do not judge credibility." },
  { key: "claim", icon: "analysis", name: "Insurance claim consistency", description: "Test the claimant's account against telematics, photos and reports.", steps: ["extract", "integrity", "compare"], instructions: "Highlight discrepancies in times, speeds and damage descriptions." },
];

// Icons for each kind of step, shared by the list and the canvas.
export const STEP_ICON: Record<string, IconName> = { extract: "files", integrity: "shield", compare: "compare", review: "review" };
