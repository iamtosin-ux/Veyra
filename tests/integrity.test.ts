import { describe, expect, it } from "vitest";
import { docxIndicators, imageIndicators, mediaIndicators, overallLevel, pdfIndicators } from "@/server/analysis/integrity";
import type { MediaProbe } from "@/server/media/ffmpeg";

const codes = (xs: { code: string }[]) => xs.map((x) => x.code);

describe("image provenance indicators", () => {
  it("flags Stable Diffusion-style PNG generation parameters as strong", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("....tEXtparameters\x00a cat, steps: 30")]);
    const r = imageIndicators(png, "image/png");
    expect(codes(r)).toContain("png_generation_params");
    expect(overallLevel(r)).toBe("strong");
  });
  it("flags declared AI source type and named generators", () => {
    expect(codes(imageIndicators(Buffer.from("xmp DigitalSourceType trainedAlgorithmicMedia"), "image/jpeg"))).toContain("iptc_ai_source");
    expect(codes(imageIndicators(Buffer.from("Software: Midjourney v6"), "image/jpeg"))).toContain("ai_tool_metadata");
  });
  it("reports editing software and missing camera data without overstating", () => {
    const r = imageIndicators(Buffer.from("Exif\x00\x00 Make Apple Model iPhone 15 Software Adobe Photoshop 25.0"), "image/jpeg");
    expect(codes(r)).toContain("editing_software");
    expect(codes(r)).not.toContain("no_camera_metadata");
    expect(overallLevel(imageIndicators(Buffer.from("\xff\xd8\xff plain"), "image/jpeg"))).toBe("info");
  });
});

describe("media, PDF and DOCX indicators", () => {
  const probe = (tags: Record<string, string>): MediaProbe => ({ duration_seconds: 10, container: "mp4", container_creation_time: tags.creation_time ?? null, tags, video: null, audio: null });
  it("notes re-encoding by a transcoding library", () => {
    expect(codes(mediaIndicators(probe({ encoder: "Lavf61.7.100" })))).toContain("re_encoded");
    expect(codes(mediaIndicators(probe({ "com.apple.quicktime.make": "Apple", creation_time: "2026-01-01" })))).not.toContain("no_device_metadata");
  });
  it("detects PDF incremental updates and changed modification dates", () => {
    const r = pdfIndicators(Buffer.from("%PDF-1.7 /Producer (Acme) /CreationDate (D:20260101100000) /ModDate (D:20260305120000) %%EOF more %%EOF"));
    expect(codes(r)).toEqual(expect.arrayContaining(["incremental_updates", "modified_after_creation"]));
  });
  it("detects DOCX edits by another person, long after creation", () => {
    const core = "<dc:creator>A. Author</dc:creator><cp:lastModifiedBy>B. Editor</cp:lastModifiedBy><dcterms:created>2026-01-01T00:00:00Z</dcterms:created><dcterms:modified>2026-02-01T00:00:00Z</dcterms:modified>";
    expect(codes(docxIndicators(core, null))).toEqual(expect.arrayContaining(["modified_after_creation", "different_editor"]));
  });
});
