import type { PolicyConfig } from "./compliance";

// Mock policies for synthetic demo data and tests only. They are not legal
// advice and must not be used with real evidence: a real policy is written and
// approved by the responsible organisation with its legal and data-protection advisers.

export const MOCK_APPROVED_POLICY: PolicyConfig = {
  label: "Mock approved policy (synthetic demo data only)",
  controller: "Demo Litigation LLP (synthetic)",
  veyra_role: "processor",
  processing_instructions: "Process uploaded case evidence only to prepare source-linked case files for the controller's reviewers.",
  purpose: "Preparing evidence for employment and housing dispute investigations on behalf of the controller.",
  lawful_basis: "legitimate_interests",
  special_category_condition: "",
  criminal_offence_condition: "",
  schedule1_conditions: "",
  appropriate_policy_document: false,
  categories: ["general", "photo_video", "communications", "employment", "legal", "third_party"],
  operations: ["text_extraction", "transcription", "frame_analysis", "image_analysis", "document_classification", "observations", "chronology", "cross_evidence", "case_preparation", "assistant_answer", "web_research"],
  providers: ["anthropic"],
  transfer_arrangements: "Synthetic demo: provider covered by the controller's processing agreement and transfer assessment.",
  retention_days: 365,
  roles: ["admin", "member"],
  external_verification: false,
  verification_providers: [],
  dpia_required: true,
  dpia_status: "approved",
};

/** Restricted: approved, but with no AI provider and only local text extraction. */
export const MOCK_RESTRICTED_POLICY: PolicyConfig = {
  ...MOCK_APPROVED_POLICY,
  label: "Mock restricted policy (synthetic demo data only)",
  operations: ["text_extraction"],
  providers: [],
  transfer_arrangements: "",
  categories: ["general"],
};
