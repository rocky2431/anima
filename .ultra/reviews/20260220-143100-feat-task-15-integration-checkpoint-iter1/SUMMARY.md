# Review Summary

**Session**: 20260220-143100-feat-task-15-integration-checkpoint-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 9 P1 findings exceed the P1>3 threshold -- error handling gaps, orphan wiring, missing logging, and untested critical paths require attention before merge.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 9 |
| P2 Medium | 11 |
| P3 Low | 5 |
| **Total** | **25** (deduplicated from 28) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 7 | completed |
| review-tests | 4 | completed |
| review-errors | 5 | completed |
| review-types | 4 | completed |
| review-comments | 4 | completed |
| review-simplify | 4 | completed |

## P1 - High (Should Fix)
### [1] collectedActivities grows without bound and never clears
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:58
- **Category**: architecture / unbounded-in-memory-state
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The collectedActivities array is appended to via recordActivity() but is never cleared after executeEveningPipeline() runs. Over days of continuous operation this array will grow without limit, leaking memory. Additionally, the next evening run will re-process all historical activities rather than only today's. This is both a memory leak and a correctness bug: reports will include stale data from previous days.
- **Suggestion**: Clear the array after snapshotting it in executeEveningPipeline(). For example, after line 64 (const report = ...), add `collectedActivities.length = 0` or splice the array. This ensures each nightly run processes only that day's activities and prevents unbounded growth.

### [2] Error handling cluster: silent no-op default + no per-phase isolation + unprotected callbacks
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:60-65
- **Category**: error-handling / silent-swallow
- **Confidence**: 95
- **Reported by**: review-code, review-errors (4 findings merged)
- **Description**: Three interrelated error handling gaps in the same code region (lines 60-65): (1) When config.onError is not provided, handleError defaults to a no-op `(() => {})`, making the cron handler catch block functionally equivalent to `catch (e) {}` -- the entire pipeline can fail repeatedly with zero observable signal. (2) The 5-phase pipeline runs with zero per-phase error handling. If phase 3 fails, phases 1-2 have already emitted events, leaving a partially-completed state with no indication of which phase failed. (3) The emitEvent callbacks (lines 65, 84, 98) are called without try/catch protection -- if a caller's onEvent handler throws, it aborts remaining pipeline phases and is misreported as a pipeline failure.
- **Suggestion**: Address all three gaps: (1) Default onError to logging or re-throw. (2) Wrap each phase in try/catch with phase context. (3) Wrap emitEvent calls in try/catch to isolate callback failures from pipeline execution.

### [3] trigger() exposes raw I/O errors without context wrapping
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:118-120
- **Category**: error-handling / missing-try-catch
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: The public trigger() method calls executeEveningPipeline() without try/catch. Unlike the cron handler path (lines 103-110) which wraps errors with context, trigger() lets raw errors from reportGenerator.generate(), memoryExtractor.extract(), memoryOrchestrator.persistExtractionResults(), or generateResponse() propagate with no context about which phase of the 5-phase pipeline failed. Callers receive an opaque error from a nested dependency with no indication it came from the evening pipeline.
- **Suggestion**: Wrap in try/catch with phase context: `try { await executeEveningPipeline() } catch (cause) { throw new Error('Evening pipeline manual trigger failed', { cause }) }`. Or better, add per-phase error wrapping inside executeEveningPipeline itself so both callers benefit.

### [4] createEveningPipeline has no caller outside its own test file
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:54-57
- **Category**: integration / orphan-code
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: Grep shows createEveningPipeline is only imported in evening-pipeline.test.ts. It is not wired into setup-orchestrator.ts, any injeca DI registration, IPC handler, or any other entry point. The function is exported but unreachable from any live code path. The existing setup-orchestrator.ts creates an AnimaOrchestrator but does not integrate the evening pipeline.
- **Suggestion**: Wire createEveningPipeline into setup-orchestrator.ts (or a dedicated setup-evening-pipeline.ts). It needs to receive its dependencies from the existing injeca service container and connect to the running AnimaOrchestrator so that recordActivity() is called with real ProcessedContext from the screenshot pipeline, and scheduleDaily() is called during app startup.

### [5] Evening pipeline has zero logging instrumentation
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:1-129
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The file does not import or use @guiiai/logg (the project's standard logging library). A long-running nightly pipeline that orchestrates 5 phases across 3 packages has zero observability. The only error handling delegates to config.onError which defaults to a no-op. When this pipeline fails in production there will be no logs to diagnose the failure.
- **Suggestion**: Add `import { useLogg } from '@guiiai/logg'` and `const log = useLogg('evening-pipeline').useGlobalConfig()`. Log at INFO level for each phase completion. Log at ERROR level in the catch block. This matches the pattern in setup-orchestrator.ts.

### [6] Error path via onError callback is never tested
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:1-380
- **Category**: test-quality / error-path-missing
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The production code catches errors in the cron handler and forwards them to the onError callback. This error path is never tested. There is no test that verifies what happens when any of the 3 external dependencies throw, or that the onError callback receives the correct wrapped Error with cause.
- **Suggestion**: Add a test that constructs a StubLlmProvider that throws, triggers the pipeline via cron, and asserts onError is called with an Error containing the correct message and the original cause.

### [7] intimacy and persona deps are injected but never used
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:15-23
- **Category**: code-quality / unused-dependency
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The deps.intimacy and deps.persona fields are declared in EveningPipelineDeps and required by callers, but they are never referenced inside createEveningPipeline() or executeEveningPipeline(). This forces callers to provide values that are ignored, creating a misleading API contract.
- **Suggestion**: Either remove intimacy and persona from EveningPipelineDeps if they are not needed yet, or use them in the pipeline (e.g., pass intimacy.getLevel() to generateResponse() for tone modulation).

### [8] Error message lacks operational context (activity count, phase)
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:108
- **Category**: error-handling / generic-error-message
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: The error message 'Evening pipeline cron handler failed' provides zero operational context. It does not include how many activities were collected, which phase failed, or any timestamps. In production, this message alone is insufficient to diagnose why the evening pipeline failed.
- **Suggestion**: Include operational context: `` new Error(`Evening pipeline cron handler failed (${collectedActivities.length} activities)`, { cause }) ``.

### [9] scheduleDaily() method is never tested
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:1-380
- **Category**: test-quality / method-untested
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The EveningPipeline interface exposes three public methods: recordActivity, trigger, and scheduleDaily. The scheduleDaily method delegates to cronService.cron() with the correct handler name and is a key part of the public contract. No test calls scheduleDaily or verifies it returns a valid schedule ID or correctly wires the handler.
- **Suggestion**: Add a test that calls pipeline.scheduleDaily() and verifies the full pipeline handler fires on the cron schedule.

## P2 - Medium (Consider)
### [10] Unsafe `as PersonaEmotion` cast on xstate snapshot value
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:90
- **Category**: type-design / unsafe-cast
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: The xstate actor snapshot `.value` is cast directly to `PersonaEmotion` bypassing type safety. If the machine's state set diverges from PersonaEmotion, this cast silently produces an invalid value. Same pattern as Task 7's AnimaOrchestrator.
- **Suggestion**: Add a runtime guard function `isPersonaEmotion(v: unknown): v is PersonaEmotion` with a fallback to 'idle' if invalid.

### [11] Unsafe `as PersonaEmotion` cast on state machine snapshot (code-quality angle)
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:90
- **Category**: code-quality / unsafe-type-cast
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The xstate snapshot value is cast to PersonaEmotion without validation. The test file also uses `as string` and `as any` casts for the same data, confirming the type is not naturally compatible.
- **Suggestion**: Create a helper function `getPersonaEmotion(actor: EmotionActor): PersonaEmotion` that maps the snapshot value to a validated PersonaEmotion with a fallback default.

### [12] Missing JSDoc on exported EveningPipelineDeps interface
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:15-23
- **Category**: comments / missing-jsdoc
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The exported EveningPipelineDeps interface has no JSDoc comment. This interface defines the dependency injection contract for the evening pipeline.
- **Suggestion**: Add: `/** Dependencies required to construct an EveningPipeline. All services must be initialized before injection. */`

### [13] Missing JSDoc on exported EveningPipelineEvent type
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:25-28
- **Category**: comments / missing-jsdoc
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The exported EveningPipelineEvent union type has no JSDoc. This discriminated union is the public event contract emitted by the pipeline.
- **Suggestion**: Add: `/** Events emitted during evening pipeline execution, in order: report-generated, memories-extracted, persona-response. */`

### [14] Missing JSDoc on exported EveningPipelineConfig interface
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:30-33
- **Category**: comments / missing-jsdoc
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The exported EveningPipelineConfig interface has no JSDoc. Consumers need to know when onError is invoked vs when errors propagate directly.
- **Suggestion**: Add: `/** Optional configuration. onError is called only when the cron handler catches an error; direct trigger() calls propagate errors to the caller. */`

### [15] Near-duplicate EveningPipelineDeps construction in two test cases
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:289-297
- **Category**: simplification / near-duplicate-code
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: The EveningPipelineDeps object is constructed almost identically at lines 289-297 and 357-365. Only the LLM responses differ.
- **Suggestion**: Extract a `buildPipelineDeps(overrides)` helper function that accepts only the varying parts (LLM providers).

### [16] Hardcoded trigger result object bypasses trigger system types
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:91-96
- **Category**: type-design / hardcoded-domain-object
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The trigger result is manually constructed as an anonymous object literal rather than using the TriggerResult type from persona-engine. If TriggerResult gains new required fields, this won't fail at compile time.
- **Suggestion**: Import `TriggerResult` from persona-engine and type-annotate the object, or look up the trigger from ALL_TRIGGERS by name.

### [17] Hardcoded trigger ID and emotion in pipeline execution
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:91-96
- **Category**: code-quality / hardcoded-trigger-values
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The trigger ID 'T06', trigger name 'evening-summary', and suggested emotion 'caring' are hardcoded inline. If these values change in persona-engine, this code silently produces mismatched results.
- **Suggestion**: Import the trigger constant from persona-engine or look up by name from the trigger registry.

### [18] First test does not exercise createEveningPipeline at all
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:179-206
- **Category**: test-quality / test-design
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The first test manually registers its own handler and manually calls reportGenerator.generate(). It never calls createEveningPipeline(). This test proves CronService and ReportGenerator work individually, but does not test the pipeline's integration wiring.
- **Suggestion**: Refactor to use createEveningPipeline or rename to clarify it tests CronService + ReportGenerator integration.

### [19] cronExpression parameter is unvalidated plain `string`
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:41
- **Category**: type-design / primitive-obsession
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: The `cronExpression` parameter accepts any string with no type-level or runtime validation. An invalid cron expression would be passed directly to CronService.cron() where it may fail with an opaque error.
- **Suggestion**: Add a branded type `CronExpression` with a validation constructor, or validate at the `scheduleDaily` call site.

### [20] trigger() error propagation not tested
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:1-380
- **Category**: test-quality / boundary-missing
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: The trigger() method calls executeEveningPipeline() directly without try/catch, unlike the cron handler path. No test verifies that trigger() rejects with the original error.
- **Suggestion**: Add: `await expect(pipeline.trigger()).rejects.toThrow('LLM down')`.

## P3 - Low (Optional)
### [21] Inline object literals on very long lines reduce readability
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:360
- **Category**: simplification / long-inline-literal
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: Line 360 is ~170 characters with deeply nested inline construction. The empty extraction fixture is duplicated on lines 352 and 360.
- **Suggestion**: Extract into a named constant: `const EMPTY_EXTRACTION: ExtractionResult = { ... }`.

### [22] Magic number 50 in createIntimacyState(50) lacks context
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.test.ts`:295
- **Category**: simplification / magic-number
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: The value 50 appears twice without explanation. Its meaning (neutral, midpoint, default) is unclear to readers unfamiliar with the intimacy scale.
- **Suggestion**: Extract to: `const DEFAULT_INTIMACY_LEVEL = 50`.

### [23] EveningPipelineDeps interface fields lack `readonly` modifier
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:15-23
- **Category**: type-design / readonly-missing
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: All EveningPipelineDeps fields are mutable despite being injected once and never reassigned. Adding readonly would express this intent.
- **Suggestion**: Add `readonly` to all fields or use `Readonly<EveningPipelineDeps>`.

### [24] Redundant comment restates self-documenting code
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:101
- **Category**: comments / redundant-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: '// Register the handler with CronService' restates what deps.cronService.registerHandler() already communicates.
- **Suggestion**: Remove or replace with a comment explaining *why* eager registration at construction time.

### [25] createEveningPipeline outer function spans 76 lines
- **File**: `apps/stage-tamagotchi/src/main/services/anima/evening-pipeline.ts`:54-129
- **Category**: simplification / function-length
- **Confidence**: 76
- **Reported by**: review-simplify
- **Description**: The factory function is 76 lines, exceeding the 50-line guideline. However, it is well-structured with clear phase comments and a contained inner function.
- **Suggestion**: No immediate change. If future phases are added, extract executeEveningPipeline to module scope.

## Positive Observations
- Clean dependency injection via the EveningPipelineDeps interface follows the Imperative Shell pattern well
- The test file uses real SQLite (DocumentStore), real LanceDB (VectorStore), and real CronService (with temp dirs) rather than in-memory mocks -- matching the project's testing standards
- StubLlmProvider and StubEmbeddingProvider have clear Test Double rationale comments explaining why they stub external APIs
- The full E2E test (line 285) traces through all 5 phases: cron -> collect -> report -> extract -> persist -> persona -> recall, proving the data flow works end-to-end
- Empty activity day test (line 350) validates graceful handling of edge cases
- Factory function pattern (createEveningPipeline) returns a clean interface, keeping internal state encapsulated
- The multi-line JSDoc on createEveningPipeline accurately describes the full pipeline flow and correctly identifies the function's architectural role as an Imperative Shell orchestrator
- Phase comments (Phase 1 through Phase 5) inside executeEveningPipeline provide genuine navigational value in a multi-step orchestration function
- No forbidden comment patterns (TODO, FIXME, HACK, XXX, PLACEHOLDER, TEMP) found in either file
- EveningPipelineEvent is a well-designed discriminated union on the `type` field with specific typed `data` payloads for each variant
- Good use of new Error(msg, { cause }) wrapping pattern in the cron handler catch block -- maintains error chain
- CronService handler registration separates scheduling concerns from pipeline logic
- The production code has very low cyclomatic complexity (estimated 2) with a clean linear pipeline of 5 phases
- The closure-based factory pattern follows the project's established functional core / imperative shell architecture
- Dependencies are passed via a typed interface rather than positional parameters, improving readability despite 7 dependencies
- Vector recall persistence is verified across logical 'day boundaries', proving persist-then-recall round-trip works

## Recommended Action Plan
1. Fix the unbounded collectedActivities array (P1 #1) -- add `collectedActivities.length = 0` after snapshotting
2. Address the error handling cluster (P1 #2, #3, #8) in a single pass: add per-phase try/catch, change default onError to log, protect emitEvent callbacks, add operational context to error messages
3. Add structured logging with @guiiai/logg (P1 #5) -- one import, log each phase
4. Wire createEveningPipeline into setup-orchestrator.ts or a setup file (P1 #4) to eliminate orphan code
5. Remove unused deps (intimacy, persona) from EveningPipelineDeps or wire them (P1 #7)
6. Add error path and scheduleDaily() tests (P1 #6, #9) -- two new test cases
7. Run `/ultra-review recheck` to verify all P1s resolved
