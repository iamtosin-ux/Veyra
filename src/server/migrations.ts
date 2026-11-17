/**
 * Ordered, append-only schema migrations. Never edit an applied migration;
 * add a new one instead.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  reference TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  evidence_seq INTEGER NOT NULL DEFAULT 0,
  observation_seq INTEGER NOT NULL DEFAULT 0,
  finding_seq INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organisation_id, reference)
);

-- Original files are immutable; everything AI-derived lives in other tables.
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('video','image','audio','document','written_account')),
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_reference TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  duplicate_of TEXT REFERENCES evidence(id),
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','queued','processing','processed','failed')),
  processing_error TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  UNIQUE (case_id, reference)
);
CREATE INDEX evidence_case ON evidence(case_id);
CREATE INDEX evidence_hash ON evidence(case_id, file_hash);

-- Machine extraction output (transcripts, page text, sampled frames...).
CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'ok',
  quality_note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX extractions_evidence ON extractions(evidence_id);

CREATE TABLE analysis_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('evidence','segment','case')),
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  stage TEXT,
  model_identifier TEXT,
  processing_configuration TEXT NOT NULL DEFAULT '{}',
  evidence_hash TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX runs_case ON analysis_runs(case_id);

-- Token / media usage per AI call, for cost tracking.
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  images_sent INTEGER NOT NULL DEFAULT 0,
  media_seconds REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- AI output that failed validation is kept, not silently dropped.
CREATE TABLE validation_rejections (
  id TEXT PRIMARY KEY,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  observation_type TEXT NOT NULL CHECK (observation_type IN
    ('direct_observation','contributor_statement','extracted_document_fact','ai_inference','potential_discrepancy','unresolved_question')),
  modality TEXT NOT NULL,
  description TEXT NOT NULL,
  quote TEXT,
  source_reference TEXT NOT NULL,
  event_time TEXT,
  uncertainty TEXT NOT NULL DEFAULT '{}',
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  superseded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (case_id, reference)
);
CREATE INDEX observations_evidence ON observations(evidence_id);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN
    ('observation','supporting_relationship','potential_discrepancy','chronological_relationship','missing_information','question')),
  relationship_explanation TEXT,
  uncertainty TEXT NOT NULL DEFAULT '{}',
  review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','accepted','corrected','rejected')),
  superseded INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (case_id, reference)
);
CREATE INDEX findings_case ON findings(case_id);

CREATE TABLE finding_sources (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  source_reference TEXT NOT NULL
);
CREATE INDEX finding_sources_finding ON finding_sources(finding_id);

CREATE TABLE finding_reviews (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('accept','correct','reject','reset')),
  previous_content TEXT NOT NULL,
  updated_content TEXT,
  review_note TEXT,
  reviewed_at TEXT NOT NULL
);
CREATE INDEX finding_reviews_finding ON finding_reviews(finding_id);

CREATE TABLE chronology_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  event_datetime TEXT,
  date_text TEXT,
  time_precision TEXT NOT NULL,
  observation_ids TEXT NOT NULL,
  evidence_ids TEXT NOT NULL,
  relationship_note TEXT,
  review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','accepted','rejected')),
  superseded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE case_packs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  include_unreviewed INTEGER NOT NULL DEFAULT 0,
  finding_snapshot TEXT NOT NULL,
  generated_by TEXT REFERENCES users(id),
  generated_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft'
);

-- Durable job queue shared by web server and worker processes.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  heartbeat_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_status ON jobs(status, created_at);
`,
  },
  {
    version: 2,
    sql: `ALTER TABLE cases ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 3,
    sql: `ALTER TABLE cases ADD COLUMN industry TEXT;
ALTER TABLE cases ADD COLUMN demo_scenario TEXT;
UPDATE cases SET demo_scenario = 'social-housing', industry = 'Social housing' WHERE is_demo = 1;`,
  },
  {
    version: 4,
    sql: `CREATE TABLE case_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  author_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX case_messages_case ON case_messages(case_id, created_at);`,
  },
  {
    version: 5,
    sql: `ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX users_username ON users(username) WHERE username IS NOT NULL;`,
  },
  {
    version: 6,
    sql: `
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('analyse','review','custom')),
  steps TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX workflows_org ON workflows(organisation_id);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  steps TEXT NOT NULL,
  result TEXT,
  error TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX workflow_runs_case ON workflow_runs(case_id);

-- Integrity / provenance indicators per evidence item (separate from the original).
CREATE TABLE integrity_reports (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('clear','info','indicator','strong','critical')),
  report TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX integrity_evidence ON integrity_reports(evidence_id, created_at);

-- Links that let people without an account upload into a case folder.
CREATE TABLE upload_invites (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  uploads INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX upload_invites_case ON upload_invites(case_id);
`,
  },
  {
    version: 7,
    sql: `ALTER TABLE cases ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 8,
    sql: `
-- Projects group related cases (e.g. one tenancy, one employee, one site).
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX projects_org ON projects(organisation_id);
ALTER TABLE cases ADD COLUMN project_id TEXT REFERENCES projects(id);
`,
  },
  {
    version: 9,
    sql: `
-- Teams that sections can be tagged to for review.
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX teams_name ON teams(organisation_id, name COLLATE NOCASE);

-- Human-in-the-loop: a person or team asked to review one section of a case.
CREATE TABLE section_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  assignee TEXT NOT NULL,
  assignee_kind TEXT NOT NULL CHECK (assignee_kind IN ('person','team')),
  assignee_user_id TEXT REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX section_assignments_case ON section_assignments(case_id, status);

-- Web material proposed for a section. Kept apart from evidence; only
-- approved items appear in the case pack, always labelled as web sources.
CREATE TABLE web_sources (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  relevance TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL CHECK (origin IN ('link','search')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','dismissed')),
  retrieved_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT
);
CREATE INDEX web_sources_case ON web_sources(case_id, status);

-- Saved views in a case's task strip.
CREATE TABLE task_views (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kinds TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Who an upload link is for, and how they relate to the case.
ALTER TABLE upload_invites ADD COLUMN relationship TEXT;
ALTER TABLE upload_invites ADD COLUMN contact TEXT;
`,
  },
  {
    version: 10,
    sql: `ALTER TABLE cases ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 11,
    sql: `ALTER TABLE case_packs ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE case_packs ADD COLUMN approved_at TEXT;`,
  },
  {
    version: 12,
    sql: `ALTER TABLE cases ADD COLUMN summary TEXT;
ALTER TABLE cases ADD COLUMN summary_source TEXT;`,
  },
  {
    version: 13,
    sql: `ALTER TABLE cases ADD COLUMN section_settings TEXT NOT NULL DEFAULT '{}';`,
  },
  {
    version: 14,
    sql: `
-- One-time sign-in codes sent by email. Only a hash of the code is stored.
CREATE TABLE login_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX login_codes_user ON login_codes(user_id, created_at);
`,
  },
  {
    version: 15,
    sql: `
-- Private projects are seen only by the person who made them; public ones by the whole organisation.
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'public'));
`,
  },
  {
    version: 16,
    sql: `
-- A reviewer's decision on a flagged integrity result: keep the file, or ask its contributor for a replacement.
CREATE TABLE integrity_reviews (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('kept', 'replacement_requested')),
  note TEXT,
  invite_id TEXT,
  decided_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX integrity_reviews_evidence ON integrity_reviews(evidence_id, created_at);
`,
  },
  {
    version: 17,
    sql: `
-- Evidence Integrity & Compliance Guard. Processing needs an approved policy;
-- every decision is audited. Policies are versioned and never edited in place.
CREATE TABLE processing_policies (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'superseded')),
  config TEXT NOT NULL,
  approved_by TEXT REFERENCES users(id),
  approver_name TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organisation_id, version)
);

CREATE TABLE processing_audit (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  case_id TEXT,
  evidence_id TEXT,
  actor_user_id TEXT,
  actor TEXT NOT NULL,
  operation TEXT NOT NULL,
  purpose TEXT,
  policy_id TEXT,
  policy_version INTEGER,
  decision TEXT NOT NULL CHECK (decision IN ('ALLOW', 'REVIEW_REQUIRED', 'BLOCK', 'RECORDED')),
  reason_codes TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL DEFAULT '',
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'decided',
  result_ref TEXT,
  model_version TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX processing_audit_org ON processing_audit(organisation_id, created_at);
CREATE INDEX processing_audit_evidence ON processing_audit(evidence_id, created_at);

ALTER TABLE evidence ADD COLUMN compliance_status TEXT NOT NULL DEFAULT 'PENDING_COMPLIANCE_REVIEW'
  CHECK (compliance_status IN ('PENDING_COMPLIANCE_REVIEW', 'APPROVED', 'REVIEW_REQUIRED', 'RESTRICTED', 'BLOCKED'));
ALTER TABLE evidence ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE evidence ADD COLUMN category_source TEXT NOT NULL DEFAULT 'default';
ALTER TABLE evidence ADD COLUMN category_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN declared_source TEXT;
ALTER TABLE evidence ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE evidence ADD COLUMN compliance_reasons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE evidence ADD COLUMN human_approval TEXT;
ALTER TABLE analysis_runs ADD COLUMN policy_id TEXT;
ALTER TABLE analysis_runs ADD COLUMN policy_version INTEGER;

-- Existing organisations in this prototype hold synthetic demo data only, so they get a
-- mock approved policy. Organisations created from now on start with none and are blocked.
INSERT INTO processing_policies (id, organisation_id, version, status, config, approved_by, approver_name, approved_at, created_at)
  SELECT lower(hex(randomblob(16))), id, 1, 'approved', '{"label": "Mock approved policy (synthetic demo data only)", "controller": "Demo Litigation LLP (synthetic)", "veyra_role": "processor", "processing_instructions": "Process uploaded case evidence only to prepare source-linked case files for the controller''s reviewers.", "purpose": "Preparing evidence for employment and housing dispute investigations on behalf of the controller.", "lawful_basis": "legitimate_interests", "special_category_condition": "", "criminal_offence_condition": "", "schedule1_conditions": "", "appropriate_policy_document": false, "categories": ["general", "photo_video", "communications", "employment", "legal", "third_party"], "operations": ["text_extraction", "transcription", "frame_analysis", "image_analysis", "document_classification", "observations", "chronology", "cross_evidence", "case_preparation", "assistant_answer", "web_research"], "providers": ["anthropic"], "transfer_arrangements": "Synthetic demo: provider covered by the controller''s processing agreement and transfer assessment.", "retention_days": 365, "roles": ["admin", "member"], "external_verification": false, "verification_providers": [], "dpia_required": true, "dpia_status": "approved"}', NULL, 'Mock approval (prototype seed)', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM organisations;
`,
  },
  {
    version: 18,
    sql: `
-- Legal hold keeps a case's evidence out of retention deletion until it's released.
ALTER TABLE cases ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN legal_hold_reason TEXT;
`,
  },
  {
    version: 19,
    sql: `
-- Consent, where an organisation relies on it. Never inferred from an upload.
CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  subject_contact TEXT,
  purpose TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('written', 'electronic', 'verbal')),
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  given_at TEXT NOT NULL,
  recorded_by TEXT REFERENCES users(id),
  withdrawn_at TEXT,
  withdrawn_reason TEXT,
  withdrawn_recorded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX consent_case ON consent_records(case_id);

-- Data-subject rights requests (access, erasure) and their statutory deadline.
CREATE TABLE subject_requests (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'erasure')),
  subject_name TEXT NOT NULL,
  identifiers TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'refused')),
  received_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  notes TEXT,
  outcome TEXT,
  created_by TEXT REFERENCES users(id),
  completed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX subject_requests_org ON subject_requests(organisation_id, status);

-- A finding that may no longer hold because something it relied on changed.
ALTER TABLE findings ADD COLUMN reassess_reason TEXT;
ALTER TABLE findings ADD COLUMN reassess_at TEXT;
ALTER TABLE chronology_events ADD COLUMN reassess_reason TEXT;
`,
  },
  {
    version: 20,
    sql: `
-- A name the team gives an item. The original filename stays as uploaded, for provenance.
ALTER TABLE evidence ADD COLUMN display_name TEXT;
`,
  },
  {
    version: 21,
    sql: `
-- Insights are never deleted. Archiving takes one out of the case view and the
-- pack while keeping it, and its history, recoverable.
ALTER TABLE findings ADD COLUMN archived_at TEXT;
`,
  },
  {
    version: 22,
    sql: `
-- Archiving and restoring an insight are review actions, recorded in its history.
CREATE TABLE finding_reviews_v22 (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('accept','correct','reject','reset','archive','unarchive')),
  previous_content TEXT NOT NULL,
  updated_content TEXT,
  review_note TEXT,
  reviewed_at TEXT NOT NULL
);
INSERT INTO finding_reviews_v22 SELECT id, finding_id, reviewer_id, action, previous_content, updated_content, review_note, reviewed_at FROM finding_reviews;
DROP TABLE finding_reviews;
ALTER TABLE finding_reviews_v22 RENAME TO finding_reviews;
CREATE INDEX finding_reviews_finding ON finding_reviews(finding_id);
`,
  },
  {
    version: 23,
    sql: `
-- Deleting a case moves it to the trash first; it is erased after 30 days or on request.
ALTER TABLE cases ADD COLUMN deleted_at TEXT;
ALTER TABLE cases ADD COLUMN deleted_by TEXT REFERENCES users(id);

-- Problems reported from inside the app, with where the person was.
CREATE TABLE problem_reports (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  user_id TEXT REFERENCES users(id),
  message TEXT NOT NULL,
  page TEXT,
  created_at TEXT NOT NULL
);
`,
  },
  {
    version: 24,
    sql: `
-- Published judgments a reviewer has linked to a finding as a precedent. Only the
-- reference is kept (citation, court, date, link), not the judgment text.
CREATE TABLE finding_precedents (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  citation TEXT,
  title TEXT NOT NULL,
  court TEXT,
  judgment_date TEXT,
  url TEXT NOT NULL,
  note TEXT,
  added_by TEXT REFERENCES users(id),
  added_at TEXT NOT NULL
);
CREATE UNIQUE INDEX finding_precedents_unique ON finding_precedents(finding_id, url);
`,
  },
  {
    version: 25,
    sql: `
-- Vault folders are separate from cases. A folder is a cases row with kind 'folder'
-- so it keeps the vault's upload, integrity, compliance and invite handling; case
-- lists exclude folders. A case uses a vault file through its own evidence row
-- (own reference, own analysis) that points back with vault_item_id and shares
-- the stored original.
ALTER TABLE cases ADD COLUMN kind TEXT NOT NULL DEFAULT 'case' CHECK (kind IN ('case', 'folder'));
ALTER TABLE evidence ADD COLUMN vault_item_id TEXT REFERENCES evidence(id);
CREATE INDEX evidence_vault_item ON evidence(vault_item_id);

-- Existing evidence goes into one "Imported" folder per organisation, still linked to its case.
INSERT INTO cases (id, organisation_id, reference, title, description, created_by, created_at, updated_at, kind)
SELECT lower(hex(randomblob(16))), o.organisation_id, 'VAULT-IMPORTED', 'Imported', '', NULL,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'folder'
  FROM (SELECT DISTINCT c.organisation_id FROM evidence e JOIN cases c ON c.id = e.case_id) o;

INSERT INTO evidence (id, case_id, reference, original_filename, evidence_type, mime_type, file_size, storage_reference,
       file_hash, uploaded_at, uploaded_by, processing_status, metadata, compliance_status, category, category_source,
       category_confirmed, declared_source, verification_status, compliance_reasons, human_approval, display_name)
SELECT 'v-' || e.id, f.id, 'EVD-' || printf('%03d', row_number() OVER (PARTITION BY f.id ORDER BY e.uploaded_at, e.id)),
       e.original_filename, e.evidence_type, e.mime_type, e.file_size, e.storage_reference, e.file_hash, e.uploaded_at,
       e.uploaded_by, 'pending', e.metadata, e.compliance_status, e.category, e.category_source, e.category_confirmed,
       e.declared_source, e.verification_status, e.compliance_reasons, e.human_approval, e.display_name
  FROM evidence e
  JOIN cases c ON c.id = e.case_id AND c.kind = 'case'
  JOIN cases f ON f.organisation_id = c.organisation_id AND f.kind = 'folder' AND f.reference = 'VAULT-IMPORTED';

UPDATE evidence SET vault_item_id = 'v-' || id
 WHERE case_id IN (SELECT id FROM cases WHERE kind = 'case') AND EXISTS (SELECT 1 FROM evidence v WHERE v.id = 'v-' || evidence.id);
UPDATE cases SET evidence_seq = (SELECT COUNT(*) FROM evidence WHERE case_id = cases.id) WHERE kind = 'folder';

-- Carry integrity results over so imported files don't all show as unscanned.
INSERT INTO integrity_reports (id, evidence_id, case_id, level, report, created_at)
SELECT 'v-' || r.id, v.id, v.case_id, r.level, r.report, r.created_at
  FROM integrity_reports r JOIN evidence v ON v.id = 'v-' || r.evidence_id;
`,
  },
  {
    version: 26,
    sql: `
-- Folders can be nested, and a top-level folder can belong to a case (its case folder).
-- Any case can still use files from any folder.
ALTER TABLE cases ADD COLUMN parent_id TEXT REFERENCES cases(id);
ALTER TABLE cases ADD COLUMN case_id TEXT REFERENCES cases(id);
CREATE INDEX cases_parent ON cases(parent_id);
CREATE INDEX cases_case_folder ON cases(case_id);

-- Files imported in version 25 move from "Imported" into a folder for the case they came from.
CREATE TEMP TABLE imported_rows AS
SELECT v.id, v.uploaded_at, e.case_id owner
  FROM evidence v
  JOIN cases f ON f.id = v.case_id AND f.kind = 'folder' AND f.reference = 'VAULT-IMPORTED'
  JOIN evidence e ON e.id = substr(v.id, 3);

INSERT INTO cases (id, organisation_id, reference, title, description, created_by, created_at, updated_at, kind, case_id)
SELECT lower(hex(randomblob(16))), c.organisation_id, 'VAULT-' || c.reference, c.title, '', c.created_by,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'folder', c.id
  FROM cases c WHERE c.id IN (SELECT owner FROM imported_rows);

CREATE TEMP TABLE imported_moves AS
SELECT r.id, nf.id folder, 'EVD-' || printf('%03d', row_number() OVER (PARTITION BY nf.id ORDER BY r.uploaded_at, r.id)) ref
  FROM imported_rows r JOIN cases nf ON nf.case_id = r.owner AND nf.kind = 'folder';

UPDATE evidence SET case_id = (SELECT folder FROM imported_moves m WHERE m.id = evidence.id),
                    reference = (SELECT ref FROM imported_moves m WHERE m.id = evidence.id)
 WHERE id IN (SELECT id FROM imported_moves);
UPDATE integrity_reports SET case_id = (SELECT folder FROM imported_moves m WHERE m.id = integrity_reports.evidence_id)
 WHERE evidence_id IN (SELECT id FROM imported_moves);
UPDATE integrity_reviews SET case_id = (SELECT folder FROM imported_moves m WHERE m.id = integrity_reviews.evidence_id)
 WHERE evidence_id IN (SELECT id FROM imported_moves);
UPDATE cases SET evidence_seq = (SELECT COUNT(*) FROM evidence WHERE case_id = cases.id) WHERE kind = 'folder';

-- The emptied "Imported" folder goes, unless something else refers to it.
DELETE FROM cases WHERE kind = 'folder' AND reference = 'VAULT-IMPORTED'
   AND NOT EXISTS (SELECT 1 FROM evidence WHERE case_id = cases.id)
   AND NOT EXISTS (SELECT 1 FROM upload_invites WHERE case_id = cases.id)
   AND NOT EXISTS (SELECT 1 FROM case_messages WHERE case_id = cases.id)
   AND NOT EXISTS (SELECT 1 FROM processing_audit WHERE case_id = cases.id)
   AND NOT EXISTS (SELECT 1 FROM consent_records WHERE case_id = cases.id);

DROP TABLE imported_moves;
DROP TABLE imported_rows;
`,
  },
  {
    version: 27,
    sql: `
-- Each person's choice about their chats and feedback being used to improve Veyra's AI. Off unless they opt in.
ALTER TABLE users ADD COLUMN ai_training INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ai_training_changed_at TEXT;
`,
  },
  {
    version: 28,
    sql: `
-- Account settings: email notifications (on by default) and self-service account deletion.
-- A deleted account is anonymised, not removed, so the work it did stays attributed to "Deleted user".
ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
`,
  },
  {
    version: 29,
    sql: `
-- Who works on a case besides its owner (the person who created it), and who may open it.
-- 'workspace' keeps today's behaviour; 'invited' limits the case to its owner, its members and admins.
CREATE TABLE case_members (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','editor','viewer')),
  invited_by TEXT REFERENCES users(id),
  invited_at TEXT NOT NULL,
  UNIQUE (case_id, email)
);
CREATE INDEX case_members_user ON case_members(user_id);
ALTER TABLE cases ADD COLUMN access TEXT NOT NULL DEFAULT 'workspace' CHECK (access IN ('workspace','invited'));
`,
  },
  {
    version: 30,
    sql: `
-- The kind of case being built (see src/lib/caseTypes.ts), and each offered handoff
-- to a different kind: dismissed ones aren't offered again, committed ones record the change.
ALTER TABLE cases ADD COLUMN case_type TEXT;
CREATE TABLE case_handoffs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_type TEXT,
  to_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('dismissed','committed')),
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX case_handoffs_case ON case_handoffs(case_id);
-- The social housing sample was reported as anti-social behaviour.
UPDATE cases SET case_type = 'anti_social_behaviour' WHERE demo_scenario = 'social-housing' AND kind = 'case';
`,
  },
  {
    version: 31,
    sql: `
-- Sections a user asked Veyra to add to the case canvas, after the built-in ones.
CREATE TABLE canvas_sections (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('chronology','evidence','map')),
  title TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX canvas_sections_case ON canvas_sections(case_id, position);
`,
  },
  {
    version: 32,
    sql: `
-- A reviewer's own order for the chronology. Unset means date order.
ALTER TABLE chronology_events ADD COLUMN position INTEGER;
`,
  },
  {
    version: 33,
    sql: `
-- Things that happened in the case itself (filings, hearings, police attendance, notices),
-- recorded by people and shown in the chronology alongside events drawn from evidence.
CREATE TABLE case_activities (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  occurred_at TEXT,
  position INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX case_activities_case ON case_activities(case_id);
`,
  },
  {
    version: 34,
    sql: `
-- Each upload request also has its own email address: mail sent to it becomes evidence.
-- The key is part of the address, so it is stored as is; like the link, it only allows sending in.
ALTER TABLE upload_invites ADD COLUMN inbox_key TEXT;
UPDATE upload_invites SET inbox_key = lower(hex(randomblob(9))) WHERE inbox_key IS NULL;
CREATE UNIQUE INDEX upload_invites_inbox ON upload_invites(inbox_key);
`,
  },
  {
    version: 35,
    sql: `
-- The inbox is derived from real records; each person's read state is when they last marked it read.
ALTER TABLE users ADD COLUMN inbox_seen_at TEXT;
`,
  },
  {
    version: 36,
    sql: `
-- Who last handed a case to its owner, and when, so the new owner hears about it.
ALTER TABLE cases ADD COLUMN transferred_by TEXT REFERENCES users(id);
ALTER TABLE cases ADD COLUMN transferred_at TEXT;
`,
  },
  {
    version: 37,
    sql: `
-- The canvas template a case was given by hand; empty means its case type's (or General).
ALTER TABLE cases ADD COLUMN canvas_template TEXT;
`,
  },
];
