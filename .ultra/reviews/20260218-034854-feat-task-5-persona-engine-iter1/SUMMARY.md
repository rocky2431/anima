# Review Summary

**Session**: 20260218-034854-feat-task-5-persona-engine-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 1 P0 breaking export removes `INITIAL_EMOTION` and `transitionEmotion` used by the only live consumer; 6 P1s including horizontal-only delivery, orphan code, missing persistence, missing contract, missing test file, and misleading comment.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 1 |
| P1 High | 6 |
| P2 Medium | 9 |
| P3 Low | 6 |
| **Total** | **22** (deduplicated from 22) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 7 | completed |
| review-tests | 3 | completed |
| review-errors | 2 | completed |
| review-types | 5 | completed |
| review-comments | 4 | completed |
| review-simplify | 1 | completed |

## P0 - Critical (Must Fix)
### [1] Removed exports break existing app-level consumer
- **File**: `packages/persona-engine/src/index.ts`:31
- **Category**: architecture / breaking-export
- **Confidence**: 99
- **Reported by**: review-code
- **Description**: The previous index.ts exported `INITIAL_EMOTION` and `transitionEmotion` from `./emotion-state-machine`. This commit removes those exports entirely. However, the app-level consumer at `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts` (lines 4-6) still imports both `INITIAL_EMOTION` and `transitionEmotion` from `@proj-airi/persona-engine`. The build will fail with 'Module has no exported member' errors. This is a breaking change that was not propagated to the only live consumer.
- **Suggestion**: Either (a) update `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts` to use the new `emotionMachine` (xstate actor) and `mapToAnimaEmotion` instead of the removed pure-function API, or (b) add backwards-compatible re-exports. The app service needs to be rewritten to create an xstate actor, send events to it, and use `mapToAnimaEmotion` for the bridge. This is the critical missing piece.

## P1 - High (Should Fix)
### [2] emotionMachine, emotion-bridge, intimacy-tracker, persona-template have no app-level consumer
- **File**: `packages/persona-engine/src/index.ts`:16
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: Four new modules (emotion-state-machine as xstate machine, emotion-bridge, intimacy-tracker, persona-template) are exported from the package index but have zero consumers outside the persona-engine package itself. The only live consumer (`apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts`) has not been updated to use any of these. Per integration rules, code exported but not reachable from any entry point is an orphan.
- **Suggestion**: Update `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts` to: (1) create an xstate actor from `emotionMachine`, (2) use `mapToAnimaEmotion` to bridge to the Anima emotion system, (3) integrate `createIntimacyState` and `applyScoreChange` for tracking relationship progression, (4) use `getPersonaTemplate` to select character personality.

### [3] response-generator.ts has no dedicated test file
- **File**: `packages/persona-engine/src/response-generator.ts`:1
- **Category**: test-quality / missing-test-file
- **Confidence**: 95
- **Reported by**: review-tests
- **Description**: response-generator.ts contains generateResponse() with template lookup, two levels of fallback logic (templates?.[emotion] -> templates?.idle -> DEFAULT_MESSAGE), and a default message constant. Only one test case in persona-engine.test.ts covers the 'caring' emotion with 'rest-reminder' trigger. Fallback paths, unknown triggers, and other emotion variants are untested. This is Functional Core code where 100% coverage is required.
- **Suggestion**: Create `packages/persona-engine/src/__tests__/response-generator.test.ts` with tests covering: (1) each emotion variant for 'rest-reminder', (2) unknown trigger name falls back to DEFAULT_MESSAGE, (3) known trigger with unmapped emotion falls back to idle template, (4) known trigger with neither emotion nor idle key falls back to DEFAULT_MESSAGE.

### [4] EmotionState alias comment claims backwards-compatibility that does not exist
- **File**: `packages/persona-engine/src/types.ts`:7
- **Category**: comments / factual-inaccuracy
- **Confidence**: 92
- **Reported by**: review-comments
- **Description**: The comment says 'Backwards-compatible alias' but the underlying values changed entirely: the previous EmotionState was 'neutral' | 'happy' | 'caring' | 'playful' | 'worried' | 'sad', while PersonaEmotion is 'idle' | 'curious' | 'caring' | 'worried' | 'sleepy' | 'excited'. Only 'caring' and 'worried' survived. This is a breaking rename, not backwards compatibility.
- **Suggestion**: Rewrite to: 'Type alias so response-generator and proactive-trigger can refer to emotion states without importing PersonaEmotion directly. Note: the emotion values were renamed in this iteration (idle replaces neutral, curious replaces happy, etc.).'

### [5] AnimaEmotionPayload uses string name but stage-ui EmotionPayload uses Emotion enum
- **File**: `packages/persona-engine/src/types.ts`:50
- **Category**: integration / missing-contract
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The `AnimaEmotionPayload` interface declares `name: string`, but its purpose is to match `stage-ui`'s `EmotionPayload` interface which uses `name: Emotion` (a string enum). The types are not structurally connected -- no shared import, no contract test. A typo in mapping values would not be caught at compile time.
- **Suggestion**: Either (1) import the `Emotion` enum from `@proj-airi/stage-ui` and use it as the `name` type, or (2) extract a shared interface into `packages/stage-shared`. Add a contract test validating all mapped values are valid Emotion enum members.

### [6] IntimacyState has no persistence path -- score resets on restart
- **File**: `packages/persona-engine/src/intimacy-tracker.ts`:46
- **Category**: architecture / in-memory-state
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The intimacy tracker creates pure immutable state objects but there is no persistence adapter, no save/load mechanism, and no consumer that would persist the score. The intimacy score (stranger -> soulmate progression) is business-critical relationship state. Per CLAUDE.md, critical state must be persistable/recoverable/observable. On app restart, all intimacy progress would be lost.
- **Suggestion**: Add a persistence adapter in the imperative shell layer. Minimal approach: (1) add `serializeIntimacyState` / `deserializeIntimacyState` in the functional core, (2) in the app service, load state from electron-store on startup and save after each `applyScoreChange`.

### [7] Change is horizontal-only: no end-to-end path exercises new modules
- **File**: `packages/persona-engine/src/index.ts`:1
- **Category**: integration / horizontal-only
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: This change adds 4 new functional core modules but does not update any imperative shell layer to consume them. The app-level service still uses the old API (which is now broken). No IPC handler, event listener, or timer invokes any of the new code. Per the vertical slice principle, every task must deliver a thin working end-to-end path.
- **Suggestion**: Update `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts` to create and manage an xstate emotion actor, send events based on triggers, use `mapToAnimaEmotion` for bridging, and integrate intimacy tracking. Wire to the existing IPC/event system.

## P2 - Medium (Consider)
### [8] AnimaEmotionPayload.name is plain string, not literal union
- **File**: `packages/persona-engine/src/types.ts`:53
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The `name` field accepts any string, but only 5 valid Anima emotion names are used. Without a literal union, consumers can pass arbitrary strings. The `intensity` field is typed as bare `number` but semantically constrained to [0, 1].
- **Suggestion**: Define `type AnimaEmotionName = 'happy' | 'sad' | 'angry' | 'think' | 'surprised' | 'awkward' | 'question' | 'curious' | 'neutral'` and use it for the `name` field.

### [9] AnimaEmotionPayload JSDoc claims it matches stage-ui EmotionPayload but types differ
- **File**: `packages/persona-engine/src/types.ts`:50
- **Category**: comments / factual-inaccuracy
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The comment says this interface 'matching the stage-ui EmotionPayload interface', but stage-ui defines name as type Emotion (an enum), not string. The comment overstates the contract alignment.
- **Suggestion**: Change the comment to 'Loosely models the stage-ui EmotionPayload. name is kept as string to avoid a direct dependency on stage-ui.'

### [10] Hardcoded intimacy stage boundaries and score deltas
- **File**: `packages/persona-engine/src/intimacy-tracker.ts`:6
- **Category**: code-quality / hardcoded-config
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: Intimacy score deltas and stage boundary ranges are hardcoded as module-level constants. Different PersonaTemplates might want to configure these differently -- a 'caring' persona might build intimacy faster than a reserved one.
- **Suggestion**: Consider making intimacy configuration part of the PersonaTemplate interface, with current constants as defaults.

### [11] User-supplied trigger.check() called without error protection
- **File**: `packages/persona-engine/src/proactive-trigger.ts`:50
- **Category**: error-handling / missing-try-catch-on-callback
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: The evaluateTriggers function invokes trigger.check(input) without contextual error wrapping. If a custom check function throws, the exception propagates without information about which trigger failed or what input was provided.
- **Suggestion**: Wrap in try/catch that re-throws with context: `throw new Error(\`Trigger '${trigger.id}' check failed\`, { cause: e })`.

### [12] Emotion state machine missing unhandled event behavior test
- **File**: `packages/persona-engine/src/__tests__/emotion-state-machine.test.ts`:181
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The test file verifies snapshot.can() only for the idle state. It does not test unhandled events or snapshot.can() for other states. Several transitions (caring -> excited on GOOD_NEWS, worried -> excited, sleepy -> excited) exist in the machine but have no dedicated tests.
- **Suggestion**: Add tests verifying: (1) unhandled events don't change state, (2) snapshot.can() for caring and worried states, (3) GOOD_NEWS transitions from caring, worried, and sleepy.

### [13] TriggerInput fields are mutable, breaking Functional Core
- **File**: `packages/persona-engine/src/types.ts`:63
- **Category**: type-design / missing-readonly
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: TriggerInput fields lack `readonly` modifiers. All other interfaces in this file correctly use `readonly`. In a Functional Core, input data should be immutable.
- **Suggestion**: Add `readonly` modifiers to all TriggerInput fields.

### [14] applyScoreChange only clamps upward; no mechanism for score decrease
- **File**: `packages/persona-engine/src/intimacy-tracker.ts`:63
- **Category**: code-quality / missing-negative-score-handling
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: Uses `Math.min(100, ...)` but not `Math.max(0, ...)`. If negative deltas are added in the future, scores could go below zero, creating inconsistency between `state.score` and `state.stage`.
- **Suggestion**: Add lower-bound clamping: `const newScore = Math.max(0, Math.min(100, state.score + delta))`.

### [15] TriggerCondition fields lack readonly, inconsistent with other types
- **File**: `packages/persona-engine/src/types.ts`:75
- **Category**: type-design / missing-readonly
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: TriggerCondition allows mutation of all fields including `check` function and `cooldownMs`. Should be immutable once created.
- **Suggestion**: Add `readonly` modifiers to all TriggerCondition fields.

### [16] Intimacy tracker missing negative score and zero-floor tests
- **File**: `packages/persona-engine/src/__tests__/intimacy-tracker.test.ts`:61
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: applyScoreChange tests verify upper bound clamping (100) but not lower bound behavior. If negative deltas were introduced, scores could go below 0 -- this gap in both code and tests should be addressed together.
- **Suggestion**: Fix applyScoreChange to use `Math.max(0, Math.min(100, ...))` and add corresponding boundary tests.

## P3 - Low (Optional)
### [17] Response generator comment references 'initial integration' scope -- will rot
- **File**: `packages/persona-engine/src/response-generator.ts`:21
- **Category**: comments / rot-risk
- **Confidence**: 82
- **Reported by**: review-comments
- **Suggestion**: Rewrite to 'Uses template-based generation. No LLM dependency required.'

### [18] IntimacyState score/stage consistency not enforced by type alone
- **File**: `packages/persona-engine/src/types.ts`:20
- **Category**: type-design / invariant-expression
- **Confidence**: 82
- **Reported by**: review-types
- **Suggestion**: Current factory-function approach is pragmatic. Consider branded types for stronger enforcement if the domain grows.

### [19] Duplicated score clamping logic could use a named helper
- **File**: `packages/persona-engine/src/intimacy-tracker.ts`:31
- **Category**: simplification / duplication
- **Confidence**: 80
- **Reported by**: review-simplify
- **Suggestion**: Extract a `clampScore(score: number): number` helper to encode domain intent. Minor -- only 2 occurrences.

### [20] Hardcoded count 'Three preset persona templates' will rot if templates change
- **File**: `packages/persona-engine/src/persona-template.ts`:4
- **Category**: comments / rot-risk
- **Confidence**: 78
- **Reported by**: review-comments
- **Suggestion**: Remove the count: 'Preset persona templates representing different character archetypes.'

### [21] PersonaTemplate.id is plain string, not constrained to known IDs
- **File**: `packages/persona-engine/src/types.ts`:42
- **Category**: type-design / primitive-obsession
- **Confidence**: 76
- **Reported by**: review-types
- **Suggestion**: Consider `type PersonaTemplateId = 'xiaorou' | 'aria' | 'mochi'` if the set is closed. Keep `string` if user-defined templates are planned.

### [22] getPersonaTemplate returns undefined instead of Result type
- **File**: `packages/persona-engine/src/persona-template.ts`:36
- **Category**: error-handling / result-pattern-opportunity
- **Confidence**: 75
- **Reported by**: review-errors
- **Suggestion**: Consider returning `{ ok: true, value } | { ok: false, reason }` with available template IDs in the error message.

## Positive Observations
- Excellent use of xstate v5 for emotion state management. Using a mature library instead of hand-rolling state transitions is the right choice.
- Pure functional core design is exemplary: all domain functions are pure, take inputs, return outputs, and require no mocks for testing.
- Immutable state pattern in intimacy-tracker (readonly properties, new object returned from applyScoreChange) prevents accidental mutation bugs.
- All modules tested with direct instantiation -- zero mocks, zero jest.fn(), zero InMemoryRepository. Exemplary adherence to the testing discipline.
- TriggerResult uses a proper discriminated union, eliminating boolean flag + empty string sentinel values. Illegal states are now unrepresentable.
- The emotion-bridge module maps between bounded contexts using a total Record<PersonaEmotion, AnimaEmotionPayload>, guaranteeing all states are handled at compile time.
- All exported functions and interfaces have JSDoc with accurate @param and @returns documentation.
- All functions are consistently short (under 20 lines) with clear single responsibilities. Maximum nesting depth is 2 levels.
- generateResponse uses Extract<TriggerResult, { triggered: true }> to narrow the discriminated union, ensuring only triggered results can produce responses.
- Guard clause pattern used effectively in evaluateTriggers (early continue for cooldown).

## Recommended Action Plan
1. Fix 1 P0 issue first: update `apps/stage-tamagotchi/src/main/services/anima/persona-engine.ts` to use the new xstate-based API, or add backwards-compatible re-exports to unbreak the build
2. Address 6 P1 issues in a single pass -- most are interconnected (wiring the app consumer resolves orphan-code, horizontal-only, and persistence gaps simultaneously; add response-generator tests and fix the misleading comment)
3. Run `/ultra-review recheck` to verify
