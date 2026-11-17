import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, PageNumber } from "docx";
import type { CasePackContent, PackEvent, PackFinding } from "./casepack";

const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level, spacing: { before: 280, after: 120 } });
const p = (text: string, opts: { italics?: boolean; bold?: boolean; color?: string } = {}) =>
  new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 100 } });

function finding(f: PackFinding): Paragraph[] {
  const draft = f.review_status === "unreviewed";
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun(`${f.reference} · ${f.title}`)],
      spacing: { before: 200, after: 60 },
    }),
    p(`${f.type_label}: ${f.status_label}`, { italics: true, color: draft ? "B45309" : "555555", bold: draft }),
    p(f.description),
    ...(f.relationship_explanation ? [p(`Relationship: ${f.relationship_explanation}`)] : []),
    ...(f.limitations ? [p(`Limitations: ${f.limitations}`, { italics: true })] : []),
    p(`Sources: ${f.citations.join("; ")}`, { color: "333333" }),
    ...(f.precedents?.length ? [p(`Precedents: ${f.precedents.map((x) => `${x.title}${x.citation ? ` ${x.citation}` : ""}`).join("; ")}`, { color: "333333" })] : []),
  ];
}

function event(e: PackEvent): Paragraph[] {
  const draft = e.status_label.startsWith("UNREVIEWED");
  return [
    new Paragraph({ children: [new TextRun({ text: `${e.when}`, bold: true }), new TextRun(` (${e.precision})  ${e.description}`)], spacing: { before: 120 } }),
    p(`${e.status_label} · Sources: ${e.citations.join("; ")}`, { italics: true, color: draft ? "B45309" : "555555" }),
    ...(e.note ? [p(`Note: ${e.note}`, { italics: true })] : []),
  ];
}

function section(title: string, items: PackFinding[], empty: string): Paragraph[] {
  return [h(title), ...(items.length ? items.flatMap(finding) : [p(empty, { italics: true })])];
}

export async function casePackToDocx(c: CasePackContent): Promise<Buffer> {
  const cell = (text: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })] });
  const inventory = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: ["Ref", "Filename", "Type", "Uploaded", "SHA-256 (prefix)"].map((t) => cell(t, true)) }),
      ...c.evidence_inventory.map(
        (e) =>
          new TableRow({
            children: [
              cell(e.reference),
              cell(e.filename + (e.duplicate_of ? ` (identical to ${e.duplicate_of})` : "")),
              cell(e.type),
              cell(e.uploaded_at.slice(0, 16).replace("T", " ")),
              cell(e.hash.slice(0, 16)),
            ],
          }),
      ),
    ],
  });

  const doc = new Document({
    creator: c.generated_by,
    title: `${c.case_reference} case preparation pack v${c.version}`,
    sections: [
      {
        headers: { default: new Header({ children: [p(`${c.case_reference} · ${c.draft_status}`, { color: "777777" })] }) },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], size: 16, color: "777777" })] })],
          }),
        },
        children: [
          new Paragraph({ text: "Case preparation pack", heading: HeadingLevel.TITLE }),
          p(`${c.case_reference}: ${c.title}`, { bold: true }),
          p(`Version ${c.version} · generated ${c.generated_at.slice(0, 16).replace("T", " ")} UTC by ${c.generated_by}`),
          p(c.draft_status, { bold: true, color: c.include_unreviewed ? "B45309" : "166534" }),
          p(c.notice, { italics: true, color: "555555" }),
          h("1. Case overview"),
          ...(c.description ? [p(c.description)] : []),
          p(
            `Status: ${c.overview.case_status}. Evidence items: ${c.overview.evidence_items}. Findings included: ${c.overview.findings_included}. Rejected (excluded): ${c.overview.findings_excluded_rejected}. Still unreviewed: ${c.overview.findings_unreviewed}.`,
          ),
          h("2. Evidence inventory"),
          inventory,
          ...section("3. Summary of reviewed findings", c.reviewed_findings, "No single-item findings included."),
          h("4. Chronology of events"),
          ...(c.chronology.length ? c.chronology.flatMap(event) : [p("No dated events included.", { italics: true })]),
          h("Undated events", HeadingLevel.HEADING_2),
          ...(c.undated_events.length ? c.undated_events.flatMap(event) : [p("None.", { italics: true })]),
          ...section("5. Cross-evidence observations", c.cross_evidence, "None included."),
          ...section("6. Potential discrepancies", c.discrepancies, "None included."),
          ...section("7. Missing information and unresolved questions", c.open_questions, "None included."),
          h("Information provided by the reviewer", HeadingLevel.HEADING_2),
          ...((c.reviewer_notes ?? []).length
            ? (c.reviewer_notes ?? []).flatMap((n) => [p(n.text), p(`${n.reference} · ${n.author ?? "Reviewer"} · ${n.added_at.slice(0, 16).replace("T", " ")} UTC`, { italics: true, color: "555555" })])
            : [p("None.", { italics: true })]),
          h("8. Source references"),
          ...c.source_references.flatMap((s) => [
            new Paragraph({ children: [new TextRun({ text: `${s.observation}: ${s.citation}`, bold: true })], spacing: { before: 80 } }),
            p(s.description),
            ...(s.quote ? [p(`“${s.quote}”`, { italics: true })] : []),
          ]),
          ...((c.web_sources ?? []).length
            ? [
                h("9. Web sources (not evidence)"),
                p("Outside material approved by a reviewer for context. It is not evidence in this case and has not been tested against it.", { italics: true }),
                ...(c.web_sources ?? []).flatMap((w) => [
                  new Paragraph({ children: [new TextRun({ text: `${w.title}`, bold: true })], spacing: { before: 80 } }),
                  p(`${w.url} · for “${w.section}” · retrieved ${w.retrieved_at.slice(0, 10)}${w.approved_by ? ` · approved by ${w.approved_by}` : ""}${w.origin === "search" ? " · found by AI web search" : ""}`, { color: "555555" }),
                  ...(w.excerpt ? [p(w.excerpt, { italics: true })] : []),
                ]),
              ]
            : []),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
