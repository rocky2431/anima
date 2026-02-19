# Review Summary

**Session**: 20260219-034800-feat-task-14-memory-pipeline-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 3 P0 critical findings (bare catch blocks, hardcoded importance=0 correctness bug) and 12 P1 findings exceed all thresholds

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 3 |
| P1 High | 12 |
| P2 Medium | 18 |
| P3 Low | 6 |
| **Total** | **39** (deduplicated from 42) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 10 | completed |
| review-tests | 6 | completed |
| review-errors | 9 | completed |
| review-types | 7 | completed |
| review-comments | 6 | completed |
| review-simplify | 4 | completed |

## P0 - Critical (Must Fix)

### [1] Bare catch in onError callback wrapper swallows error silently
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:159
- **Category**: error-handling / empty-catch
- **Confidence**: 97
- **Reported by**: review-errors (merged from review-errors-001, review-errors-003, review-errors-008)
- **Description**: Three interrelated error-handling issues in the extract() catch block (lines 159-165): (1) The nested catch block has no error parameter binding and no logging -- if onError throws, the failure is completely invisible. This is the same bare catch pattern found in ScreenshotPipeline.tick() and skill-loader.ts. (2) When onError is provided, errors are caught and an empty ExtractionResult is returned -- indistinguishable from 'nothing to extract', making monitoring impossible. (3) The dual-path behavior (never throws with onError, throws without onError) creates an inconsistent contract callers must know about.
- **Suggestion**: Bind the error and log it: `catch (callbackErr) { console.error('MemoryExtractor: onError callback threw', { original: error, callbackErr }) }`. Consider returning a Result type that distinguishes success from failure. Document the dual contract explicitly in JSDoc.

### [2] Bare catch in dedup loop hides embedding failures
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:190
- **Category**: error-handling / empty-catch
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: The catch block in the dedup loop has no error parameter binding. While the fallback behavior (include the memory rather than lose it) is defensible, the error is entirely invisible -- no log, no metric, no callback to onError. A systematic embedding provider failure would silently skip deduplication for all memories without any observable signal.
- **Suggestion**: Bind the error and report it: `catch (err) { this.onError?.(new Error('Dedup embedding failed', { cause: err })); result.push(memory) }`. This preserves the include-on-failure behavior while making failures observable.

### [3] MemoryOrchestrator.recall hardcodes importance: 0, untested
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:88
- **Category**: test-quality / correctness-bug-untested
- **Confidence**: 92
- **Reported by**: review-tests
- **Description**: The recall() method hardcodes importance to 0 for all recalled memories instead of looking up the actual importance value from DocumentStore. Consumers of recall results (e.g., proactive triggers, persona engine) will always see importance=0, losing critical prioritization data. The test at memory-orchestrator.test.ts:128 only checks typeof relevance and never asserts the importance field, so this bug passes silently.
- **Suggestion**: After vector search, look up each memory in DocumentStore by content or id to retrieve the actual importance score. Add a test that persists a memory with importance=9, recalls it, and asserts result.importance === 9.

## P1 - High (Should Fix)

### [4] MemoryOrchestrator and MemoryExtractor are orphan exports
- **File**: `packages/context-engine/src/index.ts`:12
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: MemoryOrchestrator and MemoryExtractor are exported but not imported or instantiated by any code in apps/. No IPC handler, service registration, cron job, or event listener wires these modules to a live entry point. They exist only in tests. This is dead-on-arrival code per the orphan detection rule.
- **Suggestion**: Wire MemoryOrchestrator into the Electron anima service layer with an init call, IPC handler for recall, and a scheduled trigger via cron-service for daily extraction.

### [5] recall() hardcodes importance: 0, losing stored importance
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:88
- **Category**: code-quality / data-loss
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: MemoryOrchestrator.recall() returns MemoryRecallResult with importance hardcoded to 0. The actual importance value (1-10) is stored in DocumentStore memory_entries but is never looked up during recall. All recalled memories appear equally unimportant, defeating the purpose of importance scoring.
- **Suggestion**: Cross-reference with DocumentStore.getMemoryEntries() or add importance to the vector metadata (extend ContextVector).

### [6] persistExtractionResults has zero error handling for multi-step I/O
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:117
- **Category**: error-handling / missing-try-catch
- **Confidence**: 93
- **Reported by**: review-errors
- **Description**: 5 categories of I/O operations with no try/catch anywhere in 67 lines. A failure at step 2 (vectorStore.insert) creates inconsistency between vector and document stores. No rollback, no partial-success reporting, no error context.
- **Suggestion**: Wrap each persistence category in its own try/catch. Use a transaction for SQLite writes and handle vector/document stores separately.

### [7] recall() has no error handling for embedding + vector search I/O
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:72
- **Category**: error-handling / missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: recall() calls embedding.embed() and vectorStore.semanticSearch() with no try/catch. Raw provider errors propagate with no context about what operation was being attempted.
- **Suggestion**: Wrap in try/catch: `catch (cause) { throw new Error('Memory recall failed for query: "..."', { cause }) }`.

### [8] No logging in MemoryExtractor or MemoryOrchestrator
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:1
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: Both new modules (MemoryExtractor: 243 lines, MemoryOrchestrator: 185 lines) have zero logging. The project uses @guiiai/logg. This is a recurring finding -- task-9, task-11, and task-13 all shipped without logging.
- **Suggestion**: Add useLogg('MemoryExtractor') and useLogg('MemoryOrchestrator'). Log at INFO/WARN/ERROR levels for extraction, dedup, persistence, and recall operations.

### [9] MemoryRecallResult.importance hardcoded to 0 in recall() (type-design)
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:88
- **Category**: type-design / invariant-loss
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: MemoryRecallResult declares an importance field typed as number but the only producer hardcodes it to 0. The type promises a value it cannot deliver, violating the principle that types should express useful invariants.
- **Suggestion**: Either remove importance from MemoryRecallResult or cross-reference with DocumentStore.getMemoryEntries to populate the real score.

### [10] Promise.all loses entire batch + separate UUIDs prevent correlation
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:122
- **Category**: error-handling / partial-failure
- **Confidence**: 90
- **Reported by**: review-errors (merged from review-errors-007, review-errors-009)
- **Description**: (1) Promise.all rejects on first failure, losing all successfully computed embeddings. (2) Each memory gets two different UUIDs for vector and document stores, preventing cross-store correlation and cleanup.
- **Suggestion**: Use Promise.allSettled. Generate UUID once per memory and use for both stores.

### [11] init() has no error handling for vectorStore.createTable
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:45
- **Category**: error-handling / missing-try-catch
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: If createTable fails, the raw error propagates with no context. The instance is left in an uninitialized state with no guard preventing subsequent calls from producing confusing errors.
- **Suggestion**: Wrap in try/catch with context. Add an `initialized` flag and check it in recall/persistExtractionResults.

### [12] No test for embedding failure during persistExtractionResults
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:117
- **Category**: test-quality / error-path-missing
- **Confidence**: 88
- **Reported by**: review-tests
- **Description**: If embedding.embed() throws during persist, the entire operation fails with unhandled rejection. No test verifies this error path or the resulting inconsistent state.
- **Suggestion**: Add a test with a throwing EmbeddingProvider verifying error propagation and state consistency.

### [13] L2-to-cosine comment formula notation misleads about _distance semantics
- **File**: `packages/context-engine/src/storage/vector-store.ts`:112
- **Category**: comments / factual-accuracy
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: The comment says `sim = 1 - (d^2/2)` which implies squaring the distance value. But LanceDB's _distance is already squared L2. A maintainer could incorrectly "fix" the formula by squaring _distance first.
- **Suggestion**: Rewrite: `// LanceDB _distance = squared L2; for unit vectors: cos_sim = 1 - (squared_L2 / 2)`

### [14] Promise.all in persistExtractionResults fails entire batch on single error
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:123
- **Category**: code-quality / partial-failure
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: If any single embedding.embed() fails, Promise.all rejects and NO memories get persisted. For a daily batch operation, losing the entire batch due to one failure is a data loss risk.
- **Suggestion**: Use Promise.allSettled() and persist only successfully embedded memories.

### [15] No test for embedding failure during recall()
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:72
- **Category**: test-quality / error-path-missing
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: recall() calls embedding.embed() without try/catch. No test verifies this error path. Given recall is the primary read path and embedding APIs are external, this is a significant gap.
- **Suggestion**: Add a test with a throwing EmbeddingProvider verifying error behavior.

## P2 - Medium (Consider)

### [16] Working memory is RAM-only, lost on process restart
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:32
- **Category**: architecture / in-memory-state
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: Layer 1 working memory is a plain in-memory array lost on crash/restart. Recent conversation context is critical for coherent AI character behavior.
- **Suggestion**: Hydrate working memory from DocumentStore.getRecentConversations(capacity) on init().

### [17] MemoryEntry.category is string but has documented literal values
- **File**: `packages/context-engine/src/storage/types.ts`:124
- **Category**: type-design / primitive-obsession
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: JSDoc documents 'preference', 'event', 'habit', 'goal', 'emotion' but type is plain string.
- **Suggestion**: Define `export type MemoryCategory = 'preference' | 'event' | 'habit' | 'goal' | 'emotion'`.

### [18] ExtractionInput.conversations[].role is string, not ConversationRole
- **File**: `packages/context-engine/src/types.ts`:248
- **Category**: type-design / type-mismatch
- **Confidence**: 86
- **Reported by**: review-types
- **Description**: ConversationRole is defined but not reused in ExtractionInput, widening the type unnecessarily.
- **Suggestion**: Use `Array<{ role: ConversationRole, content: string }>`.

### [19] hasNearDeadlineTodos() checks uncompleted todos, not deadlines
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:106
- **Category**: code-quality / misleading-api
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: Method name implies deadline proximity but implementation simply checks for any uncompleted todo.
- **Suggestion**: Rename to hasUncompletedTodos() or implement actual deadline checking.

### [20] hasNearDeadlineTodos name/doc implies deadline proximity (comments)
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:106
- **Category**: comments / misleading-name-as-documentation
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: Method name functions as implicit documentation that contradicts the code.
- **Suggestion**: Rename to hasIncompleteTodos() or implement actual deadline logic.

### [21] ImportantDate.dateType is string but has documented literal values
- **File**: `packages/context-engine/src/storage/types.ts`:105
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: JSDoc documents 'birthday', 'anniversary', 'deadline' but type is unconstrained string.
- **Suggestion**: Define `export type DateType = 'birthday' | 'anniversary' | 'deadline'`.

### [22] MemoryOrchestrator JSDoc references LanceDB by name
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:19
- **Category**: comments / misleading-class-doc
- **Confidence**: 82
- **Reported by**: review-comments
- **Description**: Class JSDoc names specific technologies (LanceDB, SQLite) but class depends on abstractions. Technology names in abstractions are a known comment rot risk.
- **Suggestion**: Replace with abstraction names: `Layer 2: Real-time Memory (VectorStore)`.

### [23] persistExtractionResults is 68 lines with 4 sequential blocks
- **File**: `packages/context-engine/src/consumption/memory-orchestrator.ts`:117
- **Category**: simplification / long-function
- **Confidence**: 82
- **Reported by**: review-simplify
- **Description**: Method handles 4 entity types in 68 lines. Exceeds 50-line threshold and could be decomposed.
- **Suggestion**: Extract: persistMemories, persistProfileFacts, persistRelationships, persistImportantDates.

### [24] No test for empty conversations input to MemoryExtractor
- **File**: `packages/context-engine/src/__tests__/memory-extractor.test.ts`:119
- **Category**: test-quality / boundary-condition-missing
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: No test exercises zero conversations, zero activities, zero todos. buildUserPrompt conditional blocks are untested.
- **Suggestion**: Add boundary tests: empty conversations, empty activities, all empty.

### [25] Relationship.relationshipType is unconstrained string
- **File**: `packages/context-engine/src/storage/types.ts`:89
- **Category**: type-design / primitive-obsession
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: No documented valid values. Different LLM runs could produce variant spellings for the same relationship.
- **Suggestion**: Define `export type RelationshipType = 'family' | 'friend' | 'colleague' | 'romantic' | 'acquaintance' | 'other'`.

### [26] Silent catch in dedup swallows embedding errors without logging
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:190
- **Category**: code-quality / silent-error
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: Error silently swallowed during dedup. If embedding service is down, every memory skips dedup silently, causing massive duplication.
- **Suggestion**: Log a warning with the error and memory content.

### [27] No input validation on DocumentStore memory table methods
- **File**: `packages/context-engine/src/storage/document-store.ts`:171
- **Category**: code-quality / missing-validation
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: No validation of business constraints (confidence 0-1, importance 1-10, date formats). Defense-in-depth gap.
- **Suggestion**: Add lightweight boundary validation: throw on invalid ranges, empty required fields.

### [28] L2-to-cosine conversion assumes normalized vectors without validation
- **File**: `packages/context-engine/src/storage/vector-store.ts`:112
- **Category**: code-quality / assumption
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: Formula assumes normalized vectors and squared L2 distance. Non-normalized vectors produce invalid similarity.
- **Suggestion**: Clamp: `Math.max(0, Math.min(1, 1 - (c._distance / 2)))`.

### [29] New storage interfaces lack readonly modifiers
- **File**: `packages/context-engine/src/storage/types.ts`:72
- **Category**: type-design / missing-readonly
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: UserProfileFact, Relationship, ImportantDate, MemoryEntry fields are mutable despite representing immutable persisted records.
- **Suggestion**: Add readonly to all fields or wrap with Readonly<T>.

### [30] MemoryOrchestrator.recall threshold parameter never tested
- **File**: `packages/context-engine/src/__tests__/memory-orchestrator.test.ts`:111
- **Category**: test-quality / boundary-condition-missing
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The threshold forwarding from orchestrator to vectorStore is never tested. A wiring bug would go undetected.
- **Suggestion**: Add test with high threshold verifying low-similarity results are filtered.

### [31] cosineSimilarity imported from smart-todo is a shared utility
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:13
- **Category**: simplification / misplaced-utility
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: Pure math utility imported from domain-specific module creates misleading dependency.
- **Suggestion**: Extract to `src/utils/math.ts`.

### [32] New public methods in DocumentStore lack JSDoc
- **File**: `packages/context-engine/src/storage/document-store.ts`:171
- **Category**: comments / missing-jsdoc
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: 11 new public methods lack JSDoc. Internally consistent with existing methods but deviates from CLAUDE.md convention.
- **Suggestion**: Add brief JSDoc, especially for methods with non-obvious behavior (e.g., getImportantDatesForToday matching patterns).

### [33] insertImportantDate allows duplicate entries for same event
- **File**: `packages/context-engine/src/storage/document-store.ts`:214
- **Category**: code-quality / duplicate-data
- **Confidence**: 75
- **Reported by**: review-code
- **Description**: Plain INSERT without UNIQUE constraint. Repeated LLM extractions accumulate duplicate rows, causing unbounded growth.
- **Suggestion**: Add UNIQUE constraint on (date, label) and use ON CONFLICT DO UPDATE.

## P3 - Low (Optional)

### [34] Magic number 3 in semanticSearch candidate multiplier
- **File**: `packages/context-engine/src/storage/vector-store.ts`:105
- **Category**: simplification / magic-number
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: `topK * 3` over-fetch ratio is undocumented.
- **Suggestion**: Extract to `const CANDIDATE_OVERFETCH_RATIO = 3`.

### [35] Section divider comments in DocumentStore restate class structure
- **File**: `packages/context-engine/src/storage/document-store.ts`:169
- **Category**: comments / redundant-comment
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Section dividers add visual noise without value in a 266-line file with IDE navigation.
- **Suggestion**: Consider removing or relying on IDE symbol navigation.

### [36] StubEmbeddingProvider duplicated across 3 test files
- **File**: `packages/context-engine/src/__tests__/memory-extractor.test.ts`:46
- **Category**: test-quality / test-duplication
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: Identical StubEmbeddingProvider in 3 files and StubLlmProvider in 2 files. DRY violation.
- **Suggestion**: Extract to `__tests__/fixtures/stub-providers.ts`.

### [37] No Valibot schemas at memory extraction LLM boundary
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:61
- **Category**: type-design / validation-boundary
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: Manual type guards work correctly but Valibot is the project standard. Future iteration improvement.
- **Suggestion**: Migrate to Valibot schemas for co-located type inference and range validation.

### [38] Redundant double cast in importantDates validation
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:71
- **Category**: simplification / unnecessary-cast
- **Confidence**: 76
- **Reported by**: review-simplify
- **Description**: After isValidImportantDate narrows the type, the map casts through unknown and re-casts each field.
- **Suggestion**: Trust the type guard and access fields directly.

### [39] Inline comment in catch block states the obvious
- **File**: `packages/context-engine/src/storage/memory-extractor.ts`:161
- **Category**: comments / comment-roi
- **Confidence**: 76
- **Reported by**: review-comments
- **Description**: `/* onError callback itself failed */` is obvious from context.
- **Suggestion**: Remove or make actionable: explain *why* the failure is silently swallowed.

## Positive Observations
- LLM output is validated with runtime type guards (validateExtractionResult + individual isValid* functions) before use -- clear improvement over task-13
- Test suite uses real SQLite (better-sqlite3 with temp dirs) and real LanceDB -- no InMemoryRepository anti-pattern
- Test Doubles are properly documented with '// Test Double rationale:' comments
- Full E2E pipeline test (memory-integration.test.ts) proves extract -> persist -> recall across all three layers with real storage
- DocumentStore uses parameterized queries throughout -- no SQL injection risk
- MemoryExtractor gracefully degrades on embedding failure during dedup (includes memory rather than losing it)
- Clean three-layer architecture (working memory / vector search / structured storage) with clear separation of concerns
- Excellent JSDoc on all interfaces in storage/types.ts with concrete examples
- VectorStore uses static factory method (create) to handle async initialization, avoiding constructor async antipattern
- DocumentStore constructor properly cleans up (db.close()) in catch block on init failure
- VectorStore.getDb() guard prevents use-after-close with clear error message
- VectorStore.deleteById escapes single quotes to prevent LanceDB filter injection
- MemoryOrchestrator.getWorkingMemory() returns spread copy as readonly -- good immutability pattern
- VectorSource literal union properly extended with 'memory', 'preference', 'relationship' rather than widening to string
- No vi.fn(), vi.mock(), jest.fn(), jest.mock(), InMemoryRepository, MockXxx, FakeXxx, or it.skip patterns in test files
- MemoryExtractor.extract() wraps errors with new Error(msg, { cause }) providing good error chain context
- Consistent use of early returns and guard clauses throughout
- All functions are short and focused with clear single responsibilities (except persistExtractionResults)
- MemoryExtractor class-level JSDoc includes clear flow diagram (input -> prompt -> LLM -> validate -> filter -> dedup -> result)

## Recommended Action Plan
1. Fix 3 P0 issues first: bind error params in both bare catch blocks (`memory-extractor.ts`:161 and :190), then fix hardcoded importance=0 in `recall()` by cross-referencing DocumentStore
2. Address 12 P1 issues in a single pass -- they cluster into 3 themes:
   - **Error handling** (6 P1s): Add try/catch with context to persistExtractionResults, recall, init; switch Promise.all to Promise.allSettled; share UUID across stores
   - **Observability** (2 P1s): Add useLogg to both modules; fix L2-to-cosine comment
   - **Integration + testing** (4 P1s): Wire to entry point; add error-path tests for persist and recall
3. Run `/ultra-review recheck` to verify P0s are resolved and P1 count drops below threshold
