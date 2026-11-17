// Insurance claims: rear-end collision with conflicting accounts of speed and braking.
// Synthetic. Analysis hand-written (not AI output).
import { ref, type DemoScenario } from "../types";

const VIDEO = "dashcam_policyholder.mp4";
const PHOTO = "photo_rear_bumper_third_party.jpg";
const FORM = "claim_form_CLM-88217.pdf";
const TP = "third_party_statement.txt";
const CALL = "first_notification_call.m4a";

const V = ref(VIDEO), P = ref(PHOTO), F = ref(FORM), T = ref(TP), C = ref(CALL);

const speed = (text: string, from: number, to: number) => ({ text, x: 20, y: 320, size: 18, color: "white", box: true, from, to });

export const insuranceClaim: DemoScenario = {
  id: "insurance-claim",
  industry: "Legal services",
  caseType: "personal_injury",
  title: "Station Road collision: personal injury claim",
  description: "A driver claims for injury after a rear-end collision; the dashcam speed reading and braking timeline differ from both drivers' accounts.",
  files: [VIDEO, PHOTO, FORM, TP, CALL],
  media: {
    [VIDEO]: {
      kind: "video",
      duration: 35,
      size: [640, 360],
      bg: "0x9fb6c8",
      rects: [
        { x: 0, y: 150, w: 640, h: 210, color: "0x4a4a48" },
        { x: 0, y: 150, w: 640, h: 6, color: "0x6f8f5a" },
        { x: 310, y: 250, w: 8, h: 40, color: "0xe8e8e8" },
        { x: 314, y: 310, w: 10, h: 50, color: "0xe8e8e8" },
      ],
      labels: [
        { text: "DASHCAM 01", x: 10, y: 10, size: 16, color: "white", box: true },
        speed("38 km/h", 0, 17.5),
        speed("31 km/h", 17.5, 19),
        speed("17 km/h", 19, 21),
        speed("0 km/h", 21, 35),
      ],
      movers: [
        // Lead vehicle: steady ahead, then closes quickly once it brakes.
        { w: 120, h: 70, color: "0x7a1f1f", path: [[0, 260, 165], [17.6, 260, 168], [21, 240, 230]], from: 0, to: 35 },
        // Its brake lights, on from 17.6 s.
        { w: 120, h: 10, color: "0xff3030", path: [[0, 260, 200], [17.6, 260, 203], [21, 240, 265]], from: 17.6, to: 35 },
      ],
      clock: { startIso: "2026-04-18T08:41:50Z", x: 440, y: 10 },
      audio: {
        bangs: [{ at: 21, dur: 0.4, amp: 0.95 }],
        speech: [{ voice: "Daniel", text: "He just slammed on the brakes for no reason. There was nothing in front of him.", at: 24 }],
      },
      creationTime: "2026-04-18T08:41:50Z",
    },
    [PHOTO]: {
      kind: "image",
      format: "jpg",
      size: [1000, 700],
      bg: "0xb7b7b2",
      rects: [
        { x: 120, y: 160, w: 760, h: 320, color: "0x7a1f1f" },
        { x: 120, y: 420, w: 760, h: 90, color: "0x2b2b2b" },
        { x: 420, y: 300, w: 160, h: 50, color: "0xf2f2e6" },
        { x: 460, y: 425, w: 140, h: 40, color: "0x5c5c5c" },
        { x: 520, y: 440, w: 60, h: 8, color: "0x111111" },
      ],
      labels: [{ text: "DEMO 123", x: 432, y: 308, size: 32, color: "0x111111" }],
    },
    [FORM]: {
      kind: "pdf",
      pages: [
        [
          "# Motor claim form (synthetic)",
          "Claim reference: CLM-88217",
          "Policyholder vehicle: DEMO 456",
          "Date and time of incident: 18 April 2026, approximately 08:40",
          "Location: Station Road, near the junction with Mill Lane",
          "Your speed at the time: approximately 30 km/h",
          "Description: The vehicle in front braked suddenly and without reason. I could",
          "not stop in time and hit its rear bumper.",
          "Weather: dry, good visibility.",
        ],
        ["# Declaration", "I confirm the information above is true to the best of my knowledge.", "Signed: Policyholder (synthetic)   Date: 19 April 2026"],
      ],
    },
    [TP]: {
      kind: "txt",
      text: `Statement - Driver of vehicle DEMO 123 (synthetic)

On 18 April 2026 at about 08:45 I was driving along Station Road. A cyclist pulled out from the kerb on my left without looking, so I braked hard.

I had come to a complete stop and was stationary for several seconds before the car behind hit me.

The cyclist rode off. I did not get their details.
`,
    },
    [CALL]: {
      kind: "audio",
      segments: [
        { voice: "Daniel", text: "Thank you for calling the claims line. Can you tell me what happened?" },
        { voice: "Samantha", text: "Someone braked in front of me this morning on Station Road, around twenty to nine. I was only doing about thirty. I didn't see any reason for them to stop." },
      ],
      creationTime: "2026-04-18T10:15:00Z",
    },
  },
  items: {
    [VIDEO]: {
      summary: "A 35-second forward-facing dashcam recording. The vehicle ahead brakes, the gap closes over about 3.4 seconds and an impact sound follows; the overlay shows a speed reading and a clock.",
      extraction_issues: ["The view to the sides of the lead vehicle is limited.", "The accuracy of the dashcam speed and clock is unknown."],
      observations: [
        {
          key: "v_clock",
          observation_type: "direct_observation",
          description: "The overlay reads 'DASHCAM 01' with a clock starting at 2026-04-18 08:41:50.",
          start_time_seconds: 0,
          end_time_seconds: 1,
          frame_window: [0, 3],
          event_time: { stated_text: "2026-04-18 08:41:50 (dashcam clock)", iso_datetime: "2026-04-18T08:41:50", precision: "exact", basis: "dashcam overlay (not verified)" },
        },
        {
          key: "v_speed",
          observation_type: "direct_observation",
          description: "The overlay speed reads 38 km/h while following the vehicle ahead.",
          quote: null,
          start_time_seconds: 0,
          end_time_seconds: 17.5,
          frame_window: [0, 17.5],
          requires_review: true,
          uncertainty_reason: "The dashcam's speed source (GPS or vehicle) and calibration are unknown.",
        },
        { key: "v_brake", observation_type: "direct_observation", description: "The lead vehicle's brake lights come on (dashcam clock about 08:42:07).", start_time_seconds: 17.6, end_time_seconds: 18.5, frame_window: [17.5, 19] },
        { key: "v_closing", observation_type: "direct_observation", description: "The gap to the lead vehicle closes over about 3.4 seconds while the overlay speed falls from 31 to 17 km/h.", start_time_seconds: 17.6, end_time_seconds: 21, frame_window: [17.5, 21] },
        { key: "v_impact", observation_type: "direct_observation", description: "A loud impact sound is heard and the overlay speed reads 0 km/h (dashcam clock about 08:42:11).", start_time_seconds: 21, end_time_seconds: 21.4 },
        {
          key: "v_nocyclist",
          observation_type: "direct_observation",
          description: "No cyclist or other road user is visible in frame in the seconds before the lead vehicle brakes.",
          start_time_seconds: 12,
          end_time_seconds: 18,
          frame_window: [12, 18],
          requires_review: true,
          uncertainty_reason: "The kerbside and the area ahead of the lead vehicle are partly out of view.",
        },
        {
          key: "v_comment",
          observation_type: "contributor_statement",
          description: "After the impact, a voice in the vehicle says the other driver braked for no reason.",
          quote: "He just slammed on the brakes for no reason",
          speaker_label: "Voice in vehicle (likely the driver; not established)",
        },
      ],
    },
    [PHOTO]: {
      summary: "A photograph of the rear of a dark red vehicle registered 'DEMO 123', with damage to the centre of the rear bumper.",
      extraction_issues: ["The photograph is undated."],
      observations: [
        { key: "p_plate", observation_type: "direct_observation", description: "The registration plate reads 'DEMO 123'.", quote: "DEMO 123", image_region: { x: 420, y: 430, width: 160, height: 70 } },
        { key: "p_damage", observation_type: "direct_observation", description: "The rear bumper has a dented, darker area at its centre.", image_region: { x: 460, y: 600, width: 140, height: 70 }, requires_review: true, uncertainty_reason: "Whether the damage is new cannot be determined from the image." },
      ],
    },
    [FORM]: {
      summary: "The policyholder's claim form: incident on 18 April 2026 at about 08:40 on Station Road, speed about 30 km/h, the vehicle in front braked suddenly and without reason.",
      extraction_issues: [],
      observations: [
        { key: "f_time", observation_type: "contributor_statement", description: "The form gives the incident time as approximately 08:40 on 18 April 2026.", quote: "Date and time of incident: 18 April 2026, approximately 08:40", page_number: 1, event_time: { stated_text: "18 April 2026, approximately 08:40", iso_datetime: "2026-04-18T08:40", precision: "approximate", basis: "stated by policyholder" } },
        { key: "f_speed", observation_type: "contributor_statement", description: "The policyholder states their speed was approximately 30 km/h.", quote: "Your speed at the time: approximately 30 km/h", page_number: 1 },
        { key: "f_desc", observation_type: "contributor_statement", description: "The policyholder says the vehicle in front braked suddenly and without reason, and they hit its rear bumper.", quote: "The vehicle in front braked suddenly and without reason", page_number: 1 },
        { key: "f_weather", observation_type: "contributor_statement", description: "The form records dry weather and good visibility.", quote: "Weather: dry, good visibility.", page_number: 1 },
        { key: "f_signed", observation_type: "extracted_document_fact", description: "The declaration is signed and dated 19 April 2026.", quote: "Date: 19 April 2026", page_number: 2, event_time: { stated_text: "19 April 2026", iso_datetime: "2026-04-19", precision: "day", basis: "form declaration" } },
      ],
    },
    [TP]: {
      summary: "The third-party driver's statement: braked hard for a cyclist at about 08:45, was stationary for several seconds before being hit, and the cyclist rode off.",
      extraction_issues: [],
      observations: [
        { key: "t_time", observation_type: "contributor_statement", description: "The third party gives the time as about 08:45 on 18 April 2026.", quote: "On 18 April 2026 at about 08:45", event_time: { stated_text: "18 April 2026 at about 08:45", iso_datetime: "2026-04-18T08:45", precision: "approximate", basis: "stated by third party" } },
        { key: "t_cyclist", observation_type: "contributor_statement", description: "The third party says they braked hard because a cyclist pulled out from the kerb on their left.", quote: "A cyclist pulled out from the kerb on my left without looking, so I braked hard.", requires_review: true, uncertainty_reason: "The cyclist is not identified and gave no statement." },
        { key: "t_stationary", observation_type: "contributor_statement", description: "The third party says they were stationary for several seconds before being hit.", quote: "I had come to a complete stop and was stationary for several seconds before the car behind hit me." },
        { key: "t_rodeoff", observation_type: "contributor_statement", description: "The cyclist rode off and no details were taken.", quote: "The cyclist rode off. I did not get their details." },
      ],
    },
    [CALL]: {
      summary: "A first-notification call: the policyholder says someone braked in front of them on Station Road around twenty to nine, they were doing about thirty, and they saw no reason to stop.",
      extraction_issues: ["Units of speed are not stated in the call."],
      observations: [
        { key: "c_agent", observation_type: "contributor_statement", description: "The call handler asks what happened.", quote: "Can you tell me what happened", speaker_label: "Call handler" },
        { key: "c_account", observation_type: "contributor_statement", description: "The caller says someone braked in front of them on Station Road that morning (the automatic transcript reads 'braced').", quote: "in front of me this morning on Station Road", speaker_label: "Caller (policyholder, as introduced)", event_time: { stated_text: "this morning, around twenty to nine", iso_datetime: null, precision: "approximate", basis: "stated by caller; call recorded 18 April" } },
        { key: "c_speed", observation_type: "contributor_statement", description: "The caller says they were only doing about thirty.", quote: "I was only doing about 30", speaker_label: "Caller (policyholder, as introduced)" },
        { key: "c_reason", observation_type: "contributor_statement", description: "The caller says they did not see any reason for the other driver to stop.", quote: "I didn't see any reason for them to stop", speaker_label: "Caller (policyholder, as introduced)" },
      ],
    },
  },
  case: {
    findings: [
      {
        title: "Policyholder's stated speed (about 30) is lower than the dashcam reading (38 km/h)",
        description: "The claim form and the call give about 30 km/h. The dashcam overlay shows 38 km/h while following the vehicle ahead, falling only once the lead vehicle brakes.",
        finding_type: "potential_discrepancy",
        refs: [F("f_speed"), C("c_speed"), V("v_speed")],
        relationship_explanation: "The difference may reflect an estimate by the driver, or an inaccurate dashcam speed source.",
        limitations: "The dashcam's speed calibration is unknown. Units are not given in the call.",
        requires_review: true,
      },
      {
        title: "Third party says they were stationary for several seconds; dashcam shows about 3.4 s from braking to impact",
        description: "The third party states they had stopped and were stationary for several seconds before being hit. On the dashcam the brake lights come on about 3.4 seconds before the impact and the gap is still closing until then.",
        finding_type: "potential_discrepancy",
        refs: [T("t_stationary"), V("v_brake"), V("v_closing"), V("v_impact")],
        relationship_explanation: "Perceived durations in a sudden stop are often inaccurate. The dashcam timing is measured, but the lead vehicle's own speed is not shown.",
        limitations: "Whether the lead vehicle had fully stopped cannot be determined from the footage.",
        requires_review: true,
      },
      {
        title: "Was there a cyclist? Not visible on the dashcam",
        description: "The third party says they braked for a cyclist pulling out from the left kerb. No cyclist is visible in the dashcam frames before braking, and the policyholder says there was nothing in front.",
        finding_type: "question",
        refs: [T("t_cyclist"), V("v_nocyclist"), V("v_comment"), C("c_reason")],
        relationship_explanation: "A cyclist close to the kerb ahead of the lead vehicle could be outside the dashcam's view.",
        limitations: "The cyclist was not identified. Other footage (e.g. roadside cameras) may help.",
        requires_review: true,
      },
      {
        title: "Rear-end impact and bumper damage are consistent across sources",
        description: "The dashcam records an impact as the gap closes, the claim form describes hitting the rear bumper, and the photograph shows damage to the centre of DEMO 123's rear bumper.",
        finding_type: "supporting_relationship",
        refs: [V("v_impact"), F("f_desc"), P("p_damage"), P("p_plate")],
        relationship_explanation: null,
        limitations: "The photograph is undated; whether the damage is all from this incident is not established.",
        requires_review: true,
      },
      {
        title: "Reported times (08:40–08:45) are broadly consistent with the dashcam clock (08:42)",
        description: "The claim form gives approximately 08:40, the call 'around twenty to nine', the third party about 08:45, and the dashcam clock about 08:42:11 at impact.",
        finding_type: "chronological_relationship",
        refs: [F("f_time"), C("c_account"), T("t_time"), V("v_clock"), V("v_impact")],
        relationship_explanation: "The differences are within normal estimation error.",
        limitations: "The dashcam clock is unverified.",
        requires_review: true,
      },
    ],
    chronology: [
      { description: "Policyholder's stated time of the incident.", iso_datetime: "2026-04-18T08:40", date_text: "approximately 08:40", precision: "approximate", refs: [F("f_time"), C("c_account")], relationship_note: null },
      { description: "Dashcam: lead vehicle brakes; impact about 3.4 s later (dashcam clock).", iso_datetime: "2026-04-18T08:42:07", date_text: "08:42:07–08:42:11 (dashcam clock)", precision: "approximate", refs: [V("v_clock"), V("v_brake"), V("v_impact")], relationship_note: null },
      { description: "Third party's stated time of the incident.", iso_datetime: "2026-04-18T08:45", date_text: "about 08:45", precision: "approximate", refs: [T("t_time")], relationship_note: null },
      { description: "Claim form declaration signed.", iso_datetime: "2026-04-19", date_text: "19 April 2026", precision: "day", refs: [F("f_signed")], relationship_note: null },
      { description: "Photograph of the third party's rear bumper.", iso_datetime: null, date_text: null, precision: "unknown", refs: [P("p_damage")], relationship_note: "Undated." },
    ],
    coverage_notes: ["DEMO: hand-written analysis, not AI output.", "No independent witness or roadside footage was provided."],
  },
};
