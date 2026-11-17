// Legal services: personal injury claim after a slip in a supermarket aisle.
// Synthetic. Analysis hand-written (not AI output). No conclusions on liability.
import { ref, type DemoScenario } from "../types";

const VIDEO = "store_cctv_aisle7.mp4";
const PHOTO = "photo_aisle7_after.jpg";
const BOOK = "accident_book_entry.pdf";
const CLAIMANT = "claimant_statement.txt";
const LOG = "floor_inspection_log.docx";
const INTERVIEW = "duty_manager_interview.m4a";

const V = ref(VIDEO), P = ref(PHOTO), B = ref(BOOK), C = ref(CLAIMANT), L = ref(LOG), M = ref(INTERVIEW);

export const legalServices: DemoScenario = {
  id: "legal-services",
  industry: "Legal services",
  caseType: "personal_injury",
  title: "Slip in Aisle 7: personal injury claim",
  description: "A customer slipped on spilled liquid; the store says a warning sign was already in place, the claimant says there was none.",
  files: [VIDEO, PHOTO, BOOK, CLAIMANT, LOG, INTERVIEW],
  media: {
    [VIDEO]: {
      kind: "video",
      duration: 60,
      size: [640, 360],
      bg: "0xe9e7e1",
      rects: [
        { x: 0, y: 270, w: 640, h: 90, color: "0xcfcac0" },
        { x: 0, y: 50, w: 150, h: 220, color: "0x7d93a8" },
        { x: 490, y: 50, w: 150, h: 220, color: "0x7d93a8" },
        { x: 0, y: 120, w: 150, h: 6, color: "0x55697c" },
        { x: 490, y: 120, w: 150, h: 6, color: "0x55697c" },
        { x: 270, y: 285, w: 100, h: 18, color: "0x9cc7e6" },
        // Cone placed after the fall.
        { x: 245, y: 245, w: 24, h: 40, color: "0xf2c230", from: 46 },
      ],
      labels: [{ text: "STORE CAM 07  AISLE 7", x: 10, y: 10, size: 16, color: "white", box: true }],
      movers: [
        // Customer walks towards the spill.
        { w: 42, h: 116, color: "0x6b3d6e", path: [[10, -40, 165], [22, 280, 165]], from: 10, to: 23, head: { w: 26, h: 26, color: "0xc68e5f", dx: 8, dy: -28 } },
        // Customer on the floor after the fall.
        { w: 120, h: 36, color: "0x6b3d6e", path: [[23, 270, 262]], from: 23, to: 60, head: { w: 26, h: 26, color: "0xc68e5f", dx: 120, dy: 4 } },
        // Staff member arrives.
        { w: 42, h: 116, color: "0x2f7d4f", path: [[39, 660, 165], [43, 400, 165]], from: 39, to: 60, head: { w: 26, h: 26, color: "0x8d5a3b", dx: 8, dy: -28 } },
      ],
      clock: { startIso: "2026-02-11T16:01:40Z", x: 440, y: 10 },
      creationTime: "2026-02-11T16:01:40Z",
    },
    [PHOTO]: {
      kind: "image",
      format: "jpg",
      size: [1000, 750],
      bg: "0xd9d4ca",
      rects: [
        { x: 0, y: 0, w: 220, h: 750, color: "0x7d93a8" },
        { x: 780, y: 0, w: 220, h: 750, color: "0x7d93a8" },
        { x: 380, y: 480, w: 240, h: 60, color: "0x9cc7e6" },
        { x: 470, y: 300, w: 70, h: 160, color: "0xf2c230" },
      ],
      labels: [
        { text: "WET FLOOR", x: 445, y: 260, size: 30, color: "0x111111" },
        { text: "11/02/2026 16:20", x: 740, y: 700, size: 28, color: "0xff8c1a" },
      ],
    },
    [BOOK]: {
      kind: "pdf",
      pages: [
        [
          "# Accident book entry (synthetic)",
          "Store: Northgate (synthetic)",
          "Date: 11 February 2026   Time: 16:05",
          "Person injured: Customer (name withheld)",
          "Location: Aisle 7, near the chilled drinks display",
          "What happened: Customer slipped on spilled liquid on the floor.",
          "Injury: pain in right wrist, first aid given, customer declined ambulance.",
          "Action taken: area cordoned and wet floor sign placed after the incident.",
          "Completed by: Duty manager",
        ],
      ],
    },
    [CLAIMANT]: {
      kind: "txt",
      text: `Statement of the claimant (synthetic)

On 11 February 2026, at about 4pm, I was shopping in aisle 7 of the Northgate store. I slipped on a clear liquid on the floor and fell onto my right side.

There was no warning sign or cone anywhere near the spill. A member of staff only arrived about ten minutes after I fell.

My wrist was later found to be sprained and I could not work for three weeks.
`,
    },
    [LOG]: {
      kind: "docx",
      title: "Floor inspection log - Aisle 7 (synthetic)",
      paragraphs: [
        "11/02/2026 15:00 - Aisle 7 checked - clear - initials AB",
        "11/02/2026 15:30 - Aisle 7 checked - clear - initials AB",
        "11/02/2026 16:00 - check not recorded",
        "11/02/2026 16:30 - Aisle 7 checked - cone in place following incident - initials CD",
        "Policy: aisles to be checked every 30 minutes.",
      ],
    },
    [INTERVIEW]: {
      kind: "audio",
      segments: [
        { voice: "Daniel", text: "Can you tell me about the incident in aisle seven on the eleventh of February?" },
        { voice: "Samantha", text: "Yes. A wet floor sign was already in place before the customer fell. Our staff responded within a minute or two. The floor had been checked shortly before." },
      ],
      creationTime: "2026-03-02T11:00:00Z",
    },
  },
  items: {
    [VIDEO]: {
      summary: "A 60-second silent store CCTV recording of Aisle 7. A light-blue patch is on the floor; a customer walks onto it and ends up on the floor; a staff member arrives about 16 seconds later and a yellow cone appears afterwards.",
      extraction_issues: ["The recording has no audio.", "The nature of the light-blue patch cannot be confirmed from the footage."],
      observations: [
        {
          key: "v_clock",
          observation_type: "direct_observation",
          description: "The overlay reads 'STORE CAM 07 AISLE 7' with a clock starting at 2026-02-11 16:01:40.",
          start_time_seconds: 0,
          end_time_seconds: 1,
          frame_window: [0, 3],
          event_time: { stated_text: "2026-02-11 16:01:40 (camera clock)", iso_datetime: "2026-02-11T16:01:40", precision: "exact", basis: "camera overlay (not verified)" },
        },
        { key: "v_patch", observation_type: "direct_observation", description: "A light-blue patch is visible on the floor in the middle of the aisle from the start of the recording.", start_time_seconds: 0, end_time_seconds: 10, frame_window: [0, 10], requires_review: true, uncertainty_reason: "The patch may be liquid; this cannot be confirmed visually." },
        { key: "v_nocone", observation_type: "direct_observation", description: "No warning sign or cone is visible anywhere in the aisle before the fall.", start_time_seconds: 0, end_time_seconds: 22.5, frame_window: [0, 22.5] },
        { key: "v_walk", observation_type: "direct_observation", description: "A customer in a purple coat walks along the aisle towards the patch.", start_time_seconds: 10, end_time_seconds: 22, frame_window: [10, 22] },
        { key: "v_fall", observation_type: "direct_observation", description: "The customer is no longer upright and is lying on the floor at the patch (camera clock about 16:02:03).", start_time_seconds: 22, end_time_seconds: 25, frame_window: [22, 26], requires_review: true, uncertainty_reason: "The moment of the fall falls between sampled frames." },
        { key: "v_staff", observation_type: "direct_observation", description: "A staff member in a green uniform arrives beside the customer about 16–20 seconds after the fall.", start_time_seconds: 39, end_time_seconds: 43, frame_window: [39, 44] },
        { key: "v_cone", observation_type: "direct_observation", description: "A yellow cone appears next to the patch after the staff member arrives (camera clock about 16:02:26).", start_time_seconds: 46, end_time_seconds: 50, frame_window: [46, 50] },
      ],
    },
    [PHOTO]: {
      summary: "A photograph of the aisle with a yellow 'WET FLOOR' cone beside a wet patch, with a camera date stamp of 11/02/2026 16:20.",
      extraction_issues: [],
      observations: [
        { key: "p_cone", observation_type: "direct_observation", description: "A yellow 'WET FLOOR' cone stands beside a wet patch on the floor.", quote: "WET FLOOR", image_region: { x: 440, y: 340, width: 140, height: 290 } },
        { key: "p_stamp", observation_type: "direct_observation", description: "The camera date stamp reads 11/02/2026 16:20.", quote: "11/02/2026 16:20", image_region: { x: 735, y: 920, width: 260, height: 60 }, event_time: { stated_text: "11/02/2026 16:20", iso_datetime: "2026-02-11T16:20", precision: "minute", basis: "camera date stamp (not verified)" } },
      ],
    },
    [BOOK]: {
      summary: "The store's accident book entry for 11 February 2026 at 16:05: a customer slipped on spilled liquid in Aisle 7; the wet floor sign was placed after the incident.",
      extraction_issues: [],
      observations: [
        { key: "b_time", observation_type: "extracted_document_fact", description: "The entry records the date and time as 11 February 2026, 16:05.", quote: "Date: 11 February 2026 Time: 16:05", page_number: 1, event_time: { stated_text: "11 February 2026 16:05", iso_datetime: "2026-02-11T16:05", precision: "minute", basis: "accident book" } },
        { key: "b_cause", observation_type: "extracted_document_fact", description: "The entry records that the customer slipped on spilled liquid.", quote: "Customer slipped on spilled liquid on the floor.", page_number: 1 },
        { key: "b_injury", observation_type: "extracted_document_fact", description: "The entry records pain in the right wrist and first aid given.", quote: "pain in right wrist, first aid given", page_number: 1 },
        { key: "b_sign", observation_type: "extracted_document_fact", description: "The entry records that the area was cordoned and a wet floor sign placed after the incident.", quote: "area cordoned and wet floor sign placed after the incident", page_number: 1 },
      ],
    },
    [CLAIMANT]: {
      summary: "The claimant's statement: slipped on clear liquid in aisle 7 at about 4pm on 11 February 2026, no warning sign, staff arrived about ten minutes later, wrist sprained.",
      extraction_issues: [],
      observations: [
        { key: "c_time", observation_type: "contributor_statement", description: "The claimant was shopping in aisle 7 at about 4pm on 11 February 2026.", quote: "On 11 February 2026, at about 4pm, I was shopping in aisle 7", event_time: { stated_text: "11 February 2026, at about 4pm", iso_datetime: "2026-02-11T16:00", precision: "approximate", basis: "stated by claimant" } },
        { key: "c_slip", observation_type: "contributor_statement", description: "The claimant says they slipped on a clear liquid and fell onto their right side.", quote: "I slipped on a clear liquid on the floor and fell onto my right side." },
        { key: "c_nosign", observation_type: "contributor_statement", description: "The claimant says there was no warning sign or cone near the spill.", quote: "There was no warning sign or cone anywhere near the spill." },
        { key: "c_tenmin", observation_type: "contributor_statement", description: "The claimant says staff arrived about ten minutes after the fall.", quote: "A member of staff only arrived about ten minutes after I fell.", requires_review: true, uncertainty_reason: "A recollection of elapsed time after an injury." },
        { key: "c_injury", observation_type: "contributor_statement", description: "The claimant says their wrist was sprained and they could not work for three weeks.", quote: "My wrist was later found to be sprained and I could not work for three weeks." },
      ],
    },
    [LOG]: {
      summary: "The Aisle 7 floor inspection log: checks recorded clear at 15:00 and 15:30, the 16:00 check not recorded, and a cone in place at 16:30 following the incident.",
      extraction_issues: [],
      observations: [
        { key: "l_1530", observation_type: "extracted_document_fact", description: "Aisle 7 was recorded as clear at 15:30.", quote: "11/02/2026 15:30 - Aisle 7 checked - clear", event_time: { stated_text: "11/02/2026 15:30", iso_datetime: "2026-02-11T15:30", precision: "minute", basis: "inspection log" } },
        { key: "l_1600", observation_type: "extracted_document_fact", description: "The 16:00 check is recorded as not done.", quote: "11/02/2026 16:00 - check not recorded", event_time: { stated_text: "11/02/2026 16:00", iso_datetime: "2026-02-11T16:00", precision: "minute", basis: "inspection log" } },
        { key: "l_1630", observation_type: "extracted_document_fact", description: "At 16:30 a cone was in place following the incident.", quote: "11/02/2026 16:30 - Aisle 7 checked - cone in place following incident", event_time: { stated_text: "11/02/2026 16:30", iso_datetime: "2026-02-11T16:30", precision: "minute", basis: "inspection log" } },
        { key: "l_policy", observation_type: "extracted_document_fact", description: "Store policy requires checks every 30 minutes.", quote: "Policy: aisles to be checked every 30 minutes." },
      ],
    },
    [INTERVIEW]: {
      summary: "An interview with the duty manager, who says a wet floor sign was already in place, staff responded within a minute or two, and the floor had been checked shortly before.",
      extraction_issues: [],
      observations: [
        { key: "m_q", observation_type: "contributor_statement", description: "The interviewer asks about the incident in aisle seven.", quote: "Can you tell me about the incident", speaker_label: "Interviewer" },
        { key: "m_sign", observation_type: "contributor_statement", description: "The duty manager says a wet floor sign was already in place before the customer fell.", quote: "A wet floor sign was already in place before the customer fell", speaker_label: "Duty manager (as introduced)", requires_review: true, uncertainty_reason: "Account given three weeks after the incident." },
        { key: "m_response", observation_type: "contributor_statement", description: "The duty manager says staff responded within a minute or two.", quote: "Our staff responded within a minute or two", speaker_label: "Duty manager (as introduced)" },
        { key: "m_checked", observation_type: "contributor_statement", description: "The duty manager says the floor had been checked shortly before.", quote: "The floor had been checked shortly before", speaker_label: "Duty manager (as introduced)" },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Was a warning sign in place before the fall? Accounts differ; CCTV shows none until afterwards",
        description: "The duty manager says a wet floor sign was already in place. The claimant says there was none. The CCTV shows no sign or cone in the aisle before the fall, with a cone appearing about 23 seconds after it, and the accident book records the sign as placed after the incident.",
        finding_type: "potential_discrepancy",
        refs: [M("m_sign"), C("c_nosign"), V("v_nocone"), V("v_cone"), B("b_sign")],
        relationship_explanation: "The CCTV and the store's own accident book are consistent with the claimant's account on this point. A sign outside the camera's view cannot be ruled out.",
        limitations: "The camera covers one view of the aisle only.",
        requires_review: true,
      },
      {
        title: "Staff response time: about 16–20 seconds on CCTV, 'ten minutes' per claimant",
        description: "The claimant says staff arrived about ten minutes after the fall; the duty manager says within a minute or two; the CCTV shows a staff member arriving about 16–20 seconds after the fall.",
        finding_type: "potential_discrepancy",
        refs: [C("c_tenmin"), M("m_response"), V("v_fall"), V("v_staff")],
        relationship_explanation: "The footage supports a quick response. The claimant's estimate may reflect the time until further help or first aid arrived.",
        limitations: "The camera clock is unverified, but elapsed time within the recording is reliable.",
        requires_review: true,
      },
      {
        title: "The 16:00 floor check was not recorded",
        description: "The log shows Aisle 7 clear at 15:30 and the 16:00 check not recorded; the fall occurred at about 16:02 by the camera clock. The duty manager says the floor had been checked shortly before.",
        finding_type: "potential_discrepancy",
        refs: [L("l_1530"), L("l_1600"), L("l_policy"), M("m_checked"), V("v_clock"), V("v_fall")],
        relationship_explanation: "'Shortly before' may refer to the 15:30 check, about 30 minutes earlier.",
        limitations: "When the liquid was spilled is unknown.",
        requires_review: true,
      },
      {
        title: "Liquid on the floor is supported by several sources",
        description: "The claimant describes a clear liquid, the accident book records spilled liquid, the CCTV shows a light-blue patch at the spot where the customer falls, and the later photograph shows a wet patch beside a cone.",
        finding_type: "supporting_relationship",
        refs: [C("c_slip"), B("b_cause"), V("v_patch"), V("v_fall"), P("p_cone")],
        relationship_explanation: null,
        limitations: "What the liquid was and how long it had been there are not established.",
        requires_review: true,
      },
      {
        title: "Injury: wrist pain recorded on the day; sprain and time off work claimed",
        description: "The accident book records pain in the right wrist and first aid. The claimant says the wrist was later found to be sprained and they could not work for three weeks.",
        finding_type: "missing_information",
        refs: [B("b_injury"), C("c_injury")],
        relationship_explanation: null,
        limitations: "No medical records or employer evidence of time off were provided.",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Aisle 7 recorded clear.", iso_datetime: "2026-02-11T15:30", date_text: "15:30", precision: "minute", refs: [L("l_1530")], relationship_note: null },
      { description: "Scheduled 16:00 check not recorded.", iso_datetime: "2026-02-11T16:00", date_text: "16:00", precision: "minute", refs: [L("l_1600")], relationship_note: null },
      { description: "CCTV (camera clock): customer falls at the patch; staff arrive and a cone is placed.", iso_datetime: "2026-02-11T16:02", date_text: "about 16:02–16:02:30 (camera clock)", precision: "approximate", refs: [V("v_clock"), V("v_fall"), V("v_staff"), V("v_cone")], relationship_note: "Claimant gives 'about 4pm'." },
      { description: "Accident book entry.", iso_datetime: "2026-02-11T16:05", date_text: "16:05", precision: "minute", refs: [B("b_time")], relationship_note: null },
      { description: "Photograph of the cone beside the wet patch (camera stamp).", iso_datetime: "2026-02-11T16:20", date_text: "16:20", precision: "minute", refs: [P("p_stamp")], relationship_note: null },
      { description: "Log records a cone in place following the incident.", iso_datetime: "2026-02-11T16:30", date_text: "16:30", precision: "minute", refs: [L("l_1630")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "This analysis organises evidence only and does not assess liability."],
  },
};
