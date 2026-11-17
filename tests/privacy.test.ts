import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Isolated data directory per test run; set before server modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ei-privacy-"));
process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { createInitialAdmin, getProfile, updateProfile, authenticate, hashPassword } = await import("@/server/auth");
const { exportAccountData, deleteAccount } = await import("@/server/account");
const { run, now } = await import("@/server/db");

let user: ReturnType<typeof createInitialAdmin>;
beforeAll(() => {
  user = createInitialAdmin({ organisation: "Privacy LLP", name: "Reviewer", username: "reviewer", password: "correct horse battery" });
});

describe("AI training preference", () => {
  it("is off until the person opts in, and records when it changed", () => {
    expect(getProfile(user).ai_training).toBe(false);
    expect(getProfile(user).ai_training_changed_at).toBeNull();

    expect(updateProfile(user, { ai_training: true }).ai_training).toBe(true);
    expect(getProfile(user).ai_training_changed_at).toBeTruthy();
    expect(updateProfile(user, { ai_training: false }).ai_training).toBe(false);
    // Other profile edits leave it alone.
    updateProfile(user, { email_notifications: false });
    expect(getProfile(user).ai_training).toBe(false);
    expect(getProfile(user).email_notifications).toBe(false);
  });
});

describe("account data", () => {
  it("exports the person's own records and lets a member, but not the last admin, delete their account", () => {
    const admin = user;
    const out = exportAccountData(admin);
    expect(out.profile.name).toBe("Reviewer");
    expect(out.workspace).toBe("Privacy LLP");

    // The only admin can't leave the workspace without one.
    expect(() => deleteAccount(admin)).toThrow(/only admin/);

    run(
      "INSERT INTO users (id, organisation_id, name, email, username, role, password_hash, created_at) VALUES ('m1', ?, 'Member', 'm@example.test', 'member', 'member', ?, ?)",
      admin.organisation_id,
      hashPassword("member pass"),
      now(),
    );
    const member = authenticate("member", "member pass")!;
    expect(member.id).toBe("m1");
    deleteAccount(member);
    expect(authenticate("member", "member pass")).toBeNull();
    expect(getProfile(member).name).toBe("Deleted user");
  });
});
