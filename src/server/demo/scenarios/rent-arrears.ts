// Social housing: rent arrears before possession, with a Universal Credit gap.
// Synthetic. Analysis hand-written (not AI output). No conclusions on possession.
import { ref, type DemoScenario } from "../types";

const ACCOUNT = "rent_account_statement.pdf";
const UC = "universal_credit_journal.txt";
const CONTACT = "housing_officer_contact_log.docx";
const TENANT = "tenant_email.txt";

const R = ref(ACCOUNT), U = ref(UC), H = ref(CONTACT), T = ref(TENANT);

export const rentArrears: DemoScenario = {
  id: "rent-arrears",
  industry: "Social housing",
  title: "Linden House flat 6: rent arrears and a Universal Credit gap",
  description: "A tenant's arrears reached £1,842 after a change to Universal Credit; the landlord is considering a notice, and the tenant says they asked for help months ago.",
  files: [ACCOUNT, UC, CONTACT, TENANT],
  media: {
    [ACCOUNT]: {
      kind: "pdf",
      pages: [
        [
          "# Rent account, Linden House flat 6 (synthetic)",
          "Weekly rent: £118.50",
          "1 Dec 2025  Balance £0.00",
          "5 Jan 2026  Housing Benefit ends  Balance £237.00 in arrears",
          "2 Feb 2026  No payment received  Balance £711.00 in arrears",
          "2 Mar 2026  No payment received  Balance £1,185.00 in arrears",
          "16 Mar 2026  Universal Credit housing costs paid direct £410.00",
          "30 Apr 2026  Balance £1,842.00 in arrears",
        ],
      ],
    },
    [UC]: {
      kind: "txt",
      text: `Universal Credit journal extract, shared by the tenant (synthetic)

28 Dec 2025  Claim made. First payment expected 2 February 2026.
2 Feb 2026  Payment made. Housing element: £0. Reason: rent verification not received from landlord.
3 Mar 2026  Rent verification received from landlord. Housing element added.
16 Mar 2026  Managed payment to landlord set up.
`,
    },
    [CONTACT]: {
      kind: "docx",
      title: "Housing officer contact log (synthetic)",
      paragraphs: [
        "12 Jan 2026  Arrears letter 1 sent.",
        "9 Feb 2026  Arrears letter 2 sent. No contact from tenant.",
        "26 Feb 2026  Rent verification request from DWP received. Passed to income team.",
        "3 Mar 2026  Rent verification returned to DWP.",
        "20 Apr 2026  Home visit. Tenant not in. Card left.",
        "28 Apr 2026  Case referred for a Notice of Seeking Possession.",
      ],
    },
    [TENANT]: {
      kind: "txt",
      text: `From: Tenant, Linden House flat 6 (synthetic)
Date: 2 May 2026

I phoned the housing office in January to say I had moved onto Universal Credit and asked for help. I was told someone would call me back but nobody did.

My Universal Credit didn't include my rent until March because the landlord hadn't confirmed it.

I can pay an extra £20 a week towards the arrears. I have two children and I am scared of losing our home.
`,
    },
  },
  items: {
    [ACCOUNT]: {
      summary: "The rent account shows arrears building from January 2026 after Housing Benefit ended, a direct Universal Credit payment in March, and £1,842 owed at 30 April.",
      extraction_issues: [],
      observations: [
        { key: "r_hb", observation_type: "extracted_document_fact", description: "Housing Benefit ended on 5 January 2026, leaving £237 in arrears.", quote: "5 Jan 2026 Housing Benefit ends Balance £237.00 in arrears", page_number: 1, event_time: { stated_text: "5 Jan 2026", iso_datetime: "2026-01-05", precision: "day", basis: "rent account" } },
        { key: "r_mar", observation_type: "extracted_document_fact", description: "Arrears reached £1,185 on 2 March 2026 with no payments received.", quote: "2 Mar 2026 No payment received Balance £1,185.00 in arrears", page_number: 1 },
        { key: "r_uc", observation_type: "extracted_document_fact", description: "Universal Credit housing costs of £410 were paid direct on 16 March 2026.", quote: "16 Mar 2026 Universal Credit housing costs paid direct £410.00", page_number: 1, event_time: { stated_text: "16 Mar 2026", iso_datetime: "2026-03-16", precision: "day", basis: "rent account" } },
        { key: "r_apr", observation_type: "extracted_document_fact", description: "Arrears stood at £1,842 on 30 April 2026.", quote: "30 Apr 2026 Balance £1,842.00 in arrears", page_number: 1 },
      ],
    },
    [UC]: {
      summary: "The tenant's Universal Credit journal: claim made in December, the February payment had no housing element because rent verification hadn't come from the landlord, added after verification on 3 March.",
      extraction_issues: ["Shared by the tenant as a copy; not obtained from DWP."],
      observations: [
        { key: "u_claim", observation_type: "extracted_document_fact", description: "The Universal Credit claim was made on 28 December 2025.", quote: "28 Dec 2025 Claim made.", event_time: { stated_text: "28 Dec 2025", iso_datetime: "2025-12-28", precision: "day", basis: "UC journal" } },
        { key: "u_zero", observation_type: "extracted_document_fact", description: "The February payment had no housing element because rent verification hadn't been received from the landlord.", quote: "Housing element: £0. Reason: rent verification not received from landlord." },
        { key: "u_verified", observation_type: "extracted_document_fact", description: "Rent verification from the landlord was received on 3 March 2026.", quote: "3 Mar 2026 Rent verification received from landlord.", event_time: { stated_text: "3 Mar 2026", iso_datetime: "2026-03-03", precision: "day", basis: "UC journal" } },
      ],
    },
    [CONTACT]: {
      summary: "The housing officer's log: two arrears letters, a DWP verification request received 26 February and returned 3 March, a missed home visit, and referral for a notice on 28 April.",
      extraction_issues: [],
      observations: [
        { key: "h_letters", observation_type: "extracted_document_fact", description: "Arrears letters were sent on 12 January and 9 February 2026, the second noting no contact from the tenant.", quote: "9 Feb 2026 Arrears letter 2 sent. No contact from tenant." },
        { key: "h_request", observation_type: "extracted_document_fact", description: "The DWP rent verification request was received on 26 February 2026 and passed to the income team.", quote: "26 Feb 2026 Rent verification request from DWP received.", event_time: { stated_text: "26 Feb 2026", iso_datetime: "2026-02-26", precision: "day", basis: "contact log" } },
        { key: "h_returned", observation_type: "extracted_document_fact", description: "Rent verification was returned to DWP on 3 March 2026.", quote: "3 Mar 2026 Rent verification returned to DWP." },
        { key: "h_visit", observation_type: "extracted_document_fact", description: "A home visit on 20 April 2026 found the tenant out and a card was left.", quote: "20 Apr 2026 Home visit. Tenant not in. Card left." },
        { key: "h_nosp", observation_type: "extracted_document_fact", description: "The case was referred for a Notice of Seeking Possession on 28 April 2026.", quote: "28 Apr 2026 Case referred for a Notice of Seeking Possession.", event_time: { stated_text: "28 Apr 2026", iso_datetime: "2026-04-28", precision: "day", basis: "contact log" } },
      ],
    },
    [TENANT]: {
      summary: "The tenant says they phoned in January for help and got no call back, that rent was missing from Universal Credit until March, offers £20 a week, and has two children.",
      extraction_issues: [],
      observations: [
        { key: "t_phoned", observation_type: "contributor_statement", description: "The tenant says they phoned the housing office in January about moving onto Universal Credit and asked for help.", quote: "I phoned the housing office in January to say I had moved onto Universal Credit and asked for help.", event_time: { stated_text: "January 2026", iso_datetime: "2026-01", precision: "month", basis: "stated by tenant" }, requires_review: true, uncertainty_reason: "No call appears in the contact log." },
        { key: "t_nocall", observation_type: "contributor_statement", description: "The tenant says nobody called back.", quote: "I was told someone would call me back but nobody did." },
        { key: "t_offer", observation_type: "contributor_statement", description: "The tenant offers to pay an extra £20 a week towards the arrears.", quote: "I can pay an extra £20 a week towards the arrears." },
        { key: "t_family", observation_type: "contributor_statement", description: "The tenant says they have two children and are scared of losing their home.", quote: "I have two children and I am scared of losing our home." },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Did the tenant contact the office in January? The log records no contact",
        description: "The tenant says they phoned in January and were promised a call back. The contact log records two letters and, on 9 February, 'no contact from tenant'.",
        finding_type: "potential_discrepancy",
        refs: [T("t_phoned"), T("t_nocall"), H("h_letters")],
        relationship_explanation: "Telephony records could show whether a January call was received.",
        limitations: "",
        requires_review: true,
      },
      {
        title: "Much of the arrears built up while rent verification was outstanding",
        description: "The February Universal Credit payment had no housing element because the landlord's verification hadn't arrived. The landlord received the request on 26 February and returned it on 3 March. By then arrears were £1,185.",
        finding_type: "chronological_relationship",
        refs: [U("u_zero"), H("h_request"), H("h_returned"), U("u_verified"), R("r_mar")],
        relationship_explanation: "Part of the arrears may come from the benefit delay rather than non-payment.",
        limitations: "When DWP first asked the landlord for verification is not shown.",
        requires_review: true,
      },
      {
        title: "Before a notice: the pre-action steps on record are limited",
        description: "The case was referred for a Notice of Seeking Possession after two letters and one missed visit. The tenant has offered £20 a week and has two children.",
        finding_type: "question",
        refs: [H("h_nosp"), H("h_visit"), T("t_offer"), T("t_family")],
        relationship_explanation: "The Pre-Action Protocol for Possession Claims by Social Landlords expects contact, help with benefits and consideration of a repayment offer first.",
        limitations: "",
        requires_review: true,
      },
      {
        title: "Missing: call records, the DWP request date and an affordability check",
        description: "Telephony records for January, DWP's first request date, and an income and expenditure assessment for the £20 offer are not in the case.",
        finding_type: "missing_information",
        refs: [T("t_phoned"), U("u_zero"), T("t_offer")],
        relationship_explanation: null,
        limitations: "",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Universal Credit claim made.", iso_datetime: "2025-12-28", date_text: "28 December 2025", precision: "day", refs: [U("u_claim")], relationship_note: null },
      { description: "Housing Benefit ends; arrears begin.", iso_datetime: "2026-01-05", date_text: "5 January 2026", precision: "day", refs: [R("r_hb")], relationship_note: null },
      { description: "Tenant says they phoned for help.", iso_datetime: "2026-01", date_text: "January 2026", precision: "month", refs: [T("t_phoned")], relationship_note: "Not in the contact log." },
      { description: "UC paid without a housing element.", iso_datetime: "2026-02-02", date_text: "2 February 2026", precision: "day", refs: [U("u_zero")], relationship_note: null },
      { description: "DWP verification request received by the landlord.", iso_datetime: "2026-02-26", date_text: "26 February 2026", precision: "day", refs: [H("h_request")], relationship_note: null },
      { description: "Verification returned; arrears £1,185.", iso_datetime: "2026-03-03", date_text: "3 March 2026", precision: "day", refs: [H("h_returned"), U("u_verified"), R("r_mar")], relationship_note: null },
      { description: "First direct UC housing payment.", iso_datetime: "2026-03-16", date_text: "16 March 2026", precision: "day", refs: [R("r_uc")], relationship_note: null },
      { description: "Referred for a Notice of Seeking Possession.", iso_datetime: "2026-04-28", date_text: "28 April 2026", precision: "day", refs: [H("h_nosp")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "This analysis organises evidence only and does not decide whether possession is reasonable."],
  },
};
