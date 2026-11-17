import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./db";
import { readStored, readStoredRange, seal, sealFileInPlace, storedSize } from "./sealed";

// Private on-disk storage. Nothing here is served statically: files are only
// reachable through authenticated route handlers.
const ORIGINALS = path.join(DATA_DIR, "originals");
const DERIVED = path.join(DATA_DIR, "derived");

export function originalPath(storageReference: string): string {
  const p = path.resolve(ORIGINALS, storageReference);
  if (!p.startsWith(ORIGINALS + path.sep)) throw new Error("Invalid storage reference");
  return p;
}

/** Write an original once, encrypted, and make it read-only. Never overwritten. */
export function storeOriginal(caseId: string, evidenceId: string, ext: string, bytes: Buffer): string {
  const ref = path.join(caseId, `${evidenceId}${ext}`);
  const target = originalPath(ref);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, seal(bytes, DATA_DIR), { flag: "wx", mode: 0o444 });
  return ref;
}

/** The decrypted original. */
export function readOriginal(storageReference: string): Buffer {
  return readStored(originalPath(storageReference), DATA_DIR);
}

export function originalSize(storageReference: string): number {
  return storedSize(originalPath(storageReference));
}

/** Bytes [start, end] of the decrypted original, for range requests. */
export function readOriginalRange(storageReference: string, start: number, end: number): Buffer {
  return readStoredRange(originalPath(storageReference), start, end, DATA_DIR);
}

/** SHA-256 of the decrypted original, compared with the hash recorded at upload. */
export function hashOriginal(storageReference: string): string {
  return sha256(readOriginal(storageReference));
}

const TMP = path.join(DATA_DIR, "tmp");

/**
 * Tools such as ffmpeg need a real file. Decrypt to a private temporary
 * directory for the duration of `fn` only, then remove it.
 */
export async function withOriginalFile<T>(storageReference: string, fn: (file: string) => Promise<T>): Promise<T> {
  const tmp = decryptToTemp(storageReference);
  try {
    return await fn(tmp.file);
  } finally {
    tmp.cleanup();
  }
}

/** Decrypted temporary copy for a caller that must clean up itself (always in a finally). */
export function decryptToTemp(storageReference: string): { file: string; cleanup: () => void } {
  const dir = path.join(TMP, crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `original${path.extname(storageReference)}`);
  fs.writeFileSync(file, readOriginal(storageReference), { mode: 0o600 });
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Encrypt everything produced for an item (frames, stills, audio) once a run has finished with it. */
export function sealDerived(evidenceId: string) {
  const root = path.join(DERIVED, evidenceId);
  if (!fs.existsSync(root)) return;
  for (const f of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (f.isFile() && !f.name.endsWith(".sealing")) sealFileInPlace(path.join(f.parentPath, f.name), DATA_DIR);
  }
}

export function readDerived(file: string): Buffer {
  return readStored(file, DATA_DIR);
}

/** One-off: encrypt files stored before encryption at rest existed, and clear stale temporary files. */
export function sealExistingStorage(): number {
  fs.rmSync(TMP, { recursive: true, force: true });
  let n = 0;
  for (const root of [ORIGINALS, DERIVED]) {
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || f.name.endsWith(".sealing")) continue;
      if (sealFileInPlace(path.join(f.parentPath, f.name), DATA_DIR, root === ORIGINALS ? 0o444 : undefined)) n++;
    }
  }
  return n;
}

export function derivedDir(evidenceId: string, runId: string): string {
  const dir = path.join(DERIVED, evidenceId, runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function derivedFilePath(evidenceId: string, relative: string): string {
  const base = path.join(DERIVED, evidenceId);
  const p = path.resolve(base, relative);
  if (!p.startsWith(base + path.sep)) throw new Error("Invalid derived path");
  return p;
}

/** Remove a case's stored originals, except any in `keep` (still used by another case or folder). */
export function removeCaseFiles(caseId: string, evidenceIds: string[], keep: Set<string> = new Set()) {
  const dir = path.join(ORIGINALS, caseId);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!keep.has(path.join(caseId, f))) fs.rmSync(path.join(dir, f), { force: true });
    }
    if (fs.readdirSync(dir).length === 0) fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const id of evidenceIds) fs.rmSync(path.join(DERIVED, id), { recursive: true, force: true });
}

/** Remove one item's original and anything derived from it. */
export function removeEvidenceFiles(storageReference: string, evidenceId: string, keepOriginal = false) {
  if (!keepOriginal) fs.rmSync(originalPath(storageReference), { force: true });
  fs.rmSync(path.join(DERIVED, evidenceId), { recursive: true, force: true });
}

export function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function hashFile(file: string): string {
  return sha256(readStored(file, DATA_DIR));
}
