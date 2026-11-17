import crypto from "node:crypto";
import { all, get, parseJson, run, tx } from "./db";
import { HttpError, type User } from "./auth";
import { createCase, createFolder, getCaseForUser, nextReference, touchCase } from "./cases";
import { addEvidence, linkVaultFiles } from "./evidence";

/**
 * Recordings: voice entries and meetings captured before there is a case.
 * They live as files in the person's own "Recordings" vault folder, so they
 * are stored, encrypted and transcribed like any other evidence. Starting a
 * case from one links it into a new case; until then the home page offers to.
 */

export type RecordingSource = "in_person" | "teams" | "zoom" | "meet";
export const SOURCE_LABEL: Record<RecordingSource, string> = {
  in_person: "In person",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  meet: "Google Meet",
};

const FOLDER = "Recordings";

export interface Recording {
  id: string;
  title: string;
  source: RecordingSource;
  recorded_at: string;
  status: string;
  case: { id: string; title: string } | null;
  dismissed: boolean;
}

function folderFor(user: User, create: boolean): string | null {
  const f = get<{ id: string }>(
    "SELECT id FROM cases WHERE organisation_id = ? AND kind = 'folder' AND title = ? AND created_by = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
    user.organisation_id,
    FOLDER,
    user.id,
  );
  if (f) return f.id;
  return create ? createFolder(user, FOLDER).id : null;
}

/** The folder recordings live in, for a link to them; null before the first one. */
export const recordingsFolder = (user: User) => folderFor(user, false);

export function listRecordings(user: User): Recording[] {
  const folder = folderFor(user, false);
  if (!folder) return [];
  return all<{ id: string; original_filename: string; display_name: string | null; uploaded_at: string; processing_status: string; metadata: string }>(
    "SELECT id, original_filename, display_name, uploaded_at, processing_status, metadata FROM evidence WHERE case_id = ? ORDER BY uploaded_at DESC LIMIT 50",
    folder,
  ).map((e) => {
    const m = parseJson<{ recording_source?: RecordingSource; case_id?: string; dismissed?: boolean }>(e.metadata, {});
    const c = m.case_id ? get<{ id: string; title: string }>("SELECT id, title FROM cases WHERE id = ? AND deleted_at IS NULL", m.case_id) : undefined;
    return {
      id: e.id,
      title: e.display_name || e.original_filename.replace(/\.[a-z0-9]+$/i, ""),
      source: m.recording_source ?? "in_person",
      recorded_at: e.uploaded_at,
      status: e.processing_status,
      case: c ? { id: c.id, title: c.title.replace(/^DEMO · /, "") } : null,
      dismissed: !!m.dismissed,
    };
  });
}

export function addRecording(user: User, filename: string, bytes: Buffer, source: RecordingSource) {
  const folder = folderFor(user, true)!;
  const r = addEvidence(user, folder, filename, bytes, { metadata: { upload_source: "recording", recording_source: source } });
  if (!r.ok) throw new HttpError(400, r.error);
  return r.evidence.id;
}

function recordingRow(user: User, id: string) {
  const folder = folderFor(user, false);
  const e = folder ? get<{ id: string; original_filename: string; display_name: string | null; uploaded_at: string; metadata: string }>("SELECT id, original_filename, display_name, uploaded_at, metadata FROM evidence WHERE id = ? AND case_id = ?", id, folder) : undefined;
  if (!e) throw new HttpError(404, "Recording not found");
  return e;
}

function setMeta(id: string, meta: string, patch: Record<string, unknown>) {
  run("UPDATE evidence SET metadata = ? WHERE id = ?", JSON.stringify({ ...parseJson<Record<string, unknown>>(meta, {}), ...patch }), id);
}

/** A new case built from one or more recordings: they become its first evidence. */
export function caseFromRecordings(user: User, ids: string[]) {
  const rows = ids.map((id) => recordingRow(user, id));
  for (const e of rows) {
    const m = parseJson<{ case_id?: string }>(e.metadata, {});
    if (m.case_id && get("SELECT 1 FROM cases WHERE id = ? AND deleted_at IS NULL", m.case_id)) throw new HttpError(409, `${e.display_name || e.original_filename} already started a case`);
  }
  const first = rows[0]!;
  const m = parseJson<{ recording_source?: RecordingSource }>(first.metadata, {});
  const title = rows.length === 1 ? first.display_name || first.original_filename.replace(/\.[a-z0-9]+$/i, "") : `${rows.length} recordings`;
  const c = createCase(user, title, rows.length === 1 ? `Started from a recording (${SOURCE_LABEL[m.recording_source ?? "in_person"].toLowerCase()}).` : `Started from ${rows.length} recordings.`);
  const linked = linkVaultFiles(user, c.id, ids);
  const evidenceIds: string[] = [];
  linked.forEach((l, i) => {
    if (!l.ok) throw new HttpError(400, l.error);
    evidenceIds.push(l.evidence.id);
    setMeta(rows[i]!.id, rows[i]!.metadata, { case_id: c.id });
  });
  return { caseId: c.id, evidenceIds };
}

/** A copy of the recording in another vault folder; the stored original is shared. */
export function copyRecordingTo(user: User, id: string, folderId: string) {
  recordingRow(user, id);
  const folder = getCaseForUser(user, folderId, "folder");
  if (get("SELECT 1 FROM evidence WHERE case_id = ? AND file_hash = (SELECT file_hash FROM evidence WHERE id = ?)", folder.id, id)) throw new HttpError(409, `Already in ${folder.title}`);
  tx(() => {
    run(
      `INSERT INTO evidence (id, case_id, reference, original_filename, evidence_type, mime_type, file_size, storage_reference, file_hash,
         uploaded_at, uploaded_by, processing_status, metadata, compliance_status, category, category_source, category_confirmed, declared_source,
         verification_status, compliance_reasons, human_approval, display_name)
       SELECT ?, ?, ?, original_filename, evidence_type, mime_type, file_size, storage_reference, file_hash,
         uploaded_at, uploaded_by, 'pending', metadata, compliance_status, category, category_source, category_confirmed, declared_source,
         verification_status, compliance_reasons, human_approval, display_name
         FROM evidence WHERE id = ?`,
      crypto.randomUUID(),
      folder.id,
      nextReference(folder.id, "evidence"),
      id,
    );
    touchCase(folder.id);
  });
  return { folder: { id: folder.id, title: folder.title } };
}

/** Stop offering to start a case from this recording; it stays in Recordings. */
export function dismissRecording(user: User, id: string) {
  const e = recordingRow(user, id);
  setMeta(id, e.metadata, { dismissed: true });
}
