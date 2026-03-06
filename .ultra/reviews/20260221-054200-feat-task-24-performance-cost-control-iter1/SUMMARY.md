# Review Summary

**Session**: 20260221-054200-feat-task-24-performance-cost-control-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 6 P1 findings exceed the threshold (P1 > 3)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 6 |
| P2 Medium | 14 |
| P3 Low | 7 |
| **Total** | **27** (deduplicated from 27) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-tests | 5 | completed |
| review-errors | 3 | completed |
| review-types | 4 | completed |
| review-comments | 3 | completed |
| review-simplify | 4 | completed |

## P1 - High (Should Fix)
### [1] ModelRouter exported but has zero consumers outside tests
- **File**: packages/context-engine/src/processing/model-router.ts:121
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: ModelRouter, classifyTask, and all related types are exported from the package barrel (index.ts) but are not imported or used by any consumer in apps/ or other packages/. The only references are within the context-engine package itself (definition, tests, re-exports). This is orphan code -- it cannot be exercised from any live entry point (HTTP handler, Electron IPC, event listener, cron job). Deploying this change alone does nothing to the running application.
- **Suggestion**: Wire ModelRouter into the orchestrator at apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts as a drop-in LlmProvider replacement. Until a consumer exists, this is dead code. Even a minimal integration (constructor wiring + one call path exercised in an integration test) would resolve this.

### [2] DeduplicationTracker exported but has zero consumers outside tests
- **File**: packages/context-engine/src/capture/phash.ts:94
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: DeduplicationTracker is exported from the package barrel but not imported by any code outside the context-engine test files. ScreenshotPipeline (the intended consumer per the JSDoc) does not use it. No app-level code references it. This is orphan code -- the deduplication statistics this class produces cannot be observed at runtime.
- **Suggestion**: Integrate DeduplicationTracker into ScreenshotPipeline so that every pHash comparison is tracked. Expose stats via a getter so the orchestrator or a settings panel can display dedup effectiveness. Without a live consumer, this class provides no value.

### [3] ModelRouter routing stats stored only in memory, lost on restart
- **File**: packages/context-engine/src/processing/model-router.ts:126
- **Category**: architecture / in-memory-state
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The routing statistics (callsByTier, callsByTaskType, estimatedSavingsRatio) exist only as in-memory counters on the ModelRouter instance. If the Electron app restarts, all cost-tracking data is lost. For a feature whose purpose is cost control and observability, non-persistent counters defeat the goal. The user cannot view historical cost trends or verify savings over time.
- **Suggestion**: Persist routing stats to the existing SQLite store at meaningful intervals (e.g., on getStats() or periodically). At minimum, emit the stats to a structured log sink so they survive restarts. The persistence layer already exists in the context-engine (DocumentStore/VectorStore use SQLite).

### [4] ModelRouter.generateText/generateStructured lack try/catch on LLM I/O
- **File**: packages/context-engine/src/processing/model-router.ts:135
- **Category**: error-handling / missing-try-catch-on-io
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: Both generateText() and generateStructured() call external LLM providers (network I/O) without any try/catch. Raw provider errors propagate without routing context -- a caller seeing 'Model overloaded' has no idea which tier, task type, or provider failed. This is the same recurring pattern as AiOrchestrator, capture modules, and channel modules. Additionally, the test titled 'propagates provider errors with routing context' is misleading: it only asserts the raw error message, confirming no context is actually added.
- **Suggestion**: Wrap provider calls in try/catch and re-throw with routing context: `throw new Error('ModelRouter: ${tier} provider failed for ${taskType} task', { cause: error })`.

### [5] Routing stats incremented before I/O -- corrupted on provider failure
- **File**: packages/context-engine/src/processing/model-router.ts:140
- **Category**: error-handling / stats-corruption-on-error
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: In both generateText() and generateStructured(), tierCalls and taskCalls counters are incremented BEFORE the async provider call. If the provider throws, the stats record a call that never completed. This corrupts the estimatedSavingsRatio and callsByTier/callsByTaskType metrics, which are the core deliverable of this performance/cost-control task. The cost estimation tests all use non-failing providers so this bug is not caught.
- **Suggestion**: Move stat increments after the await, or use try/finally to only count on success. Alternatively, track both attempted and succeeded counts for observability.

### [6] Comment claims extraction routes to lightweight, but it routes to local
- **File**: packages/context-engine/src/__tests__/performance-benchmark.test.ts:147
- **Category**: comments / factual-accuracy
- **Confidence**: 92
- **Reported by**: review-comments
- **Description**: The comment on line 147 states that entity extraction routes to the 'lightweight' tier. However, the ModelRouter's resolveTier function routes extraction tasks to the 'local' tier when a local provider is present (extraction is in LOCAL_ELIGIBLE_TASKS). The test assertions correctly show callsByTier.local === 120 (both classification AND extraction), contradicting the comment.
- **Suggestion**: Change line 147 to: '// - Entity extraction (60 calls) -> local: "Extract entities..."' to match the actual routing behavior.

## P2 - Medium (Consider)
### [7] Routing override to 'local' silently falls back to lightweight
- **File**: packages/context-engine/src/processing/model-router.ts:96
- **Category**: code-quality / silent-fallback
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: If a user configures routingOverrides: { summarization: 'local' } but does not provide a local provider, resolveTier returns 'local' and getProvider silently falls back to the lightweight provider. The caller has no way to know their explicit override was not honored.
- **Suggestion**: Validate routingOverrides in the constructor: if any override targets 'local' but options.providers.local is undefined, throw an Error with a clear message.

### [8] ModelRouter has no structured logging for routing decisions
- **File**: packages/context-engine/src/processing/model-router.ts:135
- **Category**: code-quality / missing-logging
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: ModelRouter makes routing decisions (task classification, tier selection) without any structured logging. For a cost-control component, observability of routing decisions is critical for debugging misclassifications and verifying cost savings.
- **Suggestion**: Add structured logging at DEBUG level for each routing decision using @guiiai/logg useLogg pattern.

### [9] Change is horizontal-only: no end-to-end path exercised
- **File**: packages/context-engine/src/index.ts:24
- **Category**: integration / horizontal-only
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: This task adds two new modules (ModelRouter, DeduplicationTracker) with unit tests and benchmark tests, but no vertical slice connects them to the running application. The orchestrator still creates LlmProvider instances directly without ModelRouter. ScreenshotPipeline still does not use DeduplicationTracker.
- **Suggestion**: Deliver a minimal vertical slice: (1) Wire ModelRouter into the orchestrator. (2) Wire DeduplicationTracker into ScreenshotPipeline. (3) Add one integration test proving end-to-end flow.

### [10] ModelRouter does not add routing context to provider errors
- **File**: packages/context-engine/src/processing/model-router.ts:135
- **Category**: code-quality / error-handling
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: When a downstream provider throws, the error propagates with no routing context. The test 'propagates provider errors with routing context' is misleadingly named -- it only verifies the raw error propagates, not that routing context is added.
- **Suggestion**: Wrap the provider call in a try/catch that enriches the error with tier and task type information. Update the test name to match the actual behavior.

### [11] Override to 'local' tier silently falls back when local provider absent
- **File**: packages/context-engine/src/processing/model-router.ts:177
- **Category**: error-handling / silent-fallback
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: When routingOverrides explicitly maps a task to 'local' but no local provider is configured, getProvider() silently falls back to lightweight via the ?? operator. The user's explicit routing configuration is silently ignored, which could cause unexpected cost increases.
- **Suggestion**: Either validate in the constructor that override tiers have corresponding providers, or log a warning when getProvider falls back.

### [12] generateText and generateStructured share identical routing logic
- **File**: packages/context-engine/src/processing/model-router.ts:135
- **Category**: simplification / near-duplicate-code
- **Confidence**: 88
- **Reported by**: review-simplify
- **Description**: Both methods perform the same 4-step routing sequence: classifyTask -> resolveTier -> getProvider -> increment stats. This is a 6-line near-duplicate block.
- **Suggestion**: Extract a private route() method that centralizes routing + stats logic. Both methods become one-liners.

### [13] Test setup (createTrackingProvider + new ModelRouter) repeated 12 times
- **File**: packages/context-engine/src/__tests__/model-router.test.ts:70
- **Category**: simplification / near-duplicate-test-setup
- **Confidence**: 82
- **Reported by**: review-simplify
- **Description**: The 4-line pattern of creating providers and a ModelRouter appears in 10 of 14 test cases, well above the 3-occurrence threshold for extraction.
- **Suggestion**: Extract a createRouter() test factory function that eliminates ~40 lines of repeated setup.

### [14] Missing test: getProvider local-to-lightweight fallback path
- **File**: packages/context-engine/src/processing/model-router.ts:179
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The getProvider method has a fallback from local to lightweight when local is undefined, but no test exercises this path via routingOverrides forcing 'local' without a local provider.
- **Suggestion**: Add a test that configures routingOverrides to force 'local' tier without providing a local provider.

### [15] Incomplete error path coverage for ModelRouter
- **File**: packages/context-engine/src/__tests__/model-router.test.ts:308
- **Category**: test-quality / missing-error-path
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: Only one error test case exists (lightweight provider throws). Missing: error from standard provider, non-Error throws, typed errors.
- **Suggestion**: Add at least one more error test: a failing standard provider for generation/summarization tasks.

### [16] Missing test: classifyTask with ambiguous/multi-keyword prompts
- **File**: packages/context-engine/src/__tests__/model-router.test.ts:31
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: No test verifies behavior when a prompt contains keywords from multiple categories. The keyword priority order is a critical business decision that should be explicitly tested.
- **Suggestion**: Add tests for ambiguous prompts to verify and document priority order.

### [17] Performance benchmark memory assertions are vacuously true
- **File**: packages/context-engine/src/__tests__/performance-benchmark.test.ts:23
- **Category**: test-quality / fragile-assertion
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: Memory budget assertions use thresholds of 100MB/500MB for objects that use kilobytes at most. The assertions will never fail.
- **Suggestion**: Tighten bounds to realistic values (e.g., <1MB for lightweight, <5MB for full).

### [18] RoutingStats output interface lacks readonly modifiers
- **File**: packages/context-engine/src/processing/model-router.ts:19
- **Category**: type-design / immutability
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: RoutingStats is a read-only output from getStats() but all fields are mutable. This regresses from Task 19's readonly standard.
- **Suggestion**: Add readonly modifiers to all fields and use Readonly<Record<...>> for nested records.

### [19] DeduplicationStats output interface lacks readonly modifiers
- **File**: packages/context-engine/src/capture/phash.ts:78
- **Category**: type-design / immutability
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: DeduplicationStats is returned from getStats() as a snapshot and should be immutable. Regresses from Task 19's readonly output types.
- **Suggestion**: Add readonly modifiers to all fields.

### [20] routingOverrides can specify 'local' tier without a local provider
- **File**: packages/context-engine/src/processing/model-router.ts:16
- **Category**: type-design / invalid-state-representable
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: The routingOverrides field accepts 'local' but the local provider is optional. No constructor validation ensures overrides match available providers.
- **Suggestion**: Add constructor validation to throw if any override specifies 'local' when providers.local is undefined.

## P3 - Low (Optional)
### [21] Keyword-based task classification is fragile and order-dependent
- **File**: packages/context-engine/src/processing/model-router.ts:33
- **Category**: code-quality / keyword-classification-fragility
- **Confidence**: 75
- **Reported by**: review-code
- **Description**: classifyTask relies on substring matching with priority ordering. Acceptable for initial implementation but will become a maintenance burden.
- **Suggestion**: Add a comment documenting priority semantics and test cases for multi-keyword prompts.

### [22] Inline comments in resolveTier restate obvious code logic
- **File**: packages/context-engine/src/processing/model-router.ts:96
- **Category**: comments / redundant-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: Comments '// Check explicit override first' and '// Route to local if available' restate what the code already expresses.
- **Suggestion**: Consider removing; the JSDoc and self-documenting code already convey intent.

### [23] Comment restates code in test: '// no local provider'
- **File**: packages/context-engine/src/__tests__/model-router.test.ts:179
- **Category**: comments / roi-assessment
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: The comment restates what is obvious from the constructor call and test name.
- **Suggestion**: Remove the comment.

### [24] Magic number 5 in areSimilar default threshold
- **File**: packages/context-engine/src/capture/phash.ts:72
- **Category**: simplification / naming-clarity
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: The default threshold of 5 is a magic number. HASH_SIZE = 8 is already a named constant in the same file.
- **Suggestion**: Extract to `const DEFAULT_SIMILARITY_THRESHOLD = 5` with a JSDoc.

### [25] Image pixel generation loops repeated 3 times in dedup-stats test
- **File**: packages/context-engine/src/__tests__/dedup-stats.test.ts:109
- **Category**: simplification / test-image-generation-duplication
- **Confidence**: 76
- **Reported by**: review-simplify
- **Description**: Three nearly identical 8-line nested loops generate test images with only color values differing.
- **Suggestion**: Extract a makeGradient(w, h, rgbFn) helper function.

### [26] Interface compliance test is trivially weak
- **File**: packages/context-engine/src/__tests__/model-router.test.ts:333
- **Category**: test-quality / test-organization
- **Confidence**: 76
- **Reported by**: review-tests
- **Description**: The test checks typeof is 'function', which TypeScript already enforces at compile time. The test name says 'integration with ContextMerger' but does not test integration with ContextMerger.
- **Suggestion**: Either remove the test or make it a real integration test with ContextMerger.

### [27] ModelRouter.generateStructured<T> inherits unconstrained generic
- **File**: packages/context-engine/src/processing/model-router.ts:146
- **Category**: type-design / unconstrained-generic
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: ModelRouter passes through the unconstrained generic T from LlmProvider. Consumers get no compile-time guarantee that LLM output matches T.
- **Suggestion**: Informational. Consumers should add runtime validation following the SmartTip/MemoryExtractor pattern.

## Positive Observations
- Clean Functional Core / Imperative Shell separation: classifyTask and resolveTier are pure functions, ModelRouter is the imperative shell
- Test doubles use the correct pattern with explicit 'Test Double rationale' comments for external LLM API boundaries
- DeduplicationTracker handles division-by-zero gracefully (returns 0 when no comparisons)
- ModelRouter implements LlmProvider interface enabling transparent drop-in usage
- Good test coverage: pure function tests for classifyTask, routing behavior tests, stats tracking, error propagation, and performance benchmarks
- The performance benchmark test validates sub-millisecond routing overhead and O(1) tracker operations
- getProvider has a sensible fallback chain: local -> lightweight when local is unavailable
- JSDoc on all exported interfaces and functions follows project conventions consistently
- The RoutingStats.estimatedSavingsRatio JSDoc explains both the formula and the interpretation
- Section divider comments (// --- Functional Core --- etc.) align with the project's FC/IS architecture
- DeduplicationTracker is a clean pure-data class with no I/O -- error-free by design
- getStats() returns shallow copies of internal state, preventing external mutation
- Division-by-zero is correctly guarded in both getStats() and DeduplicationTracker.getStats()
- No vi.fn(), vi.mock(), jest.fn(), or jest.mock() violations -- all test doubles are hand-crafted implementations
- classifyTask (Functional Core) is tested as a pure function with direct instantiation, no mocks needed
- DeduplicationTracker tests include excellent boundary conditions: zero comparisons, all duplicates, all unique, reset
- dedup-stats.test.ts includes a real integration test using sharp image processing with computePHash
- TaskType and ModelTier are proper literal unions, consistent with codebase best practices
- LOCAL_ELIGIBLE_TASKS uses ReadonlySet -- good immutability pattern
- All functions are well under 30 lines, matching project complexity thresholds
- Named constants HASH_SIZE, CLASSIFICATION_KEYWORDS follow project convention for avoiding magic values

## Recommended Action Plan
1. Fix 6 P1 issues in a single pass -- they cluster into 3 themes:
   - **Integration** (P1 #1, #2): Wire ModelRouter into orchestrator and DeduplicationTracker into ScreenshotPipeline
   - **Error handling** (P1 #4, #5): Add try/catch with routing context and move stat increments after await
   - **Observability** (P1 #3): Persist routing stats to SQLite or structured log sink
2. Fix the factual comment error (P1 #6) -- single-line change
3. Address 14 P2 issues: constructor validation for overrides, structured logging, readonly types, test coverage gaps, and code deduplication
4. Run `/ultra-review recheck` to verify
