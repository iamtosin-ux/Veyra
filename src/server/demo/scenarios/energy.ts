// Energy: a back-billing complaint after a smart meter stopped sending readings.
// Synthetic. Analysis hand-written (not AI output). No conclusions on the outcome.
import { ref, type DemoScenario } from "../types";

const BILL = "catch_up_bill_may2026.pdf";
const READS = "smart_meter_reads_log.txt";
const ENGINEER = "engineer_visit_report.docx";
const CUSTOMER = "customer_complaint_email.txt";

const B = ref(BILL), R = ref(READS), V = ref(ENGINEER), C = ref(CUSTOMER);

export const energy: DemoScenario = {
  id: "energy",
  industry: "Energy",
  title: "14 Carrow Lane: £2,340 catch-up bill after smart meter fault",
  description: "A customer received a catch-up bill covering 22 months of estimated use; the supplier's own records show the meter stopped communicating and the customer says they reported it.",
  files: [BILL, READS, ENGINEER, CUSTOMER],
  media: {
    [BILL]: {
      kind: "pdf",
      pages: [
        [
          "# Electricity catch-up bill (synthetic)",
          "Account: 14 Carrow Lane   Bill date: 12 May 2026",
          "Period: 1 July 2024 to 30 April 2026",
          "Previous bills were estimated. This bill uses an actual reading of 18,412 kWh taken on 30 April 2026.",
          "Additional charge for the period: £2,340.18",
          "Payment due: 2 June 2026",
        ],
      ],
    },
    [READS]: {
      kind: "txt",
      text: `Smart meter communication log, 14 Carrow Lane (synthetic)

28 Jun 2024  Last automatic reading received: 11,050 kWh
1 Jul 2024   Meter not communicating. Estimated billing started.
14 Oct 2024  Customer contact: reports "in-home display says no signal". Ticket opened.
14 Oct 2024  Ticket closed: "no action required".
30 Apr 2026  Actual reading taken at visit: 18,412 kWh
`,
    },
    [ENGINEER]: {
      kind: "docx",
      title: "Engineer visit report (synthetic)",
      paragraphs: [
        "Visit date: 30 April 2026.",
        "Meter found working but its communications hub had failed. Hub replaced.",
        "Actual reading taken: 18,412 kWh.",
        "Hub fault likely present for a long period. No sign of tampering.",
      ],
    },
    [CUSTOMER]: {
      kind: "txt",
      text: `From: Customer, 14 Carrow Lane (synthetic)
Date: 15 May 2026
Subject: Complaint about my catch-up bill

I reported in October 2024 that my in-home display had no signal, and I was told it was nothing to worry about.

I have paid every estimated bill on time. I can't afford £2,340 in one go.

I understand you can't bill for electricity used more than 12 months ago if it was your fault the bills were wrong.
`,
    },
  },
  items: {
    [BILL]: {
      summary: "A catch-up electricity bill dated 12 May 2026 covering July 2024 to April 2026, based on an actual reading of 18,412 kWh, adding £2,340.18.",
      extraction_issues: [],
      observations: [
        { key: "b_period", observation_type: "extracted_document_fact", description: "The bill covers 1 July 2024 to 30 April 2026.", quote: "Period: 1 July 2024 to 30 April 2026", page_number: 1 },
        { key: "b_estimated", observation_type: "extracted_document_fact", description: "The bill says previous bills were estimated and this one uses an actual reading of 18,412 kWh.", quote: "Previous bills were estimated. This bill uses an actual reading of 18,412 kWh taken on 30 April 2026.", page_number: 1 },
        { key: "b_amount", observation_type: "extracted_document_fact", description: "The additional charge is £2,340.18, due on 2 June 2026.", quote: "Additional charge for the period: £2,340.18", page_number: 1, event_time: { stated_text: "12 May 2026", iso_datetime: "2026-05-12", precision: "day", basis: "bill date" } },
      ],
    },
    [READS]: {
      summary: "The supplier's communication log: last automatic reading 28 June 2024, estimates from 1 July 2024, a customer report of 'no signal' in October 2024 closed with no action, and an actual reading in April 2026.",
      extraction_issues: [],
      observations: [
        { key: "r_last", observation_type: "extracted_document_fact", description: "The last automatic reading was 11,050 kWh on 28 June 2024.", quote: "28 Jun 2024 Last automatic reading received: 11,050 kWh", event_time: { stated_text: "28 Jun 2024", iso_datetime: "2024-06-28", precision: "day", basis: "meter log" } },
        { key: "r_estimates", observation_type: "extracted_document_fact", description: "From 1 July 2024 the meter was not communicating and estimated billing began.", quote: "1 Jul 2024 Meter not communicating. Estimated billing started.", event_time: { stated_text: "1 Jul 2024", iso_datetime: "2024-07-01", precision: "day", basis: "meter log" } },
        { key: "r_report", observation_type: "extracted_document_fact", description: "On 14 October 2024 the customer reported the in-home display had no signal.", quote: "Customer contact: reports \"in-home display says no signal\".", event_time: { stated_text: "14 Oct 2024", iso_datetime: "2024-10-14", precision: "day", basis: "meter log" } },
        { key: "r_closed", observation_type: "extracted_document_fact", description: "The ticket was closed the same day with 'no action required'.", quote: "Ticket closed: \"no action required\"." },
      ],
    },
    [ENGINEER]: {
      summary: "The engineer found the meter working but its communications hub failed, replaced the hub, took a reading of 18,412 kWh, and saw no sign of tampering.",
      extraction_issues: [],
      observations: [
        { key: "v_hub", observation_type: "extracted_document_fact", description: "The meter was working but its communications hub had failed and was replaced.", quote: "Meter found working but its communications hub had failed. Hub replaced.", event_time: { stated_text: "30 April 2026", iso_datetime: "2026-04-30", precision: "day", basis: "visit report" } },
        { key: "v_long", observation_type: "extracted_document_fact", description: "The engineer notes the hub fault was likely present for a long period.", quote: "Hub fault likely present for a long period." },
        { key: "v_tamper", observation_type: "extracted_document_fact", description: "The engineer found no sign of tampering.", quote: "No sign of tampering." },
      ],
    },
    [CUSTOMER]: {
      summary: "The customer says they reported the fault in October 2024, paid every estimated bill, can't afford £2,340 at once, and cites the 12-month back-billing limit.",
      extraction_issues: [],
      observations: [
        { key: "c_reported", observation_type: "contributor_statement", description: "The customer says they reported in October 2024 that the in-home display had no signal and were told not to worry.", quote: "I reported in October 2024 that my in-home display had no signal, and I was told it was nothing to worry about." },
        { key: "c_paid", observation_type: "contributor_statement", description: "The customer says they paid every estimated bill on time.", quote: "I have paid every estimated bill on time.", requires_review: true, uncertainty_reason: "Payment history not provided." },
        { key: "c_afford", observation_type: "contributor_statement", description: "The customer says they can't afford £2,340 in one payment.", quote: "I can't afford £2,340 in one go." },
        { key: "c_rule", observation_type: "contributor_statement", description: "The customer cites the rule that suppliers can't bill for energy used more than 12 months ago when the error was theirs.", quote: "you can't bill for electricity used more than 12 months ago if it was your fault the bills were wrong.", event_time: { stated_text: "15 May 2026", iso_datetime: "2026-05-15", precision: "day", basis: "email date" } },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "The bill reaches back about 22 months, beyond the 12-month back-billing limit",
        description: "The catch-up bill covers July 2024 to April 2026. Under Ofgem's back-billing rule, a supplier can't usually bill for energy used more than 12 months before the bill when the customer wasn't at fault.",
        finding_type: "question",
        refs: [B("b_period"), B("b_amount"), C("c_rule")],
        relationship_explanation: "Whether the customer was at fault decides if the limit applies; the evidence below bears on that.",
        limitations: "",
        requires_review: true,
      },
      {
        title: "The customer's October 2024 report is in the supplier's own log",
        description: "The customer says they reported the fault in October 2024. The supplier's log records the report on 14 October 2024 and the ticket closed the same day with no action.",
        finding_type: "supporting_relationship",
        refs: [C("c_reported"), R("r_report"), R("r_closed")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
      {
        title: "The fault was in the supplier's equipment, with no tampering",
        description: "The engineer found a failed communications hub, likely for a long period, and no sign of tampering. The meter stopped communicating from 1 July 2024.",
        finding_type: "supporting_relationship",
        refs: [V("v_hub"), V("v_long"), V("v_tamper"), R("r_estimates")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
      {
        title: "Missing: payment history and the split of usage before May 2025",
        description: "The customer's payment history, and how much of the 7,362 kWh difference falls within the last 12 months, are needed to recalculate any bill.",
        finding_type: "missing_information",
        refs: [C("c_paid"), R("r_last"), B("b_estimated")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Last automatic reading, 11,050 kWh.", iso_datetime: "2024-06-28", date_text: "28 June 2024", precision: "day", refs: [R("r_last")], relationship_note: null },
      { description: "Meter stops communicating; estimates begin.", iso_datetime: "2024-07-01", date_text: "1 July 2024", precision: "day", refs: [R("r_estimates")], relationship_note: null },
      { description: "Customer reports 'no signal'; ticket closed with no action.", iso_datetime: "2024-10-14", date_text: "14 October 2024", precision: "day", refs: [R("r_report"), R("r_closed")], relationship_note: null },
      { description: "Engineer replaces the failed hub and reads 18,412 kWh.", iso_datetime: "2026-04-30", date_text: "30 April 2026", precision: "day", refs: [V("v_hub")], relationship_note: null },
      { description: "Catch-up bill of £2,340.18 issued.", iso_datetime: "2026-05-12", date_text: "12 May 2026", precision: "day", refs: [B("b_amount")], relationship_note: null },
      { description: "Customer complains, citing the 12-month limit.", iso_datetime: "2026-05-15", date_text: "15 May 2026", precision: "day", refs: [C("c_rule")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "This analysis organises evidence only and does not decide the complaint."],
  },
};
