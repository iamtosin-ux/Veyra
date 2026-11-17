// HR investigations: grievance alleging a supervisor shouted at an operative.
// Synthetic. Analysis hand-written (not AI output).
import { ref, type DemoScenario } from "../types";

const VIDEO = "warehouse_cam4_aisle4.mp4";
const AUDIO = "interview_witness_night_shift.m4a";
const ROTA = "shift_rota_week19.png";
const GRIEVANCE = "grievance_letter_operative.pdf";
const RESPONSE = "supervisor_response.txt";
const CLOCK = "clocking_records_0605.docx";

const V = ref(VIDEO), A = ref(AUDIO), R = ref(ROTA), G = ref(GRIEVANCE), S = ref(RESPONSE), C = ref(CLOCK);

export const hrInvestigation: DemoScenario = {
  id: "hr-investigation",
  industry: "Legal services",
  caseType: "employment_tribunal",
  title: "Night shift grievance: employment tribunal claim",
  description: "A warehouse operative brings a tribunal claim after a grievance: they say a supervisor shouted and swore at them on shift; the supervisor says they spoke firmly about a safety breach.",
  files: [VIDEO, AUDIO, ROTA, GRIEVANCE, RESPONSE, CLOCK],
  media: {
    [VIDEO]: {
      kind: "video",
      duration: 60,
      size: [640, 360],
      bg: "0xd9d6cf",
      rects: [
        { x: 0, y: 280, w: 640, h: 80, color: "0x8f8b83" },
        { x: 20, y: 60, w: 120, h: 220, color: "0x3f5a7a" },
        { x: 500, y: 60, w: 120, h: 220, color: "0x3f5a7a" },
        { x: 20, y: 140, w: 120, h: 8, color: "0xc9a227" },
        { x: 500, y: 140, w: 120, h: 8, color: "0xc9a227" },
      ],
      labels: [
        { text: "CAM 4  AISLE 4", x: 10, y: 10, size: 16, color: "white", box: true },
        { text: "AISLE 4", x: 280, y: 40, size: 22, color: "0x222222" },
      ],
      movers: [
        // Supervisor (dark clothing) standing mid-aisle throughout.
        { w: 44, h: 118, color: "0x1f2433", path: [[0, 270, 160]], from: 0, to: 60, head: { w: 28, h: 28, color: "0xc68e5f", dx: 8, dy: -30 } },
        // Operative in hi-vis: enters from the right, stands facing, then leaves quickly to the left.
        { w: 44, h: 118, color: "0xe6d21e", path: [[8, 640, 160], [15, 340, 160], [38, 340, 160], [44, -60, 160]], from: 8, to: 44, head: { w: 28, h: 28, color: "0x8d5a3b", dx: 8, dy: -30 } },
      ],
      clock: { startIso: "2026-05-06T22:13:30Z", x: 440, y: 10 },
      creationTime: "2026-05-06T22:13:30Z",
    },
    [AUDIO]: {
      kind: "audio",
      segments: [
        { voice: "Daniel", text: "This is an investigation interview with a witness, recorded with consent. Please describe what you heard on the night shift of the sixth of May." },
        {
          voice: "Samantha",
          text: "I was picking in the next aisle. Just after a quarter past ten I heard the supervisor shouting at Sam. I could not hear the exact words. I did not see them, there was a rack between us. A few minutes later Sam walked past me towards the exit and looked upset.",
        },
      ],
      creationTime: "2026-05-12T14:00:00Z",
    },
    [ROTA]: {
      kind: "image",
      format: "png",
      size: [900, 420],
      bg: "0xffffff",
      rects: [{ x: 0, y: 0, w: 900, h: 70, color: "0x1f3b5c" }],
      labels: [
        { text: "NIGHT SHIFT ROTA - WEEK 19", x: 30, y: 22, size: 28, color: "white" },
        { text: "Wed 06/05   22:00-06:00   J. Okafor (Supervisor)", x: 30, y: 110, size: 24, color: "0x111111" },
        { text: "Wed 06/05   22:00-06:00   S. Patel", x: 30, y: 170, size: 24, color: "0x111111" },
        { text: "Wed 06/05   22:00-06:00   R. Lewis", x: 30, y: 230, size: 24, color: "0x111111" },
        { text: "Thu 07/05   22:00-06:00   J. Okafor (Supervisor)", x: 30, y: 290, size: 24, color: "0x111111" },
      ],
    },
    [GRIEVANCE]: {
      kind: "pdf",
      pages: [
        [
          "# Formal grievance (synthetic)",
          "From: S. Patel, Warehouse Operative",
          "Date: 8 May 2026",
          "",
          "On 6 May 2026 at about 22:15, my supervisor J. Okafor shouted and swore at me",
          "in Aisle 4 in front of colleagues. He said I was useless and should go home.",
          "I felt humiliated and left my shift early, at around 22:30.",
          "This is not the first time. He spoke to me in a similar way on 21 April 2026.",
        ],
        [
          "# Outcome requested",
          "1. A formal investigation into the supervisor's conduct.",
          "2. A change of supervisor for my shifts.",
          "3. Payment for the hours I lost on 6 May 2026.",
        ],
      ],
    },
    [RESPONSE]: {
      kind: "txt",
      text: `Response to grievance - J. Okafor, Shift Supervisor (synthetic)

On the night of 6 May 2026, at about 23:00, I spoke to S. Patel in Aisle 4 about walking in the forklift lane, which is a safety breach.

I spoke firmly because it was the third reminder that week, but I did not shout or swear. I did not tell anyone to go home.

S. Patel walked off during the conversation and did not return to the floor. I recorded this in the shift log.
`,
    },
    [CLOCK]: {
      kind: "docx",
      title: "Clocking records - 06/05/2026 night shift (synthetic)",
      paragraphs: [
        "S. Patel - clock in 21:56 - clock out 22:31",
        "R. Lewis - clock in 21:58 - clock out 06:02",
        "J. Okafor - clock in 21:45 - clock out 06:10",
        "Shift log note (J. Okafor, 23:40): Operative S. Patel left site without authorisation.",
      ],
    },
  },
  items: {
    [VIDEO]: {
      summary: "A 60-second silent CCTV recording of Aisle 4. A person in dark clothing stands mid-aisle; a person in a hi-vis vest arrives, stands facing them for about 23 seconds, then leaves quickly.",
      extraction_issues: ["The recording has no audio track.", "Faces cannot be made out at this resolution."],
      observations: [
        {
          key: "v_clock",
          observation_type: "direct_observation",
          description: "The overlay reads 'CAM 4 AISLE 4' with a clock starting at 2026-05-06 22:13:30.",
          start_time_seconds: 0,
          end_time_seconds: 1,
          frame_window: [0, 3],
          event_time: { stated_text: "2026-05-06 22:13:30 (camera clock)", iso_datetime: "2026-05-06T22:13:30", precision: "exact", basis: "camera overlay clock (not verified)" },
          requires_review: true,
          uncertainty_reason: "The camera clock has not been checked against a reference time.",
        },
        { key: "v_dark", observation_type: "direct_observation", description: "A person in dark clothing stands in the middle of the aisle from the start of the recording.", start_time_seconds: 0, end_time_seconds: 8, frame_window: [0, 8] },
        { key: "v_hivis_in", observation_type: "direct_observation", description: "A person wearing a hi-vis vest enters from the right and walks towards the person in dark clothing.", start_time_seconds: 8, end_time_seconds: 15, frame_window: [8, 15] },
        {
          key: "v_facing",
          observation_type: "direct_observation",
          description: "The two people stand close together, facing each other, for about 23 seconds (camera clock about 22:13:45 to 22:14:08).",
          start_time_seconds: 15,
          end_time_seconds: 38,
          frame_window: [15, 38],
          requires_review: true,
          uncertainty_reason: "Footage shows positions only; tone and words cannot be determined.",
        },
        { key: "v_leaves", observation_type: "direct_observation", description: "The person in the hi-vis vest moves quickly out of frame to the left; the person in dark clothing stays.", start_time_seconds: 38, end_time_seconds: 44, frame_window: [38, 44] },
        { key: "v_noaudio", observation_type: "unresolved_question", description: "The recording has no audio, so whether anyone shouted or swore cannot be established from it.", requires_review: true },
      ],
    },
    [AUDIO]: {
      summary: "An investigation interview with a witness who heard the supervisor shouting at 'Sam' shortly after 22:15 but did not see the exchange or hear the words.",
      extraction_issues: ["Two voices; speakers are labelled by role as introduced in the recording."],
      observations: [
        { key: "a_intro", observation_type: "contributor_statement", description: "The interviewer states the interview is recorded with consent.", quote: "recorded with consent", speaker_label: "Interviewer" },
        {
          key: "a_heard",
          observation_type: "contributor_statement",
          description: "The witness says that just after a quarter past ten they heard the supervisor shouting at Sam.",
          quote: "I heard the supervisor shouting at Sam",
          speaker_label: "Witness (name not stated)",
          event_time: { stated_text: "just after a quarter past ten", iso_datetime: null, precision: "approximate", basis: "stated by witness; date given by interviewer as 6 May" },
          requires_review: true,
          uncertainty_reason: "A recollection; the witness could not see the people involved.",
        },
        { key: "a_words", observation_type: "contributor_statement", description: "The witness could not hear the exact words.", quote: "I could not hear the exact words", speaker_label: "Witness (name not stated)" },
        { key: "a_rack", observation_type: "contributor_statement", description: "The witness did not see the exchange because a rack was in the way.", quote: "there was a rack between us", speaker_label: "Witness (name not stated)" },
        { key: "a_exit", observation_type: "contributor_statement", description: "A few minutes later the witness saw Sam walk towards the exit looking upset.", quote: "walked past me towards the exit and looked upset", speaker_label: "Witness (name not stated)" },
      ],
    },
    [ROTA]: {
      summary: "The week 19 night shift rota listing J. Okafor (Supervisor), S. Patel and R. Lewis on Wednesday 06/05, 22:00–06:00.",
      extraction_issues: ["The year is not shown."],
      observations: [
        { key: "r_okafor", observation_type: "extracted_document_fact", description: "J. Okafor is rostered as supervisor on Wed 06/05, 22:00–06:00.", quote: "Wed 06/05 22:00-06:00 J. Okafor (Supervisor)", image_region: { x: 25, y: 250, width: 640, height: 80 } },
        { key: "r_patel", observation_type: "extracted_document_fact", description: "S. Patel is rostered on the same shift.", quote: "Wed 06/05 22:00-06:00 S. Patel", image_region: { x: 25, y: 395, width: 440, height: 80 } },
        { key: "r_lewis", observation_type: "extracted_document_fact", description: "R. Lewis is also rostered on that shift.", quote: "Wed 06/05 22:00-06:00 R. Lewis", image_region: { x: 25, y: 540, width: 440, height: 80 } },
      ],
    },
    [GRIEVANCE]: {
      summary: "A formal grievance dated 8 May 2026 alleging the supervisor shouted and swore at the operative in Aisle 4 at about 22:15 on 6 May, and requesting an investigation.",
      extraction_issues: [],
      observations: [
        { key: "g_date", observation_type: "extracted_document_fact", description: "The grievance is dated 8 May 2026.", quote: "Date: 8 May 2026", page_number: 1, event_time: { stated_text: "8 May 2026", iso_datetime: "2026-05-08", precision: "day", basis: "letter date" } },
        {
          key: "g_allegation",
          observation_type: "contributor_statement",
          description: "The operative alleges that at about 22:15 on 6 May 2026 the supervisor shouted and swore at them in Aisle 4 in front of colleagues.",
          quote: "On 6 May 2026 at about 22:15, my supervisor J. Okafor shouted and swore at me in Aisle 4 in front of colleagues",
          page_number: 1,
          event_time: { stated_text: "6 May 2026 at about 22:15", iso_datetime: "2026-05-06T22:15", precision: "approximate", basis: "stated by complainant" },
          requires_review: true,
          uncertainty_reason: "An allegation; not independently established.",
        },
        { key: "g_words", observation_type: "contributor_statement", description: "The operative says they were told they were useless and should go home.", quote: "He said I was useless and should go home.", page_number: 1 },
        { key: "g_left", observation_type: "contributor_statement", description: "The operative says they left the shift early, at around 22:30.", quote: "left my shift early, at around 22:30", page_number: 1, event_time: { stated_text: "around 22:30", iso_datetime: "2026-05-06T22:30", precision: "approximate", basis: "stated by complainant" } },
        { key: "g_prior", observation_type: "contributor_statement", description: "The operative says a similar incident happened on 21 April 2026.", quote: "He spoke to me in a similar way on 21 April 2026.", page_number: 1, event_time: { stated_text: "21 April 2026", iso_datetime: "2026-04-21", precision: "day", basis: "stated by complainant" } },
        { key: "g_outcome", observation_type: "extracted_document_fact", description: "The operative requests a formal investigation, a change of supervisor and payment for lost hours.", quote: "A formal investigation into the supervisor's conduct.", page_number: 2 },
      ],
    },
    [RESPONSE]: {
      summary: "The supervisor's written response: they spoke firmly to the operative about walking in the forklift lane at about 23:00, did not shout or swear, and the operative walked off.",
      extraction_issues: [],
      observations: [
        {
          key: "s_time",
          observation_type: "contributor_statement",
          description: "The supervisor says the conversation took place at about 23:00 in Aisle 4 and concerned walking in the forklift lane.",
          quote: "at about 23:00, I spoke to S. Patel in Aisle 4 about walking in the forklift lane",
          event_time: { stated_text: "6 May 2026, at about 23:00", iso_datetime: "2026-05-06T23:00", precision: "approximate", basis: "stated by supervisor" },
        },
        { key: "s_firm", observation_type: "contributor_statement", description: "The supervisor says they spoke firmly but did not shout or swear.", quote: "I spoke firmly because it was the third reminder that week, but I did not shout or swear.", requires_review: true, uncertainty_reason: "An account; not independently established." },
        { key: "s_home", observation_type: "contributor_statement", description: "The supervisor denies telling anyone to go home.", quote: "I did not tell anyone to go home." },
        { key: "s_walked", observation_type: "contributor_statement", description: "The supervisor says the operative walked off during the conversation and did not return.", quote: "S. Patel walked off during the conversation and did not return to the floor." },
      ],
    },
    [CLOCK]: {
      summary: "Clocking records for the 6 May night shift and a shift log note recording that the operative left without authorisation.",
      extraction_issues: [],
      observations: [
        { key: "c_patel", observation_type: "extracted_document_fact", description: "S. Patel clocked out at 22:31.", quote: "S. Patel - clock in 21:56 - clock out 22:31", event_time: { stated_text: "06/05/2026 22:31", iso_datetime: "2026-05-06T22:31", precision: "minute", basis: "clocking system" } },
        { key: "c_lewis", observation_type: "extracted_document_fact", description: "R. Lewis worked the full shift (clock out 06:02).", quote: "R. Lewis - clock in 21:58 - clock out 06:02" },
        { key: "c_log", observation_type: "extracted_document_fact", description: "A shift log note by the supervisor at 23:40 records that the operative left site without authorisation.", quote: "Shift log note (J. Okafor, 23:40): Operative S. Patel left site without authorisation.", event_time: { stated_text: "23:40", iso_datetime: "2026-05-06T23:40", precision: "minute", basis: "shift log" } },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Time of the conversation: about 22:15 in most sources, 23:00 in the supervisor's account",
        description: "The grievance gives about 22:15, the witness heard shouting just after a quarter past ten, the CCTV shows the two people facing each other at about 22:14 by the camera clock, and the operative clocked out at 22:31. The supervisor's response puts the conversation at about 23:00.",
        finding_type: "potential_discrepancy",
        refs: [G("g_allegation"), A("a_heard"), V("v_clock"), V("v_facing"), C("c_patel"), S("s_time")],
        relationship_explanation: "Four sources point to around 22:15, and the clock-out record shows the operative had left by 22:31. The supervisor may be estimating the time from memory, or may be describing a different conversation.",
        limitations: "The camera clock is unverified. The witness's time is a recollection.",
        requires_review: true,
      },
      {
        title: "Whether the supervisor shouted or swore is disputed and cannot be resolved from the footage",
        description: "The operative alleges shouting and swearing; the supervisor says they spoke firmly but did not shout or swear. The witness heard shouting but not the words and did not see the exchange. The CCTV has no audio.",
        finding_type: "potential_discrepancy",
        refs: [G("g_allegation"), S("s_firm"), A("a_heard"), A("a_words"), V("v_noaudio")],
        relationship_explanation: "The witness supports the account that voices were raised, but neither swearing nor the content of what was said is corroborated.",
        limitations: "No recording of what was said. Raised voices in a warehouse may also reflect background noise.",
        requires_review: true,
      },
      {
        title: "The operative left shortly after the exchange",
        description: "On CCTV the person in the hi-vis vest leaves quickly after the exchange. The witness saw Sam walk to the exit looking upset, the operative says they left at around 22:30, and they clocked out at 22:31. The supervisor also says the operative walked off.",
        finding_type: "supporting_relationship",
        refs: [V("v_leaves"), A("a_exit"), G("g_left"), C("c_patel"), S("s_walked")],
        relationship_explanation: "All sources agree that the operative left the floor soon after the conversation; they differ on why.",
        limitations: "The CCTV does not identify the people shown.",
        requires_review: true,
      },
      {
        title: "Shift log records an unauthorised departure an hour after the clock-out",
        description: "The supervisor's shift log note at 23:40 records that the operative left without authorisation; the operative had clocked out at 22:31.",
        finding_type: "chronological_relationship",
        refs: [C("c_log"), C("c_patel"), G("g_left")],
        relationship_explanation: "The note was written about 70 minutes after the operative left.",
        limitations: "Whether permission to leave was sought is not recorded.",
        requires_review: true,
      },
      {
        title: "Missing: evidence of the safety breach and of the earlier incident",
        description: "The supervisor says the conversation concerned walking in the forklift lane; the grievance refers to a similar incident on 21 April 2026. Neither is evidenced in the material provided.",
        finding_type: "missing_information",
        refs: [S("s_time"), G("g_prior"), V("v_facing")],
        relationship_explanation: null,
        limitations: "The CCTV covers only 60 seconds and does not show lane markings clearly.",
        requires_review: true,
      },
      {
        title: "Who are the people on CCTV, and is R. Lewis the witness?",
        description: "The rota lists J. Okafor, S. Patel and R. Lewis on the shift. The CCTV does not identify the people shown, and the witness is not named in the interview.",
        finding_type: "question",
        refs: [R("r_okafor"), R("r_patel"), R("r_lewis"), V("v_dark"), A("a_intro")],
        relationship_explanation: null,
        limitations: "Identity should be confirmed with those involved, not inferred from clothing.",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "The operative says a similar incident occurred.", iso_datetime: "2026-04-21", date_text: "21 April 2026", precision: "day", refs: [G("g_prior")], relationship_note: "Single source; not evidenced elsewhere." },
      { description: "CCTV (camera clock) shows the two people facing each other in Aisle 4, then the hi-vis person leaving.", iso_datetime: "2026-05-06T22:13:45", date_text: "about 22:13:45–22:14:14 (camera clock)", precision: "approximate", refs: [V("v_clock"), V("v_facing"), V("v_leaves")], relationship_note: null },
      { description: "The operative's account of being shouted at in Aisle 4.", iso_datetime: "2026-05-06T22:15", date_text: "about 22:15", precision: "approximate", refs: [G("g_allegation"), A("a_heard")], relationship_note: "The witness gives 'just after a quarter past ten'." },
      { description: "The operative clocks out.", iso_datetime: "2026-05-06T22:31", date_text: "22:31", precision: "minute", refs: [C("c_patel"), G("g_left")], relationship_note: null },
      { description: "The supervisor's account of the conversation in Aisle 4.", iso_datetime: "2026-05-06T23:00", date_text: "about 23:00", precision: "approximate", refs: [S("s_time")], relationship_note: "About 45 minutes later than the other sources; both accounts are kept." },
      { description: "Shift log note records the operative left without authorisation.", iso_datetime: "2026-05-06T23:40", date_text: "23:40", precision: "minute", refs: [C("c_log")], relationship_note: null },
      { description: "Formal grievance submitted.", iso_datetime: "2026-05-08", date_text: "8 May 2026", precision: "day", refs: [G("g_date")], relationship_note: null },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "No audio of the exchange exists; findings about tone rely on accounts."],
  },
};
