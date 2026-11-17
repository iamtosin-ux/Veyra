// Property management: water leak from Unit 12 into Unit 8 and a dispute about when it was reported.
// Synthetic. Analysis hand-written (not AI output).
import { ref, type DemoScenario } from "../types";

const VIDEO = "inspection_unit8_kitchen.mp4";
const PHOTO = "photo_ceiling_stain_unit8.jpg";
const REPORT = "plumber_report_PLM-5531.pdf";
const EMAIL = "tenant_email_unit8.txt";
const VOICEMAIL = "voicemail_unit12_owner.m4a";
const LOG = "maintenance_log_june.docx";

const V = ref(VIDEO), P = ref(PHOTO), R = ref(REPORT), E = ref(EMAIL), O = ref(VOICEMAIL), L = ref(LOG);

export const propertyManagement: DemoScenario = {
  id: "property-management",
  industry: "Social housing",
  caseType: "housing_disrepair",
  title: "Kitchen ceiling leak: housing disrepair",
  description: "Water from the flat above damaged a tenant's kitchen ceiling; the tenant and the repairs log disagree on when it was first reported.",
  files: [VIDEO, PHOTO, REPORT, EMAIL, VOICEMAIL, LOG],
  media: {
    [VIDEO]: {
      kind: "video",
      duration: 40,
      size: [640, 360],
      bg: "0xeeeae2",
      rects: [
        { x: 0, y: 250, w: 640, h: 110, color: "0xd8d2c4" },
        { x: 0, y: 250, w: 640, h: 14, color: "0x9b8f78" },
        { x: 230, y: 60, w: 180, h: 70, color: "0xc4ad83" },
        { x: 255, y: 75, w: 130, h: 45, color: "0xa88a5a" },
        { x: 300, y: 250, w: 60, h: 6, color: "0x7aa6c9" },
      ],
      labels: [{ text: "INSPECTION - UNIT 8 KITCHEN", x: 10, y: 10, size: 16, color: "white", box: true }],
      movers: [
        { w: 6, h: 10, color: "0x4f86b8", path: [[20, 320, 125], [22, 320, 240]], from: 20, to: 22 },
        { w: 6, h: 10, color: "0x4f86b8", path: [[26, 320, 125], [28, 320, 240]], from: 26, to: 28 },
        { w: 6, h: 10, color: "0x4f86b8", path: [[32, 320, 125], [34, 320, 240]], from: 32, to: 34 },
      ],
      clock: { startIso: "2026-06-12T10:05:00Z", x: 440, y: 10 },
      audio: {
        speech: [
          { voice: "Daniel", text: "This is the kitchen ceiling in unit eight. The stain is about forty centimetres across and it is still wet. You can see it dripping onto the worktop.", at: 2 },
        ],
      },
      creationTime: "2026-06-12T10:05:00Z",
    },
    [PHOTO]: {
      kind: "image",
      format: "jpg",
      size: [1000, 750],
      bg: "0xefebe3",
      rects: [
        { x: 330, y: 220, w: 340, h: 200, color: "0xcdb991" },
        { x: 370, y: 250, w: 260, h: 140, color: "0xb39461" },
        { x: 330, y: 470, w: 340, h: 16, color: "0x222222" },
      ],
      labels: [
        { text: "40 cm", x: 465, y: 500, size: 30, color: "0x222222" },
        { text: "10/06/2026 18:42", x: 740, y: 700, size: 28, color: "0xff8c1a" },
      ],
    },
    [REPORT]: {
      kind: "pdf",
      pages: [
        [
          "# Plumbing attendance report (synthetic)",
          "Job: PLM-5531",
          "Attended: 12 June 2026, 11:30",
          "Location: Unit 12 (above Unit 8)",
          "",
          "Finding: failed washing machine inlet hose behind the appliance in Unit 12.",
          "Water had tracked through the floor void into the ceiling of Unit 8.",
          "Moisture readings in the Unit 8 ceiling: 28% (saturated).",
          "In my opinion the leak had been active for several days, possibly over a week.",
        ],
        ["# Works", "Hose replaced and water supply tested. No further leak observed.", "Recommend drying for 14 days before redecoration of Unit 8."],
      ],
    },
    [EMAIL]: {
      kind: "txt",
      text: `From: Tenant, Unit 8 (synthetic)
To: Property manager
Date: 9 June 2026

I first noticed water dripping from the kitchen ceiling on 2 June 2026 and phoned the office the same day. Nobody came.

The stain has been getting bigger every day and the worktop is now damaged. I need to know when this will be fixed and who will pay for the damage.
`,
    },
    [VOICEMAIL]: {
      kind: "audio",
      segments: [
        {
          voice: "Samantha",
          text: "Hello, it's the owner of unit twelve returning your call. I was away from the first of June and only got back on the eleventh. Nothing was leaking when I left. The washing machine was switched off, as far as I know.",
        },
      ],
      creationTime: "2026-06-11T19:20:00Z",
    },
    [LOG]: {
      kind: "docx",
      title: "Maintenance log - June 2026 (synthetic)",
      paragraphs: [
        "09/06/2026 10:12 - Ticket M-1182 opened: Unit 8 reports ceiling leak in kitchen (email).",
        "10/06/2026 - Call to Unit 12 owner, no answer. Voicemail left.",
        "12/06/2026 11:30 - Plumber attended Unit 12 (job PLM-5531). Hose replaced.",
        "No earlier record of a call from Unit 8 in June.",
      ],
    },
  },
  items: {
    [VIDEO]: {
      summary: "A 40-second inspection video of the Unit 8 kitchen ceiling showing a brown stain with water dripping onto the worktop, narrated by the inspector.",
      extraction_issues: ["The inspector is not named in the recording."],
      observations: [
        {
          key: "v_label",
          observation_type: "direct_observation",
          description: "The overlay reads 'INSPECTION - UNIT 8 KITCHEN' with a clock starting at 2026-06-12 10:05:00.",
          start_time_seconds: 0,
          end_time_seconds: 1,
          frame_window: [0, 3],
          event_time: { stated_text: "2026-06-12 10:05:00 (device clock)", iso_datetime: "2026-06-12T10:05:00", precision: "exact", basis: "recording overlay (not verified)" },
        },
        { key: "v_stain", observation_type: "direct_observation", description: "A brown stain is visible on the ceiling above the worktop.", start_time_seconds: 0, end_time_seconds: 20, frame_window: [0, 20] },
        { key: "v_drip", observation_type: "direct_observation", description: "Drops of water fall from the stain onto the worktop, three times in the recording.", start_time_seconds: 20, end_time_seconds: 34, frame_window: [20, 34] },
        {
          key: "v_narration",
          observation_type: "contributor_statement",
          description: "The narrator says the stain is about 40 cm across and still wet.",
          quote: "The stain is about 40 cm across and it is still wet",
          speaker_label: "Inspector (name not stated)",
        },
        {
          key: "v_location",
          observation_type: "contributor_statement",
          description: "The narrator names the location as the kitchen ceiling; the automatic transcript renders the unit as 'Unidate', likely a transcription error for 'unit 8'.",
          quote: "This is the kitchen ceiling in",
          speaker_label: "Inspector (name not stated)",
          requires_review: true,
          uncertainty_reason: "Transcription error on the unit number; check the audio. The overlay reads UNIT 8 KITCHEN.",
        },
      ],
    },
    [PHOTO]: {
      summary: "A photograph of a ceiling stain next to a ruler marked '40 cm', with an orange camera date stamp '10/06/2026 18:42'.",
      extraction_issues: ["The location is not shown in the image; the file name refers to Unit 8."],
      observations: [
        { key: "p_stain", observation_type: "direct_observation", description: "A brown stain on a ceiling, roughly the width of the 40 cm ruler shown below it.", image_region: { x: 330, y: 290, width: 340, height: 270 } },
        { key: "p_ruler", observation_type: "direct_observation", description: "A ruler labelled '40 cm' is held below the stain.", quote: "40 cm", image_region: { x: 330, y: 620, width: 340, height: 80 } },
        {
          key: "p_stamp",
          observation_type: "direct_observation",
          description: "The camera date stamp reads 10/06/2026 18:42.",
          quote: "10/06/2026 18:42",
          image_region: { x: 735, y: 920, width: 260, height: 60 },
          event_time: { stated_text: "10/06/2026 18:42", iso_datetime: "2026-06-10T18:42", precision: "minute", basis: "camera date stamp (not verified)" },
          requires_review: true,
          uncertainty_reason: "Camera date stamps can be set incorrectly.",
        },
      ],
    },
    [REPORT]: {
      summary: "A plumber's report: attended Unit 12 on 12 June 2026, found a failed washing machine inlet hose, estimated the leak had been active for several days, and replaced the hose.",
      extraction_issues: [],
      observations: [
        { key: "r_attended", observation_type: "extracted_document_fact", description: "The plumber attended on 12 June 2026 at 11:30.", quote: "Attended: 12 June 2026, 11:30", page_number: 1, event_time: { stated_text: "12 June 2026, 11:30", iso_datetime: "2026-06-12T11:30", precision: "minute", basis: "plumber report" } },
        { key: "r_cause", observation_type: "extracted_document_fact", description: "The plumber found a failed washing machine inlet hose in Unit 12.", quote: "failed washing machine inlet hose behind the appliance in Unit 12", page_number: 1 },
        { key: "r_path", observation_type: "extracted_document_fact", description: "Water had tracked through the floor void into the Unit 8 ceiling.", quote: "Water had tracked through the floor void into the ceiling of Unit 8.", page_number: 1 },
        { key: "r_moisture", observation_type: "extracted_document_fact", description: "Moisture in the Unit 8 ceiling measured 28% (saturated).", quote: "Moisture readings in the Unit 8 ceiling: 28% (saturated).", page_number: 1 },
        {
          key: "r_duration",
          observation_type: "contributor_statement",
          description: "The plumber's opinion is that the leak had been active for several days, possibly over a week.",
          quote: "the leak had been active for several days, possibly over a week",
          page_number: 1,
          requires_review: true,
          uncertainty_reason: "An estimate, not a measured start date.",
        },
        { key: "r_fixed", observation_type: "extracted_document_fact", description: "The hose was replaced and no further leak was observed.", quote: "Hose replaced and water supply tested. No further leak observed.", page_number: 2 },
      ],
    },
    [EMAIL]: {
      summary: "The Unit 8 tenant's email of 9 June 2026: first noticed dripping on 2 June, phoned the office that day, and the worktop is now damaged.",
      extraction_issues: [],
      observations: [
        { key: "e_date", observation_type: "extracted_document_fact", description: "The email is dated 9 June 2026.", quote: "Date: 9 June 2026", event_time: { stated_text: "9 June 2026", iso_datetime: "2026-06-09", precision: "day", basis: "email date" } },
        {
          key: "e_noticed",
          observation_type: "contributor_statement",
          description: "The tenant says they first noticed dripping on 2 June 2026 and phoned the office the same day.",
          quote: "I first noticed water dripping from the kitchen ceiling on 2 June 2026 and phoned the office the same day.",
          event_time: { stated_text: "2 June 2026", iso_datetime: "2026-06-02", precision: "day", basis: "stated by tenant" },
          requires_review: true,
          uncertainty_reason: "The phone call is not independently recorded.",
        },
        { key: "e_damage", observation_type: "contributor_statement", description: "The tenant says the stain has grown daily and the worktop is damaged.", quote: "the worktop is now damaged" },
      ],
    },
    [VOICEMAIL]: {
      summary: "The Unit 12 owner's voicemail: away from 1 June until 11 June, nothing was leaking when they left, and the washing machine was switched off 'as far as I know'.",
      extraction_issues: ["The year is not stated."],
      observations: [
        { key: "o_away", observation_type: "contributor_statement", description: "The owner says they were away from the first of June and returned on the eleventh.", quote: "I was away from the 1st of June", speaker_label: "Unit 12 owner (as stated)", event_time: { stated_text: "from the first of June until the eleventh", iso_datetime: null, precision: "day", basis: "stated by owner; year not stated" } },
        { key: "o_noleak", observation_type: "contributor_statement", description: "The owner says nothing was leaking when they left.", quote: "Nothing was leaking when I left", speaker_label: "Unit 12 owner (as stated)" },
        { key: "o_off", observation_type: "contributor_statement", description: "The owner believes the washing machine was switched off.", quote: "The washing machine was switched off, as far as I know", speaker_label: "Unit 12 owner (as stated)", requires_review: true, uncertainty_reason: "The owner qualifies this ('as far as I know')." },
      ],
    },
    [LOG]: {
      summary: "The June maintenance log: first ticket for the Unit 8 leak opened on 9 June 2026 from an email, with no earlier record of a call.",
      extraction_issues: [],
      observations: [
        { key: "l_ticket", observation_type: "extracted_document_fact", description: "Ticket M-1182 was opened on 9 June 2026 at 10:12 after an email from Unit 8.", quote: "09/06/2026 10:12 - Ticket M-1182 opened: Unit 8 reports ceiling leak in kitchen (email).", event_time: { stated_text: "09/06/2026 10:12", iso_datetime: "2026-06-09T10:12", precision: "minute", basis: "maintenance log" } },
        { key: "l_call", observation_type: "extracted_document_fact", description: "The office called the Unit 12 owner on 10 June and left a voicemail.", quote: "10/06/2026 - Call to Unit 12 owner, no answer. Voicemail left.", event_time: { stated_text: "10/06/2026", iso_datetime: "2026-06-10", precision: "day", basis: "maintenance log" } },
        { key: "l_noearlier", observation_type: "extracted_document_fact", description: "The log records no earlier call from Unit 8 in June.", quote: "No earlier record of a call from Unit 8 in June." },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "When was the leak first reported: 2 June (tenant) or 9 June (maintenance log)?",
        description: "The tenant says they phoned the office on 2 June 2026. The maintenance log's first ticket is from an email on 9 June 2026 and states there is no earlier record of a call from Unit 8.",
        finding_type: "potential_discrepancy",
        refs: [E("e_noticed"), L("l_ticket"), L("l_noearlier")],
        relationship_explanation: "A call may have been made but not logged, or the tenant may be mistaken about the date. The plumber's estimate that the leak had run for over a week is consistent with it starting around early June.",
        limitations: "No telephone records were provided.",
        requires_review: true,
      },
      {
        title: "Source of the leak: a failed washing machine hose in Unit 12",
        description: "The plumber found a failed inlet hose in Unit 12 and water tracking into the Unit 8 ceiling. The inspection video and photograph show a wet stain on that ceiling, with water dripping onto the worktop.",
        finding_type: "supporting_relationship",
        refs: [R("r_cause"), R("r_path"), R("r_moisture"), V("v_stain"), V("v_drip"), P("p_stain")],
        relationship_explanation: "The physical evidence in Unit 8 is consistent with the source identified in Unit 12.",
        limitations: "The photograph does not show its location.",
        requires_review: true,
      },
      {
        title: "The leak's duration is consistent with it starting while the Unit 12 owner was away",
        description: "The owner says they were away from 1 June to 11 June and nothing was leaking when they left. The tenant noticed dripping on 2 June, and the plumber estimated the leak had been active for several days, possibly over a week.",
        finding_type: "chronological_relationship",
        refs: [O("o_away"), O("o_noleak"), E("e_noticed"), R("r_duration")],
        relationship_explanation: "These accounts fit together if the hose failed shortly after the owner left.",
        limitations: "The owner's dates are not evidenced, and the plumber's duration is an estimate.",
        requires_review: true,
      },
      {
        title: "Was the water supply to the washing machine left on?",
        description: "The owner believes the machine was switched off 'as far as I know'; the plumber found a failed inlet hose. Whether the supply valve was open is not recorded.",
        finding_type: "question",
        refs: [O("o_off"), R("r_cause")],
        relationship_explanation: null,
        limitations: "This is relevant to responsibility, which is for the reviewer to assess.",
        requires_review: true,
      },
      {
        title: "Damage to the Unit 8 worktop",
        description: "The tenant reports the worktop is damaged; the inspection video shows water dripping onto it. The plumber recommends 14 days' drying before redecoration.",
        finding_type: "observation",
        refs: [E("e_damage"), V("v_drip"), R("r_fixed")],
        relationship_explanation: null,
        limitations: "The extent of the worktop damage has not been assessed.",
        requires_review: true,
      },
      {
        title: "Missing: phone records for 2 June and the inspector's identity",
        description: "The tenant's reported call on 2 June is not evidenced, and the inspector in the video is not named.",
        finding_type: "missing_information",
        refs: [E("e_noticed"), V("v_narration")],
        relationship_explanation: null,
        limitations: "Office phone logs may resolve the reporting-date discrepancy.",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "The Unit 12 owner says they left, with nothing leaking.", iso_datetime: null, date_text: "1 June (year not stated)", precision: "day", refs: [O("o_away"), O("o_noleak")], relationship_note: null },
      { description: "The tenant says dripping started and they phoned the office.", iso_datetime: "2026-06-02", date_text: "2 June 2026", precision: "day", refs: [E("e_noticed")], relationship_note: "Not reflected in the maintenance log." },
      { description: "Ticket M-1182 opened from the tenant's email.", iso_datetime: "2026-06-09T10:12", date_text: "09/06/2026 10:12", precision: "minute", refs: [L("l_ticket"), E("e_date")], relationship_note: null },
      { description: "Office calls the Unit 12 owner; no answer.", iso_datetime: "2026-06-10", date_text: "10/06/2026", precision: "day", refs: [L("l_call")], relationship_note: null },
      { description: "Photograph of the stain (camera date stamp).", iso_datetime: "2026-06-10T18:42", date_text: "10/06/2026 18:42", precision: "minute", refs: [P("p_stamp")], relationship_note: "Camera clock not verified." },
      { description: "Inspection video of the Unit 8 kitchen ceiling.", iso_datetime: "2026-06-12T10:05", date_text: "12 June 2026, 10:05", precision: "minute", refs: [V("v_label"), V("v_drip")], relationship_note: null },
      { description: "Plumber attends Unit 12 and replaces the failed hose.", iso_datetime: "2026-06-12T11:30", date_text: "12 June 2026, 11:30", precision: "minute", refs: [R("r_attended"), R("r_fixed")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "No telephone records or photographs of Unit 12 were provided."],
  },
};
