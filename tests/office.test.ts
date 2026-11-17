import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseCsv, parseDocument, rtfToText, toExtraction, toPreviewHtml } from "@/server/extract/office";
import { validateUpload } from "@/server/evidence";

async function zip(files: Record<string, string>) {
  const z = new JSZip();
  for (const [k, v] of Object.entries(files)) z.file(k, v);
  return z.generateAsync({ type: "nodebuffer" });
}

describe("document formats", () => {
  it("reads CSV with quoted commas and quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });

  it("reads RTF as plain paragraphs", () => {
    expect(rtfToText("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hello\\par World\\'21}")).toBe("Hello\nWorld!");
  });

  it("reads an XLSX workbook as sheets of cells, with shared strings", async () => {
    const bytes = await zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Rota" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>Name</t></si><si><t>A &amp; B</t></si></sst>",
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c></row><row r="2"><c r="B2" t="s"><v>1</v></c></row></sheetData></worksheet>',
    });
    const parsed = await parseDocument(".xlsx", bytes);
    expect(parsed).toEqual({ kind: "sheets", sheets: [{ name: "Rota", rows: [["Name", "", "42"], ["", "A & B"]], truncated: false }] });
    expect(toExtraction(".xlsx", parsed).pages[0].text).toContain("A & B");
  });

  it("reads a PPTX deck as slides in order", async () => {
    const slide = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
    const parsed = await parseDocument(".pptx", await zip({ "ppt/slides/slide10.xml": slide("Ten"), "ppt/slides/slide2.xml": slide("Two") }));
    expect(parsed.kind === "slides" && parsed.slides.map((s) => s.paragraphs[0])).toEqual(["Two", "Ten"]);
  });

  it("escapes everything from the file in the preview", async () => {
    const html = toPreviewHtml(await parseDocument(".csv", Buffer.from('<script>alert(1)</script>,"<img src=x>"')));
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x>");
  });

  it("accepts spreadsheets and presentations, but only when the content matches", () => {
    const pk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
    expect(validateUpload("rota.xlsx", pk).type).toBe("document");
    expect(validateUpload("deck.pptx", pk).type).toBe("document");
    expect(() => validateUpload("deck.pptx", Buffer.from("not a zip"))).toThrow(/does not match/);
  });
});
