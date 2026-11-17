import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-recordings-"));
process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const { createInitialAdmin } = await import("@/server/auth");
const { createFolder } = await import("@/server/cases");
const { encodeWav } = await import("@/components/VoiceRecorder");
const rec = await import("@/server/recordings");
const { all } = await import("@/server/db");

let user: ReturnType<typeof createInitialAdmin>;
const wav = async (n: number) => Buffer.from(await encodeWav(new Float32Array(16000).map((_, i) => Math.sin(i / (8 + n)) * 0.4), 16000).arrayBuffer());

beforeAll(() => {
  user = createInitialAdmin({ organisation: "Rec LLP", name: "Admin", username: "admin", password: "correct horse battery" });
});

describe("recordings", () => {
  it("starts one case from several recordings and links each back", async () => {
    const a = rec.addRecording(user, "Visit one.wav", await wav(1), "in_person");
    const b = rec.addRecording(user, "Visit two.wav", await wav(2), "zoom");
    const { caseId, evidenceIds } = rec.caseFromRecordings(user, [a, b]);
    expect(evidenceIds).toHaveLength(2);
    const list = rec.listRecordings(user);
    expect(list.filter((r) => r.case?.id === caseId)).toHaveLength(2);
    expect(() => rec.caseFromRecordings(user, [a])).toThrow(/already started a case/);
  });

  it("copies a recording into another vault folder once", async () => {
    const id = rec.addRecording(user, "Call.wav", await wav(3), "in_person");
    const folder = createFolder(user, "Client calls");
    expect(rec.copyRecordingTo(user, id, folder.id).folder.title).toBe("Client calls");
    expect(all("SELECT id FROM evidence WHERE case_id = ?", folder.id)).toHaveLength(1);
    expect(() => rec.copyRecordingTo(user, id, folder.id)).toThrow(/Already in/);
  });
});
