// Health and social care: overnight fall in a care home with conflicting times.
// Synthetic. Analysis hand-written (not AI output). No clinical conclusions.
import { ref, type DemoScenario } from "../types";

const VIDEO = "corridor_cctv_night.mp4";
const SENSOR = "sensor_mat_alerts_room14.png";
const REPORT = "incident_report_fall.pdf";
const PLAN = "care_plan_extract_room14.docx";
const HANDOVER = "morning_handover.m4a";
const FAMILY = "family_complaint.txt";

const V = ref(VIDEO), S = ref(SENSOR), R = ref(REPORT), C = ref(PLAN), H = ref(HANDOVER), F = ref(FAMILY);

export const healthSocialCare: DemoScenario = {
  id: "health-social-care",
  industry: "Social housing",
  title: "Overnight fall in Room 14: extra care housing",
  description: "A resident of an extra care housing scheme was found on the floor overnight; the sensor log, handover, incident report and family account give different times.",
  files: [VIDEO, SENSOR, REPORT, PLAN, HANDOVER, FAMILY],
  media: {
    [VIDEO]: {
      kind: "video",
      duration: 50,
      size: [640, 360],
      bg: "0x5a5f66",
      rects: [
        { x: 0, y: 270, w: 640, h: 90, color: "0x3d4147" },
        { x: 420, y: 100, w: 90, h: 170, color: "0x8a7a62", to: 19.5 },
        { x: 420, y: 100, w: 90, h: 170, color: "0x1a1a1a", from: 19.5 },
        { x: 120, y: 100, w: 90, h: 170, color: "0x8a7a62" },
      ],
      labels: [
        { text: "14", x: 452, y: 70, size: 22, color: "white" },
        { text: "13", x: 152, y: 70, size: 22, color: "white" },
        { text: "CORRIDOR B  NIGHT", x: 10, y: 10, size: 16, color: "white", box: true },
      ],
      movers: [
        { w: 40, h: 112, color: "0x6fa8dc", path: [[5, -40, 160], [18, 440, 160]], from: 5, to: 20, head: { w: 26, h: 26, color: "0xc68e5f", dx: 7, dy: -28 } },
        { w: 40, h: 112, color: "0x6fa8dc", path: [[32, -40, 160], [36, 440, 160]], from: 32, to: 37, head: { w: 26, h: 26, color: "0x8d5a3b", dx: 7, dy: -28 } },
      ],
      clock: { startIso: "2026-09-03T03:07:30Z", x: 440, y: 10 },
      creationTime: "2026-09-03T03:07:30Z",
    },
    [SENSOR]: {
      kind: "image",
      format: "png",
      size: [900, 400],
      bg: "0xffffff",
      rects: [{ x: 0, y: 0, w: 900, h: 70, color: "0x2d5f5a" }],
      labels: [
        { text: "SENSOR MAT ALERTS - ROOM 14", x: 30, y: 22, size: 28, color: "white" },
        { text: "03/09/2026 01:58   ALERT          Bedside mat", x: 30, y: 120, size: 24, color: "0x111111" },
        { text: "03/09/2026 01:59   ALERT          Bedside mat", x: 30, y: 180, size: 24, color: "0x111111" },
        { text: "03/09/2026 03:08   ACKNOWLEDGED   Staff ID 207", x: 30, y: 240, size: 24, color: "0x111111" },
      ],
    },
    [REPORT]: {
      kind: "pdf",
      pages: [
        [
          "# Incident report - Fall (synthetic)",
          "Service: Maple House Care Home (synthetic)",
          "Resident: Room 14 (name withheld)",
          "Date of incident: 3 September 2026",
          "Time found: 03:10, during the 03:00 two-hourly check",
          "Found on the floor beside the bed. Bed rails were down.",
          "Observations taken: no visible injury at the time.",
          "Next of kin informed: 09:05 by telephone.",
        ],
        ["# Reported by", "Night carer, Staff ID 207", "Manager review: pending"],
      ],
    },
    [PLAN]: {
      kind: "docx",
      title: "Care plan extract - Room 14 (synthetic)",
      paragraphs: [
        "Falls risk: HIGH (assessed 20/08/2026).",
        "Night checks: hourly between 22:00 and 07:00.",
        "Bed rails: to be raised at night with the resident's consent.",
        "Sensor mat: in place at the bedside; staff must respond to alerts immediately.",
      ],
    },
    [HANDOVER]: {
      kind: "audio",
      segments: [
        {
          voice: "Samantha",
          text: "Handover for the morning shift. Room fourteen had a fall at around two in the morning. She was found on the floor next to the bed. We checked her over and there was no visible injury. Family have not been told yet.",
        },
      ],
      creationTime: "2026-09-03T07:05:00Z",
    },
    [FAMILY]: {
      kind: "txt",
      text: `Complaint from the resident's daughter (synthetic)

When the home phoned me at around 9am on 3 September 2026, I was told my mother had fallen at about 4am.

When I visited that afternoon she had a large bruise on her left arm. I was told she was checked every hour at night, so I do not understand how she could have been on the floor for long.

I would like to know exactly when she fell and why I was not called straight away.
`,
    },
  },
  items: {
    [VIDEO]: {
      summary: "A 50-second silent night-time corridor recording. A carer walks to door 14 and enters at about 03:07:50 by the camera clock; a second carer arrives quickly about 15 seconds later.",
      extraction_issues: ["The recording has no audio.", "Only 50 seconds were provided; earlier footage is not available."],
      observations: [
        {
          key: "v_clock",
          observation_type: "direct_observation",
          description: "The overlay reads 'CORRIDOR B NIGHT' with a clock starting at 2026-09-03 03:07:30.",
          start_time_seconds: 0,
          end_time_seconds: 1,
          frame_window: [0, 3],
          event_time: { stated_text: "2026-09-03 03:07:30 (camera clock)", iso_datetime: "2026-09-03T03:07:30", precision: "exact", basis: "camera overlay (not verified)" },
        },
        { key: "v_carer1", observation_type: "direct_observation", description: "A person in a light-blue uniform walks along the corridor to door 14.", start_time_seconds: 5, end_time_seconds: 18, frame_window: [5, 18] },
        { key: "v_enter", observation_type: "direct_observation", description: "Door 14 appears open and the person is no longer visible in the corridor (camera clock about 03:07:50).", start_time_seconds: 18, end_time_seconds: 21, frame_window: [18, 22], requires_review: true, uncertainty_reason: "Entry into the room happens between sampled frames." },
        { key: "v_carer2", observation_type: "direct_observation", description: "A second person in a light-blue uniform moves quickly along the corridor to door 14.", start_time_seconds: 32, end_time_seconds: 36, frame_window: [32, 37] },
      ],
    },
    [SENSOR]: {
      summary: "The Room 14 sensor mat log: alerts at 01:58 and 01:59 on 03/09/2026, acknowledged at 03:08 by Staff ID 207.",
      extraction_issues: [],
      observations: [
        {
          key: "s_alert",
          observation_type: "extracted_document_fact",
          description: "The bedside sensor mat alerted at 01:58 and again at 01:59 on 3 September 2026.",
          quote: "03/09/2026 01:58 ALERT Bedside mat",
          image_region: { x: 25, y: 290, width: 660, height: 90 },
          event_time: { stated_text: "03/09/2026 01:58", iso_datetime: "2026-09-03T01:58", precision: "minute", basis: "sensor system log" },
        },
        {
          key: "s_ack",
          observation_type: "extracted_document_fact",
          description: "The alert was acknowledged at 03:08 by Staff ID 207.",
          quote: "03/09/2026 03:08 ACKNOWLEDGED Staff ID 207",
          image_region: { x: 25, y: 590, width: 700, height: 90 },
          event_time: { stated_text: "03/09/2026 03:08", iso_datetime: "2026-09-03T03:08", precision: "minute", basis: "sensor system log" },
        },
      ],
    },
    [REPORT]: {
      summary: "The incident report: resident found on the floor at 03:10 on 3 September 2026 during the 03:00 two-hourly check, bed rails down, no visible injury, next of kin informed at 09:05.",
      extraction_issues: ["Manager review is pending."],
      observations: [
        { key: "r_found", observation_type: "extracted_document_fact", description: "The report records the resident was found at 03:10 during the 03:00 two-hourly check.", quote: "Time found: 03:10, during the 03:00 two-hourly check", page_number: 1, event_time: { stated_text: "3 September 2026, 03:10", iso_datetime: "2026-09-03T03:10", precision: "minute", basis: "incident report" } },
        { key: "r_rails", observation_type: "extracted_document_fact", description: "The resident was found beside the bed and the bed rails were down.", quote: "Found on the floor beside the bed. Bed rails were down.", page_number: 1 },
        { key: "r_injury", observation_type: "extracted_document_fact", description: "No visible injury was recorded at the time.", quote: "no visible injury at the time", page_number: 1 },
        { key: "r_nok", observation_type: "extracted_document_fact", description: "Next of kin were informed at 09:05 by telephone.", quote: "Next of kin informed: 09:05 by telephone.", page_number: 1, event_time: { stated_text: "09:05", iso_datetime: "2026-09-03T09:05", precision: "minute", basis: "incident report" } },
        { key: "r_staff", observation_type: "extracted_document_fact", description: "The report was made by the night carer, Staff ID 207.", quote: "Night carer, Staff ID 207", page_number: 2 },
      ],
    },
    [PLAN]: {
      summary: "A care plan extract for Room 14: high falls risk, hourly night checks, bed rails raised at night with consent, and a sensor mat requiring immediate response.",
      extraction_issues: [],
      observations: [
        { key: "c_risk", observation_type: "extracted_document_fact", description: "The resident's falls risk is assessed as high (20/08/2026).", quote: "Falls risk: HIGH (assessed 20/08/2026).", event_time: { stated_text: "20/08/2026", iso_datetime: "2026-08-20", precision: "day", basis: "care plan" } },
        { key: "c_hourly", observation_type: "extracted_document_fact", description: "Night checks are to be hourly between 22:00 and 07:00.", quote: "Night checks: hourly between 22:00 and 07:00." },
        { key: "c_rails", observation_type: "extracted_document_fact", description: "Bed rails are to be raised at night with the resident's consent.", quote: "Bed rails: to be raised at night with the resident's consent." },
        { key: "c_mat", observation_type: "extracted_document_fact", description: "Staff must respond to sensor mat alerts immediately.", quote: "staff must respond to alerts immediately" },
      ],
    },
    [HANDOVER]: {
      summary: "A morning handover recording: Room 14 had a fall at around two in the morning, the resident was found next to the bed with no visible injury, and the family had not yet been told.",
      extraction_issues: ["The speaker is not named."],
      observations: [
        { key: "h_time", observation_type: "contributor_statement", description: "The handover says Room 14 had a fall at around two in the morning.", quote: "had a fall at around 2 in the morning", speaker_label: "Night staff member (not named)", event_time: { stated_text: "around two in the morning", iso_datetime: null, precision: "approximate", basis: "stated at handover" } },
        { key: "h_found", observation_type: "contributor_statement", description: "The resident was found on the floor next to the bed.", quote: "She was found on the floor next to the bed", speaker_label: "Night staff member (not named)" },
        { key: "h_injury", observation_type: "contributor_statement", description: "The handover reports no visible injury.", quote: "there was no visible injury", speaker_label: "Night staff member (not named)" },
        { key: "h_family", observation_type: "contributor_statement", description: "The family had not been told at the time of handover.", quote: "Family have not been told yet", speaker_label: "Night staff member (not named)" },
      ],
    },
    [FAMILY]: {
      summary: "A complaint from the resident's daughter: phoned at around 9am and told the fall was at about 4am, found a large bruise later that day, and asks when the fall happened and why she was not called sooner.",
      extraction_issues: [],
      observations: [
        { key: "f_told", observation_type: "contributor_statement", description: "The daughter says she was phoned around 9am on 3 September 2026 and told the fall was at about 4am.", quote: "I was told my mother had fallen at about 4am", event_time: { stated_text: "3 September 2026, about 4am (as told)", iso_datetime: "2026-09-03T04:00", precision: "approximate", basis: "what the daughter says she was told" } },
        { key: "f_bruise", observation_type: "contributor_statement", description: "The daughter saw a large bruise on her mother's left arm that afternoon.", quote: "she had a large bruise on her left arm" },
        { key: "f_hourly", observation_type: "contributor_statement", description: "The daughter says she was told checks were hourly at night.", quote: "I was told she was checked every hour at night" },
        { key: "f_questions", observation_type: "unresolved_question", description: "The daughter asks exactly when the fall happened and why she was not called straight away.", quote: "I would like to know exactly when she fell" },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Time of the fall: sensor alert 01:58, handover 'around two', report 'found 03:10', family told 'about 4am'",
        description: "The sensor mat alerted at 01:58 and 01:59 and the handover says the fall was around 2am. The incident report records the resident as found at 03:10, and the daughter says she was told about 4am.",
        finding_type: "potential_discrepancy",
        refs: [S("s_alert"), H("h_time"), R("r_found"), F("f_told")],
        relationship_explanation: "The sensor log and handover suggest the fall may have occurred around 01:58, with the resident found about 70 minutes later. The 4am figure may be a miscommunication.",
        limitations: "A sensor alert indicates pressure on the mat, not necessarily a fall. The system clock is not verified.",
        requires_review: true,
      },
      {
        title: "Sensor alerts were acknowledged about 70 minutes later",
        description: "The alerts at 01:58 and 01:59 were acknowledged at 03:08. The care plan requires an immediate response. The CCTV shows a carer entering Room 14 at about 03:07:50 by the camera clock.",
        finding_type: "chronological_relationship",
        refs: [S("s_alert"), S("s_ack"), C("c_mat"), V("v_clock"), V("v_enter")],
        relationship_explanation: "The acknowledgement time closely matches the CCTV entry and the 03:10 'found' time.",
        limitations: "Whether staff were attending to other residents at the time is not recorded.",
        requires_review: true,
      },
      {
        title: "Check frequency: care plan says hourly; report refers to a two-hourly check",
        description: "The care plan requires hourly night checks and the daughter was told checks were hourly. The incident report says the resident was found during the 03:00 two-hourly check.",
        finding_type: "potential_discrepancy",
        refs: [C("c_hourly"), F("f_hourly"), R("r_found")],
        relationship_explanation: "Either the check schedule differed from the plan, or the report's wording is inaccurate.",
        limitations: "Night check records were not provided.",
        requires_review: true,
      },
      {
        title: "Bed rails found down; the care plan says raised at night with consent",
        description: "The incident report records the bed rails were down. The care plan says they are to be raised at night with the resident's consent.",
        finding_type: "potential_discrepancy",
        refs: [R("r_rails"), C("c_rails")],
        relationship_explanation: "Consent may have been declined, or the rails may have been lowered by the resident or staff.",
        limitations: "Consent records were not provided.",
        requires_review: true,
      },
      {
        title: "Injury: none visible at the time; a large bruise reported later that day",
        description: "The report and handover record no visible injury. The daughter reports a large bruise on the left arm that afternoon.",
        finding_type: "chronological_relationship",
        refs: [R("r_injury"), H("h_injury"), F("f_bruise")],
        relationship_explanation: "Bruising can develop over several hours; this does not by itself show the night observations were wrong.",
        limitations: "No clinical assessment is included. This analysis makes no medical determination.",
        requires_review: true,
      },
      {
        title: "Family were informed at 09:05, about seven hours after the first sensor alert",
        description: "The handover says the family had not yet been told; the report records next of kin informed at 09:05; the daughter asks why she was not called straight away.",
        finding_type: "question",
        refs: [H("h_family"), R("r_nok"), F("f_questions"), S("s_alert")],
        relationship_explanation: null,
        limitations: "The home's policy on informing family overnight was not provided.",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Falls risk assessed as high.", iso_datetime: "2026-08-20", date_text: "20/08/2026", precision: "day", refs: [C("c_risk")], relationship_note: null },
      { description: "Sensor mat alerts in Room 14.", iso_datetime: "2026-09-03T01:58", date_text: "01:58 and 01:59", precision: "minute", refs: [S("s_alert"), H("h_time")], relationship_note: "Handover gives 'around two in the morning'." },
      { description: "CCTV (camera clock): carer enters Room 14; second carer follows.", iso_datetime: "2026-09-03T03:07:50", date_text: "about 03:07:50 (camera clock)", precision: "approximate", refs: [V("v_clock"), V("v_enter"), V("v_carer2")], relationship_note: null },
      { description: "Alert acknowledged by Staff ID 207.", iso_datetime: "2026-09-03T03:08", date_text: "03:08", precision: "minute", refs: [S("s_ack")], relationship_note: null },
      { description: "Resident recorded as found on the floor.", iso_datetime: "2026-09-03T03:10", date_text: "03:10", precision: "minute", refs: [R("r_found"), R("r_rails")], relationship_note: null },
      { description: "Time of the fall as the daughter says she was told.", iso_datetime: "2026-09-03T04:00", date_text: "about 4am", precision: "approximate", refs: [F("f_told")], relationship_note: "Later than both the sensor alert and the 'found' time; both accounts are kept." },
      { description: "Next of kin informed by telephone.", iso_datetime: "2026-09-03T09:05", date_text: "09:05", precision: "minute", refs: [R("r_nok")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "No night check records or clinical notes were provided. No medical conclusions are drawn."],
  },
};
