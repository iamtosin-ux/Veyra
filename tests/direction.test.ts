import { describe, expect, it } from "vitest";
import { caseType } from "@/lib/caseTypes";
import { assessType, pickSuggestion } from "@/server/direction";

const item = (ref: string, text: string, evidence_type: string | null = null) => ({ ref, text, evidence_id: null, evidence_type });
const asb = caseType("anti_social_behaviour")!;
const disrepair = caseType("housing_disrepair")!;

const disturbance = [
  item("FND-001", "Several sources report a loud bang and shouting in the corridor."),
  item("OBS-001", "The caller says there was shouting and a loud noise at about 2pm.", "audio"),
  item("OBS-002", "The neighbour says this is the second time this month there has been a disturbance.", "written_account"),
];
const door = [
  item("FND-005", "Door 3B was damaged, repaired, and reported damaged again."),
  item("OBS-010", "Damage near the lock was reported on 2 February.", "document"),
  item("OBS-011", "The door was repaired and the lock replaced on 20 February.", "document"),
  item("OBS-012", "Marks beside the lock may indicate damage.", "image"),
];

describe("case direction", () => {
  it("ticks checklist items from the evidence and shows what's missing", () => {
    const a = assessType(disrepair, door, ["document", "image"]);
    const by = Object.fromEntries(a.checklist.map((c) => [c.key, c.have]));
    expect(by).toMatchObject({ defect: true, photos: true, history: true, survey: false });
    expect(a.checklist.find((c) => c.key === "history")!.sources.map((s) => s.ref)).toContain("OBS-011");
  });

  it("offers another type when a finding fits it and not the current type", () => {
    const items = [...disturbance, ...door];
    const current = assessType(asb, items, ["audio", "written_account", "document", "image"]);
    const other = assessType(disrepair, items, ["audio", "written_account", "document", "image"]);
    const s = pickSuggestion(current, [other]);
    expect(s?.key).toBe("housing_disrepair");
    expect(s?.signals.map((x) => x.ref)).toContain("FND-005");
    expect(s?.signals[0]!.ref).toBe("OBS-011"); // strongest first: repaired, lock, replaced
    expect(s?.signals.map((x) => x.ref)).not.toContain("FND-001");
  });

  it("stays quiet when the current type already covers the case", () => {
    const current = assessType(asb, disturbance, ["audio", "written_account"]);
    const other = assessType(disrepair, disturbance, ["audio", "written_account"]);
    expect(pickSuggestion(current, [other])).toBeNull();
  });
});
