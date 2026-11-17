import type { CaseStatus } from "@/lib/types";

export interface EvidenceItem {
  display_name?: string | null;
  uploaded_by_name?: string | null;
  case_id?: string;
  compliance_status?: import("@/lib/compliance").ComplianceStatus;
  id: string;
  reference: string;
  original_filename: string;
  evidence_type: string;
  mime_type: string;
  file_size: number;
  file_hash: string;
  uploaded_at: string;
  processing_status: string;
  processing_error: string | null;
  duplicate_of_reference: string | null;
  observation_count: number;
  metadata: Record<string, unknown>;
  /** For vault files: the cases using this file, with the reference it has in each. */
  used_in?: { case_id: string; title: string; reference: string }[];
}

export interface RunItem {
  id: string;
  scope: "evidence" | "segment" | "case";
  status: string;
  stage: string | null;
  evidence_id: string | null;
  evidence_reference: string | null;
  error_details: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CaseData {
  case: {
    id: string;
    reference: string;
    title: string;
    description: string;
    created_at: string;
    updated_at: string;
    status: CaseStatus;
    evidence_count: number;
    findings_count: number;
    findings_needing_review: number;
    is_demo: boolean;
    pinned?: boolean;
    archived?: boolean;
    project_id?: string | null;
    industry: string | null;
    summary?: string | null;
    summary_source?: string | null;
    created_by?: string | null;
    access?: "workspace" | "invited";
    case_type?: string | null;
    canvas_template?: string | null;
  };
  evidence: EvidenceItem[];
  runs: RunItem[];
  latestCaseRun: { id: string; status: string; stage: string | null; error_details: string | null; completed_at: string | null; processing_configuration: string } | null;
}
