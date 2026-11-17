// Shared vocabulary for the Evidence Integrity & Compliance Guard. Used by the
// server policy engine and the UI; contains no legal judgments of its own.

export const OPERATIONS = [
  "integrity_check",
  "text_extraction",
  "transcription",
  "frame_analysis",
  "image_analysis",
  "document_classification",
  "observations",
  "chronology",
  "cross_evidence",
  "case_preparation",
  "assistant_answer",
  "web_research",
  "external_verification",
] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OPERATION_LABEL: Record<Operation, string> = {
  integrity_check: "Integrity check (local)",
  text_extraction: "Text extraction",
  transcription: "Audio transcription",
  frame_analysis: "Video scene and frame analysis",
  image_analysis: "Image analysis",
  document_classification: "Document classification",
  observations: "Relevant observations",
  chronology: "Chronology construction",
  cross_evidence: "Cross-evidence comparison and discrepancies",
  case_preparation: "Source-linked case preparation",
  assistant_answer: "Assistant answers about the case",
  web_research: "Web research",
  external_verification: "External source verification",
};

export const CATEGORIES = [
  "general",
  "identity_document",
  "financial",
  "employment",
  "medical",
  "communications",
  "photo_video",
  "legal",
  "criminal",
  "children",
  "third_party",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  general: "General",
  identity_document: "Identity document",
  financial: "Financial record",
  employment: "Employment record",
  medical: "Medical record (special category)",
  communications: "Personal communications",
  photo_video: "Photographs and video",
  legal: "Legal document",
  criminal: "Criminal allegation or record",
  children: "Children's information",
  third_party: "Third-party personal information",
};

/** Article 9 special-category data. */
export const SPECIAL_CATEGORIES: Category[] = ["medical"];
/** Article 10 / DPA 2018 criminal-offence data. */
export const CRIMINAL_CATEGORIES: Category[] = ["criminal"];

export const LAWFUL_BASES = ["consent", "contract", "legal_obligation", "vital_interests", "public_task", "legitimate_interests"] as const;
export type LawfulBasis = (typeof LAWFUL_BASES)[number];
export const LAWFUL_BASIS_LABEL: Record<LawfulBasis, string> = {
  consent: "Consent (Art. 6(1)(a))",
  contract: "Contract (Art. 6(1)(b))",
  legal_obligation: "Legal obligation (Art. 6(1)(c))",
  vital_interests: "Vital interests (Art. 6(1)(d))",
  public_task: "Public task (Art. 6(1)(e))",
  legitimate_interests: "Legitimate interests (Art. 6(1)(f))",
};

/** AI providers the platform can call. A policy must list one before it is used. */
export const PROVIDERS = ["anthropic", "elevenlabs"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Anthropic (Claude)", elevenlabs: "ElevenLabs (speech to text)" };

export interface PolicyConfig {
  label: string;
  controller: string;
  veyra_role: "processor" | "controller" | "joint_controller";
  processing_instructions: string;
  purpose: string;
  lawful_basis: LawfulBasis | "";
  special_category_condition: string;
  criminal_offence_condition: string;
  schedule1_conditions: string;
  appropriate_policy_document: boolean;
  categories: Category[];
  operations: Operation[];
  providers: Provider[];
  transfer_arrangements: string;
  retention_days: number;
  roles: string[];
  external_verification: boolean;
  verification_providers: string[];
  dpia_required: boolean;
  dpia_status: "not_started" | "in_progress" | "approved";
}

export type Decision = "ALLOW" | "REVIEW_REQUIRED" | "BLOCK";

export type ComplianceStatus = "PENDING_COMPLIANCE_REVIEW" | "APPROVED" | "REVIEW_REQUIRED" | "RESTRICTED" | "BLOCKED";

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  PENDING_COMPLIANCE_REVIEW: "Pending review",
  APPROVED: "Approved for analysis",
  REVIEW_REQUIRED: "Needs review",
  RESTRICTED: "Restricted",
  BLOCKED: "Blocked",
};

export type VerificationStatus = "NOT_REQUESTED" | "AWAITING_AUTHORISATION" | "IN_PROGRESS" | "VERIFIED" | "DISCREPANCY_FOUND" | "NOT_VERIFIED" | "VERIFICATION_NOT_PERMITTED";

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  NOT_REQUESTED: "Not requested",
  AWAITING_AUTHORISATION: "Awaiting authorisation",
  IN_PROGRESS: "In progress",
  VERIFIED: "Verified against the specified source",
  DISCREPANCY_FOUND: "Discrepancy found",
  NOT_VERIFIED: "Not verified",
  VERIFICATION_NOT_PERMITTED: "Unavailable or not permitted",
};

export type IntegrityStatus = "NOT_CHECKED" | "NO_INDICATORS_DETECTED" | "POTENTIAL_ANOMALY" | "PROVENANCE_VERIFIED" | "INCONCLUSIVE" | "HUMAN_REVIEW_REQUIRED";

export const INTEGRITY_STATUS_LABEL: Record<IntegrityStatus, string> = {
  NOT_CHECKED: "Not checked",
  NO_INDICATORS_DETECTED: "No indicators detected",
  POTENTIAL_ANOMALY: "Potential anomaly",
  PROVENANCE_VERIFIED: "Provenance verified",
  INCONCLUSIVE: "Inconclusive",
  HUMAN_REVIEW_REQUIRED: "Human review required",
};

/** Machine-readable reason codes with the sentence shown to people. */
export const REASONS = {
  NO_APPROVED_POLICY: "Your organisation has no approved processing policy, so evidence can't be analysed yet.",
  POLICY_INCOMPLETE: "The processing policy is missing required details.",
  PROCESSING_INSTRUCTIONS_MISSING: "Veyra acts as processor, but no documented processing instructions are recorded.",
  DPIA_NOT_APPROVED: "A DPIA is required and hasn't been approved.",
  ROLE_NOT_PERMITTED: "Your role isn't permitted to run this processing.",
  TENANT_MISMATCH: "The evidence belongs to a different organisation.",
  OPERATION_NOT_APPROVED: "The policy doesn't approve this operation.",
  PROVIDER_NOT_APPROVED: "The AI provider isn't approved in the policy.",
  TRANSFER_NOT_DOCUMENTED: "No transfer or subprocessor arrangement is documented for the AI provider.",
  EVIDENCE_RESTRICTED: "This evidence is restricted. Lift the restriction before processing it.",
  CATEGORY_NOT_COVERED: "The policy doesn't cover this kind of evidence. A responsible person must approve it.",
  CLASSIFICATION_UNCERTAIN: "This may be sensitive evidence. Confirm its type before it is analysed.",
  SPECIAL_CATEGORY_CONDITION_MISSING: "Special-category data (such as health information) needs an Article 9 condition and a Schedule 1 condition in the policy.",
  CRIMINAL_OFFENCE_CONDITION_MISSING: "Criminal-offence data needs an Article 10 / DPA 2018 Schedule 1 condition in the policy.",
  APPROPRIATE_POLICY_DOCUMENT_MISSING: "Special-category or criminal-offence processing needs an appropriate policy document.",
  CHILDREN_DATA_NEEDS_DPIA: "Children's information needs an approved DPIA before it is analysed.",
  VERIFICATION_NOT_PERMITTED: "External verification isn't permitted by the processing policy.",
  NO_VERIFICATION_INTEGRATION: "No approved verification integration exists for this source.",
  INTAKE_SAFEGUARD: "Local integrity checks run at intake and send nothing outside Veyra.",
  HUMAN_APPROVED: "A responsible person approved this evidence for analysis.",
  ENGINE_ERROR: "The compliance check couldn't run, so processing was stopped.",
  CONSENT_NOT_RECORDED: "The policy relies on consent, and no consent covering this evidence has been recorded.",
  CONSENT_WITHDRAWN: "Consent covering this evidence was withdrawn, so it can't be processed further.",
  ACTIVE_CONTENT: "Quarantined at upload: the file contains active content (such as PDF scripts or embedded files). Review it before lifting the restriction.",
  ALL_REQUIREMENTS_MET: "All configured requirements are satisfied.",
} as const;
export type ReasonCode = keyof typeof REASONS;

/** Map integrity indicators to a status. "No indicators" is never proof of authenticity. */
export function integrityStatus(indicators: { level: string; code: string }[] | null | undefined): IntegrityStatus {
  if (!indicators) return "NOT_CHECKED";
  if (indicators.some((i) => i.code === "check_failed")) return "INCONCLUSIVE";
  if (indicators.some((i) => i.level === "strong" || i.level === "critical")) return "HUMAN_REVIEW_REQUIRED";
  if (indicators.some((i) => i.level === "indicator")) return "POTENTIAL_ANOMALY";
  return "NO_INDICATORS_DETECTED";
}
