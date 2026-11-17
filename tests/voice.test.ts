import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-voice-"));
process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const { createInitialAdmin } = await import("@/server/auth");
const cases = await import("@/server/cases");
const { storeEvidence } = await import("@/server/evidence");
const { encodeWav } = await import("@/components/VoiceRecorder");

describe("voice notes", () => {
  it("encodes a mono 16-bit WAV that evidence upload accepts as audio", async () => {
    const samples = new Float32Array(16000).map((_, i) => Math.sin(i / 10) * 0.5);
    const bytes = Buffer.from(await encodeWav(samples, 16000).arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(bytes.readUInt16LE(22)).toBe(1);
    expect(bytes.readUInt32LE(24)).toBe(16000);
    expect(bytes.length).toBe(44 + samples.length * 2);

    const user = createInitialAdmin({ organisation: "Voice LLP", name: "Admin", username: "admin", password: "correct horse battery" });
    const c = cases.createCase(user, "Voice note test", "");
    const r = storeEvidence(user.id, c.id, "Voice note 2026-11-01 10.15.wav", bytes);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evidence.evidence_type).toBe("audio");
  });
});
