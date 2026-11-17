// Construction disputes: a lost day on a slab pour, attributed to a late pump and rain.
// Synthetic. Analysis hand-written (not AI output).
import { ref, type DemoScenario } from "../types";

const VIDEO = "site_timelapse_level3.mp4";
const WEATHER = "site_rain_gauge_0714.png";
const DIARY = "site_diary_contractor.pdf";
const DN = "pump_delivery_note_DN-40917.docx";
const EMAIL = "client_rep_email.txt";
const MEETING = "site_meeting_extract.m4a";

const V = ref(VIDEO), W = ref(WEATHER), D = ref(DIARY), N = ref(DN), E = ref(EMAIL), M = ref(MEETING);

export const constructionDispute: DemoScenario = {
  id: "construction-dispute",
  industry: "Legal services",
  caseType: "construction_delay",
  title: "Level 3 slab pour: construction delay claim",
  description: "The contractor claims a day's extension, blaming a late concrete pump and rain; the pump supplier, the client and the site records suggest otherwise.",
  files: [VIDEO, WEATHER, DIARY, DN, EMAIL, MEETING],
  media: {
    [VIDEO]: {
      kind: "video",
      duration: 60,
      size: [640, 360],
      bg: "0xbfd3e3",
      rects: [
        { x: 0, y: 260, w: 640, h: 100, color: "0x8a7f6e" },
        { x: 80, y: 120, w: 300, h: 140, color: "0x9a9a96" },
        { x: 80, y: 115, w: 300, h: 10, color: "0x6c6c68" },
        { x: 90, y: 125, w: 20, h: 135, color: "0x6c6c68" },
        { x: 350, y: 125, w: 20, h: 135, color: "0x6c6c68" },
      ],
      labels: [
        { text: "TIMELAPSE CAM - LEVEL 3", x: 10, y: 10, size: 16, color: "white", box: true },
        { text: "L3 DECK", x: 190, y: 90, size: 18, color: "0x333333" },
      ],
      movers: [
        // Concrete pump arrives and stays.
        { w: 150, h: 60, color: "0xe07b1f", path: [[19, 660, 205], [21, 440, 205]], from: 19, to: 60, head: { w: 110, h: 10, color: "0xb85e10", dx: -60, dy: -30 } },
        // A visitor walks on the deck (client rep).
        { w: 14, h: 34, color: "0xf5f5f5", path: [[30, 120, 82], [35, 300, 82]], from: 30, to: 35 },
        // Two operatives working on the deck from 40 s.
        { w: 14, h: 34, color: "0xf2d21b", path: [[40, 140, 82], [60, 220, 82]], from: 40, to: 60 },
        { w: 14, h: 34, color: "0xf2d21b", path: [[40, 300, 82], [60, 250, 82]], from: 40, to: 60 },
      ],
      clock: { startIso: "2026-07-14T07:00:00Z", x: 470, y: 10, secondsPerSecond: 240 },
      creationTime: "2026-07-14T11:00:00Z",
    },
    [WEATHER]: {
      kind: "image",
      format: "png",
      size: [900, 360],
      bg: "0xffffff",
      rects: [{ x: 0, y: 0, w: 900, h: 70, color: "0x2f5d8a" }],
      labels: [
        { text: "RAINFALL - SITE GAUGE (synthetic)", x: 30, y: 22, size: 28, color: "white" },
        { text: "14/07/2026  06:00-09:00   0.0 mm", x: 30, y: 120, size: 26, color: "0x111111" },
        { text: "14/07/2026  09:00-12:00   0.4 mm", x: 30, y: 185, size: 26, color: "0x111111" },
        { text: "14/07/2026  12:00-15:00   6.2 mm", x: 30, y: 250, size: 26, color: "0x111111" },
      ],
    },
    [DIARY]: {
      kind: "pdf",
      pages: [
        [
          "# Site diary - Main contractor (synthetic)",
          "Date: 14 July 2026",
          "Weather: heavy rain from 08:00, works suspended.",
          "Level 3 slab pour: delayed. Concrete pump arrived late at 11:00.",
          "Pour started 11:30 and was abandoned at 13:00 due to rain.",
          "Delay: 1 day. Cause: pump supplier and weather.",
        ],
        ["# Labour on site", "Concrete gang: 6 operatives from 07:00.", "Signed: Site manager"],
      ],
    },
    [DN]: {
      kind: "docx",
      title: "Delivery note DN-40917 - Pump hire (synthetic)",
      paragraphs: [
        "Date: 14/07/2026",
        "Pump arrived on site: 08:15",
        "Waiting time: 08:15 to 11:30 - site not ready, formwork not signed off.",
        "Pumping started: 11:30",
        "Driver: signature on file",
      ],
    },
    [EMAIL]: {
      kind: "txt",
      text: `From: Client representative (synthetic)
Date: 14 July 2026, 16:20
Subject: Level 3 pour

I visited site at 09:00 today. The pump was already on site. The Level 3 formwork had not been inspected or signed off, so the pour could not start.

There was no rain while I was there. I do not accept that the pump supplier or the weather caused today's delay.
`,
    },
    [MEETING]: {
      kind: "audio",
      segments: [
        { voice: "Daniel", text: "The pump was late, that is the whole reason we lost the day. And then the rain came in, so we could not finish the pour." },
        { voice: "Samantha", text: "Our records show the pump was there before half past eight." },
      ],
      creationTime: "2026-07-16T15:00:00Z",
    },
  },
  items: {
    [VIDEO]: {
      summary: "A one-minute timelapse of the Level 3 deck covering 07:00 to 11:00 (four minutes per video second). An orange pump vehicle arrives at about 08:16–08:24 by the overlay clock, a visitor crosses the deck around 09:00, and operatives work on the deck from about 09:40.",
      extraction_issues: ["Timelapse: anything between frames (about 4 minutes apart in real time) is not visible.", "No audio."],
      observations: [
        {
          key: "v_clock",
          observation_type: "direct_observation",
          description: "The overlay reads 'TIMELAPSE CAM - LEVEL 3' and the clock starts at 2026-07-14 07:00, advancing about four minutes per second of video.",
          start_time_seconds: 0,
          end_time_seconds: 4,
          frame_window: [0, 4],
          event_time: { stated_text: "2026-07-14 07:00 (camera clock)", iso_datetime: "2026-07-14T07:00", precision: "minute", basis: "timelapse overlay (not verified)" },
        },
        {
          key: "v_pump",
          observation_type: "direct_observation",
          description: "An orange vehicle with a boom (consistent with a concrete pump) arrives and parks beside the building at about 08:16–08:24 by the overlay clock.",
          start_time_seconds: 19,
          end_time_seconds: 23,
          frame_window: [19, 24],
          requires_review: true,
          uncertainty_reason: "The vehicle type is inferred from its appearance.",
        },
        { key: "v_pump_stays", observation_type: "direct_observation", description: "The orange vehicle remains on site until the end of the recording (overlay 11:00).", start_time_seconds: 23, end_time_seconds: 60, frame_window: [40, 60] },
        { key: "v_visitor", observation_type: "direct_observation", description: "A person in white walks across the deck at about 09:00–09:20 by the overlay clock.", start_time_seconds: 30, end_time_seconds: 35, frame_window: [30, 35] },
        { key: "v_workers", observation_type: "direct_observation", description: "Two people in yellow are working on the deck from about 09:40 by the overlay clock.", start_time_seconds: 40, end_time_seconds: 60, frame_window: [40, 60] },
        { key: "v_norain", observation_type: "ai_inference", description: "No rain or wet surfaces are visible at any point from 07:00 to 11:00 by the overlay clock.", start_time_seconds: 0, end_time_seconds: 60, frame_window: [0, 60], requires_review: true, uncertainty_reason: "Light rain may not be visible in a timelapse at this resolution." },
      ],
    },
    [WEATHER]: {
      summary: "The site rain gauge record for 14 July 2026: 0.0 mm from 06:00 to 09:00, 0.4 mm from 09:00 to 12:00, and 6.2 mm from 12:00 to 15:00.",
      extraction_issues: [],
      observations: [
        { key: "w_0609", observation_type: "extracted_document_fact", description: "No rainfall was recorded from 06:00 to 09:00.", quote: "14/07/2026 06:00-09:00 0.0 mm", image_region: { x: 25, y: 320, width: 620, height: 90 }, event_time: { stated_text: "14/07/2026 06:00-09:00", iso_datetime: "2026-07-14T06:00", precision: "hour", basis: "site rain gauge" } },
        { key: "w_0912", observation_type: "extracted_document_fact", description: "0.4 mm of rain was recorded from 09:00 to 12:00.", quote: "14/07/2026 09:00-12:00 0.4 mm", image_region: { x: 25, y: 500, width: 620, height: 90 }, event_time: { stated_text: "14/07/2026 09:00-12:00", iso_datetime: "2026-07-14T09:00", precision: "hour", basis: "site rain gauge" } },
        { key: "w_1215", observation_type: "extracted_document_fact", description: "6.2 mm of rain was recorded from 12:00 to 15:00.", quote: "14/07/2026 12:00-15:00 6.2 mm", image_region: { x: 25, y: 680, width: 620, height: 90 }, event_time: { stated_text: "14/07/2026 12:00-15:00", iso_datetime: "2026-07-14T12:00", precision: "hour", basis: "site rain gauge" } },
      ],
    },
    [DIARY]: {
      summary: "The contractor's site diary for 14 July 2026: heavy rain from 08:00, pump arrived late at 11:00, pour started 11:30 and was abandoned at 13:00 due to rain; one day's delay attributed to the pump supplier and the weather.",
      extraction_issues: [],
      observations: [
        { key: "d_rain", observation_type: "contributor_statement", description: "The diary records heavy rain from 08:00 and works suspended.", quote: "Weather: heavy rain from 08:00, works suspended.", page_number: 1, event_time: { stated_text: "14 July 2026, from 08:00", iso_datetime: "2026-07-14T08:00", precision: "hour", basis: "contractor's site diary" }, requires_review: true, uncertainty_reason: "The contractor's own record." },
        { key: "d_pump", observation_type: "contributor_statement", description: "The diary records the concrete pump arriving late at 11:00.", quote: "Concrete pump arrived late at 11:00.", page_number: 1, event_time: { stated_text: "11:00", iso_datetime: "2026-07-14T11:00", precision: "minute", basis: "contractor's site diary" } },
        { key: "d_pour", observation_type: "contributor_statement", description: "The diary records the pour starting at 11:30 and being abandoned at 13:00 due to rain.", quote: "Pour started 11:30 and was abandoned at 13:00 due to rain.", page_number: 1, event_time: { stated_text: "11:30 to 13:00", iso_datetime: "2026-07-14T11:30", precision: "minute", basis: "contractor's site diary" } },
        { key: "d_cause", observation_type: "contributor_statement", description: "The diary attributes one day's delay to the pump supplier and the weather.", quote: "Delay: 1 day. Cause: pump supplier and weather.", page_number: 1 },
        { key: "d_gang", observation_type: "extracted_document_fact", description: "A six-person concrete gang was on site from 07:00.", quote: "Concrete gang: 6 operatives from 07:00.", page_number: 2 },
      ],
    },
    [DN]: {
      summary: "The pump hire delivery note DN-40917: arrived 08:15 on 14/07/2026, waited until 11:30 because the site was not ready and the formwork was not signed off, then started pumping at 11:30.",
      extraction_issues: [],
      observations: [
        { key: "n_arrived", observation_type: "extracted_document_fact", description: "The pump is recorded as arriving on site at 08:15.", quote: "Pump arrived on site: 08:15", event_time: { stated_text: "14/07/2026 08:15", iso_datetime: "2026-07-14T08:15", precision: "minute", basis: "supplier delivery note" } },
        { key: "n_wait", observation_type: "contributor_statement", description: "The note records waiting from 08:15 to 11:30 because the site was not ready and the formwork was not signed off.", quote: "Waiting time: 08:15 to 11:30 - site not ready, formwork not signed off." },
        { key: "n_start", observation_type: "extracted_document_fact", description: "Pumping started at 11:30.", quote: "Pumping started: 11:30", event_time: { stated_text: "11:30", iso_datetime: "2026-07-14T11:30", precision: "minute", basis: "supplier delivery note" } },
      ],
    },
    [EMAIL]: {
      summary: "The client representative's email of 14 July 2026: visited at 09:00, the pump was already on site, the formwork had not been signed off, and there was no rain while they were there.",
      extraction_issues: [],
      observations: [
        { key: "e_visit", observation_type: "contributor_statement", description: "The client representative visited site at 09:00 and the pump was already there.", quote: "I visited site at 09:00 today. The pump was already on site.", event_time: { stated_text: "14 July 2026, 09:00", iso_datetime: "2026-07-14T09:00", precision: "minute", basis: "stated by client representative" } },
        { key: "e_formwork", observation_type: "contributor_statement", description: "The formwork had not been inspected or signed off, so the pour could not start.", quote: "The Level 3 formwork had not been inspected or signed off, so the pour could not start." },
        { key: "e_norain", observation_type: "contributor_statement", description: "The representative says there was no rain during their visit.", quote: "There was no rain while I was there." },
        { key: "e_dispute", observation_type: "contributor_statement", description: "The representative does not accept that the pump supplier or the weather caused the delay.", quote: "I do not accept that the pump supplier or the weather caused today's delay." },
      ],
    },
    [MEETING]: {
      summary: "An extract from a site meeting: the contractor's representative says the late pump was the whole reason the day was lost, followed by rain; the client side says their records show the pump arrived before half past eight.",
      extraction_issues: ["Speakers are not named; roles are inferred from what they say."],
      observations: [
        { key: "m_late", observation_type: "contributor_statement", description: "A speaker says the pump was late and that was the whole reason the day was lost.", quote: "that is the whole reason we lost the day", speaker_label: "Speaker A (contractor side, inferred)" },
        { key: "m_rain", observation_type: "contributor_statement", description: "The same speaker says rain then prevented the pour from finishing.", quote: "the rain came in", speaker_label: "Speaker A (contractor side, inferred)" },
        { key: "m_records", observation_type: "contributor_statement", description: "A second speaker says their records show the pump was there before half past eight.", quote: "Our records show the pump was there before half past eight", speaker_label: "Speaker B (client side, inferred)" },
        { key: "m_speakers", observation_type: "ai_inference", description: "Two different voices are heard; their roles are inferred from what they say and are not established.", requires_review: true },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Pump arrival: 11:00 per the contractor; about 08:15 per the supplier, the timelapse and the client",
        description: "The site diary says the pump arrived late at 11:00, and the contractor's representative calls it the whole reason the day was lost. The delivery note records arrival at 08:15, the timelapse shows a pump vehicle arriving about 08:16–08:24, and the client representative found it already on site at 09:00.",
        finding_type: "potential_discrepancy",
        refs: [D("d_pump"), M("m_late"), N("n_arrived"), V("v_pump"), E("e_visit"), M("m_records")],
        relationship_explanation: "Three independent sources place the pump on site by about 08:20. The diary's 11:00 might refer to when the pump was ready to start, which the delivery note gives as 11:30.",
        limitations: "The timelapse clock is unverified; the vehicle type is inferred.",
        requires_review: true,
      },
      {
        title: "Rain from 08:00 (diary) is not supported by the gauge or the timelapse until later",
        description: "The diary records heavy rain from 08:00 with works suspended. The site gauge recorded 0.0 mm from 06:00 to 09:00 and 0.4 mm from 09:00 to 12:00. The timelapse shows no visible rain to 11:00, and the client saw none at 09:00. 6.2 mm fell from 12:00 to 15:00.",
        finding_type: "potential_discrepancy",
        refs: [D("d_rain"), W("w_0609"), W("w_0912"), V("v_norain"), E("e_norain"), W("w_1215")],
        relationship_explanation: "The afternoon rainfall is consistent with the diary's account that the pour was abandoned at 13:00, but not with rain from 08:00.",
        limitations: "A single gauge; local conditions may vary.",
        requires_review: true,
      },
      {
        title: "Formwork not signed off is cited as the cause of waiting by two independent sources",
        description: "The supplier's delivery note records waiting from 08:15 to 11:30 because the formwork was not signed off, and the client representative says the formwork had not been inspected or signed off. The diary does not mention formwork.",
        finding_type: "supporting_relationship",
        refs: [N("n_wait"), E("e_formwork"), D("d_cause")],
        relationship_explanation: "If accepted, this would point to a cause of delay other than the pump or the weather. Attributing responsibility is for the reviewer.",
        limitations: "No formwork inspection record was provided.",
        requires_review: true,
      },
      {
        title: "Pumping started at 11:30, after operatives were seen working on the deck",
        description: "The delivery note and the diary both put the pour start at 11:30. The timelapse shows operatives on the deck from about 09:40, possibly preparing it.",
        finding_type: "chronological_relationship",
        refs: [N("n_start"), D("d_pour"), V("v_workers")],
        relationship_explanation: null,
        limitations: "The activity of the operatives cannot be determined from the timelapse.",
        requires_review: true,
      },
      {
        title: "Missing: formwork inspection record and gang activity before 11:30",
        description: "A six-person gang was on site from 07:00, but there is no record of what they did before the pour or when the formwork was signed off.",
        finding_type: "missing_information",
        refs: [D("d_gang"), E("e_formwork"), V("v_workers")],
        relationship_explanation: null,
        limitations: "These records would be relevant to quantifying any delay.",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Concrete gang on site; timelapse begins.", iso_datetime: "2026-07-14T07:00", date_text: "07:00", precision: "minute", refs: [D("d_gang"), V("v_clock")], relationship_note: null },
      { description: "Contractor's diary records heavy rain beginning.", iso_datetime: "2026-07-14T08:00", date_text: "from 08:00", precision: "hour", refs: [D("d_rain")], relationship_note: "The site gauge recorded 0.0 mm from 06:00 to 09:00." },
      { description: "Pump arrives on site (delivery note); timelapse shows a pump vehicle arriving.", iso_datetime: "2026-07-14T08:15", date_text: "08:15 (timelapse about 08:16–08:24)", precision: "minute", refs: [N("n_arrived"), V("v_pump"), V("v_clock")], relationship_note: null },
      { description: "Client representative visits; pump already on site, formwork not signed off.", iso_datetime: "2026-07-14T09:00", date_text: "09:00", precision: "minute", refs: [E("e_visit"), E("e_formwork")], relationship_note: null },
      { description: "Contractor's diary records the pump arriving late.", iso_datetime: "2026-07-14T11:00", date_text: "11:00", precision: "minute", refs: [D("d_pump")], relationship_note: "About 2h45 later than the delivery note; both accounts are kept." },
      { description: "Pumping starts.", iso_datetime: "2026-07-14T11:30", date_text: "11:30", precision: "minute", refs: [N("n_start"), D("d_pour")], relationship_note: null },
      { description: "Rain recorded at the site gauge (6.2 mm, 12:00–15:00); diary records the pour abandoned at 13:00.", iso_datetime: "2026-07-14T12:00", date_text: "12:00–15:00", precision: "hour", refs: [W("w_1215"), D("d_pour")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "No formwork inspection records or programme were provided."],
  },
};
