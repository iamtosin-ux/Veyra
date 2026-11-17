import crypto from "node:crypto";
import path from "node:path";
import { all, get, now, parseJson, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { caseFolder, getCaseForUser, nextReference, touchCase } from "./cases";
import { sha256, storeOriginal } from "./storage";
import { enqueueJob } from "./jobs";
import type { EvidenceType, ProcessingStatus } from "@/lib/types";
import type { Category } from "@/lib/compliance";
import { classifyIntake } from "./compliance/classify";
import { scanUpload } from "./compliance/scan";
import { audit, authorise, caseOrganisation, refreshEvidenceCompliance } from "./compliance/engine";

export interface EvidenceRow {
  id: string;
  case_id: string;
  reference: string;
  original_filename: string;
  evidence_type: EvidenceType;
  mime_type: string;
  file_size: number;
  storage_reference: string;
  file_hash: string;
  duplicate_of: string | null;
  uploaded_at: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  metadata: string;
  compliance_status?: string;
  display_name?: string | null;
}

interface FormatSpec {
  type: EvidenceType;
  mime: string;
  maxBytes: number;
  sniff: (b: Buffer) => boolean;
}

const MB = 1024 * 1024;
const isFtyp = (b: Buffer) => b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp";
const isZip = (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
const isRiff = (b: Buffer, form: string) =>
  b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === form;

/** Allow-list of accepted formats; content is sniffed, not just the extension. */
export const FORMATS: Record<string, FormatSpec> = {
  ".mp4": { type: "video", mime: "video/mp4", maxBytes: 500 * MB, sniff: isFtyp },
  ".mov": { type: "video", mime: "video/quicktime", maxBytes: 500 * MB, sniff: isFtyp },
  ".jpg": { type: "image", mime: "image/jpeg", maxBytes: 25 * MB, sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".jpeg": { type: "image", mime: "image/jpeg", maxBytes: 25 * MB, sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".png": { type: "image", mime: "image/png", maxBytes: 25 * MB, sniff: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  ".webp": { type: "image", mime: "image/webp", maxBytes: 25 * MB, sniff: (b) => isRiff(b, "WEBP") },
  ".mp3": {
    type: "audio",
    mime: "audio/mpeg",
    maxBytes: 200 * MB,
    sniff: (b) => b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  ".wav": { type: "audio", mime: "audio/wav", maxBytes: 200 * MB, sniff: (b) => isRiff(b, "WAVE") },
  ".m4a": { type: "audio", mime: "audio/mp4", maxBytes: 200 * MB, sniff: isFtyp },
  ".pdf": { type: "document", mime: "application/pdf", maxBytes: 50 * MB, sniff: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  ".docx": {
    type: "document",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    maxBytes: 50 * MB,
    sniff: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  },
  ".xlsx": { type: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", maxBytes: 50 * MB, sniff: isZip },
  ".pptx": { type: "document", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxBytes: 100 * MB, sniff: isZip },
  ".odt": { type: "document", mime: "application/vnd.oasis.opendocument.text", maxBytes: 50 * MB, sniff: isZip },
  ".ods": { type: "document", mime: "application/vnd.oasis.opendocument.spreadsheet", maxBytes: 50 * MB, sniff: isZip },
  ".odp": { type: "document", mime: "application/vnd.oasis.opendocument.presentation", maxBytes: 100 * MB, sniff: isZip },
  ".rtf": { type: "document", mime: "application/rtf", maxBytes: 25 * MB, sniff: (b) => b.subarray(0, 5).toString("latin1") === "{\\rtf" },
  ".csv": { type: "document", mime: "text/csv", maxBytes: 25 * MB, sniff: (b) => !b.includes(0) && isUtf8(b) },
  ".md": { type: "document", mime: "text/markdown", maxBytes: 5 * MB, sniff: (b) => !b.includes(0) && isUtf8(b) },
  ".txt": {
    type: "written_account",
    mime: "text/plain",
    maxBytes: 5 * MB,
    sniff: (b) => !b.includes(0) && isUtf8(b),
  },
};

function isUtf8(b: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

export const ACCEPTED_EXTENSIONS = Object.keys(FORMATS);

export type UploadResult =
  | { filename: string; ok: true; evidence: ReturnType<typeof publicEvidence>; duplicate_of_reference: string | null }
  | { filename: string; ok: false; error: string };

export function validateUpload(filename: string, bytes: Buffer): FormatSpec {
  const ext = path.extname(filename).toLowerCase();
  const spec = FORMATS[ext];
  if (!spec) {
    throw new HttpError(415, `Unsupported format "${ext || "no extension"}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`);
  }
  if (bytes.length === 0) throw new HttpError(400, "File is empty");
  if (bytes.length > spec.maxBytes) throw new HttpError(413, `File exceeds the ${spec.maxBytes / MB} MB limit for this format`);
  if (!spec.sniff(bytes)) throw new HttpError(415, `File content does not match its ${ext} extension`);
  return spec;
}

/** Store one uploaded file. Each file succeeds or fails independently. */
export function addEvidence(
  user: User,
  caseId: string,
  filename: string,
  bytes: Buffer,
  overrides?: { type?: EvidenceType; metadata?: Record<string, unknown>; declaredSource?: string | null; declaredCategory?: Category | null },
): UploadResult {
  try {
    getCaseForUser(user, caseId);
  } catch (e) {
    return { filename, ok: false, error: e instanceof HttpError ? e.message : "Upload failed" };
  }
  return storeEvidence(user.id, caseId, filename, bytes, overrides);
}

/**
 * Store a validated upload. Callers must have authorised access to the case
 * (a signed-in user, or a valid upload invitation for that case).
 */
export function storeEvidence(
  uploaderId: string | null,
  caseId: string,
  filename: string,
  bytes: Buffer,
  overrides?: { type?: EvidenceType; metadata?: Record<string, unknown>; declaredSource?: string | null; declaredCategory?: Category | null },
): UploadResult {
  try {
    const safeName = path.basename(filename).slice(0, 255);
    const spec = validateUpload(safeName, bytes);
    const hash = sha256(bytes);
    // Scan before anything is stored. A definite threat never reaches storage.
    const scan = scanUpload(safeName, bytes);
    if (scan.verdict === "refused") {
      audit({
        organisationId: caseOrganisation(caseId),
        caseId,
        evidenceId: null,
        user: uploaderId ? { id: uploaderId } : null,
        actor: uploaderId ? "Uploader" : "External contributor (invite link)",
        operation: "intake",
        purpose: null,
        policyId: null,
        policyVersion: null,
        decision: "BLOCK",
        reasons: ["UPLOAD_REFUSED"],
        explanation: `Refused ${safeName}: ${scan.findings.join("; ")}. Scanned with ${scan.engine}.`,
        provider: null,
      });
      throw new HttpError(422, `Upload refused: ${scan.findings.join("; ")}`);
    }
    const result = tx(() => {
      // Duplicates are flagged, never deleted or merged.
      const dup = get<{ id: string; reference: string }>(
        "SELECT id, reference FROM evidence WHERE case_id = ? AND file_hash = ? ORDER BY uploaded_at LIMIT 1",
        caseId,
        hash,
      );
      const id = crypto.randomUUID();
      const reference = nextReference(caseId, "evidence");
      const storageRef = storeOriginal(caseId, id, path.extname(safeName).toLowerCase(), bytes);
      const metadata = { ...(overrides?.metadata ?? {}), upload_source: overrides?.metadata?.upload_source ?? "file_upload" };
      run(
        `INSERT INTO evidence (id, case_id, reference, original_filename, evidence_type, mime_type, file_size,
           storage_reference, file_hash, duplicate_of, uploaded_at, uploaded_by, processing_status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        id,
        caseId,
        reference,
        safeName,
        overrides?.type ?? spec.type,
        spec.mime,
        bytes.length,
        storageRef,
        hash,
        dup?.id ?? null,
        now(),
        uploaderId,
        JSON.stringify(metadata),
      );
      touchCase(caseId);
      return { id, dupRef: dup?.reference ?? null };
    });
    // Intake: classify from what was declared and the file name only (no content is read),
    // record it, and work out whether the policy allows analysis. Nothing is analysed here.
    const type = overrides?.type ?? validateUpload(safeName, bytes).type;
    const cls = classifyIntake(safeName, type, overrides?.declaredCategory ?? null);
    run(
      "UPDATE evidence SET category = ?, category_source = ?, category_confirmed = ?, declared_source = ? WHERE id = ?",
      cls.category,
      cls.source,
      cls.confirmed ? 1 : 0,
      overrides?.declaredSource?.trim().slice(0, 300) || null,
      result.id,
    );
    const organisationId = caseOrganisation(caseId);
    audit({
      organisationId,
      caseId,
      evidenceId: result.id,
      user: uploaderId ? { id: uploaderId } : null,
      actor: uploaderId ? "Uploader" : "External contributor (invite link)",
      operation: "intake",
      purpose: null,
      policyId: null,
      policyVersion: null,
      decision: "RECORDED",
      reasons: [],
      explanation: `Stored encrypted with SHA-256 ${hash.slice(0, 16)}…; classified as ${cls.category} (${cls.source}${cls.confirmed ? "" : ", unconfirmed"}). Scanned with ${scan.engine}: ${scan.findings.length ? scan.findings.join("; ") : "nothing found"}.`,
      provider: null,
    });
    refreshEvidenceCompliance(result.id);
    // Risky active content: kept, but quarantined until a reviewer lifts the restriction.
    if (scan.verdict === "quarantined") {
      run("UPDATE evidence SET compliance_status = 'RESTRICTED', compliance_reasons = ? WHERE id = ?", JSON.stringify(["ACTIVE_CONTENT"]), result.id);
    }
    // Every upload is checked for signs of editing or AI generation in the background (local only).
    enqueueJob("check_integrity", { evidenceId: result.id });
    return { filename: safeName, ok: true, evidence: publicEvidence(getEvidence(result.id)!), duplicate_of_reference: result.dupRef };
  } catch (e) {
    const message = e instanceof HttpError ? e.message : "Upload failed";
    if (!(e instanceof HttpError)) console.error("[upload] failed:", e instanceof Error ? e.message : e);
    return { filename, ok: false, error: message };
  }
}

/**
 * Use vault files in a case. Each becomes the case's own evidence item (own
 * reference and analysis) that points back to the vault file and shares its
 * stored original. A file already in the case is skipped.
 */
export function linkVaultFiles(user: User, caseId: string, vaultItemIds: string[]): UploadResult[] {
  getCaseForUser(user, caseId, "case");
  return vaultItemIds.map((vid): UploadResult => {
    const v = get<EvidenceRow & { kind: string; folder: string; compliance_reasons: string | null }>(
      "SELECT e.*, c.kind, c.title folder FROM evidence e JOIN cases c ON c.id = e.case_id WHERE e.id = ? AND c.organisation_id = ? AND c.deleted_at IS NULL",
      vid,
      user.organisation_id,
    );
    if (!v || v.kind !== "folder") return { filename: vid, ok: false, error: "Vault file not found" };
    const existing = get<{ reference: string }>("SELECT reference FROM evidence WHERE case_id = ? AND vault_item_id = ?", caseId, v.id);
    if (existing) return { filename: v.original_filename, ok: false, error: `Already in this case as ${existing.reference}` };
    const result = tx(() => {
      const dup = get<{ id: string; reference: string }>("SELECT id, reference FROM evidence WHERE case_id = ? AND file_hash = ? ORDER BY uploaded_at LIMIT 1", caseId, v.file_hash);
      const id = crypto.randomUUID();
      run(
        `INSERT INTO evidence (id, case_id, reference, original_filename, evidence_type, mime_type, file_size, storage_reference, file_hash,
           duplicate_of, uploaded_at, uploaded_by, processing_status, metadata, category, category_source, category_confirmed, declared_source, display_name, vault_item_id)
         SELECT ?, ?, ?, original_filename, evidence_type, mime_type, file_size, storage_reference, file_hash,
           ?, ?, ?, 'pending', metadata, category, category_source, category_confirmed, declared_source, display_name, id
           FROM evidence WHERE id = ?`,
        id,
        caseId,
        nextReference(caseId, "evidence"),
        dup?.id ?? null,
        now(),
        user.id,
        v.id,
      );
      touchCase(caseId);
      return { id, dupRef: dup?.reference ?? null };
    });
    audit({
      organisationId: user.organisation_id,
      caseId,
      evidenceId: result.id,
      user,
      actor: "Uploader",
      operation: "intake",
      purpose: null,
      policyId: null,
      policyVersion: null,
      decision: "RECORDED",
      reasons: [],
      explanation: `Added from vault folder “${v.folder}” (${v.reference}); same stored original, SHA-256 ${v.file_hash.slice(0, 16)}….`,
      provider: null,
    });
    refreshEvidenceCompliance(result.id);
    // A quarantined vault file stays quarantined in every case that uses it.
    if (v.compliance_status === "RESTRICTED") run("UPDATE evidence SET compliance_status = 'RESTRICTED', compliance_reasons = ? WHERE id = ?", v.compliance_reasons, result.id);
    enqueueJob("check_integrity", { evidenceId: result.id });
    return { filename: v.original_filename, ok: true, evidence: publicEvidence(getEvidence(result.id)!), duplicate_of_reference: result.dupRef };
  });
}

/**
 * Put a case's own files into the vault: the case's folder by default, or any
 * folder or subfolder. The vault gets its own record of each file (sharing the
 * stored original) and the case's item points back to it, so other cases can
 * then add it. Files already in the vault are skipped.
 */
export function fileToVault(user: User, caseId: string, evidenceIds: string[], folderId?: string | null) {
  const c = getCaseForUser(user, caseId, "case");
  const folder = folderId ? getCaseForUser(user, folderId, "folder") : caseFolder(user, caseId);
  const filed: { id: string; reference: string; filename: string }[] = [];
  for (const id of evidenceIds) {
    const e = get<EvidenceRow & { vault_item_id: string | null }>("SELECT * FROM evidence WHERE id = ? AND case_id = ?", id, caseId);
    if (!e || e.vault_item_id) continue;
    const vid = crypto.randomUUID();
    const reference = tx(() => {
      const dup = get<{ id: string }>("SELECT id FROM evidence WHERE case_id = ? AND file_hash = ? ORDER BY uploaded_at LIMIT 1", folder.id, e.file_hash);
      const ref = nextReference(folder.id, "evidence");
      run(
        `INSERT INTO evidence (id, case_id, reference, original_filename, evidence_type, mime_type, file_size, storage_reference, file_hash, duplicate_of,
           uploaded_at, uploaded_by, processing_status, metadata, compliance_status, category, category_source, category_confirmed, declared_source,
           verification_status, compliance_reasons, human_approval, display_name)
         SELECT ?, ?, ?, original_filename, evidence_type, mime_type, file_size, storage_reference, file_hash, ?,
           uploaded_at, uploaded_by, 'pending', metadata, compliance_status, category, category_source, category_confirmed, declared_source,
           verification_status, compliance_reasons, human_approval, display_name
           FROM evidence WHERE id = ?`,
        vid,
        folder.id,
        ref,
        dup?.id ?? null,
        e.id,
      );
      run("UPDATE evidence SET vault_item_id = ? WHERE id = ?", vid, e.id);
      // Same file, same integrity results.
      run(
        "INSERT INTO integrity_reports (id, evidence_id, case_id, level, report, created_at) SELECT lower(hex(randomblob(16))), ?, ?, level, report, created_at FROM integrity_reports WHERE evidence_id = ?",
        vid,
        folder.id,
        e.id,
      );
      touchCase(folder.id);
      return ref;
    });
    audit({
      organisationId: user.organisation_id,
      caseId: folder.id,
      evidenceId: vid,
      user,
      actor: "Uploader",
      operation: "intake",
      purpose: null,
      policyId: null,
      policyVersion: null,
      decision: "RECORDED",
      reasons: [],
      explanation: `Added to the vault from case ${c.reference} (${e.reference}); same stored original, SHA-256 ${e.file_hash.slice(0, 16)}….`,
      provider: null,
    });
    filed.push({ id: vid, reference, filename: e.display_name || e.original_filename });
  }
  return { folder: { id: folder.id, title: folder.title }, filed };
}

/** Manually entered written account, stored as an immutable UTF-8 text original. */
export function addWrittenAccount(user: User, caseId: string, title: string, author: string, text: string, source: "manual_entry" | "chat" = "manual_entry") {
  const safeTitle = title.replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "written-account";
  return addEvidence(user, caseId, `${safeTitle}.txt`, Buffer.from(text, "utf8"), {
    type: "written_account",
    metadata: { upload_source: source, stated_author: author || null },
  });
}

export function getEvidence(id: string): EvidenceRow | undefined {
  return get<EvidenceRow>("SELECT * FROM evidence WHERE id = ?", id);
}

export function getEvidenceForUser(user: User, evidenceId: string): EvidenceRow {
  const e = get<EvidenceRow>(
    `SELECT e.* FROM evidence e JOIN cases c ON c.id = e.case_id WHERE e.id = ? AND c.organisation_id = ?`,
    evidenceId,
    user.organisation_id,
  );
  if (!e) throw new HttpError(404, "Evidence not found");
  return e;
}

export function listEvidence(caseId: string) {
  const counts = new Map(
    all<{ evidence_id: string; n: number }>(
      "SELECT evidence_id, COUNT(*) n FROM observations WHERE case_id = ? AND superseded = 0 GROUP BY evidence_id",
      caseId,
    ).map((r) => [r.evidence_id, Number(r.n)]),
  );
  const refs = new Map(all<{ id: string; reference: string }>("SELECT id, reference FROM evidence WHERE case_id = ?", caseId).map((r) => [r.id, r.reference]));
  const names = new Map(all<{ id: string; name: string }>("SELECT u.id, u.name FROM users u JOIN evidence e ON e.uploaded_by = u.id WHERE e.case_id = ?", caseId).map((u) => [u.id, u.name]));
  // For vault files: the cases using each one.
  const usedIn = new Map<string, { case_id: string; title: string; reference: string }[]>();
  for (const u of all<{ vault_item_id: string; case_id: string; title: string; reference: string }>(
    `SELECT e.vault_item_id, c.id case_id, c.title, e.reference FROM evidence e JOIN cases c ON c.id = e.case_id
      WHERE c.deleted_at IS NULL AND e.vault_item_id IN (SELECT id FROM evidence WHERE case_id = ?)`,
    caseId,
  )) {
    usedIn.set(u.vault_item_id, [...(usedIn.get(u.vault_item_id) ?? []), { case_id: u.case_id, title: u.title, reference: u.reference }]);
  }
  return all<EvidenceRow & { uploaded_by: string | null }>("SELECT * FROM evidence WHERE case_id = ? ORDER BY reference", caseId).map((e) => ({
    ...publicEvidence(e),
    uploaded_by_name: e.uploaded_by ? names.get(e.uploaded_by) ?? null : null,
    observation_count: counts.get(e.id) ?? 0,
    duplicate_of_reference: e.duplicate_of ? refs.get(e.duplicate_of) ?? null : null,
    used_in: usedIn.get(e.id) ?? [],
  }));
}

export function publicEvidence(e: EvidenceRow) {
  const { storage_reference: _s, ...rest } = e;
  void _s;
  return { ...rest, metadata: parseJson<Record<string, unknown>>(e.metadata, {}) };
}

/**
 * Queue processing for an evidence item. Re-processing creates a new analysis
 * run against the same evidence record; it never creates a duplicate record.
 */
export function queueEvidenceProcessing(user: User, evidenceId: string): string {
  const e = getEvidenceForUser(user, evidenceId);
  // Refuse up front, with the reason, rather than queueing work the policy won't allow.
  authorise({ operation: "observations", provider: isDemoCase(e.case_id) ? null : "anthropic", organisationId: user.organisation_id, caseId: e.case_id, evidenceId: e.id, user });
  return tx(() => {
    const active = get(
      "SELECT id FROM analysis_runs WHERE evidence_id = ? AND scope = 'evidence' AND status IN ('queued','running')",
      e.id,
    );
    if (active) throw new HttpError(409, `${e.reference} is already being processed`);
    const runId = crypto.randomUUID();
    run(
      `INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, evidence_hash, created_at)
       VALUES (?, ?, ?, 'evidence', 'queued', 'Queued', ?, ?)`,
      runId,
      e.case_id,
      e.id,
      e.file_hash,
      now(),
    );
    run("UPDATE evidence SET processing_status = 'queued', processing_error = NULL WHERE id = ?", e.id);
    enqueueJob("process_evidence", { runId, demo: isDemoCase(e.case_id) });
    return runId;
  });
}

export function queueSegmentInspection(user: User, evidenceId: string, center: number, halfWindow = 3): string {
  const e = getEvidenceForUser(user, evidenceId);
  if (e.evidence_type !== "video") throw new HttpError(400, "Segment inspection is only available for video");
  if (e.processing_status !== "processed") throw new HttpError(409, "Process this video before inspecting a segment");
  if (isDemoCase(e.case_id)) throw new HttpError(400, "Segment inspection uses live AI analysis and isn't available in demo cases");
  const runId = crypto.randomUUID();
  run(
    `INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, stage, evidence_hash, processing_configuration, created_at)
     VALUES (?, ?, ?, 'segment', 'queued', 'Queued', ?, ?, ?)`,
    runId,
    e.case_id,
    e.id,
    e.file_hash,
    JSON.stringify({ center, half_window: Math.min(Math.max(halfWindow, 1), 6) }),
    now(),
  );
  enqueueJob("inspect_segment", { runId });
  return runId;
}

export function isDemoCase(caseId: string): boolean {
  return !!get<{ is_demo: number }>("SELECT is_demo FROM cases WHERE id = ?", caseId)?.is_demo;
}

/** Give an item a display name. The original filename is kept unchanged as part of its provenance. */
export function renameEvidence(user: User, evidenceId: string, name: string) {
  const e = getEvidenceForUser(user, evidenceId);
  const clean = name.trim().slice(0, 255);
  run("UPDATE evidence SET display_name = ? WHERE id = ?", clean && clean !== e.original_filename ? clean : null, e.id);
  audit({
    organisationId: user.organisation_id,
    caseId: e.case_id,
    evidenceId: e.id,
    user,
    actor: user.name,
    operation: "classification",
    purpose: null,
    policyId: null,
    policyVersion: null,
    decision: "RECORDED",
    reasons: [],
    explanation: clean && clean !== e.original_filename ? `Display name set to “${clean}” (original filename kept).` : "Display name cleared.",
    provider: null,
  });
  touchCase(e.case_id);
}

/** Re-run the local integrity checks for one item in the background. */
export function queueIntegrityCheck(user: User, evidenceId: string) {
  const e = getEvidenceForUser(user, evidenceId);
  enqueueJob("check_integrity", { evidenceId: e.id });
}
