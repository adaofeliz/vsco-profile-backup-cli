# Task 1: Add --timeout-ms CLI flag and plumb it through to discovery

## Status: ✅ COMPLETE

### Changes Made

#### 1. `src/cli/types.ts`
- Added `timeoutMs?: number` field to `CliOptions` interface

#### 2. `src/cli/index.ts`
- Added `parseAndValidateTimeout()` function with validation:
  - Validates input is a number
  - Validates input is an integer
  - Enforces minimum: 1ms
  - Enforces maximum: 300000ms (300s) with warning if exceeded
  - Default: 90000ms (90s) when not specified
- Added `--timeout-ms <number>` CLI option with custom parser
- Updated verbose logging to display configured timeout
- Updated usage message to include `--timeout-ms` option

#### 3. `src/core/index.ts`
- Added `BackupOptions` interface with `timeoutMs?: number`
- Updated `orchestrateBackup()` signature to accept `options?: BackupOptions`
- Passes `navigationTimeout: options?.timeoutMs` to `discoverProfile()`

### Validation Tests

✅ **Invalid input (non-numeric)**
```bash
node dist/cli/index.js "https://vsco.co/test" --timeout-ms abc
# Error: --timeout-ms must be a number, got: abc
# Exit code: 1
```

✅ **Below minimum (0ms)**
```bash
node dist/cli/index.js "https://vsco.co/test" --timeout-ms 0
# Error: --timeout-ms must be at least 1ms, got: 0
```

✅ **Valid timeout with verbose logging**
```bash
node dist/cli/index.js "https://vsco.co/test" --timeout-ms 120000 --verbose
# Output includes: "Timeout: 120000ms"
```

✅ **Exceeds maximum (350000ms)**
- Capped to 300000ms with warning logged

### Build Status
- ✅ TypeScript compilation: PASS
- ✅ No LSP diagnostics errors
- ✅ Commit: `feat(cli): add --timeout-ms and plumb timeouts`

### Acceptance Criteria Met
- ✅ `--timeout-ms 120000` works and is logged in verbose mode
- ✅ `--timeout-ms abc` fails with clear error message
- ✅ Default timeout is 90s (90000ms)
- ✅ Timeout is passed through CLI → core → discovery chain

### Evidence
- `.sisyphus/evidence/fix-timeouts-timeoutms-invalid.txt` - Invalid input test
