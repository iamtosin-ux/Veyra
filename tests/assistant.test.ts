import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const { looksLikeCaseDetail } = await import("@/server/assistant/assistant");

describe("case detail detection (chat ingestion)", () => {
  it("treats new factual statements as details to record", () => {
    expect(looksLikeCaseDetail("The tenant in 3C phoned again on 16 March and said the noise continued until midnight.")).toBe(true);
    expect(looksLikeCaseDetail("I spoke to the caretaker, who says the CCTV clock was reset in February.")).toBe(true);
  });
  it("does not record questions, commands or short replies", () => {
    expect(looksLikeCaseDetail("What are the discrepancies?")).toBe(false);
    expect(looksLikeCaseDetail("Show the timeline")).toBe(false);
    expect(looksLikeCaseDetail("Compare the evidence and generate findings")).toBe(false);
    expect(looksLikeCaseDetail("thanks!")).toBe(false);
    expect(looksLikeCaseDetail("Was the camera clock checked")).toBe(false);
  });
});
