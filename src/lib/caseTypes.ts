// Case types and the checklist each one is built against. A checklist is a
// guide drawn from the relevant protocol or code of practice, not legal advice:
// it shows what a case of this kind usually needs and what this one has.

export interface ChecklistItem {
  key: string;
  label: string;
  /** Evidence of these types counts towards the item. */
  types?: string[];
  /** Observation or finding text containing any of these counts towards the item. */
  words?: string[];
}

export interface CaseType {
  key: string;
  label: string;
  industry: string;
  /** The guidance the checklist follows. */
  protocol: string;
  /** Words that suggest a case is of this type. */
  signals: string[];
  checklist: ChecklistItem[];
}

export const CASE_TYPES: CaseType[] = [
  {
    key: "anti_social_behaviour",
    label: "Anti-social behaviour",
    industry: "Social housing",
    protocol: "ASB case review (Anti-social Behaviour, Crime and Policing Act 2014)",
    signals: ["shouting", "noise", "disturbance", "nuisance", "loud", "music", "intimidat"],
    checklist: [
      { key: "incidents", label: "Incident reports with dates and times", types: ["audio", "written_account"], words: ["reports", "heard", "at about", "saturday", "o'clock"] },
      { key: "perpetrator", label: "Who is said to be responsible", words: ["identified", "named", "responsible", "perpetrator"] },
      { key: "pattern", label: "A pattern of incidents over time", words: ["second time", "again", "repeated", "previous", "before"] },
      { key: "impact", label: "Impact on neighbours or victims", words: ["afraid", "scared", "frightened", "impact", "unable to sleep", "distress"] },
      { key: "witness", label: "Witness accounts", types: ["written_account", "audio"], words: ["neighbour", "witness", "caller"] },
      { key: "log", label: "Incident diary or log", words: ["diary", "log", "record sheet"] },
    ],
  },
  {
    key: "housing_disrepair",
    label: "Housing disrepair",
    industry: "Social housing",
    protocol: "Pre-Action Protocol for Housing Conditions Claims (England)",
    signals: ["repair", "damage", "marks", "lock", "broken", "defect", "forced", "split", "replaced", "job"],
    checklist: [
      { key: "defect", label: "Description of the defect", words: ["damage", "marks", "broken", "split", "defect", "lock"] },
      { key: "photos", label: "Photographs of the defect", types: ["image"] },
      { key: "history", label: "Repair history", words: ["repair", "job", "replaced", "work order", "contractor"] },
      { key: "notice", label: "When the landlord was told", words: ["reported", "logged", "raised", "notified"] },
      { key: "impact", label: "Effect on the tenant (security, health, use of home)", words: ["secure", "unsafe", "cannot lock", "health", "cold", "damp"] },
      { key: "survey", label: "Inspection or surveyor's report", words: ["inspection", "survey", "surveyor", "inspected"] },
    ],
  },
  {
    key: "domestic_abuse",
    label: "Domestic abuse (safeguarding)",
    industry: "Social housing",
    protocol: "Domestic Abuse Act 2021 and DAHA housing standards",
    signals: ["abuse", "hit", "threat", "partner", "injur", "controlling", "afraid"],
    checklist: [
      { key: "disclosure", label: "Disclosure or report of abuse", words: ["abuse", "hit", "threat", "disclos"] },
      { key: "risk", label: "Risk assessment (e.g. DASH)", words: ["risk assessment", "dash", "marac"] },
      { key: "harm", label: "Injuries or damage", words: ["injur", "damage", "forced", "broken"] },
      { key: "pattern", label: "History or pattern", words: ["second time", "again", "repeated", "previous"] },
      { key: "referrals", label: "Referrals made (police, MARAC, support services)", words: ["referral", "referred", "police", "marac"] },
      { key: "safety", label: "Safety plan", words: ["safety plan", "safe", "refuge"] },
    ],
  },
  {
    key: "grievance",
    label: "Grievance",
    industry: "HR investigations",
    protocol: "Acas Code of Practice on Disciplinary and Grievance Procedures",
    signals: ["grievance", "complain", "unfair", "treated"],
    checklist: [
      { key: "complaint", label: "The written grievance", types: ["document", "written_account"], words: ["grievance", "complain"] },
      { key: "meeting", label: "Notes of the grievance meeting", words: ["meeting", "hearing", "interview"] },
      { key: "witnesses", label: "Witness statements", types: ["written_account", "audio"], words: ["witness", "says", "states"] },
      { key: "records", label: "Supporting records (rotas, logs, emails)", types: ["document"], words: ["rota", "log", "record", "email"] },
      { key: "response", label: "The other party's response", words: ["response", "account", "denies", "says they"] },
      { key: "outcome", label: "Outcome and right of appeal", words: ["outcome", "appeal", "decision"] },
    ],
  },
  {
    key: "misconduct",
    label: "Disciplinary (misconduct)",
    industry: "HR investigations",
    protocol: "Acas Code of Practice on Disciplinary and Grievance Procedures",
    signals: ["misconduct", "unauthorised", "left", "clock", "breach", "disciplinary", "absence"],
    checklist: [
      { key: "allegation", label: "The allegation, in writing", words: ["alleg", "misconduct", "breach"] },
      { key: "records", label: "Attendance or system records", types: ["document"], words: ["clock", "shift log", "rota", "records"] },
      { key: "investigation", label: "Investigation notes", words: ["investigation", "interview"] },
      { key: "explanation", label: "The employee's explanation", words: ["says", "account", "explain"] },
      { key: "policy", label: "The policy or rule said to be breached", words: ["policy", "rule", "procedure", "handbook"] },
      { key: "outcome", label: "Outcome and right of appeal", words: ["outcome", "appeal", "warning"] },
    ],
  },
  {
    key: "bullying_harassment",
    label: "Bullying and harassment",
    industry: "HR investigations",
    protocol: "Acas guidance on bullying and harassment; Equality Act 2010",
    signals: ["shout", "swore", "harass", "bully", "intimidat", "abusive", "upset"],
    checklist: [
      { key: "incidents", label: "What was said or done, and when", words: ["shout", "swore", "said", "at about"] },
      { key: "witnesses", label: "Witness accounts", types: ["written_account", "audio"], words: ["witness", "heard", "saw"] },
      { key: "footage", label: "Footage or recordings", types: ["video", "audio"] },
      { key: "pattern", label: "Any pattern or earlier incidents", words: ["similar incident", "again", "previous", "before"] },
      { key: "impact", label: "Effect on the person", words: ["upset", "distress", "afraid", "impact"] },
      { key: "response", label: "The other person's account", words: ["supervisor's account", "response", "denies", "says they spoke"] },
    ],
  },
  {
    key: "personal_injury",
    label: "Personal injury claim",
    industry: "Legal services",
    protocol: "Pre-Action Protocol for Personal Injury Claims",
    signals: ["injur", "slipped", "fell", "collision", "claimant", "whiplash", "accident"],
    checklist: [
      { key: "account", label: "The claimant's account of how it happened", types: ["written_account", "audio"], words: ["claimant", "says", "slipped", "hit"] },
      { key: "footage", label: "Footage or photographs of the scene", types: ["video", "image"] },
      { key: "record", label: "Accident record or report", types: ["document"], words: ["accident book", "incident report", "claim form", "record"] },
      { key: "injury", label: "The injury and its effect", words: ["injur", "pain", "hospital", "treatment", "whiplash"] },
      { key: "liability", label: "What was in place to prevent it", words: ["warning sign", "cleaned", "inspection", "braking", "speed"] },
      { key: "response", label: "The defendant's response", words: ["denies", "response", "says the sign", "disputes"] },
    ],
  },
  {
    key: "employment_tribunal",
    label: "Employment tribunal claim",
    industry: "Legal services",
    protocol: "Employment Tribunals Rules of Procedure; Acas Code of Practice",
    signals: ["tribunal", "grievance", "dismiss", "shouted", "swore", "supervisor", "unfair"],
    checklist: [
      { key: "grievance", label: "The grievance or complaint raised at work", types: ["document", "written_account"], words: ["grievance", "complain"] },
      { key: "incidents", label: "What was said or done, and when", words: ["shout", "swore", "said", "at about"] },
      { key: "records", label: "Rotas, clock records or emails", types: ["document"], words: ["rota", "clock", "log", "email"] },
      { key: "witnesses", label: "Witness accounts", types: ["written_account", "audio"], words: ["witness", "heard", "saw"] },
      { key: "response", label: "The employer's response", words: ["response", "denies", "says they", "account"] },
      { key: "process", label: "How the grievance was handled", words: ["meeting", "outcome", "appeal", "investigation"] },
    ],
  },
  {
    key: "construction_delay",
    label: "Construction delay claim",
    industry: "Legal services",
    protocol: "Pre-Action Protocol for Construction and Engineering Disputes",
    signals: ["delay", "extension", "pour", "site", "contractor", "programme", "weather"],
    checklist: [
      { key: "event", label: "The delaying event and when it happened", words: ["delay", "late", "arrived", "pump"] },
      { key: "diary", label: "Site diary or daily records", types: ["document"], words: ["diary", "daily", "site record"] },
      { key: "notice", label: "Notice given under the contract", words: ["notice", "notified", "delay notice"] },
      { key: "weather", label: "Weather records", words: ["weather", "rain", "met office"] },
      { key: "correspondence", label: "Correspondence with the other side", types: ["document"], words: ["email", "letter", "meeting"] },
      { key: "footage", label: "Footage or photographs of the site", types: ["video", "image"] },
    ],
  },
];

export const caseType = (key: string | null | undefined) => CASE_TYPES.find((t) => t.key === key) ?? null;
export const typesFor = (industry: string | null | undefined) => CASE_TYPES.filter((t) => t.industry === industry);
