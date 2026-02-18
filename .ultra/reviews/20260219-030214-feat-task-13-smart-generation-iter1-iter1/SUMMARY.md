# Review Summary

**Session**: 20260219-030214-feat-task-13-smart-generation-iter1-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 1 P0 critical finding (ReportGenerator trusts LLM output without validation) and 9 P1 high findings require fixes before merge.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 1 |
| P1 High | 9 |
| P2 Medium | 16 |
| P3 Low | 8 |
| **Total** | **34** (deduplicated from 36) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-tests | 6 | completed |
| review-errors | 7 | completed |
| review-types | 5 | completed |
| review-comments | 6 | completed |
| review-simplify | 4 | completed |

## P0 - Critical (Must Fix)
### [1] ReportGenerator trusts LLM output without validation
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:42
- **Category**: code-quality / missing-output-validation
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: generateStructured<T> returns Promise<T> via an unsafe `as T` cast in every implementation. The LLM can return malformed JSON missing required fields (date, highlights, activityBreakdown, totalWorkDurationMs, personalNote). SmartTip correctly validates its output with isValidSmartTipResult(), but ReportGenerator blindly trusts the cast and forwards whatever the LLM returns. If highlights is missing or activityBreakdown is null, downstream consumers (UI rendering, persistence) will crash with cannot-read-property errors. This is a correctness bug: data reaching onReport or the caller may be structurally invalid.
- **Suggestion**: Add a validation function (similar to SmartTip's isValidSmartTipResult) that checks: typeof date === 'string', Array.isArray(highlights), Array.isArray(activityBreakdown) with each entry having app/durationMs/description, typeof totalWorkDurationMs === 'number', typeof personalNote === 'string'. Return a fallback or throw a typed validation error on failure.

## P1 - High (Should Fix)
### [2] ReportGenerator, SmartTip, SmartTodo have zero callers outside tests
- **File**: `packages/context-engine/src/index.ts`:12
- **Category**: integration / orphan-code
- **Confidence**: 92
- **Reported by**: review-code
- **Description**: All three new classes are exported from the package index but have zero imports anywhere in the monorepo outside their own test files. No app (stage-tamagotchi, stage-web, server) instantiates them. No service wires them to a cron job, IPC handler, or event listener. The cron-service from task-12 exists but is not connected to these consumers either. This is classic orphan code: exported but unreachable from any live entry point.
- **Suggestion**: Wire at least one consumer (e.g., SmartTip) end-to-end: create a cron job in stage-tamagotchi that instantiates SmartTip with a real LlmProvider adapter, calls generate() on an interval, and dispatches the result via IPC/event. This proves the vertical slice from context collection through smart generation to user-visible output.

### [3] SmartTodo.recentEmbeddings grows without bound
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:52
- **Category**: code-quality / unbounded-memory-growth
- **Confidence**: 88
- **Reported by**: review-code
- **Description**: Every unique suggestion appends its embedding vector to recentEmbeddings, but there is no size limit or eviction policy. Over days/weeks of running (designed for 30-minute cron cycles), this array grows linearly with all unique suggestions ever seen. Each embedding is a number[] (~12KB per vector). After 1000 unique suggestions, this is ~12MB of in-memory data, with O(n) linear scan on every dedup check. This is also in-memory-only state that is lost on restart.
- **Suggestion**: Add a maxHistorySize option (default 200) and evict oldest embeddings when the limit is reached (ring buffer or shift). Consider persisting dedup state to the DocumentStore/VectorStore so it survives restarts.

### [4] SmartTodo trusts LLM output for suggestions array structure
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:83
- **Category**: code-quality / missing-output-validation
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: While SmartTip validates its LLM output with isValidSmartTipResult(), SmartTodo only does a shallow null-coalesce on raw?.suggestions. If the LLM returns {suggestions: [{title: 123}]} or {suggestions: 'not an array'}, the ?? [] fallback won't catch it. Each suggestion is then passed to embedding.embed(suggestion.title) where title could be undefined or non-string, causing the embedding provider to fail or produce garbage vectors.
- **Suggestion**: Add an isValidSmartTodoResult validator that checks Array.isArray(suggestions) and each entry has typeof title === 'string' && typeof reason === 'string'. Filter out invalid entries before passing to dedup.

### [5] Invalid LLM result silently returns null without logging
- **File**: `packages/context-engine/src/consumption/smart-tip.ts`:66
- **Category**: error-handling / silent-swallow
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: When the LLM returns a structurally invalid result (wrong types, missing fields, invalid enum values for kind/urgency), the code silently returns null with no logging or error callback invocation. The caller cannot distinguish 'LLM decided no tip is needed' from 'LLM returned garbage'. This hides LLM contract violations and makes debugging production issues extremely difficult.
- **Suggestion**: Log a warning or invoke onError with context about what validation failed: `const error = new Error('SmartTip: LLM returned invalid result', { cause: { result } }); this.onError?.(error); return null;`

### [6] ReportGenerator catch returns indistinguishable fallback and onError callback is unwrapped
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:53
- **Category**: error-handling / error-as-valid-state
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: Two overlapping issues at the same catch block: (1) When the LLM call fails and onError is provided, the catch block returns a DailySummary with empty arrays and zero duration, identical to a legitimate summary for a day with no activity. (2) The onError callback is invoked without its own try/catch. If the user-supplied onError throws, the fallback return is never reached. This dual issue also exists in SmartTip and SmartTodo.
- **Suggestion**: For error-as-valid-state: return a discriminated type {ok: false, error} vs {ok: true, data: DailySummary}, or return null on error. For unwrapped callback: wrap onError invocation in try/catch. Apply both fixes consistently across all three classes.

### [7] Embedding failure in dedup loop loses all suggestions
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:118
- **Category**: error-handling / missing-per-item-handling
- **Confidence**: 86
- **Reported by**: review-errors
- **Description**: The dedup() method calls this.embedding.embed() inside a for loop. If ANY single embedding call fails, the entire catch block fires and returns {suggestions: []}. 5 valid suggestions are all discarded because the 3rd one failed to embed. The embedding service is a network I/O boundary that can fail transiently.
- **Suggestion**: Add per-suggestion error handling in the dedup loop: `try { const vector = await this.embedding.embed(suggestion.title); ... } catch { result.push(suggestion); }`. Embedding failures degrade gracefully (worst case: a duplicate slips through) rather than catastrophically.

### [8] SmartTodo error messages lack context and catch returns indistinguishable empty result
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:101
- **Category**: error-handling / missing-context
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: Two overlapping issues at the SmartTodo catch block: (1) Error messages lack operational context -- 'SmartTodo failed to generate suggestions' includes no activity count, timestamp, or app name. Same issue in ReportGenerator and SmartTip. (2) When onError is provided, returns {suggestions: []} which is identical to the legitimate 'no suggestions found' result.
- **Suggestion**: Include operational context in errors. For error-as-valid-state: return a discriminated result type consistently across all three classes.

### [9] cosineSimilarity pure function lacks direct unit tests
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:21
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: cosineSimilarity is a Functional Core pure function with non-trivial math. It is only tested indirectly through SmartTodo dedup integration. Per project rules, Functional Core must have 100% coverage with direct unit tests. Boundary conditions are untested: empty arrays, mismatched lengths, zero vectors, identical vectors, orthogonal vectors.
- **Suggestion**: Export cosineSimilarity and add direct unit tests: cosineSimilarity([], []) === 0, cosineSimilarity([1,0], [0,1]) === 0, cosineSimilarity([1,2,3], [1,2,3]) === 1.0, cosineSimilarity([1], [1,2]) === 0, cosineSimilarity([0,0], [0,0]) === 0.

### [10] LLM generateStructured<T> return is unvalidated in ReportGenerator (type-design perspective)
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:42
- **Category**: type-design / invariant-enforcement
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: Encapsulation: 7/10, Expression: 4/10, Usefulness: 5/10, Enforcement: 2/10 (Aggregate: 4.5). LlmProvider.generateStructured<T> uses an unconstrained generic -- the return type T is asserted at compile-time only. The LLM can return malformed JSON, missing fields, or wrong types. ReportGenerator trusts the result with zero runtime validation. SmartTip correctly validates with isValidSmartTipResult. Missing validation on the Imperative Shell boundary is a P1.
- **Suggestion**: Add a runtime type guard that validates the DailySummary shape before returning. Apply the same pattern to SmartTodo's raw result validation.

## P2 - Medium (Consider)
### [11] PersonaConfig duplicates PersonaTemplate from persona-engine
- **File**: `packages/context-engine/src/types.ts`:191
- **Category**: architecture / duplicated-interface
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: PersonaConfig is a subset of persona-engine's PersonaTemplate. This creates a contract divergence risk if PersonaTemplate adds a required field.
- **Suggestion**: Create a shared-types package, or use Pick<PersonaTemplate, ...>, or at minimum add a contract test verifying assignability.

### [12] No logging in any of the three new consumption modules
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:16
- **Category**: architecture / missing-logging
- **Confidence**: 82
- **Reported by**: review-code
- **Description**: ReportGenerator, SmartTip, and SmartTodo handle LLM calls (network IO, latency, failures) but have zero logging. The project convention is @guiiai/logg with useLogg().
- **Suggestion**: Inject a logger and add INFO/WARN/ERROR/DEBUG logs for generate() entry, invalid LLM data, catch blocks, and response times.

### [13] Error fallback returns silently with empty data when onError is set
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:51
- **Category**: code-quality / inconsistent-error-strategy
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The three modules have inconsistent error strategies: ReportGenerator returns synthetic empty DailySummary, SmartTip returns null, SmartTodo returns {suggestions: []}.
- **Suggestion**: Use a Result/Either pattern or at minimum make the error case distinguishable. Ensure all three modules use the same error strategy.

### [14] Nullish coalescing silently converts malformed LLM output to empty array
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:89
- **Category**: error-handling / silent-conversion
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: If the LLM returns {todos: [...]} instead of {suggestions: [...]}, this line silently produces zero suggestions with no error or warning.
- **Suggestion**: Add validation similar to SmartTip's isValidSmartTipResult.

### [15] Missing JSDoc on public generate() method in ReportGenerator
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:29
- **Category**: comments / missing-documentation
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: ReportGenerator.generate() is the primary public API but lacks JSDoc documenting parameters, return semantics, and error behavior.
- **Suggestion**: Add JSDoc documenting activities parameter, error behavior, and callback invocation.

### [16] Missing JSDoc on public generate() method in SmartTip
- **File**: `packages/context-engine/src/consumption/smart-tip.ts`:46
- **Category**: comments / missing-documentation
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: SmartTip.generate() null return has two distinct meanings (no tip needed vs invalid LLM output). Error behavior is undocumented.
- **Suggestion**: Add JSDoc documenting null semantics, error behavior, and callback invocation.

### [17] Missing JSDoc on 3 public methods in SmartTodo
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:63
- **Category**: comments / missing-documentation
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: generate(), setLlmProvider(), and clearHistory() lack JSDoc. Side effects are undocumented.
- **Suggestion**: Add JSDoc to all three public methods.

### [18] StubLlmProvider duplicated identically across 3 test files
- **File**: `packages/context-engine/src/__tests__/report-generator.test.ts`:12
- **Category**: simplification / test-duplication
- **Confidence**: 95
- **Reported by**: review-simplify
- **Description**: The exact same 22-line StubLlmProvider class appears in all three test files. 66 lines of pure duplication.
- **Suggestion**: Extract to `__tests__/helpers/stub-llm-provider.ts` and import from there.

### [19] makeProcessedContext and TEST_PERSONA duplicated across 3 test files
- **File**: `packages/context-engine/src/__tests__/smart-tip.test.ts`:35
- **Category**: simplification / test-duplication
- **Confidence**: 92
- **Reported by**: review-simplify
- **Description**: TEST_PERSONA (5 lines) and makeProcessedContext (16 lines) are identically duplicated in all three test files.
- **Suggestion**: Extract to `__tests__/helpers/test-fixtures.ts`.

### [20] SmartTodo embedding provider error path untested
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:110
- **Category**: test-quality / missing-error-path
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: If embed() throws during dedup, the error propagates through generate() and hits the catch block. No test verifies this path.
- **Suggestion**: Add a test with ThrowingEmbeddingProvider that verifies error is caught, wrapped, and forwarded to onError.

### [21] isValidSmartTipResult boundary cases not explicitly tested
- **File**: `packages/context-engine/src/consumption/smart-tip.ts`:13
- **Category**: test-quality / missing-validation-edge-case
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The test suite has one test for invalid input but does not test invalid kind/urgency values, extra fields, or empty strings.
- **Suggestion**: Add parameterized tests for edge cases. Consider exporting isValidSmartTipResult for direct unit testing.

### [22] ReportGenerator onError path does not verify fallback return value
- **File**: `packages/context-engine/src/__tests__/report-generator.test.ts`:204
- **Category**: test-quality / missing-error-path-assertion
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The test verifies the error callback is invoked but does not assert the return value. The fallback structure could silently break.
- **Suggestion**: Capture and assert the return value: expect(result.highlights).toEqual([]), expect(result.totalWorkDurationMs).toBe(0), etc.

### [23] SmartTodo dedup recentEmbeddings unbounded growth untested
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:52
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: No test verifies behavior after many generations or that clearHistory is called appropriately.
- **Suggestion**: Add a test calling generate() in a loop to verify memory behavior.

### [24] DailySummary.date typed as plain string instead of date format
- **File**: `packages/context-engine/src/types.ts`:154
- **Category**: type-design / invariant-expression
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: DailySummary.date is documented as 'YYYY-MM-DD format' but typed as plain string. Primitive obsession.
- **Suggestion**: Consider a branded type: type DateString = string & { readonly __brand: 'DateString' }. At minimum, add readonly modifiers.

### [25] SmartTodo.llm is non-readonly with public setter breaking encapsulation
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:46
- **Category**: type-design / encapsulation
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: SmartTodo.llm is the only non-readonly private field. The public setLlmProvider() creates a race condition risk during generate().
- **Suggestion**: Make llm readonly and remove setLlmProvider(). Constructor injection suffices for testing.

### [26] SmartTodo does not validate LLM structured output shape (type-design perspective)
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:83
- **Category**: type-design / invariant-enforcement
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: SmartTodo applies only a minimal null guard on the LLM output. Individual TodoSuggestion items pass through unvalidated.
- **Suggestion**: Add isValidTodoSuggestion type guard and filter suggestions through it.

## P3 - Low (Optional)
### [27] StubLlmProvider and makeProcessedContext duplicated across 3 test files (code-quality perspective)
- **File**: `packages/context-engine/src/__tests__/report-generator.test.ts`:12
- **Category**: code-quality / test-utility-duplication
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: 60+ lines of exact test utility duplication across three files.
- **Suggestion**: Extract to `__tests__/helpers/stubs.ts`.

### [28] Hardcoded 'AI SDK 6' version in LlmProvider JSDoc will rot
- **File**: `packages/context-engine/src/types.ts`:114
- **Category**: comments / rot-risk
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: The version reference adds little value and will become misleading after upgrades.
- **Suggestion**: Remove the version number from the JSDoc.

### [29] SmartTip JSDoc hardcodes '1-hour cycle' scheduling detail
- **File**: `packages/context-engine/src/consumption/smart-tip.ts`:29
- **Category**: comments / rot-risk
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: Scheduling frequency is configured externally; hardcoding it in the class JSDoc creates maintenance burden.
- **Suggestion**: Replace with: 'Designed to run periodically via cron-service.'

### [30] SmartTodo JSDoc hardcodes '30-minute cycle' scheduling detail
- **File**: `packages/context-engine/src/consumption/smart-todo.ts`:40
- **Category**: comments / rot-risk
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: Same issue as SmartTip: hardcoded scheduling frequency.
- **Suggestion**: Replace with: 'Designed to run periodically via cron-service.'

### [31] buildSystemPrompt first 3 lines identical across all 3 source classes
- **File**: `packages/context-engine/src/consumption/smart-tip.ts`:83
- **Category**: simplification / structural-duplication
- **Confidence**: 82
- **Reported by**: review-simplify
- **Description**: Persona preamble is shared but methods are short (9 lines each). At the extraction threshold.
- **Suggestion**: No change recommended yet. Extract if a 4th consumer appears.

### [32] Error handling pattern (catch/onError/fallback) structurally identical in 3 classes
- **File**: `packages/context-engine/src/consumption/report-generator.ts`:51
- **Category**: simplification / structural-duplication
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: Structurally identical 7-8 line catch blocks with domain-specific differences.
- **Suggestion**: No change recommended. The pattern is clear and short.

### [33] StubLlmProvider and makeProcessedContext duplicated (test-quality perspective)
- **File**: `packages/context-engine/src/__tests__/report-generator.test.ts`:12
- **Category**: test-quality / test-duplication
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: ~120 lines of duplicated test infrastructure across 3 files.
- **Suggestion**: Extract to `__tests__/fixtures/test-helpers.ts`.

### [34] Output interfaces lack readonly modifiers unlike PersonaConfig
- **File**: `packages/context-engine/src/types.ts`:145
- **Category**: type-design / readonly-consistency
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: All new output types are mutable interfaces. PersonaConfig correctly uses readonly. Inconsistency within the same file.
- **Suggestion**: Add readonly to all fields in output interfaces.

## Positive Observations
- SmartTip includes a proper runtime validation function (isValidSmartTipResult) that guards against malformed LLM output -- this pattern should be replicated in ReportGenerator and SmartTodo
- All three modules use typed Error with { cause } for error wrapping, providing good error chain traceability
- Clean separation of prompt construction (buildSystemPrompt/buildUserPrompt) from LLM invocation logic; pure string methods are easy to test in isolation
- SmartTodo embedding-based dedup is a thoughtful design for avoiding repetitive suggestions across cycles
- Test doubles for LLM and Embedding providers are well-justified with rationale comments, following project convention
- Consistent options-object constructor pattern across all three modules with optional callback hooks
- All new exported interfaces in types.ts have thorough JSDoc with field-level documentation
- No forbidden comment patterns (TODO, FIXME, HACK, PLACEHOLDER) found in any changed files
- No vi.fn(), vi.mock(), vi.spyOn() or jest equivalents used -- all test doubles implement the full interface contract
- Error paths tested for both callback (onError) and throw (no onError) scenarios in all 3 modules
- All functions are short and focused (max 23 lines), cyclomatic complexity low (max CC=7), max nesting depth 2
- SmartTipResult uses proper literal unions for kind and urgency -- good type-level constraint
- LlmProvider and EmbeddingProvider are clean, minimal interfaces following the Dependency Inversion Principle
- cosineSimilarity is a clean pure function extracted at module scope, following functional core principle

## Recommended Action Plan
1. Fix 1 P0 issue first: add runtime validation for ReportGenerator's LLM output (same pattern as SmartTip's isValidSmartTipResult)
2. Address 9 P1 issues in a single pass -- they cluster into 3 themes:
   - **LLM output validation** (findings 4, 10): add isValidSmartTodoResult and isValidDailySummary validators
   - **Error handling consistency** (findings 5, 6, 7, 8): add logging on validation failure, wrap onError callbacks, add per-item error handling in dedup loop, include operational context in error messages
   - **Integration + testing** (findings 2, 3, 9): wire at least one consumer to a live entry point, add maxHistory eviction, export and unit-test cosineSimilarity
3. Run `/ultra-review recheck` to verify
