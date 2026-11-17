import fs from "node:fs";

export interface DocumentPage {
  page_number: number;
  text: string;
}

export interface DocumentExtraction {
  method: string;
  pages: DocumentPage[];
  total_pages: number;
  quality: "ok" | "uncertain" | "failed";
  quality_note: string | null;
  /** Pages with too little text, likely scanned images. */
  low_text_pages: number[];
}

const MIN_CHARS_PER_PAGE = 40;

export async function extractPdf(file: string): Promise<DocumentExtraction> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t, i) => ({ page_number: i + 1, text: normalise(t) }));
  const low = pages.filter((p) => p.text.length < MIN_CHARS_PER_PAGE).map((p) => p.page_number);
  let quality: DocumentExtraction["quality"] = "ok";
  let note: string | null = null;
  if (low.length === pages.length) {
    quality = "uncertain";
    note = "No embedded text layer found; the document appears to be scanned. Visual reading by the AI model is used instead and should be checked.";
  } else if (low.length > 0) {
    quality = "uncertain";
    note = `Little or no embedded text on page(s) ${low.join(", ")}; these pages may be scanned images and are read visually.`;
  }
  return { method: "pdf-text-layer", pages, total_pages: totalPages, quality, quality_note: note, low_text_pages: low };
}

export async function extractDocx(file: string): Promise<DocumentExtraction> {
  const mammoth = await import("mammoth");
  const { value, messages } = await mammoth.extractRawText({ buffer: fs.readFileSync(file) });
  const text = normalise(value);
  const warnings = messages.filter((m) => m.type === "warning" || m.type === "error");
  return {
    method: "docx-raw-text",
    // DOCX has no fixed pagination; the whole body is cited as one passage block.
    pages: [{ page_number: 1, text }],
    total_pages: 1,
    quality: text.length === 0 ? "failed" : warnings.length ? "uncertain" : "ok",
    quality_note:
      text.length === 0
        ? "No text could be extracted from this DOCX file."
        : `DOCX files have no fixed page numbers; citations reference passages, not pages.${
            warnings.length ? ` ${warnings.length} extraction warning(s).` : ""
          }`,
    low_text_pages: [],
  };
}

export function extractPlainText(file: string): DocumentExtraction {
  const text = normalise(fs.readFileSync(file, "utf8"));
  return {
    method: "utf8-text",
    pages: [{ page_number: 1, text }],
    total_pages: 1,
    quality: text.length ? "ok" : "failed",
    quality_note: text.length ? null : "The text file is empty.",
    low_text_pages: [],
  };
}

function normalise(t: string): string {
  return t.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
