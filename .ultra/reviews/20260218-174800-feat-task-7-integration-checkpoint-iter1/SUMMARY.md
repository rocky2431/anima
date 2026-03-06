# Review Summary

**Session**: 20260218-174800-feat-task-7-integration-checkpoint-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 1 P0 (forbidden placeholder pattern) and 9 P1 findings (error handling gaps, orphan code, missing persistence, missing test coverage)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 1 |
| P1 High | 9 |
| P2 Medium | 21 |
| P3 Low | 12 |
| **Total** | **43** (deduplicated from 44) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 10 | completed |
| review-tests | 8 | completed |
| review-errors | 8 | completed |
| review-types | 6 | completed |
| review-comments | 6 | completed |
| review-simplify | 6 | completed |

## P0 - Critical (Must Fix)
### [1] Class named PlaceholderVlmProvider with 'Placeholder' in JSDoc comment
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:33
- **Category**: forbidden-pattern
- **Confidence**: 95
- **Reported by**: review-comments
- **Description**: The JSDoc comment says 'Placeholder VLM provider that returns a generic activity description.' and the class is named PlaceholderVlmProvider. Per CLAUDE.md forbidden patterns, PLACEHOLDER annotations are P0. The comment 'Will be replaced with a real AI SDK 6 integration in Task 8' on line 34 is a disguised TODO referencing a specific future task, which also violates the no-TODO rule.
- **Suggestion**: Rename the class to something like StubVlmProvider or NoOpVlmProvider. Rewrite the JSDoc to describe what the class actually does ('Returns a generic activity description without calling any VLM API') rather than describing it as a placeholder. Remove the forward reference to Task 8.

## P1 - High (Should Fix)
### [2] Intimacy state, lastTriggerTimes, and emotion actor are closure-scoped with no persistence
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:118
- **Category**: in-memory-state
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The orchestrator holds three pieces of critical state in closure variables: `intimacy` (line 118), `lastTriggerTimes` (line 119), and `emotionActor` (line 117). All three are lost on app restart. Per CLAUDE.md rules: 'Business state in memory' is a forbidden pattern -- critical state must be persisted to DB/KV/Event Store. Intimacy score is a user-facing progression system. Losing it on restart destroys user experience. The lastTriggerTimes map controls trigger cooldowns; losing it means duplicate triggers fire immediately after restart.
- **Suggestion**: Persist intimacy score and stage to the existing DuckDB/SQLite store on each applyScoreChange call. Persist lastTriggerTimes as a JSON column or separate table. For the emotion actor, either persist the current state string and restore on startup, or accept that emotion is ephemeral and document that decision explicitly.

### [3] Old context-engine.ts and persona-engine.ts files are now dead code
- **File**: `apps/stage-tamagotchi/src/main/services/anima/context-engine.ts`:1
- **Category**: orphan-code
- **Confidence**: 98
- **Reported by**: review-code
- **Description**: The orchestrator replaces setupContextEngine() and setupPersonaEngine() (confirmed by the index.ts diff removing their imports). However, the old files remain in the directory. They are no longer imported from any live entry point. This is orphan code -- per CLAUDE.md orphan detection rules, code not reachable from any entry point is dead-on-arrival.
- **Suggestion**: Delete both files: `apps/stage-tamagotchi/src/main/services/anima/context-engine.ts` and `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`. They have been fully superseded by `orchestrator.ts` and `setup-orchestrator.ts`.

### [4] DoNotDisturb module still not wired into the orchestrator
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:122
- **Category**: orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The previous review (task-6) flagged that DoNotDisturb (canTrigger, recordTrigger, recordIgnore, recordUserInteraction) is exported from persona-engine but never consumed in the live wiring. This orchestrator was supposed to unify context-engine and persona-engine, but it still does not integrate DoNotDisturb. The handleProcessedContext function calls evaluateTriggers without first checking canTrigger(), and does not call recordTrigger() after firing. The entire DoNotDisturb system remains unreachable dead code in production.
- **Suggestion**: In handleProcessedContext: (1) call canTrigger(dndState, ...) before evaluateTriggers, (2) call recordTrigger(dndState, now) after a trigger fires, (3) expose recordIgnore and recordUserInteraction in the AnimaOrchestrator interface.

### [5] onError is optional -- when omitted, ScreenshotPipeline swallows errors silently and ActivityMonitor throws in setInterval
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:56
- **Category**: error-handling
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: AnimaOrchestratorConfig.onError is optional. In ScreenshotPipeline, when onError is undefined, errors are silently swallowed. In ActivityMonitor, when onError is undefined and onContext throws, the error is re-thrown inside setInterval, which becomes an unhandled exception that can crash the Electron main process.
- **Suggestion**: Either make onError required, or provide a default handler inside createAnimaOrchestrator that at minimum logs errors. This prevents both the silent-swallow path and the crash path.

### [6] handleProcessedContext has no try/catch; exceptions propagate unguarded
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:122
- **Category**: error-handling
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: handleProcessedContext (lines 122-147) calls evaluateTriggers, emotionActor.send, generateResponse, mapToAnimaEmotion, and config.onProactiveResponse without any try/catch. When onError is absent and start() is used, errors re-thrown inside setInterval cause unhandled exceptions that crash the Electron main process.
- **Suggestion**: Wrap the body of handleProcessedContext in try/catch. Log the error with context and forward to config.onError.

### [7] VLM provider failure path not tested in orchestrator
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:494
- **Category**: test-quality
- **Confidence**: 92
- **Reported by**: review-tests
- **Description**: The error handling section only tests screenshot capture failure. There is no test for when VlmProvider.describeImage() throws an error. The orchestrator wires onError for this path, but it is never verified with a failing VLM.
- **Suggestion**: Add a test with a VlmProvider that throws and verify that onError is called with the appropriate wrapped error message.

### [8] Missing error test for handleProcessedContext failures
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:494
- **Category**: error-handling
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: No test verifies that errors from evaluateTriggers, generateResponse, or onProactiveResponse are correctly caught, wrapped, and forwarded to onError. Given that handleProcessedContext has no try/catch, the crash path is both untested and unhandled.
- **Suggestion**: Add test cases: (1) onProactiveResponse callback that throws, (2) malformed trigger data, (3) behavior when onError is not provided.

### [9] setup-orchestrator onError handler only logs -- does not escalate or recover
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:69
- **Category**: error-handling
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: The production wiring sets onError to log the error but takes no recovery action. Repeated failures will log indefinitely without circuit-breaking or alerting. This is catch-and-log-only, which CLAUDE.md explicitly forbids.
- **Suggestion**: Add circuit breaker: count consecutive errors and stop the pipeline after N failures. Emit an error metric/event for observability.

### [10] createAnimaOrchestrator function is 100 lines long
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:113
- **Category**: simplification
- **Confidence**: 75
- **Reported by**: review-simplify
- **Description**: The function spans lines 113-213 (100 lines). While internally well-structured with named inner functions, the function body crosses the 100-line threshold. This is borderline -- the internal structure is good, but the overall length makes it harder to see the full shape at a glance.
- **Suggestion**: Extract the returned object's method implementations as standalone inner functions. Consider extracting only if the function grows further.

## P2 - Medium (Consider)
### [11] PlaceholderVlmProvider returns hardcoded values in production path
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:36
- **Category**: architecture
- **Confidence**: 88
- **Reported by**: review-code

### [12] No ActivityEvent source wired to the orchestrator
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:53
- **Category**: integration
- **Confidence**: 93
- **Reported by**: review-code

### [13] buildTriggerInput hardcodes several fields to safe defaults, limiting trigger coverage
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:222
- **Category**: architecture
- **Confidence**: 92
- **Reported by**: review-code, review-types

### [14] TRIGGER_EMOTION_MAP uses plain `string` key instead of trigger name literal union
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:63
- **Category**: type-design
- **Confidence**: 92
- **Reported by**: review-types

### [15] Near-duplicate PNG buffer generation blocks in test setup
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:20
- **Category**: simplification
- **Confidence**: 90
- **Reported by**: review-simplify

### [16] Heavily duplicated test orchestrator setup across 11 test cases
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:131
- **Category**: simplification
- **Confidence**: 92
- **Reported by**: review-simplify

### [17] onProactiveResponse only logs -- proactive responses never reach the UI
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:61
- **Category**: integration
- **Confidence**: 90
- **Reported by**: review-code

### [18] Trigger cooldown behavior not tested at orchestrator level
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:156
- **Category**: test-quality
- **Confidence**: 88
- **Reported by**: review-tests

### [19] AnimaOrchestratorConfig lacks readonly modifiers on all fields
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:47
- **Category**: type-design
- **Confidence**: 88
- **Reported by**: review-types

### [20] TRIGGER_EMOTION_MAP lookup silently skips unknown trigger names
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:133
- **Category**: error-handling
- **Confidence**: 85
- **Reported by**: review-errors

### [21] Unsafe type assertion: `emotionActor.getSnapshot().value as PersonaEmotion`
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:138
- **Category**: type-design
- **Confidence**: 85
- **Reported by**: review-types

### [22] No test for empty activity events edge case
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:120
- **Category**: test-quality
- **Confidence**: 85
- **Reported by**: review-tests

### [23] Unsafe type assertion on emotion actor snapshot value
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:138
- **Category**: error-handling
- **Confidence**: 82
- **Reported by**: review-errors

### [24] No test for unmapped trigger name in TRIGGER_EMOTION_MAP
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:133
- **Category**: test-quality
- **Confidence**: 82
- **Reported by**: review-tests

### [25] buildTriggerInput hardcoded defaults not tested for correctness
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:222
- **Category**: test-quality
- **Confidence**: 80
- **Reported by**: review-tests

### [26] Screenshot deduplication behavior not tested at orchestrator level
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:129
- **Category**: test-quality
- **Confidence**: 80
- **Reported by**: review-tests

### [27] setupAnimaOrchestrator has no error handling for constructor-phase failures
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:53
- **Category**: error-handling
- **Confidence**: 80
- **Reported by**: review-errors

### [28] No error handling around emotionActor.stop() in stop() method
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:175
- **Category**: error-handling
- **Confidence**: 78
- **Reported by**: review-errors

### [29] Async tick in setInterval without concurrency guard propagated to orchestrator
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:170
- **Category**: race-condition
- **Confidence**: 76
- **Reported by**: review-code

### [30] setup-orchestrator.ts has no corresponding test file
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:1
- **Category**: test-quality
- **Confidence**: 76
- **Reported by**: review-tests

### [31] Forward-looking comment referencing 'Task 8' will rot
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:34
- **Category**: comments
- **Confidence**: 95
- **Reported by**: review-comments

### [32] Forward-looking comment 'will be enhanced when respective systems are implemented'
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:220
- **Category**: comments
- **Confidence**: 92
- **Reported by**: review-comments

## P3 - Low (Optional)
### [33] Type assertion 'as PersonaEmotion' used repeatedly without runtime guard
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:138
- **Category**: code-quality
- **Confidence**: 78
- **Reported by**: review-code

### [34] PlaceholderVlmProvider in production code is a TODO pattern
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:34
- **Category**: test-quality
- **Confidence**: 78
- **Reported by**: review-tests

### [35] Magic time expressions could use named constants
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:162
- **Category**: simplification
- **Confidence**: 88
- **Reported by**: review-simplify

### [36] Misplaced 'Test Double rationale: N/A' comment on production class
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:14
- **Category**: comments
- **Confidence**: 88
- **Reported by**: review-comments

### [37] Test Double rationale comment in production code is misleading
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:14
- **Category**: code-quality
- **Confidence**: 85
- **Reported by**: review-code

### [38] AnimaProactiveEvent.timestamp is bare `number` -- primitive obsession
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:39
- **Category**: type-design
- **Confidence**: 80
- **Reported by**: review-types

### [39] Repeated continuous-work test pattern could share a helper
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:157
- **Category**: simplification
- **Confidence**: 82
- **Reported by**: review-simplify

### [40] Redundant comment 'Ensure the last event is at endTime' restates obvious code
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.test.ts`:113
- **Category**: comments
- **Confidence**: 80
- **Reported by**: review-comments

### [41] Runtime warning message references 'placeholder'
- **File**: `apps/stage-tamagotchi/src/main/services/anima/setup-orchestrator.ts`:38
- **Category**: comments
- **Confidence**: 78
- **Reported by**: review-comments

### [42] AnimaOrchestratorConfig has 7 fields mixing concerns
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:47
- **Category**: code-quality
- **Confidence**: 75
- **Reported by**: review-simplify

### [43] AnimaOrchestrator interface is well-designed with clear behavioral contract
- **File**: `apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts`:83
- **Category**: architecture (positive observation)
- **Confidence**: 95
- **Reported by**: review-types

## Positive Observations
- AnimaOrchestrator interface is well-designed with clear behavioral contract -- factory function hides implementation details while exposing deterministic tick methods for testing
- buildTriggerInput correctly bridges context-engine and persona-engine domains as an anti-corruption layer, keeping the two domains independent
- Orchestrator test file has comprehensive coverage with 11 test cases covering the main pipeline paths, proactive trigger scenarios, emotion state transitions, and intimacy progression
- The overall Functional Core / Imperative Shell separation is clean: persona-engine functions remain pure, orchestrator handles IO composition
- xstate emotion machine integration provides a principled approach to emotion state transitions rather than ad-hoc flag management
- ScreenshotPipeline uses pHash deduplication to avoid redundant VLM calls -- a thoughtful performance optimization
- The new orchestrator successfully unifies context-engine and persona-engine into a single coherent pipeline, simplifying the previous two-file setup

## Recommended Action Plan
1. Fix 1 P0 issue first: rename PlaceholderVlmProvider, remove forbidden placeholder/TODO language
2. Address 9 P1 issues in a focused pass:
   - Delete orphan files (context-engine.ts, persona-engine.ts)
   - Wire DoNotDisturb into the orchestrator
   - Add try/catch to handleProcessedContext + default onError handler
   - Add circuit breaker to setup-orchestrator onError
   - Add persistence interface for intimacy and lastTriggerTimes
   - Add missing error path tests (VLM failure, handleProcessedContext failure)
   - Consider extracting createAnimaOrchestrator if it grows
3. Run `/ultra-review recheck` to verify P0 and P1 fixes
