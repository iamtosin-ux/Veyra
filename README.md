# Veyra: evidence workspace (MVP V1 prototype)

A workspace that analyses mixed-format evidence (video, audio, images, PDFs, DOCX and written accounts). It extracts source-linked observations from each item, compares them across items, and presents findings for a person to accept, correct or reject. Reviewed material can then be assembled into a case preparation pack.

> Prototype. Use synthetic or properly authorised, anonymised material only. It is not certified, compliant or production-ready.

## Quick start

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET and ANTHROPIC_API_KEY
npm run dev                  # web app on :3000 plus the background worker
```

1. Open http://localhost:3000. On first run you are sent to **/setup** to create the organisation and its admin. Setup is disabled once a user exists.
2. Create a case and upload the files in `sample/` (run `npm run sample` to regenerate them). Upload them in the order listed in `sample/EXPECTED_RESULTS.md`.
3. On **Analysis**, run **Analyse items**, then **Compare evidence**.
4. Review on **Findings**. Use **Timeline** and **Case Pack** to check the chronology and export.

### Workspace
- **Home:** describe a case in the composer (with + to attach files) to create it and open it with the assistant. **Discover** loads a demo case for any of seven industries, **Analyse** lists cases with evidence still to process, and **Review** lists cases with findings awaiting review.
- **Case workspace:** an icon rail, the **case assistant** chat, the **case-building space** (a live draft case pack plus evidence processing status), and **drawers** opened from the top-right icons: Case details | Evidence · Insights (Findings + Analysis) · Timeline · Saved versions. Drawers can be expanded to full width.
- **Assistant:** with `ANTHROPIC_API_KEY`, Claude answers using read-only tools over the case (evidence, observation search, findings, timeline) and can start analysis or comparison when asked. Without a key it runs in a clearly labelled **offline mode** that only performs lookups and actions. In both modes every OBS/FND/EVD reference in a reply is checked against the case, and unknown references are flagged.
- **Chat ingestion:** new facts you tell the assistant are stored as a **reviewer note** (a written-account evidence item, hashed and attributed to you). They appear immediately in the case pack under "Information provided by the reviewer" and can be analysed like any other evidence.
- Video citations open a full-size player with a multi-track timeline. Other citations open the source viewer at the cited page, passage or region.

### Demo mode (no API key needed)
On the home page, open **Discover** and load a demo for one of seven industries: social housing, HR investigations, property management, insurance claims, legal services, health and social care, or construction disputes. The synthetic files live in `sample/<scenario>/` (regenerate with `npm run sample`). Each case runs the real non-AI pipeline (frame sampling, local transcription, sound detection, PDF/DOCX/TXT extraction) and then loads hand-written observations, findings and a chronology. These go through the same citation validation as AI output. Demo cases carry a DEMO tag and a banner, their drafts are labelled "Demo draft", and the case pack states the content is not AI output. Re-analysing a demo case stays in demo mode, and segment inspection is disabled. Demos show the workflow; they say nothing about AI accuracy. Scenario definitions (media specs and analysis) are in `src/server/demo/scenarios/`, and `tests/demo.test.ts` checks every document quote against the generated files.

Other commands: `npm test` (unit tests), `npm run typecheck`, `npx tsx scripts/check-extraction.mts <files>` (shows exactly what the non-AI extraction produces for a file).

The first audio or video transcription downloads the Whisper model (about 150 MB) into `data/models/`.

## Architecture

```
Browser (Next.js client UI)
   │  JSON route handlers (auth-gated by src/proxy.ts and requireUser)
   ▼
Next.js server ── SQLite (data/evidence.db, WAL) ── private files (data/originals, data/derived)
   │ enqueue                         ▲
   ▼                                 │
jobs table ──► worker process (scripts/worker.mts)
                 ├─ media/ffmpeg.ts     probe, scene detection, adaptive frame sampling, audio decode, loud-sound detection
                 ├─ media/transcribe.ts local Whisper (transformers.js), speech-region segmentation, absolute timestamps
                 ├─ extract/document.ts PDF text per page, DOCX, TXT; flags scanned pages
                 ├─ ai/client.ts        Claude (claude-opus-5-5) structured output, usage logging, refusal fallback
                 ├─ analysis/validate.ts  citation validation (the core trust layer)
                 ├─ analysis/evidencePipeline.ts  per-item observations, ±3 s segment inspection
                 └─ analysis/caseAnalysis.ts      cross-evidence findings and chronology
```

The concerns are kept separate as the PRD specifies: UI, case and evidence management (`cases.ts`, `evidence.ts`), original storage (`storage.ts`), extraction (`media/`, `extract/`), AI (`ai/`), cross-evidence reasoning (`analysis/caseAnalysis.ts`), findings and review (`findings.ts`), and case pack (`casepack.ts`, `casepackDocx.ts`). The engine is industry-neutral; legal wording appears only in the UI.

### How traceability is enforced
- Originals are written once, set read-only (mode 0444) and hashed with SHA-256. The hash is re-checked before every analysis.
- The model returns structured JSON, which is re-validated with Zod. Then `validate.ts` checks every citation against what was actually extracted:
  - **Quotes** must appear in the transcript or page text. Matching tolerates punctuation and supports ellipses. Statements and document facts whose quotes are not found are **rejected**.
  - **Statement timing comes from the transcript**, not from the model.
  - **Visual video claims** must cite frames that were actually sampled, inside the claimed time range.
  - **Timestamps** beyond the media duration and **pages** that don't exist are rejected. A quote found on a different page has its page corrected.
  - **Image regions** are bounds-checked and always labelled *approximate*.
  - **Findings** may cite only `OBS-###` references that exist in the case. Unknown references are removed and the finding is flagged. A finding with no valid references is rejected.
  - **Chronology dates** are kept only if a cited observation states that date. Otherwise the event moves to *Undated*.
- Everything rejected is stored in `validation_rejections` and shown on **Analysis**, under "AI claims removed by validation", as the unsupported-claim error category.
- Uploaded content is wrapped in `<evidence>` tags with an explicit instruction to treat it as data. The sample DOCX contains a prompt-injection line to test this.

### Review and versioning
- Accept, correct, reject and "mark unreviewed" each write a `finding_reviews` audit row with the content before and after, the reviewer and the timestamp. Corrections increment `version`, and the original AI version stays recoverable.
- Re-running the comparison archives only **unreviewed** drafts. Reviewed findings are never overwritten.
- Case packs store a snapshot of finding status and version. Any later review change marks the pack **stale**, with the reasons.
- Case status is derived from jobs, runs and review state (`deriveCaseStatus`), never set by hand.

## PRD coverage

| Area | State |
|---|---|
| Cases: create, edit, list, isolate, delete with typed confirmation | ✅ |
| Uploads: multiple files, per-file status, content sniffing, size limits, hash-based duplicate flag, manual written accounts | ✅ |
| Video: metadata, audio extraction, timestamped transcript, scene detection, adaptive frames, timestamped visual observations, ±3 s dense re-inspection | ✅ (see limitations) |
| Audio: local timestamped transcription, statements, loud-sound detection | ✅ (no speaker diarisation) |
| Images: visual analysis, text reading, approximate regions | ✅ |
| PDF (per page), DOCX, TXT extraction; scanned-page flag and visual fallback | ✅ |
| Common observation schema with the six observation types | ✅ |
| Cross-evidence findings, discrepancies, chronology, questions | ✅ |
| Citation validation and click-through to exact location (video and audio seek, transcript highlight, PDF page and passage highlight, image region) | ✅ |
| Review workflow with audit history and versions | ✅ |
| Timeline with an undated section | ✅ (accept or reject only; no editing) |
| Case pack in app, DOCX export, print to PDF | ✅ |
| Search and filtering (evidence by type, status and text; findings by type and status) | ✅ |
| Processing stages, retry, recovery from a crashed worker, AI usage per run | ✅ |
| Auth: single organisation, first-run admin, signed httpOnly session | ✅ minimal |

## Known limitations (deliberate for V1)
- **Infrastructure:** SQLite and local disk instead of PostgreSQL and object storage. No encryption at rest. Uploads are buffered in memory (500 MB cap for video).
- **Video:** at most 48 sampled frames per pass. Movement between frames is not observed, so use segment inspection for detail. Very long recordings are sampled coarsely. Frames (not the original file) are sent to the AI provider. Transcription is local.
- **Audio:** no speaker diarisation. Speaker changes are only inferred by the model and labelled as such. Whisper `base.en` is English-only.
- **Documents:** DOCX has no page numbers, so citations are passage-only. Scanned PDFs are read visually by the model, and their quotes are marked approximate, not verified.
- **Auth and security:** no user management UI, MFA, login rate limiting or CSRF tokens (it relies on SameSite=Lax cookies and JSON bodies). Logs exclude evidence content.
- **Timezones:** stated times are recorded as written. Chronology ordering treats them as local time.
- **Evaluation:** `sample/EXPECTED_RESULTS.md` defines the expected observations, but scoring a run against it is manual.
