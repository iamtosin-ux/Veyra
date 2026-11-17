// Financial services: an authorised push payment (APP) scam complaint at a bank.
// Synthetic. Analysis hand-written (not AI output). No conclusions on reimbursement.
import { ref, type DemoScenario } from "../types";

const STATEMENT = "account_statement_4417.pdf";
const CALL = "fraud_call_notes.txt";
const ALERTS = "payment_alert_log.docx";
const COMPLAINT = "customer_complaint.txt";

const S = ref(STATEMENT), C = ref(CALL), A = ref(ALERTS), P = ref(COMPLAINT);

export const financialServices: DemoScenario = {
  id: "financial-services",
  industry: "Financial services",
  title: "Account 4417: disputed transfers after a safe-account scam",
  description: "A customer moved £9,850 in three transfers after a call from someone posing as the bank; the bank's warnings and the customer's account of the call differ.",
  files: [STATEMENT, CALL, ALERTS, COMPLAINT],
  media: {
    [STATEMENT]: {
      kind: "pdf",
      pages: [
        [
          "# Current account statement, account ending 4417 (synthetic)",
          "12 Feb 2026 14:02  Faster Payment to J MORGAN  £2,500.00",
          "12 Feb 2026 14:19  Faster Payment to J MORGAN  £3,350.00",
          "12 Feb 2026 14:41  Faster Payment to J MORGAN  £4,000.00",
          "Balance after 14:41: £212.40",
          "Payee J MORGAN first added: 12 Feb 2026 13:55",
        ],
      ],
    },
    [CALL]: {
      kind: "txt",
      text: `Fraud team call notes (synthetic)
Call received: 12 Feb 2026, 16:30. Customer reporting suspected scam.

Customer says they had a call at about 1:45pm from a man saying he was from the bank's fraud department, and that their account had been compromised.

Customer says the caller told them to move money to a "safe account" in the name of J Morgan and that they would see warnings but should ignore them.

Customer says the caller's number matched the number on the back of their card.

Payments reported to the receiving bank at 16:52. Recovery requested.
`,
    },
    [ALERTS]: {
      kind: "docx",
      title: "Payment alert log, account 4417 (synthetic)",
      paragraphs: [
        "14:01  New payee J MORGAN. Confirmation of Payee result: no match on name.",
        "14:01  Scam warning shown: 'Is someone asking you to move money to a safe account?' Customer selected 'Continue'.",
        "14:18  Payment held for review. Automated call made; customer pressed 1 to confirm the payment was genuine.",
        "14:40  Scam warning shown again. Customer selected 'Continue'.",
        "No branch or human contact recorded before the payments completed.",
      ],
    },
    [COMPLAINT]: {
      kind: "txt",
      text: `Complaint from the customer (synthetic)
Date: 20 February 2026

I was tricked by someone pretending to be your fraud team. The call came from your own phone number, so I believed it.

I do not remember any warning about the name not matching. I was told the warnings were part of the security process.

I am 78 and I live alone. I would like my £9,850 back.
`,
    },
  },
  items: {
    [STATEMENT]: {
      summary: "The statement shows three Faster Payments to a new payee, J MORGAN, between 14:02 and 14:41 on 12 February 2026, totalling £9,850.",
      extraction_issues: [],
      observations: [
        { key: "s_p1", observation_type: "extracted_document_fact", description: "£2,500 was paid to J MORGAN at 14:02 on 12 February 2026.", quote: "12 Feb 2026 14:02 Faster Payment to J MORGAN £2,500.00", page_number: 1, event_time: { stated_text: "12 Feb 2026 14:02", iso_datetime: "2026-02-12T14:02", precision: "minute", basis: "bank statement" } },
        { key: "s_p2", observation_type: "extracted_document_fact", description: "£3,350 was paid to J MORGAN at 14:19.", quote: "12 Feb 2026 14:19 Faster Payment to J MORGAN £3,350.00", page_number: 1, event_time: { stated_text: "12 Feb 2026 14:19", iso_datetime: "2026-02-12T14:19", precision: "minute", basis: "bank statement" } },
        { key: "s_p3", observation_type: "extracted_document_fact", description: "£4,000 was paid to J MORGAN at 14:41, leaving £212.40.", quote: "12 Feb 2026 14:41 Faster Payment to J MORGAN £4,000.00", page_number: 1, event_time: { stated_text: "12 Feb 2026 14:41", iso_datetime: "2026-02-12T14:41", precision: "minute", basis: "bank statement" } },
        { key: "s_payee", observation_type: "extracted_document_fact", description: "The payee J MORGAN was first added at 13:55 the same day.", quote: "Payee J MORGAN first added: 12 Feb 2026 13:55", page_number: 1 },
      ],
    },
    [CALL]: {
      summary: "Fraud team notes: the customer reports a call at about 1:45pm from someone posing as the bank's fraud team, told to move money to a 'safe account' and ignore warnings; the number appeared genuine.",
      extraction_issues: [],
      observations: [
        { key: "c_call", observation_type: "contributor_statement", description: "The customer says a man claiming to be from the bank's fraud department called at about 1:45pm.", quote: "they had a call at about 1:45pm from a man saying he was from the bank's fraud department", event_time: { stated_text: "about 1:45pm", iso_datetime: "2026-02-12T13:45", precision: "approximate", basis: "stated by customer" } },
        { key: "c_ignore", observation_type: "contributor_statement", description: "The customer says the caller told them they would see warnings and should ignore them.", quote: "they would see warnings but should ignore them" },
        { key: "c_spoof", observation_type: "contributor_statement", description: "The customer says the caller's number matched the number on the back of their card.", quote: "the caller's number matched the number on the back of their card", requires_review: true, uncertainty_reason: "Number spoofing is not verified by the bank's records here." },
        { key: "c_report", observation_type: "extracted_document_fact", description: "The payments were reported to the receiving bank at 16:52 and recovery was requested.", quote: "Payments reported to the receiving bank at 16:52. Recovery requested.", event_time: { stated_text: "12 Feb 2026 16:52", iso_datetime: "2026-02-12T16:52", precision: "minute", basis: "fraud team notes" } },
      ],
    },
    [ALERTS]: {
      summary: "The alert log shows a Confirmation of Payee no-match, two scam warnings the customer continued past, and an automated call the customer confirmed; no human contact before the payments completed.",
      extraction_issues: [],
      observations: [
        { key: "a_cop", observation_type: "extracted_document_fact", description: "Confirmation of Payee returned no match on the name for J MORGAN at 14:01.", quote: "Confirmation of Payee result: no match on name." },
        { key: "a_warn1", observation_type: "extracted_document_fact", description: "A safe-account scam warning was shown at 14:01 and the customer selected Continue.", quote: "Scam warning shown: 'Is someone asking you to move money to a safe account?' Customer selected 'Continue'." },
        { key: "a_hold", observation_type: "extracted_document_fact", description: "At 14:18 the payment was held and an automated call was confirmed as genuine by the customer pressing 1.", quote: "customer pressed 1 to confirm the payment was genuine" },
        { key: "a_warn2", observation_type: "extracted_document_fact", description: "A scam warning was shown again at 14:40 and the customer selected Continue.", quote: "14:40 Scam warning shown again. Customer selected 'Continue'." },
        { key: "a_nohuman", observation_type: "extracted_document_fact", description: "No branch or human contact is recorded before the payments completed.", quote: "No branch or human contact recorded before the payments completed." },
      ],
    },
    [COMPLAINT]: {
      summary: "The customer's complaint of 20 February 2026: tricked by someone posing as the fraud team from the bank's own number, doesn't remember a name-mismatch warning, is 78 and lives alone, and asks for £9,850 back.",
      extraction_issues: [],
      observations: [
        { key: "p_number", observation_type: "contributor_statement", description: "The customer says the call came from the bank's own phone number.", quote: "The call came from your own phone number, so I believed it." },
        { key: "p_nocop", observation_type: "contributor_statement", description: "The customer says they don't remember a warning about the name not matching.", quote: "I do not remember any warning about the name not matching." },
        { key: "p_told", observation_type: "contributor_statement", description: "The customer says they were told the warnings were part of the security process.", quote: "I was told the warnings were part of the security process." },
        { key: "p_vuln", observation_type: "contributor_statement", description: "The customer says they are 78 and live alone.", quote: "I am 78 and I live alone." },
        { key: "p_ask", observation_type: "contributor_statement", description: "The customer asks for the £9,850 back.", quote: "I would like my £9,850 back.", event_time: { stated_text: "20 February 2026", iso_datetime: "2026-02-20", precision: "day", basis: "complaint date" } },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Name-mismatch warning: shown per the log, not remembered by the customer",
        description: "The alert log records a Confirmation of Payee no-match at 14:01. The customer says they don't remember any warning about the name.",
        finding_type: "potential_discrepancy",
        refs: [A("a_cop"), P("p_nocop")],
        relationship_explanation: "The customer also says the caller told them to ignore warnings, which may explain why it wasn't taken in.",
        limitations: "The log doesn't show how the result was displayed on screen.",
        requires_review: true,
      },
      {
        title: "Warnings were continued past, as the caller had told the customer to do",
        description: "Two safe-account warnings were shown and passed at 14:01 and 14:40, and the automated call was confirmed. The customer says the caller told them warnings would appear and to ignore them.",
        finding_type: "supporting_relationship",
        refs: [A("a_warn1"), A("a_warn2"), A("a_hold"), C("c_ignore"), P("p_told")],
        relationship_explanation: null,
        limitations: "Whether the warnings were effective is for the reviewer under the reimbursement rules.",
        requires_review: true,
      },
      {
        title: "Payments followed the call and a new payee within minutes",
        description: "The customer places the call at about 1:45pm; the payee was added at 13:55 and the three payments went at 14:02, 14:19 and 14:41.",
        finding_type: "chronological_relationship",
        refs: [C("c_call"), S("s_payee"), S("s_p1"), S("s_p2"), S("s_p3")],
        relationship_explanation: null,
        limitations: "",
        requires_review: false,
      },
      {
        title: "Possible vulnerability and no human intervention",
        description: "The customer says they are 78 and live alone. No branch or human contact is recorded before the payments completed, despite a payment being held for review.",
        finding_type: "question",
        refs: [P("p_vuln"), A("a_nohuman"), A("a_hold")],
        relationship_explanation: "Vulnerability and intervention both bear on how the complaint is decided.",
        limitations: "",
        requires_review: true,
      },
      {
        title: "Missing: telephony records and the receiving bank's response",
        description: "The bank's call records for 12 February (to test the spoofed-number claim) and the receiving bank's reply on recovery are not in the case.",
        finding_type: "missing_information",
        refs: [C("c_spoof"), C("c_report")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Customer receives a call from someone posing as the bank.", iso_datetime: "2026-02-12T13:45", date_text: "about 1:45pm", precision: "approximate", refs: [C("c_call")], relationship_note: "Stated by the customer." },
      { description: "New payee J MORGAN added.", iso_datetime: "2026-02-12T13:55", date_text: "13:55", precision: "minute", refs: [S("s_payee")], relationship_note: null },
      { description: "Name no-match and first scam warning; £2,500 paid.", iso_datetime: "2026-02-12T14:02", date_text: "14:01–14:02", precision: "minute", refs: [A("a_cop"), A("a_warn1"), S("s_p1")], relationship_note: null },
      { description: "Payment held; automated call confirmed; £3,350 paid.", iso_datetime: "2026-02-12T14:19", date_text: "14:18–14:19", precision: "minute", refs: [A("a_hold"), S("s_p2")], relationship_note: null },
      { description: "Second warning; £4,000 paid.", iso_datetime: "2026-02-12T14:41", date_text: "14:40–14:41", precision: "minute", refs: [A("a_warn2"), S("s_p3")], relationship_note: null },
      { description: "Reported to the receiving bank.", iso_datetime: "2026-02-12T16:52", date_text: "16:52", precision: "minute", refs: [C("c_report")], relationship_note: null },
      { description: "Customer complains and asks for the money back.", iso_datetime: "2026-02-20", date_text: "20 February 2026", precision: "day", refs: [P("p_ask")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "This analysis organises evidence only and does not decide reimbursement."],
  },
};
