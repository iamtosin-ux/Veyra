import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Isolated data directory per test run; set before server modules load.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ei-test-"));
process.env.DATA_DIR = dir;
process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { createInitialAdmin, authenticate, setAdminLogin } = await import("@/server/auth");
const cases = await import("@/server/cases");
const evidence = await import("@/server/evidence");
const { reviewFinding, listFindings, originalVersion } = await import("@/server/findings");
const { storeObservations } = await import("@/server/analysis/evidencePipeline");
const { generateCasePack, getCasePack } = await import("@/server/casepack");
const { run, now, get } = await import("@/server/db");
const { originalPath } = await import("@/server/storage");
const { claimNextJob, recoverStaleJobs } = await import("@/server/jobs");
const invites = await import("@/server/invites");
const { reviewCase } = await import("@/server/analysis/caseReview");

const { approvePolicy } = await import("@/server/compliance/policy");
const { callStructured } = await import("@/server/ai/client");
const { z } = await import("zod");
const { MOCK_APPROVED_POLICY, MOCK_RESTRICTED_POLICY } = await import("@/lib/mockPolicies");

let user: ReturnType<typeof createInitialAdmin>;
beforeAll(() => {
  user = createInitialAdmin({ organisation: "Test LLP", name: "Reviewer", username: "reviewer", password: "correct horse battery" });
  // Synthetic test data only: the organisation approves the mock policy before any analysis.
  approvePolicy(user, MOCK_APPROVED_POLICY);
});

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

describe("sign-in", () => {
  it("signs in with username and password, case-insensitively, and rejects wrong passwords", () => {
    expect(authenticate("reviewer", "correct horse battery")?.id).toBe(user.id);
    expect(authenticate("  Reviewer ", "correct horse battery")?.id).toBe(user.id);
    expect(authenticate("reviewer", "wrong")).toBeNull();
    expect(authenticate("nobody", "correct horse battery")).toBeNull();
  });
  it("can change the admin's username and password", () => {
    setAdminLogin("admin", "12345");
    expect(authenticate("admin", "12345")?.id).toBe(user.id);
    expect(authenticate("reviewer", "correct horse battery")).toBeNull();
  });
});

describe("case status derivation", () => {
  const base = { evidence: 0, evidenceFailed: 0, activeJobs: 0, completedCaseRuns: 0, latestCaseRunFailed: false, activeFindings: 0, unreviewedFindings: 0 };
  it("follows real state", () => {
    expect(cases.deriveCaseStatus(base)).toBe("created");
    expect(cases.deriveCaseStatus({ ...base, evidence: 2 })).toBe("evidence_uploaded");
    expect(cases.deriveCaseStatus({ ...base, evidence: 2, activeJobs: 1 })).toBe("analysis_in_progress");
    expect(cases.deriveCaseStatus({ ...base, evidence: 2, evidenceFailed: 1 })).toBe("error");
    expect(cases.deriveCaseStatus({ ...base, evidence: 2, completedCaseRuns: 1, activeFindings: 3, unreviewedFindings: 1 })).toBe("ready_for_review");
    expect(cases.deriveCaseStatus({ ...base, evidence: 2, completedCaseRuns: 1, activeFindings: 3 })).toBe("reviewed");
  });
});

describe("uploads", () => {
  it("stores originals read-only, assigns references and flags duplicates without deleting", () => {
    const c = cases.createCase(user, "Upload case", "");
    const a = evidence.addEvidence(user, c.id, "photo.png", png);
    const b = evidence.addEvidence(user, c.id, "photo-copy.png", png);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.evidence.reference).toBe("EVD-001");
    expect(b.evidence.reference).toBe("EVD-002");
    expect(b.duplicate_of_reference).toBe("EVD-001");
    expect(evidence.listEvidence(c.id)).toHaveLength(2);
    const row = evidence.getEvidence(a.evidence.id)!;
    expect(fs.statSync(originalPath(row.storage_reference)).mode & 0o222).toBe(0);
  });

  it("rejects unsupported or mislabelled files without affecting others", () => {
    const c = cases.createCase(user, "Bad uploads", "");
    expect(evidence.addEvidence(user, c.id, "malware.exe", Buffer.from("MZ"))).toMatchObject({ ok: false });
    expect(evidence.addEvidence(user, c.id, "fake.png", Buffer.from("not a png"))).toMatchObject({ ok: false });
    expect(evidence.addEvidence(user, c.id, "ok.txt", Buffer.from("A written account."))).toMatchObject({ ok: true });
    expect(evidence.listEvidence(c.id)).toHaveLength(1);
  });

  it("isolates cases between organisations", () => {
    const c = cases.createCase(user, "Private", "");
    const other = { ...user, organisation_id: "another-org" };
    expect(() => cases.getCaseForUser(other, c.id)).toThrow(/not found/i);
  });

  it("re-processing reuses the evidence record", () => {
    const c = cases.createCase(user, "Retry", "");
    const a = evidence.addEvidence(user, c.id, "note.txt", Buffer.from("hello"));
    if (!a.ok) throw new Error();
    evidence.queueEvidenceProcessing(user, a.evidence.id);
    expect(() => evidence.queueEvidenceProcessing(user, a.evidence.id)).toThrow(/already being processed/);
    run("UPDATE analysis_runs SET status = 'failed' WHERE evidence_id = ?", a.evidence.id);
    evidence.queueEvidenceProcessing(user, a.evidence.id);
    expect(evidence.listEvidence(c.id)).toHaveLength(1);
  });
});

describe("jobs", () => {
  it("re-queues jobs whose worker stopped responding", () => {
    while (claimNextJob()) {
      /* drain */
    }
    run("INSERT INTO jobs (id, kind, payload, status, attempts, heartbeat_at, created_at, updated_at) VALUES ('j1', 'process_evidence', '{}', 'running', 1, '2000-01-01', ?, ?)", now(), now());
    recoverStaleJobs();
    expect(get<{ status: string }>("SELECT status FROM jobs WHERE id = 'j1'")?.status).toBe("queued");
  });
});

describe("review workflow", () => {
  function setup() {
    const c = cases.createCase(user, "Review", "");
    const up = evidence.addEvidence(user, c.id, "statement.txt", Buffer.from("I heard a bang at about 2pm."));
    if (!up.ok) throw new Error();
    const e = evidence.getEvidence(up.evidence.id)!;
    const runId = "run-" + c.id;
    run("INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, created_at) VALUES (?, ?, ?, 'evidence', 'completed', ?)", runId, c.id, e.id, now());
    const refs = storeObservations(
      e,
      runId,
      [
        {
          observation_type: "contributor_statement",
          description: "Author states they heard a bang at about 2pm.",
          quote: "I heard a bang at about 2pm",
          start_time_seconds: null,
          end_time_seconds: null,
          frame_times: [],
          transcript_segment_ids: [],
          page_number: null,
          image_region: null,
          event_time: null,
          speaker_label: null,
          requires_review: false,
          uncertainty_reason: null,
        },
      ],
      { evidenceType: "written_account", durationSeconds: null, sampledFrameTimes: [], transcript: null, pages: [{ page_number: 1, text: "I heard a bang at about 2pm." }], paginated: false, unverifiablePages: [] },
      { supersedePrevious: true },
    );
    expect(refs).toEqual(["OBS-001"]);
    const obsId = get<{ id: string }>("SELECT id FROM observations WHERE case_id = ?", c.id)!.id;
    const caseRun = "case-" + c.id;
    run("INSERT INTO analysis_runs (id, case_id, scope, status, created_at) VALUES (?, ?, 'case', 'completed', ?)", caseRun, c.id, now());
    const fid = "f-" + c.id;
    run(
      `INSERT INTO findings (id, case_id, analysis_run_id, reference, title, description, finding_type, uncertainty, created_at, updated_at)
       VALUES (?, ?, ?, 'FND-001', 'Reported bang', 'The author reports a bang at about 2pm.', 'observation', '{}', ?, ?)`,
      fid,
      c.id,
      caseRun,
      now(),
      now(),
    );
    run("INSERT INTO finding_sources (id, finding_id, observation_id, evidence_id, source_reference) VALUES (?, ?, ?, ?, '{}')", "fs-" + c.id, fid, obsId, e.id);
    return { caseId: c.id, fid };
  }

  it("keeps the original AI version when a finding is corrected", () => {
    const { caseId, fid } = setup();
    reviewFinding(user, fid, "correct", { title: "Reported loud noise", description: "The author reports hearing a bang at approximately 2pm.", note: "Wording" });
    const [f] = listFindings(caseId);
    expect(f.review_status).toBe("corrected");
    expect(f.version).toBe(2);
    expect(f.history).toHaveLength(1);
    expect(originalVersion(fid)?.title).toBe("Reported bang");
  });

  it("excludes rejected findings from packs and flags packs as stale after review changes", () => {
    const { caseId, fid } = setup();
    reviewFinding(user, fid, "accept", {});
    const pack = generateCasePack(user, caseId, false)!;
    expect(pack.content.reviewed_findings).toHaveLength(1);
    expect(pack.stale_reasons).toEqual([]);
    reviewFinding(user, fid, "reject", {});
    expect(getCasePack(user, caseId)!.stale_reasons[0]).toMatch(/FND-001 changed from accepted to rejected/);
    const regenerated = generateCasePack(user, caseId, false)!;
    expect(regenerated.content.reviewed_findings).toHaveLength(0);
  });

  it("archives an insight out of the case and its pack, keeps its history, and restores it", () => {
    const { caseId, fid } = setup();
    reviewFinding(user, fid, "accept", {});
    reviewFinding(user, fid, "archive", { note: "Not relevant" });
    expect(listFindings(caseId)).toHaveLength(0);
    const kept = listFindings(caseId, { includeSuperseded: true });
    expect(kept[0].archived).toBe(true);
    expect(kept[0].history.map((h) => h.action)).toEqual(["accept", "archive"]);
    expect(generateCasePack(user, caseId, false)!.content.reviewed_findings).toHaveLength(0);
    reviewFinding(user, fid, "unarchive", {});
    expect(listFindings(caseId)[0].review_status).toBe("accepted");
    expect(generateCasePack(user, caseId, false)!.content.reviewed_findings).toHaveLength(1);
  });

  it("includes unreviewed drafts only when explicitly requested, labelled", () => {
    const { caseId } = setup();
    expect(generateCasePack(user, caseId, false)!.content.reviewed_findings).toHaveLength(0);
    const draft = generateCasePack(user, caseId, true)!.content;
    expect(draft.reviewed_findings[0].status_label).toBe("UNREVIEWED AI DRAFT");
    expect(draft.draft_status).toMatch(/DRAFT/);
  });

  it("moves a deleted case to the trash, restores it, and erases it only with the reference typed", () => {
    const { caseId } = setup();
    const ref = cases.getCaseForUser(user, caseId).reference;
    cases.trashCase(user, caseId);
    expect(() => cases.getCaseForUser(user, caseId)).toThrow();
    expect(cases.listTrash(user).map((c) => c.id)).toContain(caseId);
    cases.restoreCase(user, caseId);
    expect(cases.getCaseForUser(user, caseId).reference).toBe(ref);
    expect(() => cases.deleteCase(user, caseId, ref)).toThrow(/trash/);
    cases.trashCase(user, caseId);
    expect(() => cases.deleteCase(user, caseId, "wrong")).toThrow(/confirm/);
    cases.deleteCase(user, caseId, ref);
    expect(cases.listTrash(user).map((c) => c.id)).not.toContain(caseId);
  });
});

describe("upload invitations", () => {
  it("lets a contributor upload with a token, records who, and stops after revocation", () => {
    const c = cases.createCase(user, "Invite case", "");
    const inv = invites.createInvite(user, c.id, { label: "Resident of 3A", message: "Please add your photos", days: 7 });
    expect(get("SELECT token_hash FROM upload_invites WHERE id = ?", inv.id)).not.toMatchObject({ token_hash: inv.token });
    expect(invites.publicInvite(inv.token)).toMatchObject({ folder: "Invite case", label: "Resident of 3A" });
    const r = invites.contributeEvidence(inv.token, { name: "A. Resident", email: "", statement: "I saw the door open." }, [{ name: "door.png", bytes: png }]);
    expect(r.filter((x) => x.ok)).toHaveLength(2);
    const ev = evidence.listEvidence(c.id);
    expect(ev.map((e) => e.metadata.contributor_name)).toEqual(["A. Resident", "A. Resident"]);
    invites.revokeInvite(user, c.id, inv.id);
    expect(() => invites.publicInvite(inv.token)).toThrow(/invalid or has expired/);
    expect(() => invites.publicInvite("not-a-token")).toThrow(/invalid or has expired/);
  });
});

describe("case validity review", () => {
  it("reports unchecked integrity, unprocessed evidence and an empty case", () => {
    const empty = cases.createCase(user, "Empty", "");
    expect(reviewCase(empty.id).issues.map((i) => i.code)).toContain("no_evidence");
    const c = cases.createCase(user, "Unchecked", "");
    evidence.addEvidence(user, c.id, "a.txt", Buffer.from("hello there"));
    const codes = reviewCase(c.id).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["integrity_not_checked", "not_processed"]));
  });
});

describe("projects", () => {
  it("groups cases and leaves them intact when the project is removed", async () => {
    const projects = await import("@/server/projects");
    const p = projects.createProject(user, "Riverside Court", "");
    const c = cases.createCase(user, "Leak at Flat 2", "");
    cases.updateCase(user, c.id, { project_id: p.id });
    expect(projects.getProject(user, p.id).cases.map((x) => x.id)).toEqual([c.id]);
    expect(projects.listProjects(user).find((x) => x.id === p.id)?.cases).toBe(1);
    expect(() => cases.updateCase(user, c.id, { project_id: "missing" })).toThrow(/Project not found/);
    projects.deleteProject(user, p.id);
    expect(cases.getCaseForUser(user, c.id).project_id).toBeNull();
  });

  it("shows a private project only to the person who created it", async () => {
    const projects = await import("@/server/projects");
    const colleague = { ...user, id: "colleague" };
    const priv = projects.createProject(user, "My drafts", "", [], "private");
    const pub = projects.createProject(user, "Team folder", "");
    expect(projects.listProjects(colleague).map((p) => p.id)).toContain(pub.id);
    expect(projects.listProjects(colleague).map((p) => p.id)).not.toContain(priv.id);
    expect(() => projects.getProject(colleague, priv.id)).toThrow(/Project not found/);
    expect(() => projects.updateProject(colleague, pub.id, { visibility: "private" })).toThrow(/Only the person who created/);
    expect(projects.updateProject(user, priv.id, { visibility: "public" }).visibility).toBe("public");
  });
});

describe("workflows", () => {
  it("runs Analyse then Review on a sample case and reports to the chat", async () => {
    const { createDemoCase } = await import("@/server/demo/demo");
    const wf = await import("@/server/workflows");
    const scenarioDir = path.resolve("sample/social-housing");
    if (!fs.existsSync(scenarioDir)) return;
    const { caseId } = createDemoCase(user, "social-housing");
    // Demo seeding normally runs in the worker; the workflow's extract step handles unprocessed items itself.
    run("UPDATE evidence SET processing_status = 'pending' WHERE case_id = ?", caseId);
    const analyse = wf.defaultWorkflow(user, "analyse");
    const runId = wf.startWorkflowRun(user, analyse.id, caseId, "Focus on the night of 14 March");
    await wf.executeWorkflowRun(runId, () => {});
    const r = wf.getWorkflowRun(user, runId);
    expect(r.steps.map((s) => s.status)).toEqual(["completed", "completed", "completed"]);
    expect(Number(get<{ n: number }>("SELECT COUNT(*) n FROM findings WHERE case_id = ? AND superseded = 0", caseId)?.n)).toBeGreaterThan(0);

    const review = wf.defaultWorkflow(user, "review");
    const run2 = wf.startWorkflowRun(user, review.id, caseId, "");
    await wf.executeWorkflowRun(run2, () => {});
    const r2 = wf.getWorkflowRun(user, run2);
    expect(r2.status).toBe("completed");
    expect((r2.result as { review?: { issues: unknown[] } }).review?.issues.length).toBeGreaterThan(0);
    const last = get<{ content: string }>("SELECT content FROM case_messages WHERE case_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", caseId);
    expect(last?.content).toMatch(/review/i);
  }, 120_000);
});

describe("section review tags, web sources and tasks", () => {
  it("tags a person or team, and lists it as a task until done", async () => {
    const collab = await import("@/server/collab");
    const tasks = await import("@/server/tasks");
    const c = cases.createCase(user, "Tagging", "");
    collab.assignSection(user, c.id, { section: "findings", assignee: "Housing team", kind: "team", note: "Check the dates" });
    expect(collab.directory(user).some((d) => d.kind === "team" && d.name === "Housing team")).toBe(true);
    const [a] = collab.listAssignments(user, c.id);
    expect(tasks.caseTasks(user, c.id).filter((t) => t.kind === "review_request")).toHaveLength(1);
    collab.setAssignmentStatus(user, c.id, a.id, "done");
    expect(tasks.caseTasks(user, c.id).filter((t) => t.kind === "review_request")).toHaveLength(0);
    expect(() => collab.assignSection(user, c.id, { section: "nope", assignee: "X", kind: "person", note: "" })).toThrow(/Unknown section/);
  });

  it("refuses links to local or private addresses", async () => {
    const web = await import("@/server/websources");
    const c = cases.createCase(user, "Web", "");
    for (const url of ["http://localhost:3000/api/cases", "http://127.0.0.1/", "http://10.0.0.5/", "http://[::1]/", "file:///etc/passwd"]) {
      await expect(web.proposeLink(user, c.id, "findings", url, "")).rejects.toThrow();
    }
    await expect(web.searchWebForSection(user, c.id, "findings", "noise")).rejects.toThrow(/needs AI/);
  });

  it("extracts a page's title and summary", async () => {
    const { extractPage } = await import("@/server/websources");
    const r = extractPage(`<html><head><title>Noise &amp; nuisance</title><meta name="description" content="Guidance on statutory nuisance."></head><body><script>x()</script><p>Body</p></body></html>`, "https://example.gov.uk/noise");
    expect(r).toEqual({ title: "Noise & nuisance", excerpt: "Guidance on statutory nuisance." });
  });

  it("puts only approved web sources in the pack, separately from evidence", async () => {
    const web = await import("@/server/websources");
    const { previewCasePack } = await import("@/server/casepack");
    const c = cases.createCase(user, "Pack web", "");
    const ids = ["a", "b"].map((k) => {
      const id = `ws-${k}-${c.id}`;
      run("INSERT INTO web_sources (id, case_id, section, url, title, origin, retrieved_at) VALUES (?, ?, 'findings', ?, ?, 'link', ?)", id, c.id, `https://example.org/${k}`, `Page ${k}`, now());
      return id;
    });
    web.decideWebSource(user, c.id, ids[0], "approve");
    web.decideWebSource(user, c.id, ids[1], "dismiss");
    const { pack } = previewCasePack(user, c.id) as { pack: { web_sources?: { title: string }[]; evidence_inventory: unknown[] } };
    expect(pack.web_sources?.map((w) => w.title)).toEqual(["Page a"]);
    expect(pack.evidence_inventory).toEqual([]);
  });
});

describe("automatic integrity checks", () => {
  it("queues a check for every upload and stores a report when run", async () => {
    const { checkEvidenceIntegrity, latestIntegrity } = await import("@/server/analysis/integrity");
    const c = cases.createCase(user, "Auto integrity", "");
    const r = evidence.storeEvidence(user.id, c.id, "note.txt", Buffer.from("A short statement."));
    expect(r.ok).toBe(true);
    const id = r.ok ? r.evidence.id : "";
    expect(get("SELECT id FROM jobs WHERE kind = 'check_integrity' AND payload LIKE ?", `%${id}%`)).toBeTruthy();
    await checkEvidenceIntegrity(id);
    expect(latestIntegrity(id)?.level).toBeDefined();
  });
});

describe("case pack approval", () => {
  it("refuses with nothing reviewed, then approves a reviewed-only version and reports open items", async () => {
    const { approvalStatus, approveCasePack } = await import("@/server/approval");
    const c = cases.createCase(user, "Approval", "");
    expect(() => approveCasePack(user, c.id)).toThrow(/Review at least one finding/);
    const r = evidence.storeEvidence(user.id, c.id, "a.txt", Buffer.from("Statement A"));
    const evId = r.ok ? r.evidence.id : "";
    const runId = `run-${c.id}`;
    run("INSERT INTO analysis_runs (id, case_id, scope, status, stage, created_at) VALUES (?, ?, 'case', 'completed', 'done', ?)", runId, c.id, now());
    for (const [k, status] of [["1", "accepted"], ["2", "unreviewed"]] as const) {
      const obs = `obs-${k}-${c.id}`;
      run("INSERT INTO observations (id, case_id, evidence_id, analysis_run_id, reference, observation_type, modality, description, source_reference, uncertainty, review_status, created_at) VALUES (?, ?, ?, ?, ?, 'direct_observation', 'text', 'x', '{}', '{}', 'unreviewed', ?)", obs, c.id, evId, runId, `OBS-00${k}`, now());
      const f = `f-${k}-${c.id}`;
      run("INSERT INTO findings (id, case_id, analysis_run_id, reference, title, description, finding_type, relationship_explanation, uncertainty, review_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'd', 'observation', '', '{}', ?, ?, ?)", f, c.id, runId, `FND-00${k}`, `Finding ${k}`, status, now(), now());
      run("INSERT INTO finding_sources (id, finding_id, observation_id, evidence_id, source_reference) VALUES (?, ?, ?, ?, '{}')", `fs-${k}-${c.id}`, f, obs, evId);
    }
    expect(approvalStatus(user, c.id)).toMatchObject({ reviewed: 1, unreviewed: 1 });
    const a = approveCasePack(user, c.id);
    const row = get<{ approved_by: string; content: string }>("SELECT approved_by, content FROM case_packs WHERE id = ?", a.id)!;
    expect(row.approved_by).toBe(user.id);
    expect(row.content).toContain("Finding 1");
    expect(row.content).not.toContain("Finding 2");
    expect(approvalStatus(user, c.id).lastApproval?.version).toBe(a.version);
  });
});

describe("projects from dragging cases", () => {
  it("creates an untitled project holding both cases, and rejects other organisations' cases", async () => {
    const projects = await import("@/server/projects");
    const a = cases.createCase(user, "Drag A", "");
    const b = cases.createCase(user, "Drag B", "");
    const p = projects.createProject(user, "Untitled project", "", [a.id, b.id]);
    expect(projects.getProject(user, p.id).cases.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(() => projects.createProject(user, "Untitled project", "", ["not-a-case"])).toThrow(/Case not found/);
  });
});

describe("email sign-in codes", () => {
  it("signs in with a fresh code once, rejects wrong codes, and reveals nothing for unknown emails", async () => {
    const { requestLoginCode, verifyLoginCode } = await import("@/server/loginCodes");
    run("UPDATE users SET email = 'reviewer@example.test' WHERE id = ?", user.id);
    expect(requestLoginCode("nobody@example.test").devCode).toBeNull();
    const { devCode } = requestLoginCode("Reviewer@Example.test");
    expect(devCode).toMatch(/^\d{6}$/);
    const wrong = devCode === "000000" ? "111111" : "000000";
    expect(() => verifyLoginCode("reviewer@example.test", wrong)).toThrow(/isn't right/);
    expect(verifyLoginCode("reviewer@example.test", devCode!)).toBe(user.id);
    expect(() => verifyLoginCode("reviewer@example.test", devCode!)).toThrow(/expired/);
  });
});

describe("integrity review", () => {
  it("spots renamed files and official documents, and summarises the checks", async () => {
    const { typeIndicator, officialDocument, summariseChecks } = await import("@/server/analysis/integrity");
    expect(typeIndicator(".png", png)).toBeNull();
    expect(typeIndicator(".pdf", png)?.code).toBe("type_mismatch");
    expect(typeIndicator(".txt", png)).toBeNull();
    expect(officialDocument("scan_driving_licence.jpg", "")?.authority).toBe("DVLA");
    expect(officialDocument("notes.pdf", "Issued by HMRC: P60 End of Year Certificate")?.authority).toBe("HMRC");
    expect(officialDocument("photo.jpg", "a cat")).toBeNull();
    const checks = summariseChecks([{ level: "strong", code: "type_mismatch", title: "File contents don't match its type", detail: "" }], { kind: "driving licence", authority: "DVLA" });
    expect(checks.map((c) => c.status)).toEqual(["issue", "ok", "ok", "not_checked"]);
  });

  it("keeps, asks the contributor for a replacement, and removes a file", async () => {
    const review = await import("@/server/integrityReview");
    const { checkEvidenceIntegrity } = await import("@/server/analysis/integrity");
    const c = cases.createCase(user, "Integrity case", "");
    const inv = invites.createInvite(user, c.id, { label: "Tenant", message: "", days: 7 });
    const [up] = invites.contributeEvidence(inv.token, { name: "Sam Lee", email: "sam@example.test", statement: "" }, [{ name: "driving_licence.pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n") }]);
    expect(up.ok).toBe(true);
    const id = get<{ id: string }>("SELECT id FROM evidence WHERE case_id = ? AND original_filename = 'driving_licence.pdf'", c.id)!.id;
    const report = await checkEvidenceIntegrity(id);
    expect(report.checks?.find((x) => x.name === "Issuing authority")?.status).toBe("not_checked");

    review.keepEvidence(user, id);
    expect(review.caseIntegrityReviews(c.id)[id].decision).toBe("kept");

    const draft = await review.draftReplacementNote(user, id);
    expect(draft.drafted_by).toBe("template");
    expect(draft.message).toContain("Hi Sam");
    const req = review.requestReplacement(user, id, draft.message);
    expect(req.email).toBe("sam@example.test");
    expect(invites.publicInvite(req.token).label).toBe("Replacement for driving_licence.pdf");
    expect(review.caseIntegrityReviews(c.id)[id].decision).toBe("replacement_requested");

    evidence.addEvidence(user, c.id, "note.txt", Buffer.from("typed note"));
    const own = get<{ id: string }>("SELECT id FROM evidence WHERE case_id = ? AND original_filename = 'note.txt'", c.id)!.id;
    expect(() => review.requestReplacement(user, own, "please")).toThrow(/external contributor/);

    review.removeEvidence(user, id);
    expect(get("SELECT id FROM evidence WHERE id = ?", id)).toBeUndefined();
    expect(review.caseIntegrityReviews(c.id)[id]).toBeUndefined();
  });

  it("queues checks in the background and reports which are still pending", async () => {
    const review = await import("@/server/integrityReview");
    const c = cases.createCase(user, "Queue case", "");
    evidence.addEvidence(user, c.id, "a.txt", Buffer.from("one"));
    const queued = review.queueCaseIntegrity(user, c.id);
    expect(queued.length).toBe(1);
    expect(review.pendingIntegrity(c.id)).toEqual(queued);
  });
});

describe("compliance guard", () => {
  const compliance = async () => ({ ...(await import("@/server/compliance/engine")), ...(await import("@/server/compliance/review")), ...(await import("@/server/compliance/classify")) });
  const makeOrg = async (name: string) => {
    const orgId = crypto.randomUUID();
    run("INSERT INTO organisations (id, name, created_at) VALUES (?, ?, ?)", orgId, name, now());
    const id = crypto.randomUUID();
    run("INSERT INTO users (id, organisation_id, name, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, 'admin', 'x', ?)", id, orgId, `${name} admin`, `${id}@example.test`, now());
    return { id, organisation_id: orgId, name: `${name} admin`, email: `${id}@example.test`, role: "admin" };
  };
  const idOf = (caseId: string, name: string) => get<{ id: string }>("SELECT id FROM evidence WHERE case_id = ? AND original_filename = ?", caseId, name)!.id;

  it("AC1: without an approved policy, evidence is stored but cannot be analysed or sent to AI", async () => {
    const c = await compliance();
    const other = await makeOrg("No Policy Ltd");
    const kase = cases.createCase(other, "Unpoliced case", "");
    expect(evidence.addEvidence(other, kase.id, "note.txt", Buffer.from("hello")).ok).toBe(true);
    const id = idOf(kase.id, "note.txt");
    expect(get<{ compliance_status: string }>("SELECT compliance_status FROM evidence WHERE id = ?", id)!.compliance_status).toBe("BLOCKED");
    expect(() => evidence.queueEvidenceProcessing(other, id)).toThrow(/no approved processing policy/);
    expect(() => c.authorise({ operation: "observations", provider: "anthropic", organisationId: other.organisation_id, evidenceId: id, user: other })).toThrow(c.ComplianceBlockedError);
    // Local integrity checks are still allowed at intake.
    expect(c.authorise({ operation: "integrity_check", provider: null, organisationId: other.organisation_id, evidenceId: id, user: null }).operation).toBe("integrity_check");
  });

  it("AC2: possible health information is held for review, then blocked without Article 9 conditions", async () => {
    const c = await compliance();
    const kase = cases.createCase(user, "Sick note case", "");
    evidence.addEvidence(user, kase.id, "gp_fit_note.txt", Buffer.from("Fit note"));
    const id = idOf(kase.id, "gp_fit_note.txt");
    const before = c.evidenceCompliance(user, id);
    expect(before.compliance.category).toBe("medical");
    expect(before.compliance.decision).toBe("BLOCK");
    expect(before.compliance.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["SPECIAL_CATEGORY_CONDITION_MISSING", "CLASSIFICATION_UNCERTAIN"]));
    expect(() => c.approveForAnalysis(user, id, "needed")).toThrow(/can't be approved here/);
    // A reviewer confirms it's actually a general note: the special-category block goes away.
    expect(c.setCategory(user, id, "general")).toBe("APPROVED");
  });

  it("AC3/AC12: the AI client refuses any call without an engine-issued authorisation", async () => {
    const forged = Object.freeze({ auditId: "x", operation: "observations", provider: "anthropic", evidenceIds: [], policyId: null, policyVersion: null });
    await expect(callStructured({ authorisation: forged as never, runId: "r", purpose: "p", system: "s", content: [], schema: z.object({}) })).rejects.toThrow(/no compliance authorisation/);
    const c = await compliance();
    const local = c.authorise({ operation: "integrity_check", provider: null, organisationId: user.organisation_id, user: null });
    await expect(callStructured({ authorisation: local, runId: "r", purpose: "p", system: "s", content: [], schema: z.object({}) })).rejects.toThrow(/not anthropic/);
  });

  it("AC4: external verification is refused and recorded when no approved source exists", async () => {
    const c = await compliance();
    const kase = cases.createCase(user, "Licence case", "");
    evidence.addEvidence(user, kase.id, "notes.txt", Buffer.from("licence number"));
    const id = idOf(kase.id, "notes.txt");
    const r = c.requestVerification(user, id);
    expect(r.status).toBe("VERIFICATION_NOT_PERMITTED");
    const log = c.evidenceAudit(user, id).find((a) => a.operation === "external_verification");
    expect(log?.decision).toBe("BLOCK");
    expect(log?.reason_codes).toEqual(expect.arrayContaining(["VERIFICATION_NOT_PERMITTED", "NO_VERIFICATION_INTEGRATION"]));
  });

  it("restricted evidence is quarantined until the restriction is lifted", async () => {
    const c = await compliance();
    const kase = cases.createCase(user, "Quarantine case", "");
    evidence.addEvidence(user, kase.id, "statement.txt", Buffer.from("statement"));
    const id = idOf(kase.id, "statement.txt");
    expect(c.setRestricted(user, id, true, "awaiting legal advice")).toBe("RESTRICTED");
    expect(() => evidence.queueEvidenceProcessing(user, id)).toThrow(/restricted/);
    expect(c.setRestricted(user, id, false, "")).toBe("APPROVED");
  });

  it("AC9/AC10: every decision is audited with the policy version; a new version applies to later operations", async () => {
    const c = await compliance();
    const kase = cases.createCase(user, "Versioned case", "");
    evidence.addEvidence(user, kase.id, "log.txt", Buffer.from("log"));
    const id = idOf(kase.id, "log.txt");
    const v1 = c.authorise({ operation: "observations", provider: "anthropic", organisationId: user.organisation_id, evidenceId: id, user });
    const restricted = approvePolicy(user, MOCK_RESTRICTED_POLICY);
    expect(restricted.version).toBe(v1.policyVersion! + 1);
    expect(() => c.authorise({ operation: "observations", provider: "anthropic", organisationId: user.organisation_id, evidenceId: id, user })).toThrow(/doesn't approve this operation|AI provider isn't approved/);
    const entries = c.evidenceAudit(user, id).filter((a) => a.operation === "observations");
    expect(entries.map((e) => [e.decision, e.policy_version])).toEqual([["BLOCK", restricted.version], ["ALLOW", v1.policyVersion]]);
    approvePolicy(user, MOCK_APPROVED_POLICY);
  });

  it("AC11: another organisation's evidence and audit records are out of reach", async () => {
    const c = await compliance();
    const other = await makeOrg("Other Org");
    const kase = cases.createCase(user, "Private case", "");
    evidence.addEvidence(user, kase.id, "mine.txt", Buffer.from("mine"));
    const id = idOf(kase.id, "mine.txt");
    expect(() => c.evidenceCompliance(other, id)).toThrow(/not found/);
    expect(c.evidenceAudit(other, id)).toEqual([]);
    expect(() => c.authorise({ operation: "observations", provider: "anthropic", organisationId: other.organisation_id, evidenceId: id, user: other })).toThrow(c.ComplianceBlockedError);
  });

  it("classifies at intake from the declaration and name only, routing uncertain sensitive items restrictively", async () => {
    const c = await compliance();
    expect(c.classifyIntake("passport_scan.jpg", "image", null)).toEqual({ category: "identity_document", source: "local", confirmed: false });
    expect(c.classifyIntake("passport_scan.jpg", "image", "general")).toEqual({ category: "general", source: "declared", confirmed: true });
    expect(c.classifyIntake("cctv.mp4", "video", null).category).toBe("photo_video");
  });
});

describe("security safeguards", () => {
  const idOf = (caseId: string, name: string) => get<{ id: string; storage_reference: string }>("SELECT id, storage_reference FROM evidence WHERE case_id = ? AND original_filename = ?", caseId, name)!;

  it("stores originals encrypted, reads any byte range back, and detects tampering", async () => {
    const storage = await import("@/server/storage");
    const c = cases.createCase(user, "Encrypted case", "");
    const plain = Buffer.alloc(200_000);
    for (let i = 0; i < plain.length; i++) plain[i] = i % 251;
    const body = Buffer.concat([Buffer.from("A long statement.\n"), plain.subarray(0, 150_000).map((b) => 65 + (b % 26))]);
    expect(evidence.addEvidence(user, c.id, "long.txt", body).ok).toBe(true);
    const ev = idOf(c.id, "long.txt");
    const onDisk = fs.readFileSync(originalPath(ev.storage_reference));
    expect(onDisk.subarray(0, 8).toString()).toBe("VEYRAEC1");
    expect(onDisk.includes(Buffer.from("A long statement."))).toBe(false);
    expect(storage.readOriginal(ev.storage_reference).equals(body)).toBe(true);
    expect(storage.originalSize(ev.storage_reference)).toBe(body.length);
    // A range spanning a 64 KiB chunk boundary.
    expect(storage.readOriginalRange(ev.storage_reference, 65_530, 65_545).equals(body.subarray(65_530, 65_546))).toBe(true);
    // Flip one byte of ciphertext: decryption must fail rather than return altered content.
    const tampered = Buffer.from(onDisk);
    tampered[100] ^= 1;
    const copy = path.join(dir, "tampered.bin");
    fs.writeFileSync(copy, tampered);
    const { readStored } = await import("@/server/sealed");
    expect(() => readStored(copy, dir)).toThrow();
  });

  it("refuses malware and executables at upload and quarantines active PDF content", async () => {
    const { builtInScan } = await import("@/server/compliance/scan");
    expect(builtInScan("a.txt", Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")).refuse).toHaveLength(1);
    expect(builtInScan("a.txt", Buffer.from("MZ\x90\x00 program")).refuse[0]).toMatch(/Windows executable/);
    expect(builtInScan("a.pdf", Buffer.from("%PDF-1.4 /OpenAction << /JS (app.alert(1)) >>")).quarantine[0]).toMatch(/JavaScript/);
    expect(builtInScan("a.txt", Buffer.from("ok"))).toEqual({ refuse: [], quarantine: [] });

    const c = cases.createCase(user, "Scan case", "");
    const r = evidence.addEvidence(user, c.id, "virus.txt", Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"));
    expect(r.ok).toBe(false);
    expect(get("SELECT id FROM evidence WHERE case_id = ?", c.id)).toBeUndefined();
    expect(evidence.addEvidence(user, c.id, "form.pdf", Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (x) >> >> endobj\n%%EOF\n")).ok).toBe(true);
    expect(get<{ compliance_status: string }>("SELECT compliance_status FROM evidence WHERE case_id = ?", c.id)!.compliance_status).toBe("RESTRICTED");
  });

  it("masks direct identifiers before AI calls and restores them in the response", async () => {
    const { Pseudonymiser } = await import("@/server/compliance/pseudonymise");
    const m = new Pseudonymiser();
    const masked = m.mask("Email sam.lee@example.com or call 07700 900123. NI AB 12 34 56 C. Card 4111 1111 1111 1111. Ref 1234567890123.");
    expect(masked).not.toMatch(/sam\.lee|07700|AB 12|4111/);
    expect(masked).toContain("Ref 1234567890123"); // not a valid card number, so left alone
    expect(m.mask("again sam.lee@example.com")).toBe("again [EMAIL_1]");
    expect(m.unmaskDeep({ quote: "Contact [EMAIL_1] on [PHONE_1]" })).toEqual({ quote: "Contact sam.lee@example.com on 07700 900123" });
  });

  it("issues short-lived signed file links bound to one file", async () => {
    const { createFileLinkToken, verifyFileLinkToken } = await import("@/server/fileLinks");
    const { token } = createFileLinkToken("ev-1", "org-1");
    expect(verifyFileLinkToken(token, "ev-1")).toBe("org-1");
    expect(verifyFileLinkToken(token, "ev-2")).toBeNull();
    expect(verifyFileLinkToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "ev-1")).toBeNull();
    const expired = createFileLinkToken("ev-1", "org-1", -1).token;
    expect(verifyFileLinkToken(expired, "ev-1")).toBeNull();
  });

  it("lists items past retention, respects legal hold, and deletes only on an admin's request", async () => {
    const retention = await import("@/server/compliance/retention");
    const c = cases.createCase(user, "Old case", "");
    evidence.addEvidence(user, c.id, "old.txt", Buffer.from("old"));
    const ev = idOf(c.id, "old.txt");
    run("UPDATE evidence SET uploaded_at = ? WHERE id = ?", new Date(Date.now() - 400 * 86_400_000).toISOString(), ev.id);
    expect(retention.retentionReview(user).due.map((d) => d.id)).toContain(ev.id);
    retention.setLegalHold(user, c.id, true, "Tribunal pending");
    expect(retention.retentionReview(user).due.map((d) => d.id)).not.toContain(ev.id);
    expect(() => retention.deleteDue(user, [ev.id])).toThrow(/no longer due/);
    retention.setLegalHold(user, c.id, false, "");
    expect(retention.deleteDue(user, [ev.id])).toBe(1);
    expect(get("SELECT id FROM evidence WHERE id = ?", ev.id)).toBeUndefined();
    expect(fs.existsSync(originalPath(ev.storage_reference))).toBe(false);
  });
});

describe("consent, data-subject rights and reassessment", () => {
  /** A case with one statement, one observation and two findings that both rest on it. */
  function twoFindings(text = "Sam Lee heard a bang at about 2pm. Call 07700 900123.") {
    const c = cases.createCase(user, "Linked findings", "");
    const up = evidence.addEvidence(user, c.id, "statement.txt", Buffer.from(text));
    if (!up.ok) throw new Error("upload failed");
    const e = evidence.getEvidence(up.evidence.id)!;
    const runId = "run-" + c.id;
    run("INSERT INTO analysis_runs (id, case_id, evidence_id, scope, status, created_at) VALUES (?, ?, ?, 'evidence', 'completed', ?)", runId, c.id, e.id, now());
    run(
      `INSERT INTO observations (id, case_id, evidence_id, analysis_run_id, reference, observation_type, modality, description, quote, source_reference, event_time, uncertainty, review_status, created_at)
       VALUES (?, ?, ?, ?, 'OBS-001', 'contributor_statement', 'document', 'Sam Lee states they heard a bang.', 'Sam Lee heard a bang', '{}', NULL, '{}', 'unreviewed', ?)`,
      "o-" + c.id,
      c.id,
      e.id,
      runId,
      now(),
    );
    const caseRun = "case-" + c.id;
    run("INSERT INTO analysis_runs (id, case_id, scope, status, created_at) VALUES (?, ?, 'case', 'completed', ?)", caseRun, c.id, now());
    for (const [n, title] of [["1", "Bang reported by Sam Lee"], ["2", "Timing of the bang"]]) {
      run(
        `INSERT INTO findings (id, case_id, analysis_run_id, reference, title, description, finding_type, uncertainty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'From the statement.', 'observation', '{}', ?, ?)`,
        `f${n}-${c.id}`,
        c.id,
        caseRun,
        `FND-00${n}`,
        title,
        now(),
        now(),
      );
      run("INSERT INTO finding_sources (id, finding_id, observation_id, evidence_id, source_reference) VALUES (?, ?, ?, ?, '{}')", `fs${n}-${c.id}`, `f${n}-${c.id}`, "o-" + c.id, e.id);
    }
    return { caseId: c.id, evidenceId: e.id, f1: `f1-${c.id}`, f2: `f2-${c.id}` };
  }
  const reason = (id: string) => get<{ reassess_reason: string | null }>("SELECT reassess_reason FROM findings WHERE id = ?", id)!.reassess_reason;

  it("AC8: rejecting a finding flags findings that share its sources; reviewing them clears the flag", () => {
    const { f1, f2 } = twoFindings();
    reviewFinding(user, f1, "reject", { note: "Wrong" });
    expect(reason(f1)).toBeNull();
    expect(reason(f2)).toMatch(/FND-001 was rejected/);
    reviewFinding(user, f2, "accept", {});
    expect(reason(f2)).toBeNull();
  });

  it("flags findings when the evidence they cite is removed", async () => {
    const { removeEvidence } = await import("@/server/integrityReview");
    const { f1, f2, evidenceId } = twoFindings();
    removeEvidence(user, evidenceId);
    // The finding rows remain for review even though their source is gone.
    expect(reason(f1)).toMatch(/was removed from the case/);
    expect(reason(f2)).toMatch(/was removed from the case/);
  });

  it("where consent is the lawful basis, it must be recorded; withdrawal blocks processing and flags findings", async () => {
    const consent = await import("@/server/compliance/consent");
    const { preview } = await import("@/server/compliance/engine");
    approvePolicy(user, { ...MOCK_APPROVED_POLICY, lawful_basis: "consent" });
    try {
      const { caseId, evidenceId, f1 } = twoFindings();
      const decide = () => preview({ operation: "observations", provider: "anthropic", organisationId: user.organisation_id, evidenceId, user });
      expect(decide().reasons).toContain("CONSENT_NOT_RECORDED");
      const rec = consent.recordConsent(user, caseId, { subject_name: "Sam Lee", purpose: "Investigating the grievance", method: "written" });
      expect(decide().decision).toBe("ALLOW");
      const w = consent.withdrawConsent(user, rec.id, "Changed their mind");
      expect(w.affected).toBe(1);
      expect(decide().reasons).toContain("CONSENT_WITHDRAWN");
      expect(reason(f1)).toMatch(/Consent from Sam Lee was withdrawn/);
      expect(get<{ compliance_status: string }>("SELECT compliance_status FROM evidence WHERE id = ?", evidenceId)!.compliance_status).toBe("BLOCKED");
      expect(() => consent.withdrawConsent(user, rec.id, "")).toThrow(/already withdrawn/);
    } finally {
      approvePolicy(user, MOCK_APPROVED_POLICY);
    }
  });

  it("restricted evidence is left out of the case pack, and findings built on it are flagged", async () => {
    const { setRestricted } = await import("@/server/compliance/review");
    const { caseId, evidenceId, f1 } = twoFindings();
    reviewFinding(user, f1, "accept", {});
    const before = generateCasePack(user, caseId, false)!;
    expect(before.content.evidence_inventory).toHaveLength(1);
    expect(before.content.reviewed_findings.map((f) => f.id)).toContain(f1);
    setRestricted(user, evidenceId, true, "Not to be relied on");
    expect(reason(f1)).toMatch(/was restricted and is no longer considered/);
    const after = generateCasePack(user, caseId, false)!;
    expect(after.content.evidence_inventory).toHaveLength(0);
    expect(after.content.reviewed_findings.map((f) => f.id)).not.toContain(f1);
    expect(after.content.notice).toMatch(/1 restricted evidence item/);
  });

  it("finds a person's data, exports it, and erases it except under legal hold", async () => {
    const subjects = await import("@/server/compliance/subjects");
    const retention = await import("@/server/compliance/retention");
    const { caseId, evidenceId, f1 } = twoFindings();
    const held = twoFindings();
    retention.setLegalHold(user, held.caseId, true, "Litigation");
    expect(subjects.dueDate("2026-01-31T10:00:00.000Z")).toBe("2026-02-28T10:00:00.000Z");

    const req = subjects.createRequest(user, { kind: "erasure", subject_name: "Sam Lee", identifiers: ["07700 900123"] });
    const found = subjects.searchSubject(user, req.identifiers);
    const mine = found.cases.find((c) => c.case_id === caseId)!;
    expect(mine.matches.map((m) => m.kind)).toEqual(expect.arrayContaining(["observation", "finding"]));
    expect(found.cases.find((c) => c.case_id === held.caseId)?.legal_hold).toBe(true);

    const { bytes } = await subjects.exportRequest(user, req.id);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["report.txt", "data.json"]));
    expect(await zip.file("report.txt")!.async("string")).toMatch(/Review before sending/);

    const r = subjects.eraseRequest(user, req.id, { evidenceIds: [evidenceId, held.evidenceId], redact: true });
    expect(r.deleted).toBe(1);
    expect(r.skipped).toHaveLength(1);
    expect(get<{ title: string }>("SELECT title FROM findings WHERE id = ?", f1)!.title).toBe("Bang reported by [erased]");
    expect(get<{ title: string }>("SELECT title FROM findings WHERE id = ?", held.f1)!.title).toBe("Bang reported by Sam Lee");
    expect(subjects.closeRequest(user, req.id, "completed", "Erased except items under legal hold").status).toBe("completed");
    expect(() => subjects.eraseRequest(user, req.id, { evidenceIds: [], redact: true })).toThrow(/already closed/);
    retention.setLegalHold(user, held.caseId, false, "");
  });
});
