# Review Summary

**Session**: 20260218-042006-feat-task-6-proactive-trigger-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: P1 count (7) exceeds threshold of 3; orphan modules, missing integration tests, and incomplete wiring require fixes before merge.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 7 |
| P2 Medium | 11 |
| P3 Low | 9 |
| **Total** | **29** (deduplicated from 29) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-tests | 5 | completed |
| review-errors | 2 | completed |
| review-types | 5 | completed |
| review-comments | 5 | completed |
| review-simplify | 4 | completed |

## P1 - High (Should Fix)
### [1] DoNotDisturb module exported but never consumed by any caller
- **File**: `packages/persona-engine/src/do-not-disturb.ts`:1
- **Category**: integration / orphan-exports
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The entire do-not-disturb module (8 functions) is exported from the package index but no consumer in apps/ or any other package imports these functions. The app integration at apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts does not use canTrigger, recordTrigger, recordIgnore, or any DND function. This is orphan code with no live entry point. The evaluateTriggers function also does not internally call canTrigger, so the DND system is completely disconnected from the trigger evaluation pipeline.
- **Suggestion**: Integrate canTrigger into the evaluate() function in apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts. Call canTrigger before evaluateTriggers and pass state.cooldownMultiplier as the cooldownMultiplier parameter. Store DoNotDisturbState alongside lastTriggerTimes and call recordTrigger/recordIgnore to close the loop.

### [2] 10 of 11 triggers exported but not wired to app entry point
- **File**: `packages/persona-engine/src/index.ts`:27
- **Category**: integration / orphan-triggers
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The app integration at apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts only imports T03_REST_REMINDER (line 16) and passes `const triggers = [T03_REST_REMINDER]` (line 37). The 10 new triggers (T01, T02, T04-T11) and ALL_TRIGGERS are exported but have no consumer reachable from any entry point. These triggers are dead-on-arrival in production.
- **Suggestion**: Update apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts to import ALL_TRIGGERS instead of just T03_REST_REMINDER, and pass it to evaluateTriggers. This wires all 11 triggers to the live Electron service.

### [3] lastTriggerTimes and intimacy state held only in closure memory
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:35
- **Category**: architecture / in-memory-state
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The persona-engine service stores lastTriggerTimes (trigger cooldown tracking), intimacy state, and now implicitly would need DoNotDisturbState in closure-scoped variables. These are lost on Electron process restart. Per CLAUDE.md architecture rules, critical state must be persistable and recoverable. Intimacy score (which affects which triggers can fire) and trigger history (which prevents notification spam) are business state that affects user experience.
- **Suggestion**: Persist lastTriggerTimes and intimacy state to electron-store or a local SQLite database. Load on startup, save after each state change. This makes the persona engine restart-safe.

### [4] DoNotDisturb module not wired into setupPersonaEngine
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:33
- **Category**: test-quality / orphan-detection
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The new do-not-disturb module (canTrigger, recordTrigger, recordIgnore, recordUserInteraction) is exported from persona-engine/index.ts but is NOT imported or used in setupPersonaEngine -- the only live entry point. The DND frequency limits, quiet hours, and progressive backoff are fully tested in isolation but never actually guard trigger evaluation in production. This means the DND system is unreachable dead code despite having tests.
- **Suggestion**: Wire do-not-disturb into setupPersonaEngine.evaluate(): call canTrigger() before evaluateTriggers(), call recordTrigger() after a trigger fires, and expose recordIgnore/recordUserInteraction in the returned API. Add an integration test proving the full flow: trigger -> DND check -> response.

### [5] setupPersonaEngine has zero test coverage
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:33
- **Category**: test-quality / missing-integration-test
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: setupPersonaEngine is the Imperative Shell entry point that composes evaluateTriggers, createEmotionActor, generateResponse, and mapToAnimaEmotion. It manages mutable state (lastTriggerTimes, intimacy). There is no dedicated test file for this service. The persona-engine.test.ts integration test exercises the pure functions directly but does NOT test setupPersonaEngine itself. The stateful orchestration (lastTriggerTimes mutation on line 51, emotion actor lifecycle, repeated evaluate calls) is untested.
- **Suggestion**: Create apps/stage-tamagotchi/src/main/services/anima/__tests__/persona-engine.test.ts that tests setupPersonaEngine directly: (1) evaluate returns null when no trigger fires, (2) evaluate returns a ProactiveResponse when trigger fires, (3) calling evaluate twice within cooldown returns null on second call (tests lastTriggerTimes statefulness), (4) dispose stops the emotion actor cleanly.

### [6] Only 1 of 11 triggers has response templates; 10 triggers silently fallback
- **File**: `packages/persona-engine/src/response-generator.ts`:6
- **Category**: test-quality / missing-behavioral-coverage
- **Confidence**: 88
- **Reported by**: review-tests
- **Description**: RESPONSE_TEMPLATES only contains entries for 'rest-reminder' (T03). The other 10 triggers all fall through to DEFAULT_MESSAGE. The response-generator.test.ts only tests T03 and an 'unknown-trigger' -- it does not verify that all 11 defined triggers produce meaningful user-facing messages. When T01/T02/T04-T11 fire in production, every user will see the generic fallback message regardless of emotion state.
- **Suggestion**: Add response templates for all 11 triggers in RESPONSE_TEMPLATES, or at minimum add a test that iterates ALL_TRIGGERS and verifies each produces a non-fallback message.

### [7] ENTERTAINMENT_APPS hardcoded as static set, not configurable
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:40
- **Category**: architecture / hardcoded-config
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The entertainment app list is hardcoded as a module-level constant. It uses exact string matching against app names, which is both fragile (app names vary by OS, locale, and version) and not user-configurable. Discord and WeChat are classified as 'entertainment' but are commonly used for work communication. T04 uses exact case-sensitive Set.has() matching, so 'youtube' or 'YOUTUBE' would not match.
- **Suggestion**: Accept the entertainment app list as a configuration parameter (similar to DoNotDisturbConfig). Use case-insensitive matching. Consider allowing per-user overrides.

## P2 - Medium (Consider)
### [8] Only rest-reminder has response templates; 10 triggers have no templates
- **File**: `packages/persona-engine/src/response-generator.ts`:6
- **Category**: code-quality / response-coverage
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: RESPONSE_TEMPLATES only contains entries for 'rest-reminder'. When any of the 10 new triggers fire, generateResponse will fall through to DEFAULT_MESSAGE which is a generic Chinese string. This means all 10 new triggers produce identical, context-free messages, making the trigger-specific behavior meaningless to the user.
- **Suggestion**: Add at least one template per trigger name in RESPONSE_TEMPLATES. Even a single emotion variant per trigger would provide meaningful differentiation.

### [9] indexOf returns -1 for unknown IntimacyStage, silently wrong result
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:34
- **Category**: error-handling / silent-failure
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: If either `current` or `required` is not present in INTIMACY_ORDER, `indexOf` returns -1. Comparing -1 >= -1 yields true, meaning an unknown stage would silently pass all intimacy checks. This is a fail-open condition -- unknown inputs are treated as meeting any requirement rather than being rejected.
- **Suggestion**: Add a runtime guard: throw or return false when indexOf returns -1 for either operand. Fail-closed on unknown input.

### [10] TRIGGER_EVENT_MAP only maps rest-reminder; new triggers have no emotion events
- **File**: `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`:24
- **Category**: integration / missing-trigger-event-map
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The TRIGGER_EVENT_MAP in the app integration service only handles 'rest-reminder'. When T01-T02 or T04-T11 fire, the event lookup returns undefined, so emotionActor.send() is skipped. The emotion machine never transitions based on these new triggers. TriggerResult now includes suggestedEmotion which could drive the emotion transition but is not used.
- **Suggestion**: Either expand TRIGGER_EVENT_MAP to cover all 11 trigger names, or use result.suggestedEmotion to dynamically derive the emotion event.

### [11] No test proving canTrigger and evaluateTriggers compose correctly
- **File**: `packages/persona-engine/src/__tests__/do-not-disturb.test.ts`:1
- **Category**: test-quality / missing-composition-test
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: canTrigger (DND guard) and evaluateTriggers (trigger evaluation) are designed to work together but no test exercises this composition. The contract between the two modules could break silently.
- **Suggestion**: Add a composition test: create DND state, recordIgnore 3 times to trigger backoff, verify cooldownMultiplier is 1.5, pass that multiplier to evaluateTriggers and verify cooldown is extended.

### [12] ONE_HOUR_MS and TWENTY_FOUR_HOURS_MS duplicated across modules
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:10
- **Category**: code-quality / duplicated-constants
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The constants ONE_HOUR_MS and TWENTY_FOUR_HOURS_MS are defined identically in both proactive-trigger.ts and do-not-disturb.ts. This duplication creates a maintenance risk where one could be updated without the other.
- **Suggestion**: Extract shared time constants to a common constants.ts file in the persona-engine package.

### [13] canTrigger has 6 parameters -- consider a config/context object
- **File**: `packages/persona-engine/src/do-not-disturb.ts`:69
- **Category**: simplification / parameter-count
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: canTrigger accepts 6 positional parameters, exceeding the recommended threshold of 5. Two number parameters (currentHour and now) are easy to swap accidentally.
- **Suggestion**: Group context parameters (currentHour, isFullscreen, priority, now) into a CanTriggerContext interface, reducing positional parameters from 6 to 3.

### [14] ProactiveResponse fields lack readonly modifiers
- **File**: `packages/persona-engine/src/types.ts`:145
- **Category**: type-design / encapsulation-inconsistency
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: Every other interface in types.ts uses readonly modifiers, but ProactiveResponse has plain mutable fields. This breaks the immutability convention established throughout the Functional Core.
- **Suggestion**: Add readonly modifiers to all ProactiveResponse fields.

### [15] isFrequencyExceeded silently accepts zero/negative config limits
- **File**: `packages/persona-engine/src/do-not-disturb.ts`:48
- **Category**: error-handling / silent-failure
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: If config.maxPerHour or config.maxPerDay is 0 or negative, the frequency check will always report 'exceeded', silently blocking all triggers without indication of misconfiguration.
- **Suggestion**: Add an assertion to validate that config values are positive integers.

### [16] DoNotDisturbConfig accepts invalid hour/count values
- **File**: `packages/persona-engine/src/do-not-disturb.ts`:12
- **Category**: type-design / missing-invariant-enforcement
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: The DoNotDisturbConfig interface imposes no type-level or runtime constraints. A consumer can construct invalid configs (e.g., { maxPerHour: -1, quietHoursStart: 99 }) causing subtle bugs.
- **Suggestion**: Add a validated factory function that enforces invariants: hours in 0-23, counts > 0, backoffMultiplier > 1.0.

### [17] evaluateTriggers has 5 parameters -- borderline for clarity
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:244
- **Category**: simplification / parameter-count
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: evaluateTriggers sits at 5 parameters. Three of them (lastTriggerTimes, now, cooldownMultiplier) are evaluation context that travels together. Grouping into an options object future-proofs the signature.
- **Suggestion**: Group lastTriggerTimes, now, and cooldownMultiplier into an EvaluateOptions interface.

### [18] TriggerInput hour/minute fields accept any number without validation
- **File**: `packages/persona-engine/src/types.ts`:90
- **Category**: type-design / primitive-obsession
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: TriggerInput.currentHour should be 0-23 and currentMinute should be 0-59, but both are typed as plain number. Invalid values produce wrong results silently.
- **Suggestion**: Add a createTriggerInput factory function with range validation.

### [19] EmotionState alias JSDoc duplicates values that will rot
- **File**: `packages/persona-engine/src/types.ts`:7
- **Category**: comments / redundant-alias-docs
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The JSDoc explicitly lists all six PersonaEmotion values as prose. When the union changes, this comment will become stale.
- **Suggestion**: Remove the enumerated values from the comment. Keep only: '/** Type alias for convenience across persona-engine modules. */'

### [20] T02_NOON_CARE boundary at exactly 13:30 not tested
- **File**: `packages/persona-engine/src/__tests__/proactive-trigger.test.ts`:125
- **Category**: test-quality / boundary-conditions
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: The test verifies 13:31 does not fire, but does not verify the exact boundary at 13:30 (inclusive upper bound). Boundary conditions are where off-by-one errors hide.
- **Suggestion**: Add explicit boundary tests: T02 at exactly 13:30 should fire, T05 at hour=4 should fire and hour=5 should not.

## P3 - Low (Optional)
### [21] TriggerInput fields lack boundary validation
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:244
- **Category**: code-quality / input-validation
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: evaluateTriggers does not validate that input fields are within expected ranges. Low severity since TriggerInput is constructed internally.
- **Suggestion**: Consider adding a debug-mode assertion or Valibot schema validation at the construction boundary.

### [22] Duration/timestamp fields use bare number without unit distinction
- **File**: `packages/persona-engine/src/types.ts`:84
- **Category**: type-design / primitive-obsession
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: Multiple fields represent durations in milliseconds typed as plain number. The 'Ms' suffix provides adequate clarity but branded types would add compile-time safety.
- **Suggestion**: Consider introducing branded types for time units in a future iteration.

### [23] ONE_HOUR_MS defined in two separate modules
- **File**: `packages/persona-engine/src/do-not-disturb.ts`:3
- **Category**: simplification / duplicate-constant
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: ONE_HOUR_MS and TWENTY_FOUR_HOURS_MS are independently defined in both proactive-trigger.ts and do-not-disturb.ts with identical values.
- **Suggestion**: Extract to a shared time-constants.ts module within the persona-engine package.

### [24] evaluateTriggers lastTriggerTimes uses Record<string, number>
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:247
- **Category**: type-design / loose-key-typing
- **Confidence**: 76
- **Reported by**: review-types
- **Description**: lastTriggerTimes accepts any string key but should only contain trigger IDs. However, since triggers are extensible, a fully constrained key type would be overly rigid.
- **Suggestion**: Consider a type alias to document intent without over-constraining.

### [25] Time constant JSDoc comments restate the variable name
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:3
- **Category**: comments / redundant-constant-comment
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Five time constants each have a JSDoc comment that restates what the variable name and expression already convey. Zero added information.
- **Suggestion**: Remove these comments entirely. The names and expressions are self-documenting.

### [26] do-not-disturb.test.ts section header '--- State Mutations ---' is inaccurate
- **File**: `packages/persona-engine/src/__tests__/do-not-disturb.test.ts`:143
- **Category**: comments / misleading-label
- **Confidence**: 82
- **Reported by**: review-comments
- **Description**: The section comment says 'State Mutations' but the functions all return new immutable state objects. Could mislead a future maintainer.
- **Suggestion**: Rename to '// --- State Transitions ---' to reflect the immutable pattern.

### [27] canTrigger could use destructuring for final return
- **File**: `packages/persona-engine/src/do-not-disturb.ts`:77
- **Category**: simplification / guard-clause
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: The final frequency check assigns to a temporary variable used once. Already well-structured; this is a very minor simplification opportunity.
- **Suggestion**: Replace `const freq = ...` with destructuring and a single return expression.

### [28] Section separator comments in proactive-trigger.ts are low-ROI
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:57
- **Category**: comments / redundant-section-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: Eleven section separators are redundant given the self-named trigger constants. Harmless but negative ROI.
- **Suggestion**: Consider removing; IDE outline provides equivalent navigation.

### [29] Test comment says '23 PM' instead of '23:00'
- **File**: `packages/persona-engine/src/__tests__/do-not-disturb.test.ts`:41
- **Category**: comments / accuracy
- **Confidence**: 76
- **Reported by**: review-comments
- **Description**: '23 PM' is not a valid 12-hour time format. 23:00 is 24-hour format; 'PM' is contradictory.
- **Suggestion**: Change to 'handles boundary: 23:00 is quiet'.

## Positive Observations
- Excellent Functional Core design: all trigger conditions are pure functions with no side effects, making them trivially testable via direct instantiation with no mocks needed.
- Discriminated union TriggerResult type makes illegal states unrepresentable -- good type design.
- DoNotDisturb module uses immutable state pattern correctly: every mutation returns a new state object, enabling easy persistence and time-travel debugging.
- Comprehensive boundary-value testing for all 11 triggers, including edge cases for time ranges (inclusive/exclusive bounds).
- Clean separation of concerns: trigger evaluation, DND policy, emotion mapping, and response generation are each in their own module with clear single responsibilities.
- TriggerInput uses readonly properties throughout, preventing accidental mutation.
- The cooldownMultiplier parameter elegantly connects the DND backoff system to the trigger evaluation without coupling the modules directly.
- All Functional Core modules tested with direct instantiation and zero mocks -- exactly the correct approach per architecture rules.
- persona-engine.test.ts end-to-end integration test proves real collaboration across trigger -> emotion machine -> emotion bridge -> response generator.
- All changed code is pure Functional Core: no I/O, no async, no try/catch needed. No empty catch blocks, no swallowed errors.
- String literal unions (PersonaEmotion, IntimacyStage, TriggerPriority, AppCategory) provide excellent type safety.
- All functions are short (under 30 lines), with consistently low cyclomatic complexity.
- Named constants are used consistently instead of magic numbers for all time durations.

## Recommended Action Plan
1. Wire the DoNotDisturb module into setupPersonaEngine -- call canTrigger before evaluateTriggers, recordTrigger after fires (fixes findings [1], [4])
2. Import ALL_TRIGGERS instead of just T03_REST_REMINDER in the app integration service (fixes finding [2])
3. Expand TRIGGER_EVENT_MAP and RESPONSE_TEMPLATES for all 11 triggers (fixes findings [6], [8], [10])
4. Add response templates for T01-T02, T04-T11 in response-generator.ts (fixes finding [6], [8])
5. Persist lastTriggerTimes and intimacy state to electron-store or SQLite (fixes finding [3])
6. Make ENTERTAINMENT_APPS configurable and use case-insensitive matching (fixes finding [7])
7. Add integration tests for setupPersonaEngine (fixes finding [5])
8. Run `/ultra-review recheck` to verify all P1 issues are resolved
