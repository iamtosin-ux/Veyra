import crypto from "node:crypto";
import { all, get, now, parseJson, run, tx } from "../db";
import { HttpError, type User } from "../auth";
import { getCaseForUser, nextReference, touchCase } from "../cases";
import { enqueueJob } from "../jobs";
import { isDemoCase } from "../evidence";
import { MODEL, callStructured, describeAiError } from "../ai/client";
import { sectionInstructionText } from "../collab";
import { CASE_SYSTEM_PROMPT } from "../ai/prompts";
import { CaseAnalysisSchema, type CaseAnalysis } from "../ai/schemas";
import { validateChronologyEntry, validateFinding, type KnownObservation } from "./validate";
import { completeRun, failRun, getRun, recordRejection, setStage, startRun } from "./runs";
import { formatCitation, type EventTime, type SourceReference } from "@/lib/types";
import type { Provider } from "@/lib/compliance";
import { ComplianceBlockedError, authorise, caseOrganisation, completeAudit, type Authorisation } from "../compliance/engine";

export function queueCaseAnalysis(user: User, caseId: string, focus?: string): string {
  getCaseForUser(user, caseId);
  authorise({ operation: "cross_evidence", provider: isDemoCase(caseId) ? null : "anthropic", organisationId: user.organisation_id, caseId, user });
  return tx(() => {
    if (get("SELECT id FROM analysis_runs WHERE case_id = ? AND scope = 'case' AND status IN ('queued','running')", caseId)) {
      throw new HttpError(409, "Case analysis is already in progress");
    }
    if (get("SELECT id FROM evidence WHERE case_id = ? AND processing_status IN ('queued','processing')", caseId)) {
      throw new HttpError(409, "Wait for evidence processing to finish before comparing evidence");
    }
    const processed = Number(get<{ n: number }>("SELECT COUNT(*) n FROM evidence WHERE case_id = ? AND processing_status = 'processed'", caseId)?.n);
    if (processed === 0) throw new HttpError(400, "Process at least one evidence item first");
    const runId = crypto.randomUUID();
    run(
      "INSERT INTO analysis_runs (id, case_id, scope, status, stage, processing_configuration, created_at) VALUES (?, ?, 'case', 'queued', 'Queued', ?, ?)",
      runId,
      caseId,
      JSON.stringify(focus ? { focus } : {}),
      now(),
    );
    enqueueJob("analyse_case", { runId, demo: isDemoCase(caseId) });
    return runId;
  });
}

export interface ObsRow {
  id: string;
  reference: string;
  evidence_id: string;
  observation_type: string;
  description: string;
  quote: string | null;
  source_reference: string;
  event_time: string | null;
  uncertainty: string;
}

/** The cross-evidence reasoning step. Claude in normal use; swappable for demo data. */
export interface CaseAnalyser {
  model: string;
  provider: Provider | null;
  analyse: (input: { runId: string; inventory: string; observationList: string; observations: ObsRow[]; focus?: string; auth: Authorisation }) => Promise<CaseAnalysis>;
}

export const claudeCaseAnalyser: CaseAnalyser = {
  model: MODEL,
  provider: "anthropic",
  analyse: ({ runId, inventory, observationList, focus, auth }) =>
    callStructured({
      authorisation: auth,
      runId,
      purpose: "case:cross_evidence",
      system: CASE_SYSTEM_PROMPT,
      content: [
        {
          type: "text",
          text: `<evidence>\n## Evidence inventory\n${inventory}\n\n## Observations extracted from the evidence\n${observationList}\n</evidence>\n\n${focus ? `Reviewer's focus for this analysis (an instruction from the user, not evidence): ${focus}\n\n` : ""}Compare these observations across evidence items. Produce findings and a proposed chronology as specified. Cite only the OBS references above.`,
        },
      ],
      schema: CaseAnalysisSchema,
      effort: "high",
    }),
};

export async function analyseCaseRun(runId: string, heartbeat: () => void, analyser: CaseAnalyser = claudeCaseAnalyser) {
  const r = getRun(runId);
  if (!r) throw new Error("Run not found");
  const caseId = r.case_id;
  // The run's own focus plus any instructions saved on the case's sections.
  const focus = [parseJson<{ focus?: string }>(r.processing_configuration, {}).focus, sectionInstructionText(caseId)].filter(Boolean).join("\n") || undefined;
  // Compliance: the case-level operation must be allowed, and only evidence the
  // policy allows for comparison is included. Each decision is audited.
  const organisationId = caseOrganisation(caseId);
  let auth: Authorisation;
  try {
    auth = authorise({ operation: "cross_evidence", provider: analyser.provider, organisationId, caseId, user: null, modelVersion: analyser.model });
  } catch (err) {
    failRun(runId, `Blocked by processing policy: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
  const permitted = new Set<string>();
  for (const { id } of all<{ id: string }>("SELECT id FROM evidence WHERE case_id = ?", caseId)) {
    try {
      authorise({ operation: "cross_evidence", provider: analyser.provider, organisationId, caseId, evidenceId: id, user: null, modelVersion: analyser.model });
      permitted.add(id);
    } catch (err) {
      if (!(err instanceof ComplianceBlockedError)) throw err;
    }
  }
  startRun(runId, analyser.model, { pipeline: "case-analysis/1", focus });
  run("UPDATE analysis_runs SET policy_id = ?, policy_version = ? WHERE id = ?", auth.policyId, auth.policyVersion, runId);
  try {
    setStage(runId, "Comparing evidence");
    const evidence = all<{ id: string; reference: string; evidence_type: string; original_filename: string; uploaded_at: string; metadata: string; duplicate_of: string | null; processing_status: string }>(
      "SELECT id, reference, evidence_type, original_filename, uploaded_at, metadata, duplicate_of, processing_status FROM evidence WHERE case_id = ? ORDER BY reference",
      caseId,
    ).filter((e) => permitted.has(e.id));
    const evRef = new Map(evidence.map((e) => [e.id, e.reference]));
    // Minimum necessary: observations from evidence the policy doesn't allow are never sent.
    const obs = all<ObsRow>(
      "SELECT * FROM observations WHERE case_id = ? AND superseded = 0 ORDER BY reference",
      caseId,
    ).filter((o) => permitted.has(o.evidence_id));
    if (obs.length === 0) throw new Error("No observations available to compare.");

    const known = new Map<string, KnownObservation>(
      obs.map((o) => [
        o.reference,
        {
          id: o.id,
          reference: o.reference,
          evidence_id: o.evidence_id,
          source_reference: parseJson<SourceReference>(o.source_reference, {} as SourceReference),
          event_time: parseJson<EventTime | null>(o.event_time, null),
        },
      ]),
    );

    const inventory = evidence
      .map((e) => {
        const m = parseJson<Record<string, unknown>>(e.metadata, {});
        const tech = (m.technical ?? {}) as { duration_seconds?: number; container_creation_time?: string };
        return [
          `${e.reference}: ${e.evidence_type}, "${e.original_filename}", uploaded ${e.uploaded_at}`,
          tech.duration_seconds ? `duration ${tech.duration_seconds.toFixed(1)}s` : "",
          tech.container_creation_time ? `file metadata creation_time ${tech.container_creation_time} (unverified device clock)` : "",
          m.stated_author ? `author as entered: ${m.stated_author}` : "",
          e.duplicate_of ? `IDENTICAL FILE HASH to ${evRef.get(e.duplicate_of)}` : "",
          e.processing_status !== "processed" ? `NOT ANALYSED (${e.processing_status})` : "",
        ]
          .filter(Boolean)
          .join("; ");
      })
      .join("\n");

    const observationList = obs
      .map((o) => {
        const sr = parseJson<SourceReference>(o.source_reference, {} as SourceReference);
        const et = parseJson<EventTime | null>(o.event_time, null);
        const unc = parseJson<{ requires_review?: boolean; reason?: string; speaker_label?: string }>(o.uncertainty, {});
        return [
          `${o.reference} [${o.observation_type}] cited at ${formatCitation(evRef.get(o.evidence_id) ?? "?", sr)}`,
          `  ${o.description}`,
          o.quote ? `  Quote: "${o.quote}"` : "",
          unc.speaker_label ? `  Speaker: ${unc.speaker_label}` : "",
          et ? `  Event time: ${et.stated_text ?? ""}${et.iso_datetime ? ` (iso ${et.iso_datetime}, precision ${et.precision})` : ""}${et.basis ? `; basis: ${et.basis}` : ""}` : "",
          unc.requires_review && unc.reason ? `  Uncertainty: ${unc.reason}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    heartbeat();
    const ai = await analyser.analyse({ runId, inventory, observationList, observations: obs, focus, auth });

    setStage(runId, "Preparing findings");
    heartbeat();
    // A short summary for case lists; marked as AI-written or demo-written.
    if (ai.case_summary?.trim()) {
      run("UPDATE cases SET summary = ?, summary_source = ? WHERE id = ?", ai.case_summary.trim().slice(0, 600), analyser.model.startsWith("demo:") ? "demo" : "ai", caseId);
    }
    tx(() => {
      // Re-analysis never overwrites human review: only unreviewed drafts from older runs are superseded.
      run(
        "UPDATE findings SET superseded = 1, updated_at = ? WHERE case_id = ? AND analysis_run_id != ? AND review_status = 'unreviewed' AND superseded = 0",
        now(),
        caseId,
        runId,
      );
      run(
        "UPDATE chronology_events SET superseded = 1 WHERE case_id = ? AND analysis_run_id != ? AND review_status = 'unreviewed'",
        caseId,
        runId,
      );
      for (const f of ai.findings) {
        const v = validateFinding(f, known);
        if (!v.ok) {
          recordRejection(runId, "finding", v.reason, f);
          continue;
        }
        const id = crypto.randomUUID();
        const ts = now();
        run(
          `INSERT INTO findings (id, case_id, analysis_run_id, reference, title, description, finding_type, relationship_explanation,
             uncertainty, review_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?)`,
          id,
          caseId,
          runId,
          nextReference(caseId, "finding"),
          f.title.trim(),
          f.description.trim(),
          f.finding_type,
          f.relationship_explanation,
          JSON.stringify({ requires_review: v.requires_review, reason: v.limitations }),
          ts,
          ts,
        );
        for (const s of v.sources) {
          run(
            "INSERT INTO finding_sources (id, finding_id, observation_id, evidence_id, source_reference) VALUES (?, ?, ?, ?, ?)",
            crypto.randomUUID(),
            id,
            s.id,
            s.evidence_id,
            JSON.stringify(s.source_reference),
          );
        }
      }
      for (const c of ai.chronology) {
        const v = validateChronologyEntry(c, known);
        if (!v.ok) {
          recordRejection(runId, "chronology", v.reason, c);
          continue;
        }
        run(
          `INSERT INTO chronology_events (id, case_id, analysis_run_id, description, event_datetime, date_text, time_precision,
             observation_ids, evidence_ids, relationship_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          caseId,
          runId,
          c.description,
          v.iso_datetime,
          c.date_text,
          v.precision,
          JSON.stringify(v.sources.map((s) => s.id)),
          JSON.stringify([...new Set(v.sources.map((s) => s.evidence_id))]),
          [c.relationship_note, v.note].filter(Boolean).join(" ") || null,
          now(),
        );
      }
      if (ai.coverage_notes.length) {
        run("UPDATE analysis_runs SET processing_configuration = ? WHERE id = ?", JSON.stringify({ pipeline: "case-analysis/1", coverage_notes: ai.coverage_notes }), runId);
      }
    });
    completeRun(runId);
    completeAudit(auth.auditId, "completed", runId);
    touchCase(caseId);
  } catch (err) {
    failRun(runId, describeAiError(err));
    touchCase(caseId);
    throw err;
  }
}
