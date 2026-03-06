# Review Summary

**Session**: 20260221-030900-feat-task-22-context-merger-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: P1 count (6) exceeds threshold (>3)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 6 |
| P2 Medium | 11 |
| P3 Low | 6 |
| **Total** | **23** (deduplicated from 23) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 6 | completed |
| review-tests | 3 | completed |
| review-errors | 4 | completed |
| review-types | 5 | completed |
| review-comments | 2 | completed |
| review-simplify | 3 | completed |

## P1 - High (Should Fix)
### [1] ContextMerger and EntityExtractor have no live consumer
- **File**: packages/context-engine/src/processing/context-merger.ts:108
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: ContextMerger and EntityExtractor are exported from the context-engine barrel (index.ts) but no module in apps/ or any other package imports them. The classes are dead-on-arrival: no HTTP handler, event listener, cron job, or Electron service instantiates them. Grep across the entire monorepo (apps/, packages/, services/) returns zero import matches outside context-engine itself and its tests.
- **Suggestion**: Wire ContextMerger into an existing live entry point, such as the AnimaOrchestrator in apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts, which already consumes other context-engine modules (ScreenshotPipeline, ActivityMonitor). Even a minimal call like `orchestrator.getMergedContext()` would prove the wiring works end-to-end.

### [2] Test description says 'weighted average' but code uses simple mean
- **File**: packages/context-engine/src/__tests__/context-merger.test.ts:161
- **Category**: comments / factual-accuracy
- **Confidence**: 95
- **Reported by**: review-comments
- **Description**: The test name states 'weighted average' but the actual implementation in computeImportance() (context-merger.ts:72-81) computes a simple arithmetic mean: sum / count. A weighted average would weight each source differently (e.g., by recency or source type). The JSDoc on computeImportance correctly says 'average' without the 'weighted' qualifier. This discrepancy will mislead anyone reading the test into thinking the importance calculation accounts for per-source weights, when it does not.
- **Suggestion**: Rename the test to: it('computes importance as arithmetic mean of source importances', ...) or simply it('computes importance as average of source importances', ...) to match the actual behavior and the JSDoc.

### [3] Error messages lack operational context (source count, text length)
- **File**: packages/context-engine/src/processing/context-merger.ts:155
- **Category**: error-handling / missing-context
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: Both ContextMerger.merge() (line 155) and EntityExtractor.extract() (line 33 of entity-extractor.ts) wrap errors with new Error(msg, { cause }), which is the correct pattern. However, neither message includes the operational context needed for debugging: number of sources, source types, combined text length, or a text snippet. When these errors surface in production logs, the developer cannot tell what input triggered the failure without digging through the cause chain.
- **Suggestion**: Include input context in both error messages. For ContextMerger: `throw new Error(\`Context merge failed (${selected.length} sources, types=[${selected.map(s=>s.source).join(',')}])\`, { cause })`. For EntityExtractor: `throw new Error(\`Entity extraction failed (text length=${text.length})\`, { cause })`.

### [4] EntityExtractor trusts LLM output without runtime validation
- **File**: packages/context-engine/src/processing/entity-extractor.ts:24
- **Category**: type-design / missing-validation
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: EntityExtractor calls generateStructured<ExtractedEntities> but performs no runtime validation on the returned object. The generic type parameter T is erased at runtime -- if the LLM returns malformed data (e.g., a string instead of an array for 'persons', or a missing field), the invalid shape silently propagates through the pipeline. SmartTip in this same codebase demonstrates the gold-standard pattern: validate LLM output with type guards before returning.
- **Suggestion**: Add a validateExtractedEntities() type guard that checks all 5 fields are present and are string arrays, similar to SmartTip's isValidSmartTipResult(). Return a safe default (empty arrays) or throw a typed error on validation failure.

### [5] Horizontal-only change: no vertical slice integration
- **File**: packages/context-engine/src/processing/context-merger.ts:1
- **Category**: integration / horizontal-only
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: This task adds a complete context-merging layer (ContextMerger, EntityExtractor, types) with tests, but delivers zero vertical integration. There is no entry point that calls ContextMerger.merge(), no IPC handler exposes it to the UI, and no scheduled job triggers it. This is a horizontal layer addition (pure library code) rather than a vertical slice that proves end-to-end connectivity.
- **Suggestion**: Add at least one vertical integration point: (1) call ContextMerger.merge() from AnimaOrchestrator when processing a context update cycle, passing the outputs of ScreenshotPipeline + ActivityMonitor as ContextSource[], or (2) add an IPC handler that the UI can invoke. Include one integration test proving the wiring.

### [6] No validation of LLM structured output shape
- **File**: packages/context-engine/src/processing/context-merger.ts:164
- **Category**: error-handling / missing-validation
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: classifyActivity() (line 164-169) trusts that generateStructured returns an object with a string `activityType` field. If the LLM returns a malformed response (e.g., `{}`, `{ activityType: 123 }`, or `null`), `result.activityType` becomes `undefined` or a non-string value. This silently propagates through validateActivityType which only checks Set membership, causing it to return 'other' -- masking LLM misbehavior. Same issue in EntityExtractor with missing array fields.
- **Suggestion**: Add runtime validation after generateStructured calls. For classifyActivity: verify `typeof result?.activityType === 'string'` and throw a typed error if not. For EntityExtractor: verify all 5 arrays exist and are arrays. Consider using Valibot (project standard) for schema validation of LLM responses.

## P2 - Medium (Consider)
### [7] combinedText built twice with identical logic
- **File**: packages/context-engine/src/processing/context-merger.ts:130
- **Category**: code-quality / duplicate-computation
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The merge() method builds `combinedText` at line 130-131, then passes `selected` to generateSummary() which rebuilds the identical string at lines 173-175. The same string formatting logic `[${s.source}] ${s.summary}` is duplicated.
- **Suggestion**: Pass the already-computed `combinedText` string directly to generateSummary() instead of passing `sources` and recomputing.

### [8] No test for invalid activityType fallback to 'other'
- **File**: packages/context-engine/src/__tests__/context-merger.test.ts:208
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The test verifies all 7 valid activity types are passed through correctly, but there is no test for the fallback behavior when the LLM returns an invalid activity type string. The validateActivityType method's default-to-'other' logic is untested.
- **Suggestion**: Add a test case where the StubLlmProvider returns an invalid activity type and assert that the merged result has activityType === 'other'.

### [9] Unsafe `as ActivityType` cast in validateActivityType
- **File**: packages/context-engine/src/processing/context-merger.ts:183
- **Category**: architecture / unsafe-as-cast
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The `as ActivityType` cast at line 185 is technically safe because of the Set guard, but VALID_ACTIVITY_TYPES is typed as `Set<string>` rather than `Set<ActivityType>`. If someone adds a new ActivityType to the union but forgets to update the Set, the cast would silently allow the unvalidated value through.
- **Suggestion**: Type the set as `ReadonlySet<ActivityType>` to get compile-time enforcement when the union changes.

### [10] computeImportance clamp logic not tested with out-of-range values
- **File**: packages/context-engine/src/__tests__/context-merger-utils.test.ts:105
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The test named 'clamps result to [0, 1]' only tests with valid boundary values (0 and 1). It does not test values outside the valid range (e.g., importance: 1.5 or importance: -0.3) that would actually exercise the clamping logic.
- **Suggestion**: Add test cases with out-of-range importance values (e.g., 1.5 should clamp to 1, -0.5 should clamp to 0).

### [11] MergedContext output type lacks readonly modifiers
- **File**: packages/context-engine/src/processing/types.ts:49
- **Category**: type-design / immutability
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: MergedContext is a pipeline output type that should be immutable after construction. Task 19 established a readonly standard in context-engine (DocumentExtractionResult, TextChunk, FileChangeEvent). MergedContext breaks this pattern, allowing consumers to accidentally mutate arrays or overwrite computed fields.
- **Suggestion**: Add readonly to all fields and use readonly arrays for keywords, entities, and extractedEntities.

### [12] No structured logging in ContextMerger or EntityExtractor
- **File**: packages/context-engine/src/processing/context-merger.ts:108
- **Category**: code-quality / missing-logging
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: Neither ContextMerger nor EntityExtractor include any structured logging. The merge pipeline makes 3 concurrent LLM calls, but there is no visibility into source count, LLM call durations, or which step failed on error.
- **Suggestion**: Add @guiiai/logg structured logging: INFO at merge start with sourceCount, DEBUG with LLM call durations, ERROR in the catch block before re-throwing.

### [13] validateActivityType silently falls back to 'other' without logging
- **File**: packages/context-engine/src/processing/context-merger.ts:183
- **Category**: error-handling / silent-fallback
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: When the LLM returns an invalid activity type string, validateActivityType silently maps it to 'other' with no log or warning. This masks LLM prompt drift or model degradation -- classification quality degrades invisibly.
- **Suggestion**: Add a warning log when falling back: `console.warn('Unknown activity type from LLM, defaulting to other', { received: type })`.

### [14] ContextSource and ExtractedEntities lack readonly modifiers
- **File**: packages/context-engine/src/processing/types.ts:19
- **Category**: type-design / immutability
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Both ContextSource (input) and ExtractedEntities (output) are fully mutable. ContextSource is passed into merge() and should not be mutated. ExtractedEntities flows downstream as immutable data. Arrays are particularly vulnerable to accidental mutation.
- **Suggestion**: Mark all fields readonly. For ContextSource, at minimum make the array fields readonly. For ExtractedEntities, mark all 5 string array fields as readonly string[].

### [15] StubLlmProvider routes by schema content string matching -- brittle
- **File**: packages/context-engine/src/__tests__/context-merger.test.ts:49
- **Category**: test-quality / fragile-test-double
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: The StubLlmProvider.generateStructured method routes its response by checking if schemaDescription.includes('persons'). This couples the test to an internal implementation detail. If the schema description changes, the stub will silently return the wrong response type.
- **Suggestion**: Consider making the routing more explicit, for example by tracking call order or by using separate stub instances for each LLM call.

### [16] Promise.all for independent LLM calls -- partial failure wastes work
- **File**: packages/context-engine/src/processing/context-merger.ts:134
- **Category**: error-handling / partial-failure
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: Three independent LLM calls run via Promise.all. If any one fails, the entire merge fails and the results from the other two are discarded. A transient failure in one LLM call forces retry of all three calls.
- **Suggestion**: If partial results are acceptable, use Promise.allSettled and populate fallback values for failed calls. If all-or-nothing is correct, document this choice with a comment.

### [17] ContextSource.importance lacks type-level constraint for 0-1 range
- **File**: packages/context-engine/src/processing/types.ts:31
- **Category**: type-design / primitive-obsession
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: The importance field is documented as '0-1' in JSDoc but typed as bare number. Callers can pass -5 or 100 without type error. computeImportance() clamps the output but does not validate inputs.
- **Suggestion**: Add a validateContextSource() function at the boundary where ContextSource is created, asserting 0 <= importance <= 1.

## P3 - Low (Optional)
### [18] Unreachable catch guard for empty-sources error
- **File**: packages/context-engine/src/processing/context-merger.ts:151
- **Category**: simplification / dead-code
- **Confidence**: 95
- **Reported by**: review-simplify
- **Description**: The empty-sources guard is on line 121, BEFORE the try block starts on line 124. This error can never be caught by the catch block. The string comparison on line 152 is dead code.
- **Suggestion**: Remove the dead branch. Simplify the catch to just: `catch (cause) { throw new Error('Context merge failed', { cause }) }`.

### [19] Duplicate source-to-text mapping on lines 131 and 174
- **File**: packages/context-engine/src/processing/context-merger.ts:130
- **Category**: simplification / duplicate-code-fragment
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: The pattern `.map(s => \`[${s.source}] ${s.summary}\`).join('\\n')` appears identically at line 131 (in merge()) and line 174 (in generateSummary()). The merge method builds combinedText, then generateSummary rebuilds the exact same string.
- **Suggestion**: Pass the already-built combinedText string to generateSummary() instead of the sources array.

### [20] Redundant error identity check in catch block
- **File**: packages/context-engine/src/processing/context-merger.ts:151
- **Category**: code-quality / unnecessary-rethrow-check
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The catch block checks if the caught error is the empty-sources validation error thrown at line 121 and re-throws it unwrapped. However, this validation error exits the function before entering the try block. The string-matching guard is dead code.
- **Suggestion**: Remove the identity check and simplify the catch block.

### [21] Hardcoded count '7 activity types' in JSDoc will rot if types change
- **File**: packages/context-engine/src/processing/types.ts:2
- **Category**: comments / long-term-value
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: The JSDoc comment on the ActivityType union hardcodes the number '7'. If an activity type is added or removed, the comment becomes silently incorrect.
- **Suggestion**: Remove the count: change to 'Activity types for user context classification.' The union definition makes the count self-evident.

### [22] extractEntities is a single-line passthrough method
- **File**: packages/context-engine/src/processing/context-merger.ts:159
- **Category**: simplification / trivial-wrapper
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: The private method `extractEntities` is a trivial single-line delegation to `this.entityExtractor.extract(text)`. Unlike `classifyActivity` and `generateSummary`, it adds no transformation, no error handling, and no additional parameters.
- **Suggestion**: Inline the call: replace `this.extractEntities(combinedText)` with `this.entityExtractor.extract(combinedText)` and remove the private method.

### [23] ContextMerger does not validate maxSources option
- **File**: packages/context-engine/src/processing/context-merger.ts:113
- **Category**: type-design / constructor-validation
- **Confidence**: 75
- **Reported by**: review-types
- **Description**: The constructor accepts maxSources without validation. A caller could pass 0 or a negative number, causing selectTopSources to return an empty array after the empty-sources check has already passed.
- **Suggestion**: Add a guard in the constructor: `if (max < 1) throw new RangeError('maxSources must be >= 1')`.

## Positive Observations
- Clean Functional Core / Imperative Shell separation: pure utility functions (deduplicateStrings, mergeKeywords, computeImportance, selectTopSources) are properly extracted and independently testable without any mocking.
- LLM calls use Test Doubles with proper rationale comments in both test files, consistent with project conventions. No vi.fn(), vi.mock(), jest.fn(), jest.mock(), InMemoryRepository, MockXxx, FakeXxx, or skipped tests detected.
- Comprehensive unit test coverage for all pure functions with edge cases: empty input, single element, whitespace trimming, case-insensitive dedup, clamping.
- Error handling wraps LLM failures with contextual messages using the cause chain pattern (Error cause), enabling debuggable error traces.
- Well-defined TypeScript interfaces (ContextSource, MergedContext, ExtractedEntities) with JSDoc documentation provide clear contracts.
- Concurrent LLM calls via Promise.all for entity extraction, activity classification, and summary generation -- good performance optimization.
- All exported pure functions have accurate JSDoc explaining behavior, edge cases, and defaults.
- Architectural section markers provide useful structural orientation without restating code.
- ContextMerger class JSDoc documents the full 6-step pipeline with high-level overview.
- ActivityType is a well-defined 7-value literal union -- good domain modeling.
- ContextSource.source uses a 5-value literal union preventing invalid source types at compile time.
- Guard clauses and early returns used effectively throughout.
- Named constants used consistently instead of magic values.
- All functions are short and focused (longest ~38 lines, cyclomatic complexity 1-4).
- Input validation at entry point: merge() throws immediately for empty sources before any I/O.
- Tests include error-path coverage for both ContextMerger and EntityExtractor LLM failure scenarios.

## Recommended Action Plan
1. **Fix 6 P1 issues** grouped by theme:
   - **Integration (2)**: Wire ContextMerger into AnimaOrchestrator or another live entry point; this resolves both the orphan-code and horizontal-only findings simultaneously
   - **LLM output validation (2)**: Add Valibot runtime validation for generateStructured responses in both classifyActivity() and EntityExtractor.extract()
   - **Error context (1)**: Include source count, types, and text length in error messages
   - **Test accuracy (1)**: Rename 'weighted average' test to 'arithmetic mean'
2. **Address 11 P2 issues** in a single pass -- the largest clusters are type immutability (3 findings, all in types.ts) and test coverage gaps (3 findings)
3. Run `/ultra-review recheck` to verify
