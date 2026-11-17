import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Isolated data directory per test run; set before server modules load.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ei-vault-"));
process.env.DATA_DIR = dir;
process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { createInitialAdmin } = await import("@/server/auth");
const cases = await import("@/server/cases");
const evidence = await import("@/server/evidence");
const invites = await import("@/server/invites");
const { removeEvidence } = await import("@/server/integrityReview");
const { originalPath } = await import("@/server/storage");

let user: ReturnType<typeof createInitialAdmin>;
beforeAll(() => {
  user = createInitialAdmin({ organisation: "Vault LLP", name: "Reviewer", username: "reviewer", password: "correct horse battery" });
});

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

describe("vault folders", () => {
  it("are named independently and kept out of case lists", () => {
    const c = cases.createCase(user, "Flat 3B noise", "");
    const f = cases.createFolder(user, "Site photos");
    expect(f.kind).toBe("folder");
    expect(cases.listCases(user).map((x) => x.id)).toContain(c.id);
    expect(cases.listCases(user).map((x) => x.id)).not.toContain(f.id);
    expect(invites.vaultFolders(user).map((x) => x.id)).toEqual([f.id]);
    expect(() => cases.getCaseForUser(user, f.id, "case")).toThrow();
  });

  it("lets one file be used by several cases, each with its own reference", () => {
    const f = cases.createFolder(user, "Shared evidence");
    const a = cases.createCase(user, "Case A", "");
    const b = cases.createCase(user, "Case B", "");
    const stored = evidence.addEvidence(user, f.id, "photo.png", png);
    if (!stored.ok) throw new Error(stored.error);

    const [inA] = evidence.linkVaultFiles(user, a.id, [stored.evidence.id]);
    const [inB] = evidence.linkVaultFiles(user, b.id, [stored.evidence.id]);
    if (!inA?.ok || !inB?.ok) throw new Error("link failed");
    expect(inA.evidence.case_id).toBe(a.id);
    expect(inB.evidence.case_id).toBe(b.id);
    expect(inA.evidence.id).not.toBe(inB.evidence.id);

    // Adding the same file to a case twice is refused.
    expect(evidence.linkVaultFiles(user, a.id, [stored.evidence.id])[0]?.ok).toBe(false);
    // Case files cannot be linked as if they were vault files.
    expect(evidence.linkVaultFiles(user, b.id, [inA.evidence.id])[0]?.ok).toBe(false);

    const listed = evidence.listEvidence(f.id).find((e) => e.id === stored.evidence.id);
    expect(listed?.used_in.map((u) => u.case_id).sort()).toEqual([a.id, b.id].sort());
  });

  it("keeps the shared original until nothing uses it", () => {
    const f = cases.createFolder(user, "Removal");
    const c = cases.createCase(user, "Uses it", "");
    const stored = evidence.addEvidence(user, f.id, "keep.png", png);
    if (!stored.ok) throw new Error(stored.error);
    const [linked] = evidence.linkVaultFiles(user, c.id, [stored.evidence.id]);
    if (!linked?.ok) throw new Error("link failed");
    const file = originalPath(evidence.getEvidence(stored.evidence.id)!.storage_reference);

    // Removing it from the vault leaves the case's copy readable.
    removeEvidence(user, stored.evidence.id);
    expect(fs.existsSync(file)).toBe(true);
    expect(evidence.getEvidence(linked.evidence.id)?.storage_reference).toBeTruthy();

    // Once the last user of the file goes, so does the original.
    removeEvidence(user, linked.evidence.id);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("puts a case's own files into its case folder, named after the case, and lets other cases use them", () => {
    const a = cases.createCase(user, "Bin store dispute", "");
    const b = cases.createCase(user, "Related complaint", "");
    const up = evidence.addEvidence(user, a.id, "bins.png", png);
    if (!up.ok) throw new Error(up.error);
    // Uploaded in the case: not in the vault yet.
    expect(cases.findCaseFolder(user, a.id)).toBeUndefined();

    const out = evidence.fileToVault(user, a.id, [up.evidence.id]);
    const folder = cases.findCaseFolder(user, a.id)!;
    expect(folder.title).toBe("Bin store dispute");
    expect(out.folder.id).toBe(folder.id);
    expect(out.filed).toHaveLength(1);
    // The case's item now points at the vault copy; filing again does nothing.
    expect(evidence.fileToVault(user, a.id, [up.evidence.id]).filed).toHaveLength(0);

    const [inB] = evidence.linkVaultFiles(user, b.id, [out.filed[0]!.id]);
    expect(inB?.ok).toBe(true);
    // The case folder keeps its own name if the case is renamed.
    cases.updateCase(user, a.id, { title: "Renamed case" });
    expect(cases.caseFolder(user, a.id).title).toBe("Bin store dispute");
  });

  it("nests folders and lists one level at a time", () => {
    const top = cases.createFolder(user, "Photos");
    const sub = cases.createFolder(user, "Night shots", { parentId: top.id });
    expect(invites.vaultFolders(user).map((f) => f.id)).toContain(top.id);
    expect(invites.vaultFolders(user).map((f) => f.id)).not.toContain(sub.id);
    expect(invites.vaultFolders(user, top.id).map((f) => f.id)).toEqual([sub.id]);
    expect(invites.folderPath(user, sub.id)).toEqual([{ id: top.id, title: "Photos" }]);

    const c = cases.createCase(user, "Uses a subfolder", "");
    const up = evidence.addEvidence(user, c.id, "night.png", png);
    if (!up.ok) throw new Error(up.error);
    expect(evidence.fileToVault(user, c.id, [up.evidence.id], sub.id).folder.id).toBe(sub.id);
  });
});
