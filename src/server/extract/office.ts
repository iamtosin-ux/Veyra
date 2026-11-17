import JSZip from "jszip";
import type { DocumentExtraction } from "./document";

/**
 * Office and other document formats, read without an external converter:
 * spreadsheets as tables, presentations as slides, word processing as flowing
 * text. One parse serves both the in-browser preview and text extraction.
 */

export const SHEET_EXTS = [".xlsx", ".ods", ".csv"];
export const SLIDE_EXTS = [".pptx", ".odp"];
export const TEXT_EXTS = [".docx", ".odt", ".rtf", ".md", ".txt"];

export type Parsed =
  | { kind: "sheets"; sheets: { name: string; rows: string[][]; truncated: boolean }[] }
  | { kind: "slides"; slides: { n: number; paragraphs: string[]; images: string[] }[] }
  | { kind: "text"; text: string }
  | { kind: "html"; html: string; text: string };

const MAX_ROWS = 1000;
const MAX_COLS = 60;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text of every <tag>…</tag> inside a fragment, in order. */
const texts = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => decode(m[1]));

export async function parseDocument(ext: string, bytes: Buffer): Promise<Parsed> {
  switch (ext) {
    case ".docx":
      return parseDocx(bytes);
    case ".xlsx":
      return parseXlsx(bytes);
    case ".pptx":
      return parsePptx(bytes);
    case ".odt":
      return parseOdt(bytes);
    case ".ods":
      return parseOds(bytes);
    case ".odp":
      return parseOdp(bytes);
    case ".csv":
      return { kind: "sheets", sheets: [{ name: "Sheet 1", ...cap(parseCsv(bytes.toString("utf8"))) }] };
    case ".rtf":
      return { kind: "text", text: rtfToText(bytes.toString("latin1")) };
    default:
      return { kind: "text", text: bytes.toString("utf8") };
  }
}

function cap(rows: string[][]) {
  return { rows: rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS)), truncated: rows.length > MAX_ROWS || rows.some((r) => r.length > MAX_COLS) };
}

async function parseDocx(bytes: Buffer): Promise<Parsed> {
  const mammoth = await import("mammoth");
  const [{ value: html }, { value: text }] = await Promise.all([mammoth.convertToHtml({ buffer: bytes }), mammoth.extractRawText({ buffer: bytes })]);
  return { kind: "html", html, text };
}

async function parseXlsx(bytes: Buffer): Promise<Parsed> {
  const zip = await JSZip.loadAsync(bytes);
  const read = (p: string) => zip.file(p)?.async("string") ?? Promise.resolve("");
  const shared = texts(await read("xl/sharedStrings.xml"), "si").map((si) => texts(`<x>${si}</x>`, "t").join("") || si.replace(/<[^>]+>/g, ""));
  const workbook = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g)) {
    const t = target.get(m[2]);
    if (!t) continue;
    const xml = await read(t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\.\//, "")}`);
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\br="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowIndex = r[1] ? Number(r[1]) - 1 : rows.length;
      if (rowIndex >= MAX_ROWS + 1) break;
      const row: string[] = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = c[1].match(/\br="([A-Z]+)\d+"/)?.[1];
        const type = c[1].match(/\bt="([^"]+)"/)?.[1];
        const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (type === "s" && v != null) value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = texts(c[2] ?? "", "t").join("");
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v != null) value = decode(v);
        const col = ref ? [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
        row[col] = value;
      }
      rows[rowIndex] = Array.from(row, (x) => x ?? "");
    }
    sheets.push({ name: decode(m[1]), ...cap(Array.from(rows, (x) => x ?? [])) });
  }
  return { kind: "sheets", sheets };
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

async function parsePptx(bytes: Buffer): Promise<Parsed> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const slides = [];
  for (const [i, name] of names.entries()) {
    const xml = await zip.file(name)!.async("string");
    const paragraphs = texts(xml, "a:p")
      .map((p) => texts(`<x>${p}</x>`, "a:t").join(""))
      .map((p) => decode(p).trim())
      .filter(Boolean);
    // Pictures on the slide, embedded so the preview needs no further requests.
    const rels = (await zip.file(name.replace("slides/", "slides/_rels/") + ".rels")?.async("string")) ?? "";
    const target = new Map([...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const images: string[] = [];
    for (const m of xml.matchAll(/r:embed="([^"]+)"/g)) {
      const t = target.get(m[1]);
      const ext = t?.split(".").pop()?.toLowerCase() ?? "";
      if (!t || !MIME[ext] || images.length >= 4) continue;
      const file = zip.file(`ppt/${t.replace(/^\.\.\//, "")}`);
      if (file) images.push(`data:${MIME[ext]};base64,${await file.async("base64")}`);
    }
    slides.push({ n: i + 1, paragraphs, images });
  }
  return { kind: "slides", slides };
}

async function odContent(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  return (await zip.file("content.xml")?.async("string")) ?? "";
}

/** Paragraph text from OpenDocument markup, keeping spaces and tabs it encodes as elements. */
const odText = (xml: string) =>
  decode(
    xml
      .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n) => " ".repeat(Number(n ?? 1)))
      .replace(/<text:tab\s*\/>/g, "\t")
      .replace(/<text:line-break\s*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );

async function parseOdt(bytes: Buffer): Promise<Parsed> {
  const xml = await odContent(bytes);
  const body = xml.match(/<office:text[^>]*>([\s\S]*)<\/office:text>/)?.[1] ?? "";
  const parts = [...body.matchAll(/<text:(h|p)\b[^>]*>([\s\S]*?)<\/text:\1>/g)].map((m) => ({ h: m[1] === "h", t: odText(m[2]) }));
  const html = parts.map((p) => (p.h ? `<h2>${esc(p.t)}</h2>` : `<p>${esc(p.t) || "&nbsp;"}</p>`)).join("");
  return { kind: "html", html, text: parts.map((p) => p.t).join("\n\n") };
}

async function parseOds(bytes: Buffer): Promise<Parsed> {
  const xml = await odContent(bytes);
  const sheets = [];
  for (const t of xml.matchAll(/<table:table\b[^>]*table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)) {
    const rows: string[][] = [];
    for (const r of t[2].matchAll(/<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g)) {
      const row: string[] = [];
      for (const c of r[2].matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const repeat = Math.min(Number(c[1].match(/number-columns-repeated="(\d+)"/)?.[1] ?? 1), MAX_COLS);
        const value = c[2] ? texts(c[2], "text:p").map(odText).join("\n") : "";
        for (let k = 0; k < repeat; k++) row.push(value);
      }
      while (row.length && !row[row.length - 1]) row.pop();
      const repeatRows = Math.min(Number(r[1].match(/number-rows-repeated="(\d+)"/)?.[1] ?? 1), 50);
      for (let k = 0; k < repeatRows; k++) rows.push(row);
      if (rows.length > MAX_ROWS) break;
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    sheets.push({ name: decode(t[1]), ...cap(rows) });
  }
  return { kind: "sheets", sheets };
}

async function parseOdp(bytes: Buffer): Promise<Parsed> {
  const xml = await odContent(bytes);
  const slides = [...xml.matchAll(/<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/g)].map((m, i) => ({
    n: i + 1,
    paragraphs: [...m[1].matchAll(/<text:(p|h)\b[^>]*>([\s\S]*?)<\/text:\1>/g)].map((p) => odText(p[2]).trim()).filter(Boolean),
    images: [] as string[],
  }));
  return { kind: "slides", slides };
}

export function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** Plain text from RTF: drops control words and hidden groups, keeps paragraphs. */
export function rtfToText(rtf: string): string {
  return rtf
    .replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, "")
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\(?:par|line)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/\\([{}\\])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text for analysis: one passage block per sheet or slide so citations can point at it. */
export function toExtraction(ext: string, parsed: Parsed): DocumentExtraction {
  let pages: { page_number: number; text: string }[];
  let unit: string;
  if (parsed.kind === "sheets") {
    unit = "sheet";
    pages = parsed.sheets.map((s, i) => ({ page_number: i + 1, text: `${s.name}\n${s.rows.map((r) => r.join("\t")).join("\n")}`.trim() }));
  } else if (parsed.kind === "slides") {
    unit = "slide";
    pages = parsed.slides.map((s) => ({ page_number: s.n, text: s.paragraphs.join("\n") }));
  } else {
    unit = "passage";
    pages = [{ page_number: 1, text: parsed.text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() }];
  }
  const empty = pages.every((p) => !p.text);
  return {
    method: `${ext.slice(1)}-${parsed.kind}`,
    pages,
    total_pages: pages.length,
    quality: empty ? "failed" : "ok",
    quality_note: empty ? `No text could be extracted from this ${ext} file.` : unit === "passage" ? null : `Citations reference ${unit}s.`,
    low_text_pages: [],
  };
}

const PAGE_CSS = `
:root{color-scheme:light}
body{margin:0;padding:32px 40px;font:15px/1.65 Georgia,"Times New Roman",serif;color:#1b1b1b;background:#fff}
h1,h2,h3{font-family:-apple-system,system-ui,sans-serif;line-height:1.3}
table{border-collapse:collapse;font:12.5px/1.4 -apple-system,system-ui,sans-serif}
td,th{border:1px solid #e3e3e3;padding:4px 8px;vertical-align:top;white-space:pre-wrap}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap;font:13.5px/1.6 ui-monospace,Menlo,monospace}
.tabs{position:sticky;top:0;display:flex;gap:4px;padding:8px 0 12px;background:#fff;font:12.5px -apple-system,system-ui,sans-serif}
.tabs a{padding:4px 10px;border-radius:8px;background:#f3f3f3;color:#444;text-decoration:none}
.sheet{margin-bottom:28px}.sheet h3{font-size:13px;margin:0 0 8px;color:#666}
.grid th{background:#f7f7f7;color:#888;font-weight:500;text-align:center}
.grid td.n{text-align:center;background:#f7f7f7;color:#888}
.note{font:12px -apple-system,system-ui,sans-serif;color:#888}
.slide{margin:0 auto 20px;max-width:880px;aspect-ratio:16/9;border:1px solid #e3e3e3;border-radius:14px;padding:36px 44px;box-sizing:border-box;overflow:hidden;font-family:-apple-system,system-ui,sans-serif;position:relative}
.slide .num{position:absolute;right:16px;bottom:12px;font-size:11px;color:#aaa}
.slide p{margin:0 0 8px;font-size:15px}.slide p:first-child{font-size:24px;font-weight:600;margin-bottom:16px}
.slide .imgs{display:flex;gap:10px;margin-top:12px}.slide .imgs img{max-height:180px;border-radius:6px}
`;

const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** A self-contained HTML page for the preview frame. Every value from the file is escaped. */
export function toPreviewHtml(parsed: Parsed): string {
  let body: string;
  if (parsed.kind === "html") body = parsed.html;
  else if (parsed.kind === "text") body = `<pre>${esc(parsed.text)}</pre>`;
  else if (parsed.kind === "slides") {
    body = parsed.slides
      .map(
        (s) =>
          `<section class="slide">${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${
            s.images.length ? `<div class="imgs">${s.images.map((src) => `<img src="${src}" alt="">`).join("")}</div>` : ""
          }<span class="num">${s.n}</span></section>`,
      )
      .join("");
  } else {
    const tabs = parsed.sheets.length > 1 ? `<nav class="tabs">${parsed.sheets.map((s, i) => `<a href="#s${i}">${esc(s.name)}</a>`).join("")}</nav>` : "";
    body =
      tabs +
      parsed.sheets
        .map((s, i) => {
          const cols = Math.max(0, ...s.rows.map((r) => r.length));
          const head = `<tr><th></th>${Array.from({ length: cols }, (_, c) => `<th>${colName(c)}</th>`).join("")}</tr>`;
          const rows = s.rows.map((r, ri) => `<tr><td class="n">${ri + 1}</td>${Array.from({ length: cols }, (_, c) => `<td>${esc(r[c] ?? "")}</td>`).join("")}</tr>`).join("");
          return `<div class="sheet" id="s${i}">${parsed.sheets.length > 1 ? `<h3>${esc(s.name)}</h3>` : ""}<table class="grid">${head}${rows}</table>${
            s.truncated ? `<p class="note">Showing the first ${MAX_ROWS} rows and ${MAX_COLS} columns. Download the original for the rest.</p>` : ""
          }</div>`;
        })
        .join("");
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;
}
