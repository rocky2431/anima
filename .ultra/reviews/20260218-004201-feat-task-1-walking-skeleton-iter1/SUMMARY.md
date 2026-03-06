# Review Summary

**Session**: 20260218-004201-feat-task-1-walking-skeleton-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 9 P1 findings exceed the threshold of 3 (architecture violations, missing error handling, orphan code, incomplete walking skeleton wiring)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 9 |
| P2 Medium | 10 |
| P3 Low | 8 |
| **Total** | **27** (deduplicated from 28) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 7 | completed |
| review-tests | 5 | completed |
| review-errors | 4 | completed |
| review-types | 4 | completed |
| review-comments | 6 | completed |
| review-simplify | 2 | completed |

## P1 - High (Should Fix)
### [1] Business state (emotion, cooldown) stored only in memory
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:21
- **Category**: architecture / stateful-in-memory
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The persona engine stores currentEmotion and lastTriggerTimes in closure-scoped variables. If the Electron app restarts or crashes, all emotion state and trigger cooldown history is lost. CLAUDE.md explicitly forbids 'Business state in memory' and requires persistence to DB. The cooldown state is particularly critical: without persistence, the rest-reminder trigger could fire immediately after restart even if it just fired 5 minutes ago.
- **Suggestion**: Persist currentEmotion and lastTriggerTimes to a local SQLite database (e.g., better-sqlite3) or electron-store. Load on startup, write on mutation. This also enables observability of the persona state across sessions.

### [2] Context engine and persona engine are not connected end-to-end
- **File**: `apps/stage-tamagotchi/src/main/index.ts`:79
- **Category**: integration / no-end-to-end-path
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: Both engines are registered via injeca but never connected. No timer, IPC handler, or event listener ever invokes personaEngine.evaluate() with data from contextEngine. The walking skeleton declares connectivity but does not deliver a working end-to-end data flow from activity observation through trigger evaluation to response generation.
- **Suggestion**: Add a periodic timer in a wiring module that: (1) polls activity events or captures screenshots via contextEngine, (2) builds an ActivityContext via buildActivityContext, (3) maps it to TriggerInput, (4) calls personaEngine.evaluate(input), and (5) sends any response to the renderer via IPC.

### [3] Electron desktopCapturer.getSources() called without try/catch
- **File**: `apps/stage-tamagotchi/src/main/services/anima/context-engine.ts`:12
- **Category**: error-handling / missing-try-catch-io
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: desktopCapturer.getSources() is an Electron platform API that can throw on permission denial (macOS screen recording permission), when no display server is available, or on other OS-level failures. This async I/O call has no try/catch protection.
- **Suggestion**: Wrap the desktopCapturer call in try/catch. Log the error with context using the project's structured logger, then re-throw a typed error (e.g., CaptureError).

### [4] TriggerResult allows invalid state combinations
- **File**: `packages/persona-engine/src/types.ts`:37
- **Category**: type-design / illegal-state-representable
- **Confidence**: 92
- **Reported by**: review-types
- **Description**: TriggerResult uses a boolean flag plus string fields that are empty when not triggered. This allows four illegal states. A discriminated union would make illegal states unrepresentable. Consumers already branch on `trigger.triggered`, so adopting the union is a straightforward refactor.
- **Suggestion**: Refactor to discriminated union: `type TriggerResult = { triggered: true; triggerId: string; triggerName: string } | { triggered: false }`

### [5] No-source condition returns empty Buffer instead of signaling error
- **File**: `apps/stage-tamagotchi/src/main/services/anima/context-engine.ts`:17
- **Category**: error-handling / error-converted-to-invalid-state
- **Confidence**: 90
- **Reported by**: review-code, review-errors
- **Description**: When desktopCapturer returns no screen sources, the provider silently returns an empty Buffer. This converts a real error condition into an invalid state. Downstream consumers receive a 0-byte buffer that looks like success but contains no useful data.
- **Suggestion**: Throw a typed error when no primary source is available: `throw new Error('No screen sources available from desktopCapturer. Check screen recording permissions.')`

### [6] buildActivityContext exported but never consumed anywhere
- **File**: `packages/context-engine/src/activity/activity-context.ts`:11
- **Category**: integration / orphan-code
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: buildActivityContext is exported from the context-engine package index but has zero consumers in the entire codebase. This function is the critical bridge between raw ActivityEvents and the TriggerInput that persona-engine needs, yet it is never used.
- **Suggestion**: Wire buildActivityContext into the app-level integration layer. The periodic evaluation loop should call buildActivityContext(events) to produce an ActivityContext, then map it to TriggerInput.

### [7] VectorStore interface defined but no implementation or consumer exists
- **File**: `packages/context-engine/src/storage/vector-store.ts`:1
- **Category**: integration / orphan-code
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: VectorStore is an interface-only definition with no implementation and no consumer. An interface without a consumer or a contract test is dead code that may drift from actual requirements.
- **Suggestion**: Either remove VectorStore from this PR and add it when there is a real consumer, or add a minimal implementation with a contract test proving the interface shape.

### [8] ScreenshotCapture.capture() has no error handling for provider
- **File**: `packages/context-engine/src/capture/screenshot.ts`:17
- **Category**: error-handling / missing-try-catch-io
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: ScreenshotCapture.capture() awaits an external I/O provider with no error handling. This class is the boundary wrapper -- it should catch provider errors and add diagnostic context before letting them propagate.
- **Suggestion**: Add try/catch to wrap the provider call and re-throw with added context: `throw new Error('Screenshot capture failed', { cause: error })`

### [9] ScreenshotCapture missing error propagation test
- **File**: `packages/context-engine/src/__tests__/screenshot.test.ts`:20
- **Category**: test-quality / missing-error-path
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: ScreenshotCapture.capture() wraps an external provider call but there is no test verifying behavior when the provider throws an error. Error propagation is a critical behavioral path for Imperative Shell boundaries.
- **Suggestion**: Add a test with a failing provider and verify the error propagates correctly.

## P2 - Medium (Consider)
### [10] buildActivityContext has no unit test despite being functional core
- **File**: `packages/context-engine/src/activity/activity-context.ts`:11
- **Category**: code-quality / missing-test
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: buildActivityContext is a pure function in the functional core. CLAUDE.md mandates 100% coverage for the functional core, but there is no test file for this function.
- **Suggestion**: Create `packages/context-engine/src/__tests__/activity-context.test.ts` with tests for empty events, single event, multiple events, and custom gapThresholdMs.

### [11] Disguised TODO: 'Future: replaced by LLM-generated responses'
- **File**: `packages/persona-engine/src/response-generator.ts`:6
- **Category**: comments / stale-future-reference
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: This comment describes planned future work rather than explaining why the current code exists. It functions as an implicit TODO.
- **Suggestion**: Document why templates were chosen instead of promising a specific future replacement.

### [12] transitionEmotion missing test for unknown trigger name
- **File**: `packages/persona-engine/src/__tests__/emotion-state-machine.test.ts`:14
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The fallback behavior when a trigger fires with an unknown triggerName (falling back to currentState via ??) is unverified by tests.
- **Suggestion**: Add a test verifying that an unknown trigger name preserves the current emotion state.

### [13] Comment references specific future tech (LanceDB) that will rot
- **File**: `packages/context-engine/src/storage/vector-store.ts`:3
- **Category**: comments / stale-future-reference
- **Confidence**: 82
- **Reported by**: review-comments
- **Description**: The comment couples interface documentation to a specific storage technology that may not be adopted.
- **Suggestion**: Replace with technology-agnostic description: 'Contract for vector storage operations.'

### [14] Duration and timestamp fields use raw number type
- **File**: `packages/context-engine/src/types.ts`:6
- **Category**: type-design / primitive-obsession
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Multiple fields use bare `number` for timestamps and durations, risking unit mismatches (seconds vs milliseconds).
- **Suggestion**: Introduce branded types: `type UnixTimestampMs = number & { readonly __brand: 'UnixTimestampMs' }`

### [15] Log call in persona-engine service missing traceId
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:41
- **Category**: code-quality / missing-trace-id
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: CLAUDE.md observability rules require every log entry to include traceId. The log.info call omits traceId.
- **Suggestion**: Generate a correlation ID for each evaluation cycle: `const cycleId = crypto.randomUUID()`

### [16] generateResponse missing test for unknown trigger/default fallback
- **File**: `packages/persona-engine/src/__tests__/persona-engine.test.ts`:6
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The three-level fallback chain (exact match -> neutral template -> DEFAULT_MESSAGE) is only partially tested.
- **Suggestion**: Add tests for unknown trigger names and missing emotion-specific templates.

### [17] Optional chaining silently falls through on unrecognized trigger
- **File**: `packages/persona-engine/src/response-generator.ts`:33
- **Category**: error-handling / optional-chaining-hiding-errors
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: When trigger.triggerName is not found in RESPONSE_TEMPLATES, the chain silently falls through to DEFAULT_MESSAGE with no logging, hiding missing template configurations.
- **Suggestion**: Add a warning log when templates are not found for a trigger name.

### [18] calculateContinuousWorkDuration no test for unsorted input
- **File**: `packages/context-engine/src/__tests__/duration.test.ts`:18
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: The function requires sorted input per JSDoc but has no defensive guard and no test documenting the precondition.
- **Suggestion**: Either add a defensive sort or add a test that explicitly documents the precondition.

### [19] TriggerCondition.id uses unbranded string
- **File**: `packages/persona-engine/src/types.ts`:24
- **Category**: type-design / primitive-obsession
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: TriggerCondition.id is typed as bare `string` but has an implicit format (e.g., 'T03'), enabling accidental use of triggerName where triggerId is expected.
- **Suggestion**: Introduce branded type: `type TriggerId = string & { readonly __brand: 'TriggerId' }`

## P3 - Low (Optional)
### [20] Walking skeleton scope comment will rot as triggers are added
- **File**: `packages/persona-engine/src/emotion-state-machine.ts`:10
- **Category**: comments / scope-coupled-comment
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Comment 'only T03 is mapped' is tightly coupled to current scope and will become stale.
- **Suggestion**: Replace with: 'Maps trigger names to the emotion states they induce.'

### [21] Walking skeleton scope comment will rot on response-generator
- **File**: `packages/persona-engine/src/response-generator.ts`:5
- **Category**: comments / scope-coupled-comment
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Comment states 'only T03 templates are defined' which will become false as soon as another trigger's templates are added.
- **Suggestion**: Replace with: 'Template-based response messages keyed by trigger name and emotion state.'

### [22] Duplicated gap threshold default across two functions
- **File**: `packages/context-engine/src/activity/activity-context.ts`:13
- **Category**: simplification / duplicated-constant
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: The default gap threshold `5 * 60 * 1000` is duplicated in both calculateContinuousWorkDuration and buildActivityContext.
- **Suggestion**: Extract to a shared constant: `export const DEFAULT_GAP_THRESHOLD_MS = 5 * 60 * 1000`

### [23] Walking skeleton scope comment on setupContextEngine will rot
- **File**: `apps/stage-tamagotchi/src/main/services/anima/context-engine.ts`:28
- **Category**: comments / scope-coupled-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: Comment 'only initializes screenshot capture' will become stale when additional context sources are wired in.
- **Suggestion**: Replace with: 'Initialize the ContextEngine service for the main process, wiring platform-specific providers.'

### [24] Walking skeleton scope comment on setupPersonaEngine will rot
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:19
- **Category**: comments / scope-coupled-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: Comment 'only T03 rest-reminder trigger is active' will become false as soon as additional triggers are registered.
- **Suggestion**: Replace with: 'Initialize the PersonaEngine service for the main process, registering proactive triggers and managing emotion state.'

### [25] evaluateTriggers missing multi-trigger priority test
- **File**: `packages/persona-engine/src/__tests__/proactive-trigger.test.ts`:51
- **Category**: test-quality / test-completeness
- **Confidence**: 76
- **Reported by**: review-tests
- **Description**: Only a single trigger is tested. The first-match priority behavior when multiple triggers could match simultaneously is untested.
- **Suggestion**: When a second trigger is added, include a test verifying first-match priority.

### [26] ScreenshotCapture class wraps a single method with no state
- **File**: `packages/context-engine/src/capture/screenshot.ts`:7
- **Category**: simplification / unnecessary-class
- **Confidence**: 76
- **Reported by**: review-simplify
- **Description**: The class holds a single provider field and exposes a single capture() method. Could be a plain function, but the class may be intentional for future extensibility.
- **Suggestion**: Consider replacing with a plain function if no lifecycle hooks or caching are planned.

### [27] VectorStore metadata uses Record<string, unknown>
- **File**: `packages/context-engine/src/storage/vector-store.ts`:7
- **Category**: type-design / loose-metadata-type
- **Confidence**: 75
- **Reported by**: review-types
- **Description**: The VectorStore interface uses Record<string, unknown> for metadata, providing no type safety.
- **Suggestion**: Make VectorStore generic when implementing beyond the walking skeleton.

## Positive Observations
- Clean Functional Core / Imperative Shell separation: domain logic is implemented as pure functions with no side effects, while platform-specific code is isolated in the shell layer.
- Well-designed ScreenshotProvider interface enables dependency inversion: the context-engine package depends on an abstraction, not the Electron API directly.
- persona-engine functional core has thorough unit tests with good edge case coverage: cooldown periods, fullscreen suppression, emotion transitions from all states, and an end-to-end integration test.
- TriggerInput is intentionally decoupled from ActivityContext, keeping persona-engine independent of context-engine at the type level.
- All pure functions accept explicit parameters (including 'now' timestamp) rather than calling Date.now() internally, making them fully deterministic and testable.
- Test doubles for external APIs include proper rationale comments as required by CLAUDE.md.
- Functional Core modules tested with direct instantiation and pure input/output -- no mocks on domain logic.
- End-to-end pipeline test in persona-engine.test.ts validates the full trigger->emotion->response flow using real module imports.
- Boundary conditions are well-covered: empty arrays, single elements, exact boundary values, cooldown edge cases.
- No forbidden test patterns detected: no jest.fn(), no jest.mock(), no InMemory/Mock/Fake repository classes.
- EmotionState uses a string literal union type, making invalid emotion values unrepresentable at compile time.
- All interfaces are well-documented with JSDoc comments explaining purpose and field semantics.
- No forbidden comment patterns (TODO, FIXME, HACK, XXX) found in any of the 11 files.
- JSDoc parameter descriptions accurately match actual function signatures across all files.
- All functions have low cyclomatic complexity (1-4 decision points), maximum nesting depth is 2 levels.
- Every function is short (under 25 lines), with clean early returns and guard clauses throughout.
- Named constants used consistently instead of magic numbers (TWO_HOURS_MS, COOLDOWN_MS, DEFAULT_MESSAGE, INITIAL_EMOTION).
- No nested ternaries, no complex conditionals, no deep callback chains.

## Recommended Action Plan
1. **Wire the end-to-end path** (findings [2], [6]): Add a periodic evaluation loop connecting contextEngine to personaEngine with IPC output to the renderer -- this is the core walking skeleton deliverable
2. **Fix error handling at the screenshot boundary** (findings [3], [5], [8]): Add try/catch around desktopCapturer.getSources(), throw on empty sources instead of returning empty Buffer, add error context wrapping in ScreenshotCapture
3. **Persist business state** (finding [1]): Move currentEmotion and lastTriggerTimes to SQLite or electron-store to survive restarts
4. **Refactor TriggerResult to discriminated union** (finding [4]): Straightforward refactor since consumers already branch on `trigger.triggered`
5. **Remove or implement VectorStore** (finding [7]): Either defer the interface to a PR that delivers a consumer, or add a minimal implementation with a contract test
6. **Add missing tests** (findings [9], [10]): Error propagation test for ScreenshotCapture, unit tests for buildActivityContext
7. Address remaining P2 issues (comments, boundary tests, observability) in a follow-up pass
8. Run `/ultra-review recheck` to verify
