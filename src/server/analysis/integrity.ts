import crypto from "node:crypto";
import path from "node:path";
import { all, get, now, parseJson, run } from "../db";
import { getEvidence, type EvidenceRow } from "../evidence";
import { hashOriginal, readOriginal, withOriginalFile } from "../storage";
import { probe, type MediaProbe } from "../media/ffmpeg";
import { authorise, caseOrganisation } from "../compliance/engine";

// Integrity and provenance indicators. These are deterministic checks of the
// stored original and its metadata. They surface things a reviewer should look
// at; none of them proves or disproves tampering or AI generation.

export type IntegrityLevel = "clear" | "info" | "indicator" | "strong" | "critical";

export interface IntegrityIndicator {
  level: Exclude<IntegrityLevel, "clear">;
  code: string;
  title: string;
  detail: string;
}

/** One line per area checked, for the reviewer: file type, metadata, AI, and the issuing authority. */
export interface IntegrityCheck {
  name: "File type" | "Metadata" | "AI generation or manipulation" | "Issuing authority";
  status: "ok" | "issue" | "not_checked";
  detail: string;
}

export interface IntegrityReport {
  evidence_id: string;
  level: IntegrityLevel;
  indicators: IntegrityIndicator[];
  checks?: IntegrityCheck[];
  methods: string[];
  limits: string;
  checked_at: string;
}

const RANK: Record<IntegrityLevel, number> = { clear: 0, info: 1, indicator: 2, strong: 3, critical: 4 };

export function overallLevel(indicators: IntegrityIndicator[]): IntegrityLevel {
  return indicators.reduce<IntegrityLevel>((lvl, i) => (RANK[i.level] > RANK[lvl] ? i.level : lvl), "clear");
}

// Names of generative tools that write identifiable metadata. Matching one is a
// strong indicator; not matching says nothing (metadata is easily stripped).
const AI_TOOLS =
  /(midjourney|dall[·\-\s]?e|stable[\s_-]?diffusion|comfyui|automatic1111|invokeai|adobe firefly|firefly|imagen|ideogram|leonardo\.ai|runway(ml)?|\bsora\b|pika labs|\bveo\b|synthesia|heygen|elevenlabs|suno|udio|kling)/i;
const EDITORS = /(adobe photoshop|lightroom|gimp|affinity photo|pixelmator|snapseed|picsart|canva|facetune|premiere|after effects|final cut|davinci resolve|capcut|imovie|audacity|adobe audition)/i;
const TRANSCODERS = /(lavf|lavc|ffmpeg|handbrake|libx264|libx265)/i;

// What the first bytes of each supported type look like. A file whose contents
// don't match its extension may have been renamed to disguise what it is.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  ".jpg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  ".jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  ".png": (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  ".webp": (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP",
  ".pdf": (b) => b.toString("latin1", 0, 5) === "%PDF-",
  ".docx": (b) => b[0] === 0x50 && b[1] === 0x4b,
  ".xlsx": (b) => b[0] === 0x50 && b[1] === 0x4b,
  ".pptx": (b) => b[0] === 0x50 && b[1] === 0x4b,
  ".odt": (b) => b[0] === 0x50 && b[1] === 0x4b,
  ".ods": (b) => b[0] === 0x50 && b[1] === 0x4b,
  ".odp": (b) => b[0] === 0x50 && b[1] === 0x4b,
  ".rtf": (b) => b.toString("latin1", 0, 5) === "{\\rtf",
  ".mp4": (b) => b.toString("latin1", 4, 8) === "ftyp",
  ".mov": (b) => b.toString("latin1", 4, 8) === "ftyp" || b.toString("latin1", 4, 8) === "moov" || b.toString("latin1", 4, 8) === "wide",
  ".m4a": (b) => b.toString("latin1", 4, 8) === "ftyp",
  ".wav": (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE",
  ".mp3": (b) => b.toString("latin1", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
};

/** Pure: does the file's content match its extension? Null when the type has no fixed signature (e.g. .txt). */
export function typeIndicator(ext: string, head: Buffer): IntegrityIndicator | null {
  const sig = SIGNATURES[ext];
  if (!sig || sig(head)) return null;
  return { level: "strong", code: "type_mismatch", title: "File contents don't match its type", detail: `The file is named ${ext} but its contents are not a ${ext.slice(1).toUpperCase()} file. It may have been renamed or corrupted.` };
}

// Official documents an issuing authority could confirm. Recognised from the
// file name and any extracted text; this is a hint, not a classification.
const OFFICIAL: { kind: string; authority: string; pattern: RegExp }[] = [
  { kind: "driving licence", authority: "DVLA", pattern: /driv(ing|er'?s?)[\s_-]*licen[cs]e|\bdvla\b/i },
  { kind: "passport", authority: "HM Passport Office", pattern: /\bpassport\b/i },
  { kind: "payslip or tax document", authority: "HMRC", pattern: /\bpayslip|\bp60\b|\bp45\b|\bhmrc\b/i },
  { kind: "birth or marriage certificate", authority: "General Register Office", pattern: /(birth|marriage|death)[\s_-]*certificate/i },
  { kind: "council tax bill", authority: "the issuing council", pattern: /council[\s_-]*tax/i },
  { kind: "bank statement", authority: "the issuing bank", pattern: /bank[\s_-]*statement/i },
];

/** Pure: which official document this looks like, if any. */
export function officialDocument(filename: string, text: string): { kind: string; authority: string } | null {
  const hay = `${filename}\n${text.slice(0, 20000)}`;
  const hit = OFFICIAL.find((o) => o.pattern.test(hay));
  return hit ? { kind: hit.kind, authority: hit.authority } : null;
}

const AI_CODES = ["ai_tool_metadata", "iptc_ai_source", "png_generation_params"];

/** Pure: summarise indicators into the four areas a reviewer cares about. */
export function summariseChecks(indicators: IntegrityIndicator[], official: { kind: string; authority: string } | null): IntegrityCheck[] {
  const serious = (i: IntegrityIndicator) => i.level !== "info";
  const typeIssue = indicators.find((i) => i.code === "type_mismatch" || i.code === "hash_mismatch");
  const ai = indicators.find((i) => AI_CODES.includes(i.code));
  const meta = indicators.filter((i) => serious(i) && !AI_CODES.includes(i.code) && i.code !== "type_mismatch" && i.code !== "hash_mismatch");
  return [
    { name: "File type", status: typeIssue ? "issue" : "ok", detail: typeIssue?.title ?? "Contents match the file type, and the file is unchanged since upload." },
    { name: "Metadata", status: meta.length ? "issue" : "ok", detail: meta.length ? meta.map((m) => m.title).join("; ") : "Nothing unusual in the embedded metadata." },
    { name: "AI generation or manipulation", status: ai ? "issue" : "ok", detail: ai?.title ?? "No AI-tool markers found. Absence of markers doesn't prove a file is authentic." },
    official
      ? { name: "Issuing authority", status: "not_checked", detail: `Looks like a ${official.kind}. It can be confirmed with ${official.authority}, but no ${official.authority} connection is set up, so it hasn't been verified.` }
      : { name: "Issuing authority", status: "ok", detail: "Not an official document that needs verifying." },
  ];
}

/** Pure: indicators from an image's raw bytes (EXIF/XMP/PNG text/C2PA markers). */
export function imageIndicators(bytes: Buffer, mime: string): IntegrityIndicator[] {
  const out: IntegrityIndicator[] = [];
  const text = bytes.toString("latin1");
  const ai = text.match(AI_TOOLS);
  if (ai) out.push({ level: "strong", code: "ai_tool_metadata", title: "Metadata names a generative AI tool", detail: `The file's embedded metadata contains “${ai[0]}”, which is associated with AI image generation.` });
  if (/trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia/.test(text)) {
    out.push({ level: "strong", code: "iptc_ai_source", title: "Declared as AI-generated or AI-composited", detail: "The IPTC digital source type in the file's metadata declares algorithmic (AI) media." });
  }
  if (mime === "image/png" && /(tEXt|iTXt)(parameters|prompt|workflow)/.test(text.replace(/\x00/g, ""))) {
    out.push({ level: "strong", code: "png_generation_params", title: "Image generation parameters embedded", detail: "PNG text chunks contain 'parameters', 'prompt' or 'workflow' fields, which generative tools such as Stable Diffusion interfaces write." });
  }
  if (/c2pa|jumb/i.test(text)) {
    out.push({ level: "info", code: "c2pa_present", title: "Content Credentials (C2PA) present", detail: "The file carries a provenance manifest. Its claims (capture device, edits, AI use) can be inspected with a C2PA verifier." });
  }
  const editor = text.match(EDITORS);
  if (editor) out.push({ level: "indicator", code: "editing_software", title: "Edited or exported with editing software", detail: `Metadata names “${editor[0]}”. The image may have been altered or re-exported after capture.` });
  const hasExif = text.includes("Exif\x00\x00");
  const camera = /(Canon|NIKON|SONY|FUJIFILM|OLYMPUS|Panasonic|Apple|iPhone|samsung|SM-[A-Z0-9]+|Google|Pixel|HUAWEI|OnePlus|Xiaomi|OPPO|motorola|GoPro|DJI)/.test(text);
  if (!hasExif || !camera) {
    out.push({
      level: "info",
      code: "no_camera_metadata",
      title: "No camera metadata",
      detail: "There is no capture-device information. This is normal for screenshots, messaging-app copies and exports, and is also typical of generated images. When and where it was taken cannot be confirmed from the file.",
    });
  }
  return out;
}

/** Pure: indicators from a media probe (video/audio container tags). */
export function mediaIndicators(p: MediaProbe): IntegrityIndicator[] {
  const out: IntegrityIndicator[] = [];
  const tags = Object.entries(p.tags).map(([k, v]) => `${k}=${v}`).join(" ");
  const ai = tags.match(AI_TOOLS);
  if (ai) out.push({ level: "strong", code: "ai_tool_metadata", title: "Metadata names a generative AI tool", detail: `Container tags contain “${ai[0]}”, which is associated with AI video or audio generation.` });
  const editor = tags.match(EDITORS);
  if (editor) out.push({ level: "indicator", code: "editing_software", title: "Processed with editing software", detail: `Container tags name “${editor[0]}”. The recording may have been cut or altered after capture.` });
  const transcoder = tags.match(TRANSCODERS);
  if (transcoder && !editor) {
    out.push({ level: "indicator", code: "re_encoded", title: "Re-encoded, not a device original", detail: `The file was written by “${p.tags.encoder ?? transcoder[0]}” (a transcoding library). It is a processed copy; request the original export from the recording system if authenticity matters.` });
  }
  const device = /(com\.apple\.quicktime\.(make|model)|com\.android\.(version|manufacturer)|make=|model=|location)/i.test(tags);
  if (!device) out.push({ level: "info", code: "no_device_metadata", title: "No recording-device metadata", detail: "No make, model or capture-device information is embedded, so the source device cannot be confirmed from the file." });
  if (!p.container_creation_time) out.push({ level: "info", code: "no_creation_time", title: "No recording time in metadata", detail: "The container has no creation time." });
  return out;
}

/** Pure: indicators from a PDF's raw bytes. */
export function pdfIndicators(bytes: Buffer): IntegrityIndicator[] {
  const out: IntegrityIndicator[] = [];
  const text = bytes.toString("latin1");
  const eofs = (text.match(/%%EOF/g) ?? []).length;
  if (eofs > 1) out.push({ level: "indicator", code: "incremental_updates", title: "Modified after it was first saved", detail: `The PDF contains ${eofs - 1} incremental update(s), meaning content or annotations were added or changed after the original save.` });
  const field = (k: string) => text.match(new RegExp(`/${k}\\s*\\(([^)]{0,200})\\)`))?.[1] ?? null;
  const producer = field("Producer");
  const creator = field("Creator");
  const created = field("CreationDate");
  const modified = field("ModDate");
  if (created && modified && created.slice(0, 16) !== modified.slice(0, 16)) {
    out.push({ level: "indicator", code: "modified_after_creation", title: "Modification date differs from creation date", detail: `Created ${created}, modified ${modified}.` });
  }
  const tool = `${producer ?? ""} ${creator ?? ""}`;
  const editor = tool.match(/(acrobat|pdf-?xchange|foxit|smallpdf|ilovepdf|sejda|nitro)/i);
  if (editor) out.push({ level: "info", code: "pdf_editor", title: "Produced or edited with a PDF tool", detail: `Producer/Creator: ${tool.trim()}.` });
  const ai = tool.match(AI_TOOLS);
  if (ai) out.push({ level: "strong", code: "ai_tool_metadata", title: "Metadata names a generative AI tool", detail: `Producer/Creator contains “${ai[0]}”.` });
  if (!producer && !creator) out.push({ level: "info", code: "no_pdf_metadata", title: "No producer metadata", detail: "The PDF does not say what created it." });
  else if (!editor && !ai) out.push({ level: "info", code: "pdf_producer", title: "Producer recorded", detail: `Producer/Creator: ${tool.trim()}.` });
  return out;
}

/** Pure: indicators from DOCX core/app properties. */
export function docxIndicators(core: string | null, app: string | null): IntegrityIndicator[] {
  const out: IntegrityIndicator[] = [];
  if (!core) return [{ level: "info", code: "no_docx_metadata", title: "No document properties", detail: "The document has no core properties (author, created, modified)." }];
  const tag = (x: string, t: string) => x.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`))?.[1] ?? null;
  const created = tag(core, "dcterms:created");
  const modified = tag(core, "dcterms:modified");
  const author = tag(core, "dc:creator");
  const lastBy = tag(core, "cp:lastModifiedBy");
  const revision = Number(tag(core, "cp:revision") ?? "0");
  if (created && modified) {
    const days = (Date.parse(modified) - Date.parse(created)) / 86_400_000;
    if (days > 1) out.push({ level: "indicator", code: "modified_after_creation", title: "Edited after it was created", detail: `Created ${created}, last modified ${modified} (${Math.round(days)} days later).` });
  }
  if (author && lastBy && author !== lastBy) out.push({ level: "indicator", code: "different_editor", title: "Last edited by someone other than the author", detail: `Author “${author}”, last modified by “${lastBy}”.` });
  if (revision > 10) out.push({ level: "info", code: "many_revisions", title: "Many revisions", detail: `Revision number ${revision}.` });
  const application = app ? tag(app, "Application") : null;
  const ai = `${application ?? ""} ${author ?? ""} ${lastBy ?? ""}`.match(AI_TOOLS);
  if (ai) out.push({ level: "strong", code: "ai_tool_metadata", title: "Metadata names a generative AI tool", detail: `Document properties contain “${ai[0]}”.` });
  if (!created && !author) out.push({ level: "info", code: "sparse_docx_metadata", title: "Sparse document properties", detail: "No author or creation date is recorded." });
  return out;
}

async function docxProps(bytes: Buffer): Promise<{ core: string | null; app: string | null }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  return { core: (await zip.file("docProps/core.xml")?.async("string")) ?? null, app: (await zip.file("docProps/app.xml")?.async("string")) ?? null };
}

/** Run every applicable check on one evidence item and store the report. */
export async function checkEvidenceIntegrity(evidenceId: string): Promise<IntegrityReport> {
  const e = getEvidence(evidenceId) as EvidenceRow;
  // Local only; allowed at intake even before a policy is approved, and audited like everything else.
  authorise({ operation: "integrity_check", provider: null, organisationId: caseOrganisation(e.case_id), caseId: e.case_id, evidenceId: e.id, user: null });
  const indicators: IntegrityIndicator[] = [];
  const methods: string[] = ["SHA-256 comparison with the hash recorded at upload"];
  // Stored encrypted; decrypted in memory only for these checks.
  const bytes = readOriginal(e.storage_reference);

  if (hashOriginal(e.storage_reference) !== e.file_hash) {
    indicators.push({ level: "critical", code: "hash_mismatch", title: "Stored original has changed since upload", detail: "The file's SHA-256 no longer matches the value recorded at upload. Its integrity cannot be relied on." });
  }
  const ext = path.extname(e.original_filename).toLowerCase();
  try {
    const head = bytes.subarray(0, 16);
    methods.push("File signature compared with its type");
    const mismatch = typeIndicator(ext, head);
    if (mismatch) indicators.push(mismatch);
  } catch {
    // An unreadable file is reported by the checks below.
  }
  try {
    if (e.evidence_type === "video" || e.evidence_type === "audio") {
      methods.push("Container and stream metadata (FFprobe)");
      indicators.push(...mediaIndicators(await withOriginalFile(e.storage_reference, (file) => probe(file))));
    } else if (e.evidence_type === "image") {
      methods.push("Embedded EXIF/XMP/PNG/C2PA metadata scan");
      indicators.push(...imageIndicators(bytes, e.mime_type));
    } else if (ext === ".pdf") {
      methods.push("PDF structure and document information");
      indicators.push(...pdfIndicators(bytes));
    } else if (ext === ".docx") {
      methods.push("DOCX core and application properties");
      const { core, app } = await docxProps(bytes);
      indicators.push(...docxIndicators(core, app));
    } else {
      indicators.push({ level: "info", code: "plain_text", title: "Plain text has no provenance metadata", detail: "Authorship and timing rely on the uploader's account." });
    }
  } catch (err) {
    indicators.push({ level: "info", code: "check_failed", title: "Metadata could not be read", detail: err instanceof Error ? err.message : String(err) });
  }
  const meta = parseJson<{ upload_source?: string; contributor_name?: string | null }>(e.metadata, {});
  if (meta.upload_source === "invite" && !meta.contributor_name) {
    indicators.push({ level: "indicator", code: "anonymous_contribution", title: "Contributor not identified", detail: "Uploaded through an invitation link without a contributor name, which leaves a gap in the chain of custody." });
  }
  if (e.duplicate_of) indicators.push({ level: "info", code: "duplicate", title: "Identical to another upload", detail: "Same SHA-256 as an earlier item in this case." });

  const text = parseJson<{ pages?: { text: string }[]; text?: string }>(
    get<{ content: string }>("SELECT content FROM extractions WHERE evidence_id = ? AND kind = 'document_text' ORDER BY created_at DESC LIMIT 1", e.id)?.content ?? "{}",
    {},
  );
  const official = officialDocument(e.original_filename, text.text ?? (text.pages ?? []).map((p) => p.text).join("\n"));
  if (official) methods.push(`Recognised as a ${official.kind}; verification with ${official.authority} is not connected`);

  const report: IntegrityReport = {
    evidence_id: e.id,
    level: overallLevel(indicators),
    indicators,
    checks: summariseChecks(indicators, official),
    methods,
    limits:
      "Metadata can be removed or forged, so the absence of an indicator does not show a file is authentic or human-made, and AI-generated content often carries no marker. Treat these as prompts for further inquiry, such as requesting originals or expert forensic examination.",
    checked_at: now(),
  };
  run("INSERT INTO integrity_reports (id, evidence_id, case_id, level, report, created_at) VALUES (?, ?, ?, ?, ?, ?)", crypto.randomUUID(), e.id, e.case_id, report.level, JSON.stringify(report), report.checked_at);
  return report;
}

export function latestIntegrity(evidenceId: string): IntegrityReport | null {
  const row = get<{ report: string }>("SELECT report FROM integrity_reports WHERE evidence_id = ? ORDER BY created_at DESC LIMIT 1", evidenceId);
  return row ? parseJson<IntegrityReport | null>(row.report, null) : null;
}

export function caseIntegrity(caseId: string): Map<string, IntegrityReport> {
  const rows = all<{ evidence_id: string; report: string }>(
    "SELECT evidence_id, report FROM integrity_reports r WHERE case_id = ? AND created_at = (SELECT MAX(created_at) FROM integrity_reports x WHERE x.evidence_id = r.evidence_id)",
    caseId,
  );
  return new Map(rows.map((r) => [r.evidence_id, parseJson<IntegrityReport>(r.report, {} as IntegrityReport)]));
}
