# End-to-End Acceptance Runbook

This runbook describes the steps to verify the full backup workflow of the VSCO Profile Backup CLI.

## Prerequisites

- Node.js 18+
- npm
- Internet connection (for initial backup)

## 1. Build the Project

Compile the TypeScript source code into executable JavaScript.

```bash
npm install
npm run build
```

**Expected Output:**
- No compilation errors.
- `dist/` directory populated with `.js` files.

## 2. Run Initial Backup

Perform a full backup of a public VSCO profile.

```bash
node dist/cli/index.js "https://vsco.co/vsco" --out-root ./backups --verbose
```

**Expected Output:**
- Logs showing "Starting backup for vsco".
- Discovery phase finding photos, galleries, and blog posts.
- Download phase showing assets being downloaded.
- "Backup completed successfully for vsco" message.
- Artifacts created in `./backups/vsco/`:
  - `.vsco-backup/manifest.json`
  - `.vsco-backup/media/` (containing images)
  - `index.html`
  - `assets/style.css`

## 3. Verify Incremental Backup

Run the same command again to verify that existing content is skipped.

```bash
node dist/cli/index.js "https://vsco.co/vsco" --out-root ./backups --verbose
```

**Expected Output:**
- Logs showing "Skipping download (already valid)" for existing media.
- `manifest.json` updated with a new backup run entry.
- No new files downloaded if the profile hasn't changed.

## 4. Verify Recovery (Truncate and Rerun)

Simulate a corrupted or missing file and verify the tool recovers it.

1. Identify a file in the media directory:
   ```bash
   ls ./backups/vsco/.vsco-backup/media/ | head -n 1
   ```
2. Truncate the file:
   ```bash
   truncate -s 0 ./backups/vsco/.vsco-backup/media/<filename>
   ```
3. Rerun the backup:
   ```bash
   node dist/cli/index.js "https://vsco.co/vsco" --out-root ./backups --verbose
   ```

**Expected Output:**
- Logs showing "Downloading <filename> ... (reason: zero-byte file)".
- File size restored to its original value.

## 5. Offline Verification

Run the automated offline verification script to check the generated site.

```bash
node dist/qa/offline-test.js ./backups/vsco
```

**Expected Output:**
- "✓ All pages verified successfully" message.
- Screenshots saved in `.sisyphus/evidence/`:
  - `offline-index.png`
  - `offline-gallery.png` (if applicable)
  - `offline-blog.png` (if applicable)

## Evidence Consolidation

After running the steps above, the following evidence should be present:

- `./backups/vsco/.vsco-backup/manifest.json`: Full state of the backup.
- `.sisyphus/evidence/*.png`: Visual confirmation of the generated site.
