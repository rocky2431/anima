# Ultra Review Recheck - cron-service (iter2)

**Session**: `20260219-023300-feat-task-12-cron-service-iter1-iter2`
**Parent**: `20260218-181836-feat-task-12-cron-service-iter1`
**Verdict**: COMMENT
**Findings**: 8 total (P0: 0, P1: 3, P2: 4, P3: 1)

## Delta from Previous Review

### Resolved (16 findings)

| Severity | Title | Resolution |
|----------|-------|------------|
| **P0** | Silent no-op when handler not registered | Added `validateOptions()` that throws before saving |
| **P0** | Handler errors propagate unhandled | Added catch block with `onError` callback |
| P1 | No input validation on schedule params | Added validation for date, interval, cron expression, handler, name |
| P1 | Race condition in runCount increment | Atomic SQL: `run_count = run_count + 1` |
| P1 | Handler errors in callback unhandled | Catch block with onError (same as P0 fix) |
| P1 | updateLastRun can mask original error | Nested try/catch with onError |
| P1 | Cron constructor leaves orphaned DB records | `createJob()` removes record on schedule failure |
| P1 | start() aborts on first failure | Per-job try/catch isolation |
| P1 | Mutable CronJobRecord fields | All fields marked `readonly` |
| P1 | pause/resume untested | Added test coverage |
| P1 | Handler error paths untested | Added error handling tests |
| P1 | start() filtering untested | Added persistence tests |
| P2 | Unsafe `as` cast on mode field | Added `VALID_MODES` runtime validation |
| P2 | close() no try/finally | Added try/finally |
| P2 | stop() untested | Added stop() test |
| P2 | Near-duplicate at/every/cron | Extracted `createJob()` |

### Unchanged (3 findings - accepted as-is)

| Severity | Title | Rationale |
|----------|-------|-----------|
| P1 | Package has no consumer | Expected for new package; wired in future integration task |
| P1 | No structured logging | Library uses onError callback; logging at integration layer |
| P1 | Polymorphic schedule string | Acceptable trade-off for SQLite persistence simplicity |

### New Findings: 0

## Remaining Findings (P2/P3 only)

1. **[P2]** CronService hardcodes JobStore dependency - DI deferred to integration
2. **[P2]** No use-after-close guard on JobStore - Low risk, managed by CronService lifecycle
3. **[P2]** CronJobRecord mixes config and state - Acceptable for current scope
4. **[P2]** Exported classes lack JSDoc - Type signatures self-documenting
5. **[P3]** save() uses 11 positional SQL parameters - Readability suggestion

## Test Status

- **34/34 tests passing** (11 job-store + 23 cron-service)
- ESLint: 0 errors
- TypeScript: 0 errors
- Build: success
