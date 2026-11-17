// Legal services: a commercial debt claim with a defence of late delivery.
// Synthetic. Analysis hand-written (not AI output). No conclusions on liability.
import { ref, type DemoScenario } from "../types";

const AGREEMENT = "supply_agreement_2025.pdf";
const LEDGER = "invoice_statement_march.pdf";
const EMAILS = "email_chain_deliveries.txt";
const LETTER = "letter_before_claim.docx";

const A = ref(AGREEMENT), L = ref(LEDGER), E = ref(EMAILS), C = ref(LETTER);

export const commercialContract: DemoScenario = {
  id: "commercial-contract",
  industry: "Legal services",
  title: "Harbourline Logistics v Brightmere Foods: unpaid invoices",
  description: "A haulier claims £48,600 in unpaid invoices; the customer withheld payment, saying deliveries were late and it is owed service credits.",
  files: [AGREEMENT, LEDGER, EMAILS, LETTER],
  media: {
    [AGREEMENT]: {
      kind: "pdf",
      pages: [
        [
          "# Chilled distribution agreement (synthetic)",
          "Between Harbourline Logistics Ltd (Supplier) and Brightmere Foods Ltd (Customer). Dated 1 April 2025.",
          "Clause 4.2  Deliveries are on time if completed within the 2-hour slot booked by the Customer.",
          "Clause 7.1  Invoices are payable within 30 days of the invoice date.",
          "Clause 7.4  The Customer may not withhold or set off any amount unless agreed in writing by the Supplier.",
          "Clause 9.3  Service credits of 2% of the monthly charge apply for each late delivery, claimed in writing within 14 days.",
        ],
      ],
    },
    [LEDGER]: {
      kind: "pdf",
      pages: [
        [
          "# Statement of account: Brightmere Foods (synthetic)",
          "INV-2201  issued 31 Jan 2026  £16,200  due 2 Mar 2026  unpaid",
          "INV-2245  issued 28 Feb 2026  £15,900  due 30 Mar 2026  unpaid",
          "INV-2290  issued 31 Mar 2026  £16,500  due 30 Apr 2026  unpaid",
          "Total outstanding: £48,600",
        ],
      ],
    },
    [EMAILS]: {
      kind: "txt",
      text: `From: Brightmere Foods, operations (synthetic)
To: Harbourline Logistics, accounts
Date: 9 March 2026

We are withholding payment of INV-2201 because 11 deliveries in January arrived late. We will claim service credits.

---
From: Harbourline Logistics, accounts
To: Brightmere Foods, operations
Date: 10 March 2026

Our tracking shows 3 deliveries outside the booked slot in January, not 11. Withholding is not permitted under clause 7.4. No service credit claim was received within 14 days.

---
From: Brightmere Foods, operations
Date: 24 March 2026

Our goods-in log shows the arrival times. We have attached it.
`,
    },
    [LETTER]: {
      kind: "docx",
      title: "Letter before claim (synthetic)",
      paragraphs: [
        "Date: 6 May 2026. From: solicitors for Harbourline Logistics Ltd. To: Brightmere Foods Ltd.",
        "Our client claims £48,600 for invoices INV-2201, INV-2245 and INV-2290, plus statutory interest.",
        "Clause 7.4 of the agreement does not allow withholding without written agreement, which was not given.",
        "Please respond within 14 days under the Practice Direction on Pre-Action Conduct.",
      ],
    },
  },
  items: {
    [AGREEMENT]: {
      summary: "The 2025 chilled distribution agreement: on-time means within the booked 2-hour slot, invoices are due in 30 days, no withholding without written agreement, and service credits must be claimed within 14 days.",
      extraction_issues: [],
      observations: [
        { key: "a_slot", observation_type: "extracted_document_fact", description: "A delivery is on time if completed within the 2-hour slot booked by the customer.", quote: "Deliveries are on time if completed within the 2-hour slot booked by the Customer.", page_number: 1 },
        { key: "a_terms", observation_type: "extracted_document_fact", description: "Invoices are payable within 30 days of the invoice date.", quote: "Invoices are payable within 30 days of the invoice date.", page_number: 1 },
        { key: "a_setoff", observation_type: "extracted_document_fact", description: "The customer may not withhold or set off any amount without the supplier's written agreement.", quote: "The Customer may not withhold or set off any amount unless agreed in writing by the Supplier.", page_number: 1 },
        { key: "a_credits", observation_type: "extracted_document_fact", description: "Service credits of 2% apply per late delivery if claimed in writing within 14 days.", quote: "Service credits of 2% of the monthly charge apply for each late delivery", page_number: 1 },
      ],
    },
    [LEDGER]: {
      summary: "The supplier's statement shows three unpaid invoices from January to March 2026 totalling £48,600.",
      extraction_issues: [],
      observations: [
        { key: "l_2201", observation_type: "extracted_document_fact", description: "INV-2201 for £16,200 was due on 2 March 2026 and is unpaid.", quote: "INV-2201 issued 31 Jan 2026 £16,200 due 2 Mar 2026 unpaid", page_number: 1, event_time: { stated_text: "due 2 Mar 2026", iso_datetime: "2026-03-02", precision: "day", basis: "statement of account" } },
        { key: "l_2245", observation_type: "extracted_document_fact", description: "INV-2245 for £15,900 was due on 30 March 2026 and is unpaid.", quote: "INV-2245 issued 28 Feb 2026 £15,900 due 30 Mar 2026 unpaid", page_number: 1 },
        { key: "l_2290", observation_type: "extracted_document_fact", description: "INV-2290 for £16,500 was due on 30 April 2026 and is unpaid.", quote: "INV-2290 issued 31 Mar 2026 £16,500 due 30 Apr 2026 unpaid", page_number: 1 },
        { key: "l_total", observation_type: "extracted_document_fact", description: "The total outstanding is £48,600.", quote: "Total outstanding: £48,600", page_number: 1 },
      ],
    },
    [EMAILS]: {
      summary: "An email exchange: the customer withheld payment citing 11 late January deliveries; the supplier says its tracking shows 3 and that withholding isn't allowed; the customer later sent a goods-in log.",
      extraction_issues: ["The goods-in log mentioned in the last email was not provided."],
      observations: [
        { key: "e_withhold", observation_type: "contributor_statement", description: "The customer says it is withholding INV-2201 because 11 January deliveries arrived late.", quote: "We are withholding payment of INV-2201 because 11 deliveries in January arrived late.", event_time: { stated_text: "9 March 2026", iso_datetime: "2026-03-09", precision: "day", basis: "email date" } },
        { key: "e_three", observation_type: "contributor_statement", description: "The supplier says its tracking shows 3 deliveries outside the booked slot in January.", quote: "Our tracking shows 3 deliveries outside the booked slot in January, not 11.", event_time: { stated_text: "10 March 2026", iso_datetime: "2026-03-10", precision: "day", basis: "email date" } },
        { key: "e_noclaim", observation_type: "contributor_statement", description: "The supplier says no service credit claim was received within 14 days.", quote: "No service credit claim was received within 14 days." },
        { key: "e_log", observation_type: "contributor_statement", description: "The customer says its goods-in log shows the arrival times and that it is attached.", quote: "Our goods-in log shows the arrival times. We have attached it.", event_time: { stated_text: "24 March 2026", iso_datetime: "2026-03-24", precision: "day", basis: "email date" } },
      ],
    },
    [LETTER]: {
      summary: "The supplier's letter before claim of 6 May 2026 for £48,600 plus interest, relying on the no-withholding clause and asking for a response within 14 days.",
      extraction_issues: [],
      observations: [
        { key: "c_claim", observation_type: "extracted_document_fact", description: "The letter claims £48,600 for three invoices plus statutory interest.", quote: "Our client claims £48,600 for invoices INV-2201, INV-2245 and INV-2290, plus statutory interest.", event_time: { stated_text: "6 May 2026", iso_datetime: "2026-05-06", precision: "day", basis: "letter date" } },
        { key: "c_reply", observation_type: "extracted_document_fact", description: "The letter asks for a response within 14 days under the Practice Direction on Pre-Action Conduct.", quote: "Please respond within 14 days under the Practice Direction on Pre-Action Conduct." },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "How many January deliveries were late: 11 or 3?",
        description: "The customer says 11 deliveries were late; the supplier's tracking shows 3 outside the booked slot. 'On time' is defined by the booked 2-hour slot.",
        finding_type: "potential_discrepancy",
        refs: [E("e_withhold"), E("e_three"), A("a_slot")],
        relationship_explanation: "The two counts may use different measures, such as arrival at the gate versus completion within the slot.",
        limitations: "Neither the tracking data nor the goods-in log was provided.",
        requires_review: true,
      },
      {
        title: "Withholding appears to conflict with clause 7.4",
        description: "The agreement bars withholding or set-off without the supplier's written agreement. The customer withheld INV-2201 and nothing in the papers shows that agreement.",
        finding_type: "supporting_relationship",
        refs: [A("a_setoff"), E("e_withhold"), C("c_claim")],
        relationship_explanation: null,
        limitations: "This organises the evidence only; whether the clause is enforceable is a legal question for the reviewer.",
        requires_review: true,
      },
      {
        title: "No service credit claim within 14 days is shown",
        description: "Service credits must be claimed in writing within 14 days. The supplier says none was received, and the first written mention of credits is the customer's email of 9 March.",
        finding_type: "supporting_relationship",
        refs: [A("a_credits"), E("e_noclaim"), E("e_withhold")],
        relationship_explanation: null,
        limitations: "Earlier correspondence may exist.",
        requires_review: true,
      },
      {
        title: "Missing: the goods-in log and the supplier's tracking data",
        description: "The customer says it attached a goods-in log, but it isn't in the case. The supplier's tracking data for January is also needed to compare the counts.",
        finding_type: "missing_information",
        refs: [E("e_log"), E("e_three")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Agreement signed.", iso_datetime: "2025-04-01", date_text: "1 April 2025", precision: "day", refs: [A("a_terms")], relationship_note: null },
      { description: "INV-2201 falls due.", iso_datetime: "2026-03-02", date_text: "2 March 2026", precision: "day", refs: [L("l_2201")], relationship_note: null },
      { description: "Customer withholds INV-2201 citing 11 late deliveries.", iso_datetime: "2026-03-09", date_text: "9 March 2026", precision: "day", refs: [E("e_withhold")], relationship_note: null },
      { description: "Supplier replies: 3 late deliveries, withholding not permitted.", iso_datetime: "2026-03-10", date_text: "10 March 2026", precision: "day", refs: [E("e_three")], relationship_note: null },
      { description: "Customer says it has sent its goods-in log.", iso_datetime: "2026-03-24", date_text: "24 March 2026", precision: "day", refs: [E("e_log")], relationship_note: "The log is not in the case." },
      { description: "Letter before claim for £48,600.", iso_datetime: "2026-05-06", date_text: "6 May 2026", precision: "day", refs: [C("c_claim")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "This analysis organises evidence only and does not assess liability."],
  },
};
