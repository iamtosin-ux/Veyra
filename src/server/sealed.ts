import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Encryption at rest for stored evidence and derived files. AES-256-GCM in
// 64 KiB chunks, so any byte range can be read (video seeking) without
// decrypting the whole file. Each chunk is authenticated with the file header
// and its index, so chunks can't be swapped, reordered or truncated unnoticed.
//
// Key: VEYRA_ENCRYPTION_KEY (32 bytes, base64 or hex). Without it a key is
// generated once into the data directory, which is acceptable for a local
// prototype only; production must use a managed key service.

const MAGIC = Buffer.from("VEYRAEC1");
const HEADER = 32; // magic 8 + chunk size 4 + plain size 8 + base nonce 12
const CHUNK = 64 * 1024;
const TAG = 16;

let cachedKey: Buffer | null = null;

function loadKey(dataDir: string): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.VEYRA_ENCRYPTION_KEY?.trim();
  if (env) {
    const k = /^[0-9a-f]{64}$/i.test(env) ? Buffer.from(env, "hex") : Buffer.from(env, "base64");
    if (k.length !== 32) throw new Error("VEYRA_ENCRYPTION_KEY must be 32 bytes (base64 or hex)");
    return (cachedKey = k);
  }
  const file = path.join(dataDir, "keys", "master.key");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
    console.warn("[storage] generated a local encryption key in the data directory. Use VEYRA_ENCRYPTION_KEY from a key manager in production.");
  }
  return (cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64"));
}

function nonceFor(base: Buffer, index: number): Buffer {
  const n = Buffer.from(base);
  n.writeUInt32BE((n.readUInt32BE(8) ^ index) >>> 0, 8);
  return n;
}

function aad(header: Buffer, index: number, last: boolean): Buffer {
  const b = Buffer.alloc(5);
  b.writeUInt32BE(index, 0);
  b[4] = last ? 1 : 0;
  return Buffer.concat([header, b]);
}

export function isSealed(buf: Buffer): boolean {
  return buf.length >= HEADER && buf.subarray(0, 8).equals(MAGIC);
}

export function seal(plain: Buffer, dataDir: string): Buffer {
  const key = loadKey(dataDir);
  const header = Buffer.alloc(HEADER);
  MAGIC.copy(header, 0);
  header.writeUInt32BE(CHUNK, 8);
  header.writeBigUInt64BE(BigInt(plain.length), 12);
  crypto.randomBytes(12).copy(header, 20);
  const base = header.subarray(20, 32);
  const parts: Buffer[] = [header];
  const count = Math.max(1, Math.ceil(plain.length / CHUNK));
  for (let i = 0; i < count; i++) {
    const c = crypto.createCipheriv("aes-256-gcm", key, nonceFor(base, i));
    c.setAAD(aad(header, i, i === count - 1));
    parts.push(c.update(plain.subarray(i * CHUNK, (i + 1) * CHUNK)), c.final(), c.getAuthTag());
  }
  return Buffer.concat(parts);
}

interface Meta {
  header: Buffer;
  chunk: number;
  size: number;
  count: number;
}

function meta(fd: number): Meta {
  const header = Buffer.alloc(HEADER);
  fs.readSync(fd, header, 0, HEADER, 0);
  if (!header.subarray(0, 8).equals(MAGIC)) throw new Error("Not a sealed file");
  const chunk = header.readUInt32BE(8);
  const size = Number(header.readBigUInt64BE(12));
  return { header, chunk, size, count: Math.max(1, Math.ceil(size / chunk)) };
}

function readChunk(fd: number, m: Meta, i: number, key: Buffer): Buffer {
  const plainLen = i === m.count - 1 ? m.size - i * m.chunk : m.chunk;
  const buf = Buffer.alloc(plainLen + TAG);
  fs.readSync(fd, buf, 0, buf.length, HEADER + i * (m.chunk + TAG));
  const d = crypto.createDecipheriv("aes-256-gcm", key, nonceFor(m.header.subarray(20, 32), i));
  d.setAAD(aad(m.header, i, i === m.count - 1));
  d.setAuthTag(buf.subarray(plainLen));
  return Buffer.concat([d.update(buf.subarray(0, plainLen)), d.final()]);
}

/** Plain size of a stored file, sealed or not. */
export function storedSize(file: string): number {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    return head.equals(MAGIC) ? meta(fd).size : fs.fstatSync(fd).size;
  } finally {
    fs.closeSync(fd);
  }
}

/** Read bytes [start, end] inclusive, decrypting only the chunks needed. Plain (legacy) files are read as-is. */
export function readStoredRange(file: string, start: number, end: number, dataDir: string): Buffer {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    if (!head.equals(MAGIC)) {
      const out = Buffer.alloc(end - start + 1);
      const n = fs.readSync(fd, out, 0, out.length, start);
      return out.subarray(0, n);
    }
    const m = meta(fd);
    const key = loadKey(dataDir);
    const last = Math.min(end, m.size - 1);
    const parts: Buffer[] = [];
    for (let i = Math.floor(start / m.chunk); i <= Math.floor(last / m.chunk); i++) parts.push(readChunk(fd, m, i, key));
    const offset = start - Math.floor(start / m.chunk) * m.chunk;
    return Buffer.concat(parts).subarray(offset, offset + (last - start + 1));
  } finally {
    fs.closeSync(fd);
  }
}

export function readStored(file: string, dataDir: string): Buffer {
  const size = storedSize(file);
  return size === 0 ? Buffer.alloc(0) : readStoredRange(file, 0, size - 1, dataDir);
}

/** Encrypt a plaintext file in place (atomically). Already-sealed files are left alone. */
export function sealFileInPlace(file: string, dataDir: string, mode?: number): boolean {
  const buf = fs.readFileSync(file);
  if (isSealed(buf)) return false;
  const tmp = `${file}.sealing`;
  fs.writeFileSync(tmp, seal(buf, dataDir), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Read-only originals can still be replaced by rename in a writable directory.
  }
  fs.renameSync(tmp, file);
  if (mode !== undefined) fs.chmodSync(file, mode);
  return true;
}
