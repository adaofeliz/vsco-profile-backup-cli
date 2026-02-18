# Fix: VSCO Discovery Timeout (Playwright load-state)

## TL;DR
Fix the backup failure caused by Playwright timing out on `page.waitForLoadState('networkidle')` during profile discovery. Replace “network idle” waits with **DOM + selector readiness**, add `--timeout-ms` to control timeouts, and capture **screenshot + HTML** to `<backupRoot>/.vsco-backup/logs/` on failure.

**Primary Repro**
```bash
node dist/cli/index.js "https://vsco.co/june-ten" --out-root ./backups/
```

**Observed Error**
`Profile discovery failed: page.waitForLoadState: Timeout 30000ms exceeded.`

---

## Context

### What’s happening
VSCO pages can keep background network activity running (analytics/long-polling), so Playwright’s `networkidle` may never be reached even when the DOM is usable.

### Code references (verified)
- `src/vsco/discovery.ts` — contains:
  - `page.goto(profileUrl, { timeout: opts.navigationTimeout })` (no explicit waitUntil)
  - `await page.waitForLoadState('networkidle', { timeout: opts.navigationTimeout });` (line ~75)
- Additional risk areas (should be audited as part of this fix):
  - `src/vsco/blog.ts` uses `waitUntil: 'networkidle'`
  - `src/qa/offline-test.ts` uses `waitUntil: 'networkidle'`
- Pipeline entry:
  - `src/core/index.ts:orchestrateBackup()` calls `discoverProfile(username)` without passing timeouts.
- CLI options live in:
  - `src/cli/index.ts` and `src/cli/types.ts`

### Confirmed user preferences
- Evidence location: `<backupRoot>/.vsco-backup/logs/`
- Add CLI override flag: `--timeout-ms <number>`
- Replace `networkidle` with DOM+selector readiness.

---

## Work Objectives

### Must Have
- [ ] `--timeout-ms` is supported and affects discovery navigation + readiness waits.
- [ ] `discoverProfile()` no longer depends on `networkidle`.
- [ ] On discovery failure, artifacts are written to `<backupRoot>/.vsco-backup/logs/`:
  - screenshot (png)
  - HTML snapshot (html)
  - both filenames include run id + phase + timestamp.
- [ ] Original error is still surfaced even if artifact writing fails.

### Must NOT Have
- No stealth/captcha bypass/login.
- No unbounded waits; timeouts remain bounded and configurable.
- Do not change the manifest schema (unless strictly necessary for logging paths).

---

## Verification Strategy

No unit tests required for this fix; verification is agent-executed QA:

### QA Scenarios
1. **Repro becomes pass (or changes failure mode) with selector readiness**
   - Run the original command for `june-ten`.
   - Expected: discovery proceeds past initial load and either:
     - completes discovery, OR
     - fails with a more meaningful selector/blocked/private error (not `networkidle` timeout).

2. **Timeout override works**
   - Run with `--timeout-ms 1`.
   - Expected: quick failure; artifacts created; message includes artifact paths.

3. **Artifact location correctness**
   - Ensure files exist under `<backupRoot>/.vsco-backup/logs/`.

---

## Execution Strategy (Max Parallelism)

Wave 1 (parallel)
- T1: Add `--timeout-ms` plumbing (CLI → core → vsco options)
- T2: Implement readiness strategy in `discoverProfile` (remove `networkidle`)
- T3: Add artifact capture utility (logs dir + screenshot + HTML)

Wave 2 (after Wave 1)
- T4: Audit and replace other `networkidle` usage likely to hang (blog/offline QA)
- T5: Run QA scenarios and capture evidence

---

## TODOs

- [x] 1. Add `--timeout-ms` CLI flag and plumb into discovery

  **What to do**:
  - Update `src/cli/types.ts` to include `timeoutMs?: number`.
  - Update `src/cli/index.ts` to parse `--timeout-ms <number>` with validation:
    - integer
    - min 1ms
    - cap to a reasonable maximum (default: 90_000; max: 300_000) (documented)
  - Update `src/core/index.ts:orchestrateBackup()` signature to accept an options object (or pass through timeoutMs separately).
  - Pass the timeout to `discoverProfile(username, { navigationTimeout: timeoutMs })`.
  - Also pass through `backupRoot` and the current manifest `runId` so downstream modules can write artifacts to `<backupRoot>/.vsco-backup/logs/`.

  **References**:
  - `src/cli/index.ts` (existing option parsing)
  - `src/cli/types.ts` (options interface)
  - `src/core/index.ts:orchestrateBackup` (current call: `discoverProfile(username)`)
  - `src/vsco/types.ts:DiscoveryOptions` (has `navigationTimeout?: number`)

  **Acceptance Criteria**:
  - [ ] `node dist/cli/index.js "https://vsco.co/june-ten" --out-root ./backups --timeout-ms 120000` prints configured timeout in verbose mode.
  - [ ] `--timeout-ms not-a-number` fails with a clear error.

  **QA Scenarios**:
  ```
  Scenario: Timeout flag validation
    Tool: Bash
    Steps:
      1. Run with --timeout-ms abc
    Expected Result: Exit != 0; message explains number required
    Evidence: .sisyphus/evidence/fix-timeouts-timeoutms-invalid.txt
  ```

- [x] 2. Replace `networkidle` with DOM+selector readiness in discovery

  **What to do**:
  - In `src/vsco/discovery.ts`, remove `waitForLoadState('networkidle')`.
  - Change navigation to `page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout })`.
  - Implement a readiness helper that waits for one of:
    - content signal (e.g., existence of `[data-id]` or `[data-image-id]`, or other stable selectors discovered in DOM)
    - known private/suspended text (reuse `checkIfPrivateOrSuspended`)
    - known not-found/interstitial signals
  - Ensure readiness wait uses the configured timeout.

  **References**:
  - `src/vsco/discovery.ts:75` (current `networkidle` wait)
  - `src/vsco/discovery.ts:214+` (private/suspended detection selectors)

  **Acceptance Criteria**:
  - [ ] The error `waitForLoadState('networkidle') timeout` no longer occurs.
  - [ ] If page is blocked/interstitial, error message is specific (selector-based) and artifacts captured.

  **QA Scenarios**:
  ```
  Scenario: Profile discovery does not depend on network idle
    Tool: Bash
    Steps:
      1. Run: node dist/cli/index.js "https://vsco.co/june-ten" --out-root ./backups --timeout-ms 120000 --verbose
    Expected Result: No networkidle timeout; progress continues beyond initial navigation
    Evidence: .sisyphus/evidence/fix-timeouts-discovery-no-networkidle.txt
  ```

- [x] 3. Add failure artifact capture to `<backupRoot>/.vsco-backup/logs/`

  **What to do**:
  - Add a utility (e.g., `src/utils/artifacts.ts`) to:
    - ensure `<backupRoot>/.vsco-backup/logs/` exists
    - write:
      - screenshot: `page.screenshot({ path })`
      - HTML: `await page.content()` → file
    - name files with: phase + runId + timestamp
  - Wire into discovery catch block so on failure it attempts to capture artifacts.
  - Capture artifacts **only on final failure** (not on every retry attempt) to avoid log explosion.
  - If artifact capture fails, log a warning but preserve original error.

  **References**:
  - `src/vsco/discovery.ts` catch block (currently only logs and closes browser)
  - Output conventions in `src/utils/paths.ts` for `.vsco-backup/`

  **Acceptance Criteria**:
  - [ ] On induced failure, two files appear under `<backupRoot>/.vsco-backup/logs/`.
  - [ ] Console prints the artifact paths.

  **QA Scenarios**:
  ```
  Scenario: Fast fail produces artifacts
    Tool: Bash
    Steps:
      1. Run with --timeout-ms 1
      2. List <backupRoot>/.vsco-backup/logs
    Expected Result: Contains png + html with phase/runId in name
    Evidence: .sisyphus/evidence/fix-timeouts-artifacts-listing.txt
  ```

- [x] 4. Audit other `networkidle` waits and switch to selector readiness where appropriate

  **What to do**:
  - Inspect and update:
    - `src/vsco/blog.ts` (`page.goto(... waitUntil: 'networkidle')`)
    - `src/qa/offline-test.ts` (`waitUntil: 'networkidle'`)
  - For offline-test, use `domcontentloaded` or `load` (file://) to avoid hangs.

  **Acceptance Criteria**:
  - [ ] No `waitUntil: 'networkidle'` remains in VSCO scraping paths unless justified.

- [x] 5. End-to-end verification on the reported profile

  **What to do**:
  - Run:
    - `node dist/cli/index.js "https://vsco.co/june-ten" --out-root ./backups --timeout-ms 120000 --verbose`
  - Confirm it passes discovery and proceeds.
  - If it fails due to block/interstitial, ensure artifacts are captured and message is actionable.

  **Acceptance Criteria**:
  - [ ] Either successful backup OR failure with artifacts + actionable message (no networkidle timeout).

---

## Commit Strategy

- Commit 1 (Wave 1): `fix(scrape): replace networkidle with selector readiness`
- Commit 2 (Wave 1): `feat(cli): add --timeout-ms and plumb timeouts`
- Commit 3 (Wave 1): `chore(debug): capture playwright artifacts on failure`
- Commit 4 (Wave 2): `fix(scrape): remove remaining networkidle waits`

---

## Success Criteria

- [ ] The reported command no longer fails due to `waitForLoadState('networkidle')` timeout.
- [ ] `--timeout-ms` reliably controls how long we wait.
- [ ] Failure artifacts are written to `<backupRoot>/.vsco-backup/logs/`.
