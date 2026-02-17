# Review Summary

**Session**: 20260217-172644-feat-task-2-context-engine-storage-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 8 P1 findings exceed the threshold of 3 (security injection, orphan code, missing error handling, type-design gaps)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 8 |
| P2 Medium | 12 |
| P3 Low | 8 |
| **Total** | **28** (deduplicated from 30) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 7 | completed |
| review-tests | 5 | completed |
| review-errors | 6 | completed |
| review-types | 5 | completed |
| review-comments | 4 | completed |
| review-simplify | 3 | completed |

## P1 - High (Should Fix)
### [1] VectorStore.delete() accepts raw filter string (injection risk)
- **File**: packages/context-engine/src/storage/vector-store.ts:82
- **Category**: security/injection
- **Confidence**: 92
- **Reported by**: review-code, review-errors
- **Description**: The delete method accepts a raw string filter and passes it directly to LanceDB's table.delete(filter). If 'filter' is ever constructed from user input, this is a filter-injection vector (analogous to SQL injection). The JSDoc examples show string-interpolated patterns like "id = 'v1'", encouraging unsafe usage at call sites. Even if callers are currently safe, the API surface is inherently dangerous.
- **Suggestion**: Change the API to accept structured filter parameters (e.g., { field: string, op: '=' | 'IN', value: string | string[] }) and build the filter expression internally with proper escaping. Alternatively, provide a safe `deleteById(tableName, id)` helper for the most common case.

### [2] DocumentStore and VectorStore not wired to any entry point
- **File**: packages/context-engine/src/index.ts:18
- **Category**: integration/orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: Both DocumentStore and VectorStore are exported from the package index but are not instantiated or consumed by any entry point. The existing setupContextEngine() only wires ScreenshotCapture. Neither store is registered with injeca, connected via IPC, or invoked by any handler. This is orphan code -- exported but unreachable from any live execution path.
- **Suggestion**: Wire both stores into setupContextEngine() and expose relevant operations via IPC handlers or injeca service providers. At minimum, instantiate both stores in the service setup function so they are reachable.

### [3] Conversation.role is string but documents a finite union
- **File**: packages/context-engine/src/storage/types.ts:36
- **Category**: type-design/primitive-obsession
- **Confidence**: 95
- **Reported by**: review-types
- **Description**: The JSDoc comment explicitly lists three valid values ('user' | 'assistant' | 'system') but the type is plain `string`. The type system cannot catch invalid roles at compile time, and DocumentStore.insertConversation will accept any arbitrary string.
- **Suggestion**: Define `export type ConversationRole = 'user' | 'assistant' | 'system'` and use it: `role: ConversationRole`.

### [4] ContextVector.source is string but documents a finite union
- **File**: packages/context-engine/src/storage/types.ts:9
- **Category**: type-design/primitive-obsession
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: The JSDoc enumerates known source values but the type is `string`, allowing any arbitrary source value. Misspelled sources would silently create unsearchable records.
- **Suggestion**: Define `export type VectorSource = 'screenshot' | 'conversation' | 'document'` and use it in both ContextVector and VectorSearchResult.

### [5] VectorStore: zero error handling on all I/O operations
- **File**: packages/context-engine/src/storage/vector-store.ts:16
- **Category**: error-handling/missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: VectorStore has 7 async methods performing I/O against LanceDB. None have try/catch blocks. Failures will propagate as untyped library errors with no context about what operation failed or what input caused it.
- **Suggestion**: Wrap each I/O operation in try/catch. Catch errors, add context (operation name, table name, data dir), and re-throw as a typed ContextEngineStorageError.

### [6] DocumentStore: zero error handling; constructor leaks DB on failure
- **File**: packages/context-engine/src/storage/document-store.ts:13
- **Category**: error-handling/missing-try-catch
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: DocumentStore has 10 methods performing SQLite I/O. None have try/catch blocks. Additionally, if initTables() throws in the constructor, the Database connection is never closed, causing a resource leak.
- **Suggestion**: Wrap each method in try/catch with context. For the constructor: `try { this.initTables() } catch (err) { this.db.close(); throw new DocumentStoreError(...) }`

### [7] VectorStore.close() nullifies db without use-after-close guard
- **File**: packages/context-engine/src/storage/vector-store.ts:98
- **Category**: error-handling/unsafe-state
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: After close(), this.db is null via unsafe cast. Subsequent calls throw cryptic TypeError instead of a clear 'store is closed' error. No guard exists to check closed state.
- **Suggestion**: Add a `private closed = false` flag. Guard each method: `if (this.closed) throw new StorageError('VectorStore is closed')`.

### [8] No app-level integration test proving store wiring
- **File**: apps/stage-tamagotchi/src/main/services/anima/context-engine.ts:33
- **Category**: integration/missing-integration-test
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: Package-level tests use real databases (good), but there is no integration test at the app level proving stores can be instantiated, wired into injeca, and invoked through the service layer.
- **Suggestion**: Add an integration test in apps/stage-tamagotchi that instantiates both stores via the service setup function and performs a round-trip operation.

## P2 - Medium (Consider)
### [9] Conversation.role is untyped string instead of union type
- **File**: packages/context-engine/src/storage/types.ts:36
- **Category**: architecture/type-safety
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The Conversation interface documents role in JSDoc but the actual type is `string`. Any arbitrary string can be inserted with no compile-time or runtime validation.
- **Suggestion**: Change the type to a union: `role: 'user' | 'assistant' | 'system'`.

### [10] Role values documented in comment instead of type union
- **File**: packages/context-engine/src/storage/types.ts:37
- **Category**: comments/comment-will-rot
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: The comment enumerates allowed role values but the field type is plain `string`. If roles change, the comment will silently become stale.
- **Suggestion**: Define a string literal union type and use it as the field type instead.

### [11] updateIntimacy read-then-write is not atomic
- **File**: packages/context-engine/src/storage/document-store.ts:121
- **Category**: code-quality/race-condition
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: updateIntimacy performs a read followed by a write as two separate operations. With multiple connections this is a race condition.
- **Suggestion**: Use `UPDATE intimacy SET level = MAX(0, level + ?) WHERE id = 1` as a single atomic statement.

### [12] VectorStore.close() nullifies db via unsafe cast
- **File**: packages/context-engine/src/storage/vector-store.ts:98
- **Category**: code-quality/unsafe-state
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The double cast (`null as unknown as lancedb.Connection`) hides the nullable state from the type system, leading to confusing runtime errors on use-after-close.
- **Suggestion**: Make db nullable: `private db: lancedb.Connection | null` and check explicitly.

### [13] No validation on VectorStore.createTable dimension parameter
- **File**: packages/context-engine/src/storage/vector-store.ts:25
- **Category**: code-quality/missing-validation
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The dimension parameter has no validation. Zero, negative, or very large values could cause incorrect behavior or memory issues.
- **Suggestion**: Add: `if (!Number.isInteger(dimension) || dimension < 1) throw new Error('Invalid vector dimension')`.

### [14] No test for operations on non-existent table
- **File**: packages/context-engine/src/__tests__/vector-store.test.ts:35
- **Category**: test-quality/missing-error-path
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: VectorStore operations throw when the table does not exist. No test verifies this error behavior.
- **Suggestion**: Add test: `await expect(store.search('nonexistent', [...], 5)).rejects.toThrow()`.

### [15] No test for createTable idempotency
- **File**: packages/context-engine/src/__tests__/vector-store.test.ts:36
- **Category**: test-quality/missing-boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: VectorStore.createTable has explicit idempotency logic that is never tested.
- **Suggestion**: Add a test calling createTable twice and verifying existing data is preserved.

### [16] No test for dimension mismatch in vector search
- **File**: packages/context-engine/src/__tests__/vector-store.test.ts:47
- **Category**: test-quality/missing-boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: No test verifies behavior when a query vector has a different dimension than stored vectors.
- **Suggestion**: Add a dimension mismatch test to document the expected behavior.

### [17] No test for duplicate conversation ID insertion
- **File**: packages/context-engine/src/__tests__/document-store.test.ts:26
- **Category**: test-quality/missing-boundary-condition
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: Inserting a duplicate id throws a SQLite constraint error. No test documents this behavior.
- **Suggestion**: Add test verifying duplicate insertion throws, or change to INSERT OR REPLACE.

### [18] DocumentStore.getIntimacy() assumes row always exists
- **File**: packages/context-engine/src/storage/document-store.ts:116
- **Category**: error-handling/null-dereference
- **Confidence**: 82
- **Reported by**: review-errors
- **Description**: stmt.get() can return undefined if the row was externally deleted. The result is cast and accessed immediately, causing an unhandled TypeError.
- **Suggestion**: Add null check: `if (!row) throw new DocumentStoreError('Intimacy record not found')`.

### [19] Todo allows completed:true with completedAt:null
- **File**: packages/context-engine/src/storage/types.ts:47
- **Category**: type-design/illegal-state-representable
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The Todo interface allows contradictory states that should be impossible.
- **Suggestion**: Use a discriminated union or derive `completed` from `completedAt !== null`.

### [20] DocumentStore accepts domain types without input validation
- **File**: packages/context-engine/src/storage/document-store.ts:53
- **Category**: type-design/no-validation
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Boundary methods accept types but perform no validation. Invalid data will be persisted silently.
- **Suggestion**: Create Valibot schemas for Conversation and Todo and validate at the boundary.

## P3 - Low (Optional)
### [21] No test for empty collections (getTodos, getRecentConversations)
- **File**: packages/context-engine/src/__tests__/document-store.test.ts:68
- **Category**: test-quality/missing-boundary-condition
- **Confidence**: 76
- **Reported by**: review-tests
- **Description**: Empty-state queries are not tested.
- **Suggestion**: Add tests verifying empty-state queries return empty arrays.

### [22] Timestamps use bare number throughout all interfaces
- **File**: packages/context-engine/src/storage/types.ts:14
- **Category**: type-design/primitive-obsession
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: All interfaces use bare `number` for timestamps with no compile-time distinction.
- **Suggestion**: Consider a branded type `type UnixMillis = number & { readonly __brand: 'UnixMillis' }`. Low priority.

### [23] Delete method JSDoc calls LanceDB filter a 'SQL filter expression'
- **File**: packages/context-engine/src/storage/vector-store.ts:79
- **Category**: comments/misleading-terminology
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: LanceDB uses its own filter syntax, not SQL. The terminology could mislead maintainers.
- **Suggestion**: Change 'SQL filter expression' to 'LanceDB filter expression'.

### [24] Count method JSDoc restates the method name
- **File**: packages/context-engine/src/storage/vector-store.ts:88
- **Category**: comments/redundant-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: The JSDoc adds no information beyond the method signature.
- **Suggestion**: Remove or enhance with useful context.

### [25] Multiple individual type assertions in search result mapping
- **File**: packages/context-engine/src/storage/vector-store.ts:69
- **Category**: simplification/type-assertion-cleanup
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: Five individual type assertions could be consolidated to a single cast.
- **Suggestion**: Replace with `return results.map(row => row as unknown as VectorSearchResult)`.

### [26] Double cast through unknown to null the db reference
- **File**: packages/context-engine/src/storage/vector-store.ts:102
- **Category**: code-quality/unsafe-nulling
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: The double cast escape hatch hides the nullable state from the type system.
- **Suggestion**: Make the field nullable and assign null directly.

### [27] Close method comment references 'future compatibility' (rot risk)
- **File**: packages/context-engine/src/storage/vector-store.ts:99
- **Category**: comments/forward-looking-comment
- **Confidence**: 76
- **Reported by**: review-comments
- **Description**: The speculative 'future compatibility' framing may rot.
- **Suggestion**: Rephrase to focus on interface symmetry without speculating about future LanceDB changes.

### [28] Inconsistent result type handling between stores
- **File**: packages/context-engine/src/storage/document-store.ts:64
- **Category**: simplification/naming
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: getRecentConversations directly casts while getTodos manually maps. The difference is intentional but undocumented.
- **Suggestion**: Add an inline comment explaining why Conversation needs no mapping (all columns alias directly).

## Positive Observations
- Tests use real SQLite and LanceDB databases with temp directories -- no mocks or in-memory fakes (Dev/Prod Parity).
- Persistence tests verify data survives across reconnect (close + reopen), proving real durability.
- SQL uses parameterized queries throughout DocumentStore -- no SQL injection in document store.
- WAL mode enabled for SQLite, demonstrating awareness of concurrent read/write performance.
- Clean separation between types, storage implementations, and package exports.
- DocumentStore schema uses proper constraints (PRIMARY KEY, NOT NULL, CHECK) for data integrity.
- Intimacy table uses CHECK (id = 1) constraint to enforce singleton row at the database level.
- VectorStore uses private constructor + static factory pattern, properly encapsulating the LanceDB connection.
- VectorStore.search() correctly handles empty tables by checking rowCount before searching.
- Proper test isolation via temp directories with cleanup in afterEach prevents cross-test contamination.
- VectorStore tests verify search result ordering by distance, not just presence.
- All functions are short (under 15 lines) with low cyclomatic complexity.
- No forbidden patterns (TODO, FIXME, HACK, PLACEHOLDER, TEMP) found in any files.

## Recommended Action Plan
1. Fix the security injection risk in VectorStore.delete() by replacing the raw filter string API with structured parameters
2. Add error handling (try/catch with context + typed errors) to both VectorStore and DocumentStore -- this addresses 3 of the 8 P1 findings in a single pass
3. Replace string types with union types for Conversation.role and ContextVector.source
4. Add use-after-close guard to VectorStore with a `closed` flag
5. Wire DocumentStore and VectorStore into setupContextEngine() to eliminate orphan code
6. Add app-level integration test proving the wiring works end-to-end
7. Address P2 findings (boundary validation, atomic updates, test coverage gaps) in a follow-up pass
8. Run `/ultra-review recheck` to verify
