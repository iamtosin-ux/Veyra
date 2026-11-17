import { describe, expect, it } from "vitest";
import { CANVAS_TEMPLATES, templateFor } from "@/lib/canvasTemplates";

describe("canvas templates", () => {
  it("offers General, the sector templates and anti-social behaviour", () => {
    expect(CANVAS_TEMPLATES.map((t) => t.label)).toEqual(["General", "Social housing", "Legal services", "HR investigations", "Anti-social behaviour", "Healthcare", "Financial services", "Energy"]);
  });
  it("uses the chosen template, else the case type's own, else its sector's, else General", () => {
    expect(templateFor("legal_services", "housing_disrepair").key).toBe("legal_services");
    expect(templateFor(null, "anti_social_behaviour").key).toBe("anti_social_behaviour");
    expect(templateFor(null, "housing_disrepair").key).toBe("social_housing");
    expect(templateFor(null, "grievance").key).toBe("hr_investigations");
    expect(templateFor(null, "personal_injury").key).toBe("legal_services");
    expect(templateFor("retired-key", null).key).toBe("general");
  });
  it("falls back to the case's industry when it has no case type", () => {
    expect(templateFor(null, null, "Healthcare").key).toBe("healthcare");
    expect(templateFor(null, null, "Financial services").key).toBe("financial_services");
    expect(templateFor(null, null, "Energy").key).toBe("energy");
    expect(templateFor(null, null, "Construction disputes").key).toBe("general");
    expect(templateFor("legal_services", null, "Energy").key).toBe("legal_services");
  });
  it("opens every canvas with the summary and ends it with the reviewer's notes", () => {
    for (const t of CANVAS_TEMPLATES) {
      expect(t.sections[0].key).toBe("summary");
      expect(t.sections.at(-1)!.key).toBe("notes");
    }
  });
  it("never repeats a section within a template, so its settings and reviews stay its own", () => {
    for (const t of CANVAS_TEMPLATES) expect(new Set(t.sections.map((x) => x.key)).size).toBe(t.sections.length);
  });
  it("keeps the chronology, evidence list and checklist off every canvas", () => {
    for (const t of CANVAS_TEMPLATES) for (const x of t.sections) expect(["chronology", "evidence", "checklist"]).not.toContain(x.key);
  });
  it("names the practice each sector template follows", () => {
    for (const t of CANVAS_TEMPLATES.filter((x) => x.key !== "general")) expect(t.basis).toBeTruthy();
  });

});
