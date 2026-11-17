import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-members-"));
process.env.SESSION_SECRET = "x".repeat(40);
const { createInitialAdmin } = await import("@/server/auth");
const cases = await import("@/server/cases");
const members = await import("@/server/members");
const { run, now } = await import("@/server/db");

let admin: ReturnType<typeof createInitialAdmin>;
const people: Record<string, { id: string; organisation_id: string; name: string; email: string; role: string }> = {};
const addPerson = (name: string) => {
  const id = crypto.randomUUID();
  const email = `${name.toLowerCase()}@example.test`;
  run("INSERT INTO users (id, organisation_id, name, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, 'member', 'x', ?)", id, admin.organisation_id, name, email, now());
  return (people[name] = { id, organisation_id: admin.organisation_id, name, email, role: "member" });
};

beforeAll(() => {
  admin = createInitialAdmin({ organisation: "Members LLP", name: "Admin", username: "admin", password: "correct horse battery" });
  addPerson("Ada");
  addPerson("Ben");
  addPerson("Cy");
});

describe("case members and access", () => {
  it("limits an invited-only case to its owner, members and admins", () => {
    const c = cases.createCase(people.Ada, "Private matter", "");
    members.inviteMember(people.Ada, c.id, people.Ben.email, "viewer");
    members.setCaseAccess(people.Ada, c.id, "invited");
    expect(cases.getCaseForUser(people.Ben, c.id).id).toBe(c.id);
    expect(cases.getCaseForUser(admin, c.id).id).toBe(c.id);
    expect(() => cases.getCaseForUser(people.Cy, c.id)).toThrow(/not found/i);
    expect(cases.listCases(people.Cy).some((x) => x.id === c.id)).toBe(false);
    // A viewer can't change who has access.
    expect(() => members.setCaseAccess(people.Ben, c.id, "workspace")).toThrow(/owner or a case manager/);
  });

  it("links invites to existing accounts and keeps others pending", () => {
    const c = cases.createCase(people.Ada, "Invites", "");
    expect(members.inviteMember(people.Ada, c.id, "BEN@example.test", "editor").joined).toBe(true);
    expect(members.inviteMember(people.Ada, c.id, "new.person@example.test", "viewer").joined).toBe(false);
    expect(() => members.inviteMember(people.Ada, c.id, "ben@example.test", "viewer")).toThrow(/already/);
    expect(() => members.inviteMember(people.Ada, c.id, "not an email", "viewer")).toThrow(/isn't an email/);
  });

  it("transfers ownership only to a case manager, keeping the old owner as a manager", () => {
    const c = cases.createCase(people.Ada, "Handover", "");
    members.inviteMember(people.Ada, c.id, people.Ben.email, "editor");
    const ben = () => members.caseAccess(people.Ada, c.id).members.find((m) => m.email === people.Ben.email)!;
    expect(() => members.transferOwnership(people.Ada, c.id, ben().id)).toThrow(/case manager/);
    members.setMemberRole(people.Ada, c.id, ben().id, "manager");
    members.transferOwnership(people.Ada, c.id, ben().id);
    const after = members.caseAccess(people.Ben, c.id);
    expect(after.owner?.id).toBe(people.Ben.id);
    expect(after.members.map((m) => [m.email, m.role])).toEqual([[people.Ada.email, "manager"]]);
  });
});
