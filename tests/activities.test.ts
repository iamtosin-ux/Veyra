import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-activities-"));
process.env.SESSION_SECRET = "x".repeat(40);
const { createInitialAdmin } = await import("@/server/auth");
const cases = await import("@/server/cases");
const { addActivity, removeActivity } = await import("@/server/activities");
const { listChronology } = await import("@/server/findings");
const { reorderChronology } = await import("@/server/chronologyOrder");

let user: ReturnType<typeof createInitialAdmin>;
beforeAll(() => {
  user = createInitialAdmin({ organisation: "Activity LLP", name: "Admin", username: "admin", password: "correct horse battery" });
});

describe("case activity in the chronology", () => {
  it("merges activities into the chronology in date order, undated last", () => {
    const c = cases.createCase(user, "Activity case", "");
    addActivity(user, c.id, { kind: "court_hearing", occurred_at: "2026-04-02" });
    addActivity(user, c.id, { kind: "police_attendance", title: "Police attended Flat 3B", occurred_at: "2026-03-14T16:30" });
    addActivity(user, c.id, { kind: "letter_sent" });
    const list = listChronology(c.id);
    expect(list.map((e) => e.description)).toEqual(["Police attended Flat 3B", "Court hearing", "Letter sent"]);
    expect(list.every((e) => e.origin === "activity")).toBe(true);
  });

  it("can be reordered by hand and removed", () => {
    const c = cases.createCase(user, "Reorder case", "");
    const a = addActivity(user, c.id, { kind: "meeting", occurred_at: "2026-01-01" });
    const b = addActivity(user, c.id, { kind: "letter_received" });
    // Moving the undated letter first clashes with no dates, so it saves straight away.
    expect(reorderChronology(user, c.id, [b, a], false).saved).toBe(true);
    expect(listChronology(c.id).map((e) => e.id)).toEqual([b, a]);
    removeActivity(user, c.id, b);
    expect(listChronology(c.id).map((e) => e.id)).toEqual([a]);
  });

  it("refuses unknown kinds and badly formed dates", () => {
    const c = cases.createCase(user, "Checks", "");
    expect(() => addActivity(user, c.id, { kind: "made_up" })).toThrow(/Unknown kind/);
    expect(() => addActivity(user, c.id, { kind: "meeting", occurred_at: "14/03/2026" })).toThrow(/YYYY-MM-DD/);
  });
});
