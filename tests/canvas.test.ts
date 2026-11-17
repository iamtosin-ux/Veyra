import { describe, expect, it } from "vitest";
import { parseSectionRequest } from "@/server/canvas";

describe("canvas section requests", () => {
  it("recognises the chronology and evidence list", () => {
    expect(parseSectionRequest("Add the chronology to the canvas")).toEqual({ kind: "chronology" });
    expect(parseSectionRequest("can you include the timeline on the main canvas?")).toEqual({ kind: "chronology" });
    expect(parseSectionRequest("Show the evidence list on the canvas")).toEqual({ kind: "evidence" });
  });

  it("reads the place and topic of a map", () => {
    expect(parseSectionRequest("Create a map view of anti-social behaviour in Brixton")).toEqual({ kind: "map", place: "Brixton", topic: "anti-social behaviour" });
    expect(parseSectionRequest("Add a map around Peckham Rye.")).toEqual({ kind: "map", place: "Peckham Rye", topic: undefined });
    expect(parseSectionRequest("Create a map")).toEqual({ kind: "map", place: undefined, topic: undefined });
  });

  it("leaves questions and other requests to the assistant", () => {
    expect(parseSectionRequest("What does the timeline show?")).toBeNull();
    expect(parseSectionRequest("Analyse the new evidence")).toBeNull();
    expect(parseSectionRequest("Add a web source to Key findings: https://example.com/")).toBeNull();
  });
});

import { newConflicts } from "@/server/chronologyOrder";

describe("chronology reordering", () => {
  const ev = (id: string, t: number | null) => ({ id, t });
  const dated = [ev("a", 1), ev("b", 2), ev("c", 3), ev("u", null)];

  it("flags a move that puts a later-dated event first", () => {
    const after = [dated[2]!, dated[0]!, dated[1]!, dated[3]!];
    expect(newConflicts(dated, after).map(([x, y]) => `${x.id}>${y.id}`)).toEqual(["c>a", "c>b"]);
  });

  it("lets undated events move freely", () => {
    const after = [dated[3]!, dated[0]!, dated[1]!, dated[2]!];
    expect(newConflicts(dated, after)).toEqual([]);
  });

  it("doesn't re-raise an inversion that was already accepted", () => {
    const before = [dated[1]!, dated[0]!, dated[2]!];
    const after = [dated[1]!, dated[0]!, dated[2]!];
    expect(newConflicts(before, after)).toEqual([]);
  });
});
