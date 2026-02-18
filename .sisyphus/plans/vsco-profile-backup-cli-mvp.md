# VSCO Profile Backup CLI — MVP Work Plan

## TL;DR
> Build a greenfield Node.js + TypeScript CLI that takes a VSCO profile URL and incrementally backs up photos, galleries, and blog posts into a local folder containing a browsable offline static site. It must **never delete** existing local content; subsequent runs download only new/missing/invalid assets.

**Deliverables**
- A runnable CLI command: `vsco-backup "https://vsco.co/<username>" [--out-root <dir>] [--verbose]`
- Backup output at: `<out-root>/<username>/` (default out-root = `.`)
- Manifest at: `<backup-root>/.vsco-backup/manifest.json`
- Downloaded media stored locally (highest available resolution)
- Generated static site:
  - `<backup-root>/index.html`
  - `<backup-root>/galleries/<gallery-slug>/index.html`
  - `<backup-root>/blog/<post-slug>/index.html`
  - `<backup-root>/assets/*` (CSS/JS)

**Estimated Effort**: Large (greenfield + scraping uncertainty)
**Parallel Execution**: YES — 4 waves + final verification
**Critical Path**: scaffold → manifest+IO → scraper extraction → downloader → generator → CLI integration → end-to-end QA

---

## Context

### Original Request
A Node.js/TypeScript CLI that incrementally backs up a VSCO profile into a local static website without deleting any existing local backup content.

### Confirmed Requirements / Decisions
- **Scope**: MVP only (explicitly exclude daemon mode, embedded HTTP server, git integration).
- **Input**: URL only (`https://vsco.co/<username>`).
- **Output root**: `<out-root>/<username>/` (support `--out-root`).
- **Manifest**: `.vsco-backup/manifest.json` inside backup root.
- **Overwrite policy**: keep existing files unless clearly invalid; re-download invalid (e.g., 0 bytes; size mismatch when expected size known).
- **Logging**: concise by default; `--verbose` for details.
- **Scraping default**: Playwright.
- **Rate limiting**: conservative; exponential backoff with jitter; retry transient errors only.
- **Automated tests**: none for MVP; **agent-executed QA scenarios are mandatory**.

### Metis Review — Guardrails Incorporated
- No auth / no ToS bypass: do not attempt login, captcha solving, or stealth beyond normal UA; fail fast with a clear message.
- Deterministic output: stable IDs/filenames; collision-proof naming.
- Crawl safety: explicit stopping rules and caps to prevent runaway runs.
- Robots.txt ethics: fetch robots.txt and enforce safe defaults.

---

## Work Objectives

### Core Objective
Create a reliable, rerunnable CLI that produces an offline static site backup of a VSCO profile and can be re-run to incrementally fetch only new/missing/invalid content.

### Definition of Done (MVP)
- [ ] Fresh run creates `<out-root>/<username>/` with manifest and generated HTML.
- [ ] Re-run (no upstream changes) downloads 0 new assets and reports 0 new content.
- [ ] If a previously downloaded file is truncated to 0 bytes, rerun re-downloads it.
- [ ] Galleries + blog post pages exist (even if minimal templates) and link correctly.
- [ ] No operation deletes existing local assets or pages.

### Must NOT Have (Guardrails)
- No login flows, cookie persistence, captcha/anti-bot bypass.
- No deletion of local assets/content/manifest entries.
- No unbounded crawling: must have stopping rules + caps.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION**: All verification is agent-executed. No “manually open the browser and check”.

### Test Decision
- **Infrastructure exists**: NO (greenfield)
- **Automated tests**: None for MVP

### QA Policy (per-task)
Every task includes:
- Concrete acceptance criteria verifiable via commands
- At least 1 happy-path + 1 failure/edge QA scenario
- Evidence artifacts saved to: `.sisyphus/evidence/task-<N>-<scenario>.*`

Tooling guidance:
- CLI verification: `interactive_bash` (tmux) or bash running node/dist.
- Scraping verification: Playwright (real browser automation).

---

## Execution Strategy

### Parallel Execution Waves (target 5–8 tasks per wave)

Wave 1 — Foundation (scaffold + contracts)
- T1–T7

Wave 2 — Core modules in parallel (scrape + download + generate)
- T8–T14

Wave 3 — Integration (incremental logic + CLI wiring + ergonomics)
- T15–T20

Wave 4 — Robustness + end-to-end QA hardening
- T21–T26

### Dependency Matrix (abbreviated)

| Task | Depends On | Blocks |
|------|------------|--------|
| T1 | — | T2–T7 |
| T2 | T1 | T15 |
| T3 | T1 | T4–T5 |
| T4 | T3 | T8, T15–T17 |
| T5 | T3 | T13–T14, T17 |
| T6 | T1 | T8–T9, T15, T20 |
| T7 | T1 | T9–T13 |
| T8 | T4, T6 | T15 |
| T9 | T2, T6, T7 | T10–T12, T22 |
| T10 | T9 | T18–T19 |
| T11 | T9 | T17–T19 |
| T12 | T9 | T18–T19 |
| T13 | T5, T7 | T16, T18 |
| T14 | T5 | T17, T19 |
| T15 | T2, T4, T8–T14 | T21, T25 |
| T16 | T4, T5, T13 | T18 |
| T17 | T14, T4 | T19, T24 |
| T18 | T10–T13, T16 | T15 |
| T19 | T17 | T24 |
| T20 | T6 | T25 |
| T21 | T4, T15 | T25 |
| T22 | T9 | T15 |
| T23 | T5 | T25 |
| T24 | T17, T19 | F3 |
| T25 | T15–T24 | Final Verification |
| T26 | T1–T5 | — |

---

## TODOs

- [x] 1. Repository scaffold + build/run scripts

  **What to do**:
  - Initialize Node.js + TypeScript CLI project structure (`src/`, `dist/`).
  - Target Node.js: **>= 20 LTS** (to rely on stable built-in `fetch` and modern TS/ESM support).
  - Recommended CLI parsing library (to reduce ambiguity): **commander**.
  - Add package scripts for: build, dev-run, lint/format (optional), and a single “run CLI” command.
  - Establish standard directories:
    - `src/cli/` (argument parsing + command entry)
    - `src/core/` (high-level orchestration)
    - `src/vsco/` (scraping/extraction)
    - `src/download/` (download + validation)
    - `src/site/` (static HTML generation)
    - `src/manifest/` (schema + read/write)
    - `src/utils/` (fs/path/logging/rate limit)
  - Add `.gitignore` for `dist/`, Playwright browser cache, evidence artifacts.

  **Must NOT do**:
  - Don’t add test framework (MVP explicitly no automated tests).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: standard scaffold/setup.
  - **Skills**: []

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: T2–T7
  - Blocked By: None

  **References**:
  - External: Node.js TypeScript CLI project patterns (keep minimal; avoid framework lock-in).

  **Acceptance Criteria**:
  - [ ] `npm run build` (or equivalent) succeeds and produces `dist/`.
  - [ ] `node dist/...` can execute and prints a placeholder help message.

  **QA Scenarios**:
  ```
  Scenario: Build and run help text
    Tool: Bash
    Steps:
      1. Run build command
      2. Run CLI with --help
    Expected Result: Exit code 0; help text printed
    Evidence: .sisyphus/evidence/task-1-build-help.txt

  Scenario: Running without args fails gracefully
    Tool: Bash
    Steps:
      1. Run CLI without args
    Expected Result: Exit code != 0; prints usage and error message
    Evidence: .sisyphus/evidence/task-1-noargs-error.txt
  ```

- [x] 2. CLI argument parsing + validation contract

  **What to do**:
  - Define CLI interface:
    - positional: profile URL (must match `https://vsco.co/<username>`; tolerate trailing slash/query/redirect)
    - options: `--out-root <dir>`, `--verbose`
  - Implement validation and normalized parsing to produce:
    - `username`
    - `profileUrlNormalized`
    - `backupRoot` (= join(outRoot, username))

  **Must NOT do**:
  - Don’t support username-only input (explicit decision: URL only).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1 (with T3–T7)
  - Blocks: T15+ (integration)
  - Blocked By: T1

  **References**:
  - External: URL parsing best practices; ensure Windows paths aren’t assumed (even if MVP targets macOS/Linux).

  **Acceptance Criteria**:
  - [ ] `vsco-backup "https://vsco.co/foo" --out-root /tmp/vsco` resolves backup root `/tmp/vsco/foo/`.
  - [ ] Invalid URL prints a clear error and usage.

  **QA Scenarios**:
  ```
  Scenario: Valid URL parsing
    Tool: interactive_bash
    Steps:
      1. Run: node dist/... "https://vsco.co/foo" --out-root /tmp/vsco
      2. Observe printed resolved paths (concise output)
    Expected Result: Shows username=foo; backupRoot=/tmp/vsco/foo
    Evidence: .sisyphus/evidence/task-2-parse-url.txt

  Scenario: Invalid URL rejected
    Tool: interactive_bash
    Steps:
      1. Run: node dist/... "https://example.com/foo"
    Expected Result: Exit != 0; message mentions expected vsco.co URL format
    Evidence: .sisyphus/evidence/task-2-invalid-url.txt
  ```

- [x] 3. Manifest schema (versioned) + types

  **What to do**:
  - Define a versioned manifest schema with `schemaVersion`.
  - Include entities: profile, photos, galleries, blog_posts, backup_runs.
  - Decide stable keys:
    - Preferred: VSCO-provided IDs discovered via network responses
    - Fallback: deterministic hash of canonical media URL

  **Must NOT do**:
  - Don’t store cookies/session data.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: T4–T6, T8+
  - Blocked By: T1

  **References**:
  - Draft data model in `.sisyphus/drafts/vsco-profile-backup-cli.md`.

  **Acceptance Criteria**:
  - [ ] Manifest type can be serialized/deserialized with runtime validation (lightweight).

  **QA Scenarios**:
  ```
  Scenario: Manifest roundtrip
    Tool: Bash
    Steps:
      1. Run a small node script that creates a manifest object and JSON.stringify
      2. Parse back and validate
    Expected Result: No thrown errors
    Evidence: .sisyphus/evidence/task-3-manifest-roundtrip.txt
  ```

- [x] 4. Manifest IO: init/load/atomic save + run recording

  **What to do**:
  - Implement:
    - `ensureBackupRoot(backupRoot)`
    - `loadManifest(backupRoot)` (if missing: init)
    - `saveManifestAtomic(backupRoot, manifest)` (write temp + rename)
    - `recordBackupRunStart/Finish` with counts and status.
  - Location: `<backup-root>/.vsco-backup/manifest.json`.

  **Must NOT do**:
  - Don’t rewrite manifest in-place without atomicity.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: T15+ (integration), T8+ (needs manifest)
  - Blocked By: T3

  **Acceptance Criteria**:
  - [ ] Fresh run creates `.vsco-backup/manifest.json` valid JSON.
  - [ ] Save is atomic (no partially written file on interruption; best-effort simulated).

  **QA Scenarios**:
  ```
  Scenario: Init manifest on first run
    Tool: Bash
    Steps:
      1. Run CLI with a dummy username in a temp out-root
      2. Assert manifest file exists
    Expected Result: manifest.json exists and has schemaVersion + profile.username
    Evidence: .sisyphus/evidence/task-4-init-manifest.txt

  Scenario: Atomic save behavior
    Tool: Bash
    Steps:
      1. Trigger save twice rapidly (or via a small script)
      2. Validate manifest is always parseable JSON
    Expected Result: No JSON parse errors
    Evidence: .sisyphus/evidence/task-4-atomic-save.txt
  ```

- [x] 5. Output layout + slug/file naming policy (collision-proof)

  **What to do**:
  - Define canonical output layout:
    - `.vsco-backup/manifest.json`
    - `.vsco-backup/media/` (downloaded binaries)
    - `assets/` (generated CSS/JS)
    - `index.html`, `galleries/<gallery-slug>/index.html`, `blog/<post-slug>/index.html`
  - Define slug rules for gallery/post:
    - normalize unicode, lowercase, hyphenate
    - collision handling: append short suffix (e.g., `-2`, or `-<shortid>`)
  - Define media filename rules:
    - prefer stable media ID; fallback to hash of canonical URL
    - include extension based on content-type

  **Must NOT do**:
  - Don’t generate filenames from titles alone (collision risk).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: T9–T14 (downloader/generator), T15+
  - Blocked By: T3

  **Acceptance Criteria**:
  - [ ] Given two galleries with same name, slugs differ deterministically.
  - [ ] Media filename generation is stable across runs.

  **QA Scenarios**:
  ```
  Scenario: Slug collision handling
    Tool: Bash
    Steps:
      1. Run a small node script that slugs ["My Gallery", "My Gallery"]
    Expected Result: Distinct slugs produced; stable ordering
    Evidence: .sisyphus/evidence/task-5-slug-collision.txt
  ```

- [x] 6. Logging + progress reporting utility

  **What to do**:
  - Implement a logger with levels: info (default), debug (verbose).
  - Standardize progress events:
    - discovered counts (photos/galleries/blog)
    - download queue size; completed/failed
    - summary: new/missing/invalid redownloaded

  **Must NOT do**:
  - Don’t spam per-request logs in default mode.

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: T15+ (integration)
  - Blocked By: T1

  **Acceptance Criteria**:
  - [ ] Default run prints a concise summary line for each phase.
  - [ ] `--verbose` prints detailed steps including backoff/retry notes.

  **QA Scenarios**:
  ```
  Scenario: Verbose toggles debug logs
    Tool: Bash
    Steps:
      1. Run CLI once without --verbose
      2. Run CLI with --verbose
    Expected Result: Second run includes debug lines; first does not
    Evidence: .sisyphus/evidence/task-6-verbose-diff.txt
  ```

- [x] 7. Rate limiting + retry policy helper (conservative defaults)

  **What to do**:
  - Implement:
    - fixed/random delay between navigation/download actions
    - exponential backoff with jitter for transient failures (timeouts, 5xx, 429)
    - max attempts cap (e.g., 5)
  - Ensure deterministic “give up” behavior with clear error reporting.

  **Must NOT do**:
  - Don’t retry deterministic failures (404, parse errors).

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: T10–T14 (downloader/scraper)
  - Blocked By: T1

  **References**:
  - External: Playwright navigation timeout + retry guidance; general exponential backoff with jitter.

  **Acceptance Criteria**:
  - [ ] A simulated transient failure triggers retries with increasing delays.

  **QA Scenarios**:
  ```
  Scenario: Backoff increases per attempt
    Tool: Bash
    Steps:
      1. Run a node script that calls retry wrapper around a function failing N-1 times
      2. Capture timestamps
    Expected Result: Delays are non-decreasing; stop after success
    Evidence: .sisyphus/evidence/task-7-backoff.txt
  ```

- [x] 8. Robots.txt fetch + policy enforcement

  **What to do**:
  - On run start, fetch `https://vsco.co/robots.txt`.
  - Apply **safe default**:
    - If profile crawling appears disallowed: stop with clear message and suggest an explicit override flag (e.g., `--ignore-robots`).
    - If robots fetch fails due to network: **warn and proceed** (record in manifest) with conservative throttling.
  - Record robots decision in manifest run log.

  **Must NOT do**:
  - Don’t silently ignore robots disallow rules.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: policy decisions + edge cases.

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: T15 (main orchestration)
  - Blocked By: T6 (logging), T4 (manifest run recording)

  **Acceptance Criteria**:
  - [ ] If robots fetch fails (network), default behavior is explicit and documented (e.g., warn + proceed, or fail). Choose one and be consistent.

  **QA Scenarios**:
  ```
  Scenario: Robots disallow stops run
    Tool: Bash
    Preconditions: Stub robots response (or point to a controlled URL in dev mode)
    Steps:
      1. Run CLI
    Expected Result: Exit != 0; message mentions robots.txt and override flag
    Evidence: .sisyphus/evidence/task-8-robots-stop.txt
  ```

- [x] 9. VSCO profile discovery: extract canonical identifiers and entry URLs

  **What to do**:
  - Implement Playwright navigation to profile URL.
  - Establish a stable extraction strategy preference order:
    1) Parse network JSON responses for IDs/asset URLs
    2) Fallback to DOM parsing for visible items
  - Extract/confirm:
    - canonical username
    - profile metadata needed for site header
    - entry points for photos/galleries/blog
  - Define crawl stopping rule for infinite scroll:
    - Stop when **no new IDs discovered** after N scroll cycles (default 3) OR after max cycles cap.

  **Must NOT do**:
  - Don’t rely on brittle classnames only.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2 (with T10–T14)
  - Blocks: T15–T18
  - Blocked By: T2, T6, T7

  **References**:
  - External: Playwright locators guidance.

  **Acceptance Criteria**:
  - [ ] For a known public profile, extractor returns a non-empty set of photo IDs/URLs OR a clear “no content” result.

  **QA Scenarios**:
  ```
  Scenario: Extracts at least one item from a real profile
    Tool: Playwright
    Steps:
      1. Navigate to a public test profile URL
      2. Run discovery until stopping rule triggers
      3. Save extracted summary JSON to evidence
    Expected Result: summary contains counts and at least one ID OR explicit empty profile signal
    Evidence: .sisyphus/evidence/task-9-discovery.json

  Scenario: Private/suspended profile handled
    Tool: Playwright
    Steps:
      1. Navigate to a known private/nonexistent profile URL
    Expected Result: Graceful error message; exit code != 0; no partial files written beyond manifest run log
    Evidence: .sisyphus/evidence/task-9-private-error.txt
  ```

- [x] 10. Photos scraper: enumerate photo items + highest-res candidate URLs

  **What to do**:
  - From discovery, enumerate photo items with stable IDs.
  - For each photo, collect candidate URLs (srcset/variants) and select highest-res.
  - Capture minimal metadata: width/height if discoverable, caption if present.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: T16 (download queue), T19 (site)
  - Blocked By: T9

  **Acceptance Criteria**:
  - [ ] Produces a deterministic list of photo records with chosen `url_highres`.

  **QA Scenarios**:
  ```
  Scenario: Highest-res selection from srcset candidates
    Tool: Bash
    Steps:
      1. Run unit-like node script feeding sample srcset to selector
    Expected Result: Chooses max resolution candidate
    Evidence: .sisyphus/evidence/task-10-srcset-select.txt
  ```

- [x] 11. Galleries scraper: enumerate galleries + membership

  **What to do**:
  - Discover galleries with stable IDs and names.
  - For each gallery, enumerate photo IDs contained.
  - Generate stable `gallery-slug` (from T5) for page path.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: T19 (site)
  - Blocked By: T9

  **Acceptance Criteria**:
  - [ ] At least one gallery (if present) yields a non-empty photo list.

  **QA Scenarios**:
  ```
  Scenario: Gallery enumeration
    Tool: Playwright
    Steps:
      1. Navigate to a profile with galleries
      2. Extract gallery list and one gallery’s photo IDs
    Expected Result: gallery count > 0; each gallery has stable id + slug
    Evidence: .sisyphus/evidence/task-11-galleries.json
  ```

- [x] 12. Blog posts scraper: enumerate posts + content extraction

  **What to do**:
  - Discover blog posts with stable IDs and slugs.
  - Extract title, published_at, and content HTML suitable for offline rendering.
  - Normalize embedded asset URLs so they can be downloaded.

  **Must NOT do**:
  - Don’t attempt to execute remote scripts in offline HTML.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: T19 (site), T16 (download queue for embedded assets)
  - Blocked By: T9

  **Acceptance Criteria**:
  - [ ] Produces a deterministic list of posts with non-empty title/slug.

  **QA Scenarios**:
  ```
  Scenario: Blog post extraction
    Tool: Playwright
    Steps:
      1. Navigate to a profile with a blog post
      2. Extract the first post content HTML
    Expected Result: content_html length > 0; local-link rewrite map created
    Evidence: .sisyphus/evidence/task-12-blog.json
  ```

- [x] 13. Downloader: fetch binary assets with validation + re-download invalid

  **What to do**:
  - Implement download pipeline to `.vsco-backup/media/`.
  - Validation policy:
    - If file missing → download
    - If size==0 → re-download
    - If expected size known and mismatch → re-download
    - Otherwise keep
  - Use conservative rate limiting + retry wrapper (T7).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: T18–T20
  - Blocked By: T5, T7

  **Acceptance Criteria**:
  - [ ] A 0-byte placeholder file is replaced by a non-zero download on rerun.

  **QA Scenarios**:
  ```
  Scenario: Re-download invalid file
    Tool: Bash
    Steps:
      1. Create an empty target media file at expected path
      2. Run downloader for that URL
    Expected Result: File size > 0 after run
    Evidence: .sisyphus/evidence/task-13-redownload.txt

  Scenario: Retry transient failure
    Tool: Bash
    Steps:
      1. Simulate transient failure (e.g., local proxy returning 503 first 2 times)
      2. Run downloader
    Expected Result: Eventually succeeds; logs show backoff attempts when --verbose
    Evidence: .sisyphus/evidence/task-13-retry.txt
  ```

- [x] 14. Static site templates (minimal) + asset pipeline

  **What to do**:
  - Create minimal HTML templates for:
    - index grid
    - gallery page
    - blog post page
  - Generate `assets/style.css` (simple, readable) and ensure relative links work with `file://`.
  - Include a “last backup” stamp sourced from manifest.

  **Must NOT do**:
  - Don’t overbuild a full theming system.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: T19–T20
  - Blocked By: T5

  **Acceptance Criteria**:
  - [ ] Templates render valid HTML with relative links.

  **QA Scenarios**:
  ```
  Scenario: Template render smoke test
    Tool: Bash
    Steps:
      1. Run generator with fixture manifest JSON
      2. Assert output files exist
    Expected Result: index.html + one gallery + one blog page created
    Evidence: .sisyphus/evidence/task-14-templates.txt
  ```

- [ ] 15. Core orchestration: run pipeline + phase boundaries

  **What to do**:
  - Implement high-level runner:
    1) parse args → backupRoot
    2) load/init manifest
    3) robots policy check
    4) scrape discovery + entities
    5) compute incremental plan (new/missing/invalid)
    6) download queue execution (sequential)
    7) generate static site
    8) record run summary

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: cross-module integration and failure modes.

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Sequential (Wave 3)
  - Blocks: T21–T26
  - Blocked By: T2, T4, T8–T14

  **Acceptance Criteria**:
  - [ ] A run completes end-to-end for a small public profile.

  **QA Scenarios**:
  ```
  Scenario: End-to-end run (happy path)
    Tool: Playwright + Bash
    Steps:
      1. Run CLI for a known public profile into a temp out-root
      2. Assert manifest exists and includes run summary
      3. Assert index.html exists
    Expected Result: Exit 0; summary prints counts; files created
    Evidence: .sisyphus/evidence/task-15-e2e.txt

  Scenario: Network failure yields partial but recoverable run
    Tool: Bash
    Steps:
      1. Simulate intermittent failure mid-download
      2. Rerun
    Expected Result: First run status=partial; second run resumes and finishes; no deletion
    Evidence: .sisyphus/evidence/task-15-partial-resume.txt
  ```

- [x] 16. Incremental detection rules (new vs missing vs invalid)

  **What to do**:
  - Define incremental classification:
    - **new**: discovered ID not in manifest
    - **missing**: in manifest but local file missing
    - **invalid**: local file fails validation policy
  - Ensure rerun with no changes results in 0 new/missing/invalid.

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Wave 3 (with T15)
  - Blocks: T17–T20
  - Blocked By: T4, T5, T13

  **Acceptance Criteria**:
  - [ ] Second run against unchanged profile performs 0 downloads.

  **QA Scenarios**:
  ```
  Scenario: Rerun is incremental
    Tool: Bash
    Steps:
      1. Run CLI once
      2. Run CLI again
    Expected Result: Second run reports 0 new downloads; manifest run log shows new_content_count=0
    Evidence: .sisyphus/evidence/task-16-rerun-incremental.txt
  ```

- [x] 17. Site generator: write index/gallery/blog pages from manifest

  **What to do**:
  - Generate pages every run (idempotent) based on manifest content.
  - Use relative links to `.vsco-backup/media/...`.
  - Ensure galleries/blog pages link back to index.
  - Decide update semantics: **always regenerate HTML**; do not delete stale pages (guardrail).

  **Must NOT do**:
  - Don’t delete pages for content that disappeared upstream; optionally mark as “missing upstream” in HTML, but keep page.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Wave 3
  - Blocks: T21–T26
  - Blocked By: T14, T4

  **Acceptance Criteria**:
  - [ ] All required HTML files exist after run.

  **QA Scenarios**:
  ```
  Scenario: Generated pages exist and link correctly
    Tool: Bash
    Steps:
      1. Run CLI
      2. Assert paths: index.html, galleries/*/index.html, blog/*/index.html
      3. Grep for expected relative link prefixes
    Expected Result: All files exist; links are relative (no https required for navigation)
    Evidence: .sisyphus/evidence/task-17-pages.txt
  ```

- [ ] 18. Download planning: build download queue from scraped entities

  **What to do**:
  - Convert scraped entities into a download queue of URLs → local paths.
  - Deduplicate by stable media ID.
  - Include embedded blog assets discovered in T12.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Wave 3
  - Blocks: T15
  - Blocked By: T10–T13, T16

  **Acceptance Criteria**:
  - [ ] Queue length equals (#new + #missing + #invalid) assets.

  **QA Scenarios**:
  ```
  Scenario: Queue excludes already-downloaded assets
    Tool: Bash
    Steps:
      1. Run once to populate manifest
      2. Run plan builder only (dry-run mode if implemented) to print queue size
    Expected Result: Queue size 0 on second run
    Evidence: .sisyphus/evidence/task-18-queue-zero.txt
  ```

- [ ] 19. Static site navigation + “profile home” UX

  **What to do**:
  - Ensure index page shows:
    - profile title/header
    - photo grid thumbnails linking to original (optional) and/or local media
    - links to galleries and blog index sections
  - Galleries page shows gallery name + contained photos.
  - Blog post pages show title + date + content.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 3 (can be done alongside T18 if generator supports)
  - Blocks: T24 (offline open QA)
  - Blocked By: T14, T17

  **Acceptance Criteria**:
  - [ ] Opening `index.html` locally allows navigation to galleries/blog pages.

  **QA Scenarios**:
  ```
  Scenario: Offline navigation works
    Tool: Playwright
    Steps:
      1. Open file://.../index.html
      2. Click a gallery link
      3. Navigate back
      4. Click a blog post link
    Expected Result: All navigations succeed; images load from local paths
    Evidence: .sisyphus/evidence/task-19-offline-nav.png
  ```

- [x] 20. Error taxonomy + exit codes

  **What to do**:
  - Standardize error classes and exit codes:
    - invalid input
    - robots disallowed
    - profile not found/private
    - scrape parse failure
    - download failures (partial)
  - Ensure messages are user-friendly (actionable next step) and concise by default.

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 3
  - Blocks: T24–T26
  - Blocked By: T6

  **Acceptance Criteria**:
  - [ ] Each error case produces a stable exit code and actionable message.

  **QA Scenarios**:
  ```
  Scenario: Robots disallowed exit code
    Tool: Bash
    Steps:
      1. Trigger robots disallowed
    Expected Result: Exit code matches documented value; prints override flag
    Evidence: .sisyphus/evidence/task-20-robots-exit.txt
  ```

- [ ] 21. Resume safety: per-item manifest updates + crash tolerance

  **What to do**:
  - Update manifest incrementally as items complete (or in small batches) so a crash leaves useful state.
  - Ensure partial run is recorded as `partial` with counts.

  **Must NOT do**:
  - Don’t require starting from scratch after a failure.

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - Can Run In Parallel: NO
  - Parallel Group: Wave 4
  - Blocks: T25–T26
  - Blocked By: T4, T15

  **Acceptance Criteria**:
  - [ ] Killing the process mid-run leaves manifest parseable and next run continues.

  **QA Scenarios**:
  ```
  Scenario: Kill mid-run and resume
    Tool: interactive_bash
    Steps:
      1. Start a run on a profile with enough items to take time
      2. Interrupt process (Ctrl+C)
      3. Rerun
    Expected Result: Second run resumes; does not re-download completed items; no manifest corruption
    Evidence: .sisyphus/evidence/task-21-resume.txt
  ```

- [ ] 22. Crawl stopping rule + caps (anti-runaway)

  **What to do**:
  - Implement a default stopping rule:
    - stop after N scroll cycles with 0 new IDs (default 3)
    - hard cap total scroll cycles (e.g., 50)
  - Optionally add CLI flags (MVP acceptable): `--max-scrolls`, `--max-items`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 4
  - Blocks: reliable completeness for T9–T12
  - Blocked By: T9

  **Acceptance Criteria**:
  - [ ] Run terminates in bounded time even if VSCO keeps lazy-loading.

  **QA Scenarios**:
  ```
  Scenario: Stopping rule triggers
    Tool: Playwright
    Steps:
      1. Run discovery
      2. Capture scroll iterations and new-ID counts
    Expected Result: Stops when consecutive no-new threshold reached; logs mention stopping reason
    Evidence: .sisyphus/evidence/task-22-stopping.json
  ```

- [ ] 23. Deterministic filenames + collision tests

  **What to do**:
  - Add safeguards:
    - two items never map to same local path
    - path length constraints
    - safe characters only
  - Validate that stable ID → path mapping is stable across runs.

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 4
  - Blocks: overall stability
  - Blocked By: T5

  **Acceptance Criteria**:
  - [ ] Fixture set with collisions produces unique paths.

  **QA Scenarios**:
  ```
  Scenario: Path uniqueness for collisions
    Tool: Bash
    Steps:
      1. Run a script generating paths for a fixture with duplicate titles
    Expected Result: No duplicates; stable outputs
    Evidence: .sisyphus/evidence/task-23-path-unique.txt
  ```

- [ ] 24. Offline open verification (file://) + screenshot evidence

  **What to do**:
  - Use Playwright to open generated `file://.../index.html` and navigate.
  - Capture screenshots for:
    - index
    - a gallery page
    - a blog post page

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 4
  - Blocks: final verification
  - Blocked By: T17, T19

  **Acceptance Criteria**:
  - [ ] Screenshots exist and show content (not blank placeholders).

  **QA Scenarios**:
  ```
  Scenario: Capture offline screenshots
    Tool: Playwright
    Steps:
      1. Open file:// index
      2. Screenshot
      3. Navigate to gallery and blog pages; screenshot each
    Expected Result: PNG files written
    Evidence: .sisyphus/evidence/task-24-offline-index.png
  ```

- [ ] 25. End-to-end acceptance runbook + evidence consolidation

  **What to do**:
  - Provide a single runbook command sequence for the executor to run on a clean machine:
    - build
    - run backup
    - rerun incremental
    - truncate a file and rerun
  - Ensure evidence files are written for each step.

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 4
  - Blocks: Final verification wave
  - Blocked By: T15–T21

  **Acceptance Criteria**:
  - [ ] Runbook includes exact commands and expected outputs.

  **QA Scenarios**:
  ```
  Scenario: Runbook completeness check
    Tool: Bash
    Steps:
      1. Execute runbook commands
    Expected Result: All steps produce expected artifacts; evidence exists
    Evidence: .sisyphus/evidence/task-25-runbook.txt
  ```

- [ ] 26. Documentation: minimal README usage + output structure

  **What to do**:
  - Add minimal README section:
    - install/build
    - run examples
    - output layout
    - limitations (no auth, robots policy, rate limiting)

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - Can Run In Parallel: YES
  - Parallel Group: Wave 4
  - Blocks: none
  - Blocked By: T1–T2, T5

  **Acceptance Criteria**:
  - [ ] README contains a copy-pastable command and an output tree example.

  **QA Scenarios**:
  ```
  Scenario: README quick-start run
    Tool: Bash
    Steps:
      1. Copy/paste README commands
    Expected Result: Works without missing steps
    Evidence: .sisyphus/evidence/task-26-readme-run.txt
  ```


---

## Final Verification Wave

- [ ] F1. Plan Compliance Audit — `oracle`
- [ ] F2. Code Quality Review — `unspecified-high`
- [ ] F3. End-to-End QA Execution — `unspecified-high` (+ `playwright` skill)
- [ ] F4. Scope Fidelity Check — `deep`

---

## Commit Strategy

> Greenfield repo: prefer small atomic commits after completing each task (or tight 1-concern bundle).
> Goal: a clear local timeline showing incremental progress and easy bisects.

- Suggested convention: `feat(cli): ...`, `feat(scrape): ...`, `feat(site): ...`, `chore(scaffold): ...`, `fix(download): ...`

### Cadence (recommended)
- Commit after each Wave-1 foundation task (T1–T7) to establish a stable base.
- Wave 2–4: commit after each scraper/downloader/generator module task, even if feature-incomplete, as long as build still runs.
- Always include a short “why” in the body when a commit introduces guardrails (robots, caps, no-delete).

### Suggested atomic commit checkpoints
- After T1: `chore(scaffold): initialize ts cli project structure`
- After T2: `feat(cli): parse vsco url and resolve backup root`
- After T3–T4: `feat(manifest): add schema and atomic read/write`
- After T5: `feat(core): define output layout and stable naming`
- After T6–T7: `chore(log): add logger and retry/backoff helpers`
- After T8: `feat(policy): enforce robots.txt policy`
- After T9: `feat(scrape): add profile discovery and stopping rule`
- After T10–T12: `feat(scrape): extract photos/galleries/blog entities`
- After T13: `feat(download): download assets with validation and retries`
- After T14: `feat(site): add minimal html templates and assets`
- After T15–T16: `feat(core): orchestrate pipeline and incremental detection`
- After T17–T20: `feat(site): generate pages and improve offline navigation`
- After T21–T24: `fix(core): improve resume safety and offline verification`
- After T25–T26: `docs: add runbook and readme quick-start`

### Guardrails
- Never commit secrets (cookies, tokens) — this project should not store them at all.
- Keep `.sisyphus/evidence/` out of git by default (it’s machine-specific); if you want it tracked, decide explicitly.

---

## Success Criteria

- [ ] Command works on macOS/Linux: `vsco-backup "https://vsco.co/<u>"`.
- [ ] Output folder contains manifest + static site pages + downloaded media.
- [ ] Re-run is incremental and produces stable results.
