# Review Summary

**Session**: 20260218-181836-feat-task-12-cron-service-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 2 P0 critical error-handling issues (silent failure on unregistered handler, unhandled async errors in cron callback) and 13 P1 findings across error-handling, test coverage, security, and type design.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 2 |
| P1 High | 13 |
| P2 Medium | 15 |
| P3 Low | 3 |
| **Total** | **33** (deduplicated from 35) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 9 | completed |
| review-tests | 6 | completed |
| review-errors | 7 | completed |
| review-types | 7 | completed |
| review-comments | 3 | completed |
| review-simplify | 3 | completed |

## P0 - Critical (Must Fix)

### [1] Silent no-op when handler is not registered for scheduled job
- **File**: `packages/cron-service/src/cron-service.ts`:127
- **Category**: error-handling / silent-failure
- **Confidence**: 95
- **Reported by**: review-code, review-errors
- **Description**: When scheduleJob() is called but no handler is registered for the record's handler name, the method silently returns. The job record is already persisted to the database (save() is called before scheduleJob() in at()/every()/cron()), so the job exists in the DB but will never fire. On start(), these jobs will also be silently skipped. The caller receives a valid job ID, creating the illusion of success. There is no warning, no error, and no way to detect this silent failure.
- **Suggestion**: Throw an error when the handler is not registered, BEFORE saving to the store. Validate handler registration upfront. Alternatively, move store.save() after scheduleJob() succeeds, so failed scheduling does not leave orphaned records.

### [2] Handler errors propagate unhandled from async cron callback
- **File**: `packages/cron-service/src/cron-service.ts`:131
- **Category**: error-handling / unhandled-async-error
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The try/finally block has no catch clause. If handler() throws, the error propagates out of the async callback. This leads to unhandled promise rejections in Node.js, which can crash the process. Additionally, the finally block increments runCount even on failure, misrepresenting the job execution state.
- **Suggestion**: Add a catch block that: (1) logs the error with context (job ID, handler name), (2) does NOT re-throw (to prevent crashing the cron scheduler), (3) only increments runCount on success, or add a separate failCount field.

## P1 - High (Should Fix)

### [3] Package has no consumer in the monorepo
- **File**: `packages/cron-service/src/index.ts`:1
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: No other package, app, or service in the monorepo imports @proj-airi/cron-service. The package is entirely orphaned -- no entry point, no IPC handler, no event listener. This change delivers a complete package in isolation, but no vertical slice is exercised.
- **Suggestion**: Wire CronService into the Electron main process service layer or another app. Register it with injeca DI and connect it to at least one real consumer with an integration test.

### [4] No logging in cron-service package
- **File**: `packages/cron-service/src/cron-service.ts`:1
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The entire cron-service package has zero logging. Critical operations -- job scheduling, job firing, handler failures, job removal, service start/stop -- all happen silently.
- **Suggestion**: Add @guiiai/logg as a dependency and inject a logger using the useLogg('cron-service') pattern. Log INFO on job scheduled/removed/started/stopped, ERROR on handler failure, WARN on missing handler registration, DEBUG on each job tick.

### [5] No validation on schedule parameters (cron expr, interval, date)
- **File**: `packages/cron-service/src/cron-service.ts`:21
- **Category**: security / missing-input-validation
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: None of the three scheduling methods validate their inputs. at() accepts any string, every() accepts 0/negative/NaN/Infinity (risking tight infinite loop), cron() passes arbitrary strings to Croner without pre-validation, and handler name is not validated for empty strings.
- **Suggestion**: Add input validation at the API boundary using Valibot per project conventions. Validate date, intervalSeconds (positive finite integer), cron expression, and handler name.

### [6] Race condition in runCount increment for overlapping job executions
- **File**: `packages/cron-service/src/cron-service.ts`:132
- **Category**: code-quality / race-condition
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The callback reads the current runCount from the database, then later writes runCount + 1. If handler execution takes longer than the interval period, overlapping executions will produce lost increments. No concurrency guard prevents overlapping executions.
- **Suggestion**: Use an atomic SQL UPDATE: `run_count = run_count + 1`. Also add a concurrency guard or configure Croner's protect option.

### [7] Handler errors in cron callback propagate unhandled (error-handling detail)
- **File**: `packages/cron-service/src/cron-service.ts`:136
- **Category**: error-handling / unhandled-async-error
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: The try/finally block has no catch. If handler(currentRecord) throws, the error propagates into croner's internal scheduler, potentially killing the cron job or crashing the process. The finally block increments runCount even on failure, recording a 'successful' run for a failed execution.
- **Suggestion**: Add a catch block that logs the error with job context and emits it through an onError callback. Track failed runs separately with a lastError field or errorCount.

### [8] updateLastRun in finally block can mask original error
- **File**: `packages/cron-service/src/cron-service.ts`:139
- **Category**: error-handling / missing-try-catch
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: The finally block calls this.store.updateLastRun(), a database operation that can throw. If the handler also threw, the DB error from finally will mask the original handler error, making debugging extremely difficult.
- **Suggestion**: Wrap the finally block's DB operation in its own try/catch.

### [9] Cron constructor can throw, leaving orphaned DB records
- **File**: `packages/cron-service/src/cron-service.ts`:154
- **Category**: error-handling / missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: The Cron constructor throws for invalid cron expressions, invalid dates, or invalid timezone values. Since save() is called before scheduleJob(), a failure here leaves an orphaned record in the database.
- **Suggestion**: Wrap the Cron constructor in try/catch. Either remove the orphaned record on failure, or validate inputs before saving.

### [10] start() loop aborts on first scheduleJob failure
- **File**: `packages/cron-service/src/cron-service.ts`:82
- **Category**: error-handling / missing-try-catch
- **Confidence**: 87
- **Reported by**: review-errors
- **Description**: If scheduleJob throws on any single job, the entire start() loop aborts, leaving all remaining jobs unscheduled. One bad record prevents the entire service from starting.
- **Suggestion**: Wrap each scheduleJob call in try/catch to isolate per-job failures.

### [11] pause() and resume() public methods have zero test coverage
- **File**: `packages/cron-service/src/cron-service.ts`:58
- **Category**: test-quality / missing-coverage
- **Confidence**: 95
- **Reported by**: review-tests
- **Description**: CronService exposes pause() and resume() as public API methods, but neither has any test coverage. Behavior for both valid and invalid job IDs is completely unverified.
- **Suggestion**: Add tests for pause/resume with valid job IDs, non-existent job IDs, and the pause-then-resume flow.

### [12] Handler error propagation in scheduleJob callback untested
- **File**: `packages/cron-service/src/cron-service.ts`:131
- **Category**: test-quality / missing-error-path
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The try/finally resilience behavior (updateLastRun called even when handler throws) is completely untested. No test verifies error handling in the scheduling callback.
- **Suggestion**: Add a test with a throwing handler, trigger it, and verify runCount was still incremented and lastRunAt was updated.

### [13] start() filtering logic (expired/disabled jobs) has no test
- **File**: `packages/cron-service/src/cron-service.ts`:82
- **Category**: test-quality / missing-coverage
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: start() contains two important filtering conditions (skip disabled jobs, skip expired 'at' jobs). Neither filter branch is tested. Regressions would cause disabled jobs to fire on restart and expired one-time jobs to re-execute.
- **Suggestion**: Add tests for 'start() does not schedule disabled jobs' and 'start() skips expired at jobs'.

### [14] CronJobRecord schedule is polymorphic string -- illegal states representable
- **File**: `packages/cron-service/src/cron-types.ts`:3
- **Category**: type-design / discriminated-union
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: CronJobRecord uses a single `schedule: string` whose semantics change based on `mode`. The type permits nonsensical combinations (e.g., mode='at' with a cron expression). A discriminated union would make illegal states unrepresentable.
- **Suggestion**: Refactor into a discriminated union: `type CronJobRecord = AtJob | EveryJob | CronExprJob` with correctly-typed schedule fields per variant.

### [15] CronService.get() and list() leak mutable CronJobRecord references
- **File**: `packages/cron-service/src/cron-service.ts`:74
- **Category**: type-design / encapsulation
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: get() and list() return mutable CronJobRecord objects. Consumers can mutate fields creating inconsistency with persisted DB state.
- **Suggestion**: Add `readonly` modifier to all CronJobRecord fields, or return frozen copies.

## P2 - Medium (Consider)

### [16] CronService hardcodes JobStore dependency via direct instantiation
- **File**: `packages/cron-service/src/cron-service.ts`:13
- **Category**: architecture / dip-violation
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: CronService directly instantiates JobStore in its constructor, violating the Dependency Inversion Principle. The project uses injeca for DI, but this package does not participate in it.
- **Suggestion**: Define a JobStore interface (ICronJobStore) and accept it via constructor injection.

### [17] Unsafe 'as' cast on mode field from database row
- **File**: `packages/cron-service/src/job-store.ts`:101
- **Category**: code-quality / unsafe-cast
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The mode field from the database row is cast to ScheduleMode without runtime validation. Data corruption could produce unexpected values.
- **Suggestion**: Add a runtime assertion validating row.mode before the cast.

### [18] close() does not use try/finally for resource cleanup
- **File**: `packages/cron-service/src/cron-service.ts`:100
- **Category**: error-handling / resource-leak
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: If this.stop() throws, this.store.close() is never called, leaking the SQLite database connection.
- **Suggestion**: Use try/finally: `try { this.stop() } finally { this.store.close() }`.

### [19] No use-after-close guard on JobStore
- **File**: `packages/cron-service/src/job-store.ts`:78
- **Category**: error-handling / use-after-close
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: After close(), any subsequent call throws a raw better-sqlite3 error with no meaningful message.
- **Suggestion**: Add a `closed` flag and guard at the top of each public method.

### [20] No Valibot validation at JobStore boundary -- unsafe `as` cast in mapRow
- **File**: `packages/cron-service/src/job-store.ts`:97
- **Category**: type-design / validation
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: mapRow() casts row.mode without runtime validation. Valibot is the project standard but is not used here.
- **Suggestion**: Add a Valibot schema for full row validation at the DB boundary.

### [21] Timestamps as bare `string`, intervalSeconds lacks positive constraint
- **File**: `packages/cron-service/src/cron-types.ts`:11
- **Category**: type-design / primitive-obsession
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: createdAt and lastRunAt are ISO date strings with no type-level distinction from arbitrary strings. intervalSeconds has no positive constraint.
- **Suggestion**: Consider branded types for timestamps. Add runtime checks for intervalSeconds.

### [22] ScheduleOptions.handler is untyped string -- no link to registered handlers
- **File**: `packages/cron-service/src/cron-types.ts`:19
- **Category**: type-design / primitive-obsession
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: The handler field is a plain string that must match a registered key. Typos are only caught at runtime (and silently).
- **Suggestion**: Use a generic parameter on CronService to constrain handler names at compile time.

### [23] CronJobRecord mixes configuration and runtime state in single interface
- **File**: `packages/cron-service/src/cron-types.ts`:3
- **Category**: type-design / separation-of-concerns
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: CronJobRecord conflates immutable configuration with mutable runtime state. No separate creation input vs stored record type.
- **Suggestion**: Split into CronJobConfig (immutable), CronJobState (mutable), and CronJobRecord = CronJobConfig & CronJobState.

### [24] stop() method behavior not directly tested
- **File**: `packages/cron-service/src/cron-service.ts`:93
- **Category**: test-quality / missing-coverage
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: stop() is called indirectly in cleanup but no test verifies jobs actually cease to fire after stop().
- **Suggestion**: Schedule a recurring job, verify it fires, call stop(), wait, and verify count did not increase.

### [25] No test for scheduling without registered handler behavior
- **File**: `packages/cron-service/src/cron-service.ts`:127
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The existing test verifies persistence but not the behavioral consequence (job NOT scheduled). Startup ordering edge case untested.
- **Suggestion**: Add assertions for unregistered handler behavior and startup ordering scenarios.

### [26] No boundary tests for invalid inputs (bad cron, negative interval)
- **File**: `packages/cron-service/src/cron-service.ts`:40
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: No tests verify behavior with invalid cron expressions, negative intervals, past dates, or empty handler names.
- **Suggestion**: Add boundary tests for each invalid input scenario.

### [27] Exported CronService class has no JSDoc on any public method
- **File**: `packages/cron-service/src/cron-service.ts`:8
- **Category**: comments / missing-documentation
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: 12 public methods with zero JSDoc. Key behaviors are non-obvious (at() accepts Date|string, every() takes seconds not milliseconds, start() rehydrates persisted jobs).
- **Suggestion**: Add JSDoc to class and each public method documenting key semantics.

### [28] Exported interfaces CronJobRecord and ScheduleOptions lack JSDoc
- **File**: `packages/cron-service/src/cron-types.ts`:1
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: All exported types lack JSDoc. Non-obvious details: payload is JSON-serialized, schedule semantics depend on mode, handler is a registry key.
- **Suggestion**: Add JSDoc to each exported type with field-level documentation.

### [29] Exported JobStore class has no JSDoc documentation
- **File**: `packages/cron-service/src/job-store.ts`:5
- **Category**: comments / missing-documentation
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: JobStore is exported with 6 public methods and no JSDoc. Non-obvious: constructor enables WAL mode, save() uses upsert semantics.
- **Suggestion**: Add JSDoc to JobStore class and its public methods.

### [30] at(), every(), cron() methods share near-identical structure
- **File**: `packages/cron-service/src/cron-service.ts`:21
- **Category**: simplification / near-duplicate-code
- **Confidence**: 88
- **Reported by**: review-simplify
- **Description**: The three scheduling methods follow the exact same 7-line pattern repeated 3 times. Only the input normalization line differs.
- **Suggestion**: Extract the shared sequence into a private createJob() method, reducing public methods to thin type-safe adapters.

## P3 - Low (Optional)

### [31] scheduleJob() silently ignores unregistered handler -- type gap
- **File**: `packages/cron-service/src/cron-service.ts`:126
- **Category**: architecture / silent-failure
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Architecture finding tied to the type gap: the type system does not prevent scheduling jobs with unregistered handler names.
- **Suggestion**: Validate handler existence before saving, or use a generic parameter to constrain handler names.

### [32] Switch in scheduleJob() could use a mode-to-config lookup
- **File**: `packages/cron-service/src/cron-service.ts`:154
- **Category**: simplification / switch-to-lookup
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: The mode dispatch switch could be isolated into a helper method for clarity.
- **Suggestion**: Extract into a private cronArgsForMode() method.

### [33] save() uses 11 positional SQL parameters, hard to audit
- **File**: `packages/cron-service/src/job-store.ts`:39
- **Category**: simplification / positional-to-named-parameters
- **Confidence**: 76
- **Reported by**: review-simplify
- **Description**: 11 positional placeholders make column-to-value mapping error-prone. better-sqlite3 supports named parameters.
- **Suggestion**: Switch to named parameters ($id, $name, $mode, ...) with an object argument.

## Positive Observations
- SQLite persistence with WAL mode and parameterized queries throughout -- zero SQL injection risk
- Real SQLite tests with temp files: both test suites use real better-sqlite3 with temporary directories, following Dev/Prod Parity
- Zero mock violations -- no vi.fn(), vi.mock(), InMemory*, Mock*, or Fake* patterns
- Clean separation of concerns: Types, persistence, and scheduling are in separate files with clear responsibilities
- Proper cleanup in tests: afterEach hooks close resources and remove temp directories
- Database schema uses CHECK constraint for mode validation (defense-in-depth)
- CronService integration tests use real timer-based assertions to verify jobs actually fire
- JobStore constructor uses try/catch with proper cleanup (db.close()) on init failure
- Good encapsulation: private store, private handlers Map, private activeJobs Map
- ScheduleMode is a proper 3-value literal union type
- JobRow is a private internal interface correctly modeling the SQLite row shape separately from the domain type
- Zero forbidden comment patterns (no TODO, FIXME, HACK, PLACEHOLDER, or TEMP comments)
- Both files are well under the 200-line guideline with clean, focused methods
- Guard clauses and early returns used consistently throughout
- Pure mapRow function at module scope follows functional core pattern
- JobStore test suite is thorough: CRUD operations, upsert behavior, persistence across reopens, all three schedule modes

## Recommended Action Plan
1. Fix 2 P0 issues first: add error handling for unregistered handlers (validate before save) and add a catch block in the async cron callback
2. Address 13 P1 issues in a single pass -- the error-handling P1s (items 7-10) are closely related to the P0 fixes and can be addressed together; test coverage P1s (items 11-13) follow naturally from the error-handling changes
3. Consider the type-design P1s (items 14-15) as a focused refactor: discriminated union for CronJobRecord and readonly modifiers
4. Wire the package to at least one consumer in the monorepo (item 3) to prove the end-to-end path
5. Run `/ultra-review recheck` to verify
