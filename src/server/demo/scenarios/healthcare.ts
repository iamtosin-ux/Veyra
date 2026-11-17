// Healthcare: a patient safety incident on a hospital ward, reviewed under PSIRF.
// Synthetic. Analysis hand-written (not AI output). No conclusions about individuals' practice.
import { ref, type DemoScenario } from "../types";

const OBS = "ward7_observation_chart.pdf";
const INCIDENT = "incident_report_INC-4471.docx";
const NURSE = "staff_nurse_statement.txt";
const FAMILY = "family_complaint_email.txt";

const O = ref(OBS), I = ref(INCIDENT), N = ref(NURSE), F = ref(FAMILY);

export const healthcare: DemoScenario = {
  id: "healthcare",
  industry: "Healthcare",
  title: "Ward 7 deterioration: delayed sepsis escalation",
  description: "An elderly patient's early warning score rose overnight; the record and the staff account differ on when the doctor was called, and the family say concerns were raised hours earlier.",
  files: [OBS, INCIDENT, NURSE, FAMILY],
  media: {
    [OBS]: {
      kind: "pdf",
      pages: [
        [
          "# Ward 7 observation chart (synthetic)",
          "Patient: Bed 14 (name withheld)   Date: 3 March 2026",
          "22:00  Temp 37.9  HR 98  BP 118/74  RR 20  SpO2 95%  NEWS2 3",
          "00:00  Temp 38.4  HR 108  BP 109/68  RR 22  SpO2 94%  NEWS2 5",
          "02:00  Temp 38.9  HR 118  BP 96/60  RR 25  SpO2 92%  NEWS2 7",
          "04:30  Temp 39.1  HR 124  BP 88/54  RR 26  SpO2 91%  NEWS2 9",
          "04:40  Doctor informed. Sepsis screen started.",
          "Escalation guide: NEWS2 of 5 or more needs an urgent review; 7 or more needs an emergency response.",
        ],
      ],
    },
    [INCIDENT]: {
      kind: "docx",
      title: "Incident report INC-4471 (synthetic)",
      paragraphs: [
        "Reported: 4 March 2026, 09:15, by the ward manager.",
        "Summary: Patient in Bed 14 deteriorated overnight and was transferred to the high dependency unit at 06:10.",
        "Escalation: the record shows the on-call doctor was informed at 04:40.",
        "Sepsis bundle: antibiotics were given at 05:35.",
        "Staffing: one registered nurse was absent through sickness; the ward ran with one nurse fewer than planned.",
        "Initial level of harm: moderate, pending review.",
      ],
    },
    [NURSE]: {
      kind: "txt",
      text: `Statement of the staff nurse (synthetic)

I was caring for the patient in Bed 14 on the night of 3 March 2026.

When I did the 2am observations the score was 7. I bleeped the on-call doctor at about 2:15am but did not get a call back, and I was also covering another bay.

I bleeped again at about 4:30am after the next set of observations and the doctor came to the ward at 4:40am.

I did not write the 2:15am bleep in the notes because I was busy.
`,
    },
    [FAMILY]: {
      kind: "txt",
      text: `From: Patient's daughter (synthetic)
Subject: Complaint about my father's care on Ward 7
Date: 6 March 2026

I visited my father until about 11pm on 3 March. He was hot, shaking and more confused than usual, and I told the nurse I was worried he had an infection.

I was told he would be checked during the night. The next morning we were called to say he had been moved to the high dependency unit.

I would like to know why it took so long for a doctor to see him.
`,
    },
  },
  items: {
    [OBS]: {
      summary: "The overnight observation chart for Bed 14 on 3 March 2026: NEWS2 rose from 3 at 22:00 to 9 at 04:30, with the doctor recorded as informed at 04:40.",
      extraction_issues: [],
      observations: [
        { key: "o_2200", observation_type: "extracted_document_fact", description: "At 22:00 the NEWS2 score was 3.", quote: "22:00 Temp 37.9 HR 98 BP 118/74 RR 20 SpO2 95% NEWS2 3", page_number: 1, event_time: { stated_text: "3 March 2026 22:00", iso_datetime: "2026-03-03T22:00", precision: "minute", basis: "observation chart" } },
        { key: "o_0000", observation_type: "extracted_document_fact", description: "At 00:00 the NEWS2 score was 5.", quote: "00:00 Temp 38.4 HR 108 BP 109/68 RR 22 SpO2 94% NEWS2 5", page_number: 1, event_time: { stated_text: "4 March 2026 00:00", iso_datetime: "2026-03-04T00:00", precision: "minute", basis: "observation chart" } },
        { key: "o_0200", observation_type: "extracted_document_fact", description: "At 02:00 the NEWS2 score was 7.", quote: "02:00 Temp 38.9 HR 118 BP 96/60 RR 25 SpO2 92% NEWS2 7", page_number: 1, event_time: { stated_text: "4 March 2026 02:00", iso_datetime: "2026-03-04T02:00", precision: "minute", basis: "observation chart" } },
        { key: "o_0430", observation_type: "extracted_document_fact", description: "At 04:30 the NEWS2 score was 9.", quote: "04:30 Temp 39.1 HR 124 BP 88/54 RR 26 SpO2 91% NEWS2 9", page_number: 1, event_time: { stated_text: "4 March 2026 04:30", iso_datetime: "2026-03-04T04:30", precision: "minute", basis: "observation chart" } },
        { key: "o_0440", observation_type: "extracted_document_fact", description: "The chart records the doctor informed and a sepsis screen started at 04:40.", quote: "04:40 Doctor informed. Sepsis screen started.", page_number: 1, event_time: { stated_text: "4 March 2026 04:40", iso_datetime: "2026-03-04T04:40", precision: "minute", basis: "observation chart" } },
        { key: "o_guide", observation_type: "extracted_document_fact", description: "The chart's escalation guide says a score of 5 or more needs an urgent review and 7 or more an emergency response.", quote: "NEWS2 of 5 or more needs an urgent review; 7 or more needs an emergency response.", page_number: 1 },
      ],
    },
    [INCIDENT]: {
      summary: "Incident report INC-4471: the patient deteriorated overnight and moved to HDU at 06:10; the doctor was informed at 04:40, antibiotics given at 05:35, and the ward was one nurse short.",
      extraction_issues: [],
      observations: [
        { key: "i_hdu", observation_type: "extracted_document_fact", description: "The patient was transferred to the high dependency unit at 06:10.", quote: "transferred to the high dependency unit at 06:10", event_time: { stated_text: "4 March 2026 06:10", iso_datetime: "2026-03-04T06:10", precision: "minute", basis: "incident report" } },
        { key: "i_dr", observation_type: "extracted_document_fact", description: "The report states the on-call doctor was informed at 04:40.", quote: "the on-call doctor was informed at 04:40" },
        { key: "i_abx", observation_type: "extracted_document_fact", description: "Antibiotics were given at 05:35.", quote: "antibiotics were given at 05:35", event_time: { stated_text: "4 March 2026 05:35", iso_datetime: "2026-03-04T05:35", precision: "minute", basis: "incident report" } },
        { key: "i_staff", observation_type: "extracted_document_fact", description: "The ward ran with one registered nurse fewer than planned because of sickness.", quote: "the ward ran with one nurse fewer than planned" },
      ],
    },
    [NURSE]: {
      summary: "The staff nurse says they bleeped the on-call doctor at about 2:15am after a score of 7, got no call back, bleeped again at 4:30am, and did not record the first bleep.",
      extraction_issues: [],
      observations: [
        { key: "n_score", observation_type: "contributor_statement", description: "The nurse says the 2am observations gave a score of 7.", quote: "When I did the 2am observations the score was 7." },
        { key: "n_bleep1", observation_type: "contributor_statement", description: "The nurse says they bleeped the on-call doctor at about 2:15am and got no call back.", quote: "I bleeped the on-call doctor at about 2:15am but did not get a call back", event_time: { stated_text: "about 2:15am", iso_datetime: "2026-03-04T02:15", precision: "approximate", basis: "stated by nurse" }, requires_review: true, uncertainty_reason: "Not recorded at the time." },
        { key: "n_cover", observation_type: "contributor_statement", description: "The nurse says they were also covering another bay.", quote: "I was also covering another bay." },
        { key: "n_bleep2", observation_type: "contributor_statement", description: "The nurse says they bleeped again at about 4:30am and the doctor arrived at 4:40am.", quote: "I bleeped again at about 4:30am after the next set of observations and the doctor came to the ward at 4:40am." },
        { key: "n_unrecorded", observation_type: "contributor_statement", description: "The nurse says the 2:15am bleep was not written in the notes.", quote: "I did not write the 2:15am bleep in the notes because I was busy." },
      ],
    },
    [FAMILY]: {
      summary: "The patient's daughter says she raised concerns about infection before 11pm on 3 March and asks why it took so long for a doctor to see her father.",
      extraction_issues: [],
      observations: [
        { key: "f_concern", observation_type: "contributor_statement", description: "The daughter says her father was hot, shaking and more confused, and she told the nurse she was worried about infection.", quote: "I told the nurse I was worried he had an infection.", event_time: { stated_text: "before about 11pm on 3 March", iso_datetime: "2026-03-03T23:00", precision: "approximate", basis: "stated by family" } },
        { key: "f_reassured", observation_type: "contributor_statement", description: "The daughter says she was told he would be checked during the night.", quote: "I was told he would be checked during the night." },
        { key: "f_question", observation_type: "contributor_statement", description: "The daughter asks why it took so long for a doctor to see him.", quote: "I would like to know why it took so long for a doctor to see him." },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "When was the doctor first called: 02:15 per the nurse, 04:40 per the record?",
        description: "The nurse says the on-call doctor was bleeped at about 2:15am with no call back. The chart and the incident report only record the doctor being informed at 04:40, and the nurse says the first bleep was not written down.",
        finding_type: "potential_discrepancy",
        refs: [N("n_bleep1"), N("n_unrecorded"), O("o_0440"), I("i_dr")],
        relationship_explanation: "Bleep logs or switchboard records could confirm whether a 02:15 bleep was made.",
        limitations: "The 02:15 bleep rests on the nurse's account alone.",
        requires_review: true,
      },
      {
        title: "Scores met the escalation thresholds from midnight",
        description: "The score reached 5 at 00:00 and 7 at 02:00. The chart's own guide calls for an urgent review at 5 and an emergency response at 7.",
        finding_type: "supporting_relationship",
        refs: [O("o_0000"), O("o_0200"), O("o_guide"), N("n_score")],
        relationship_explanation: null,
        limitations: "Whether any review happened between 00:00 and 04:40 is not recorded.",
        requires_review: true,
      },
      {
        title: "Concerns about infection were raised by the family before 11pm",
        description: "The daughter says she told the nurse she was worried about infection before leaving at about 11pm. The 22:00 observations show a temperature of 37.9 and a score of 3.",
        finding_type: "chronological_relationship",
        refs: [F("f_concern"), F("f_reassured"), O("o_2200")],
        relationship_explanation: "The family's concern came before the scores rose.",
        limitations: "No record of the conversation was provided.",
        requires_review: true,
      },
      {
        title: "Staffing was one nurse short, and the nurse was covering another bay",
        description: "The incident report records one registered nurse fewer than planned. The nurse says they were also covering another bay.",
        finding_type: "supporting_relationship",
        refs: [I("i_staff"), N("n_cover")],
        relationship_explanation: null,
        limitations: "The rota and patient allocation were not provided.",
        requires_review: true,
      },
      {
        title: "Missing: bleep log, rota and the sepsis screening record",
        description: "The review needs the switchboard or bleep log for the night, the nursing rota and allocation, and the sepsis screening tool started at 04:40.",
        finding_type: "missing_information",
        refs: [N("n_bleep1"), I("i_staff"), O("o_0440")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "NEWS2 score 3.", iso_datetime: "2026-03-03T22:00", date_text: "3 March 22:00", precision: "minute", refs: [O("o_2200")], relationship_note: null },
      { description: "Family raise concern about infection before leaving.", iso_datetime: "2026-03-03T23:00", date_text: "about 11pm", precision: "approximate", refs: [F("f_concern")], relationship_note: "Stated by the family." },
      { description: "NEWS2 score 5.", iso_datetime: "2026-03-04T00:00", date_text: "00:00", precision: "minute", refs: [O("o_0000")], relationship_note: null },
      { description: "NEWS2 score 7.", iso_datetime: "2026-03-04T02:00", date_text: "02:00", precision: "minute", refs: [O("o_0200")], relationship_note: null },
      { description: "Nurse says the doctor was bleeped with no call back.", iso_datetime: "2026-03-04T02:15", date_text: "about 02:15", precision: "approximate", refs: [N("n_bleep1")], relationship_note: "Not in the record." },
      { description: "NEWS2 score 9; doctor informed at 04:40.", iso_datetime: "2026-03-04T04:30", date_text: "04:30–04:40", precision: "minute", refs: [O("o_0430"), O("o_0440")], relationship_note: null },
      { description: "Antibiotics given.", iso_datetime: "2026-03-04T05:35", date_text: "05:35", precision: "minute", refs: [I("i_abx")], relationship_note: null },
      { description: "Transferred to the high dependency unit.", iso_datetime: "2026-03-04T06:10", date_text: "06:10", precision: "minute", refs: [I("i_hdu")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "This analysis organises evidence for a patient safety review and does not judge any individual's practice."],
  },
};
