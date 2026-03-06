# Review Summary

**Session**: 20260304-170355-main-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 5 P0 critical issues (SSRF vulnerability, zero test coverage on 800-line service, empty catch block, forbidden TODO pattern) and 22 P1 high-severity issues across security, error handling, testing, and architecture.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 5 |
| P1 High | 22 |
| P2 Medium | 33 |
| P3 Low | 7 |
| **Total** | **67** (deduplicated from 67) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 14 | completed |
| review-tests | 14 | completed |
| review-errors | 12 | completed |
| review-comments | 13 | completed |
| review-simplify | 14 | completed |
| review-types | 0 | **timed out** |

## P0 - Critical (Must Fix)

### [1] TODO comment in use-modules-list.ts
- **File**: `packages/stage-ui/src/composables/use-modules-list.ts`:176
- **Category**: forbidden-pattern
- **Confidence**: 99
- **Reported by**: review-comments
- **Description**: Forbidden TODO pattern found in production code. Per CLAUDE.md and project rules, TODO/FIXME/HACK/XXX comments must not be committed. This comment has persisted from prior code and was not removed during this diff's changes to the same file.
- **Suggestion**: Either implement the reactive store approach now, or remove the comment entirely. If the work is tracked, reference a ticket number in a non-TODO comment.

### [2] Entire airi-brain service has zero test files
- **File**: `services/airi-brain/src/store.ts`:51
- **Category**: test-quality
- **Confidence**: 95
- **Reported by**: review-tests
- **Description**: The services/airi-brain package contains 8 new/modified source files with approximately 800 lines of new business logic and ZERO test files anywhere in the service. BrainStore is a critical SQLite-backed persistence layer managing activity events, summaries, LLM configs, embedding configs, provider configs, skills state, and vision config. It performs SQL operations, JSON serialization/deserialization, and date-based filtering -- all untested.
- **Suggestion**: Create `services/airi-brain/src/__tests__/store.test.ts` with Vitest using a real SQLite database (better-sqlite3 in-memory via ':memory:'). Test every method including initTables idempotency, round-trip persistence, JSON serialization, date filtering, and the hasCredentials filter logic.

### [3] Evening pipeline (critical business workflow) completely untested
- **File**: `services/airi-brain/src/handlers/evening-pipeline.ts`:18
- **Category**: test-quality
- **Confidence**: 92
- **Reported by**: review-tests
- **Description**: runEveningPipeline is a multi-phase critical business workflow: (1) fetch today's activities, (2) generate daily summary via LLM, (3) extract memories via ML pipeline, (4) persist to vector DB, (5) push results to frontend. This is the core data pipeline that transforms raw activity events into user-facing summaries and long-term memories. It has zero tests. Failures here would silently corrupt or lose user memory data.
- **Suggestion**: Create an integration test that sets up a real BrainStore with test activities, uses Test Double LLM/embedding providers, and verifies the full pipeline produces correct summaries. Test early-return paths when no events exist and when pipeline components are null.

### [4] SSRF via untrusted baseURL in embedding handler proxy
- **File**: `services/airi-brain/src/handlers/embedding.ts`:63
- **Category**: security
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The embedding:models:list and embedding:model:validate handlers accept a baseURL from WebSocket event data and use it directly in server-side fetch calls with the user's API key attached as an Authorization header. A malicious client could supply a baseURL pointing to an attacker-controlled server, causing the brain service to send the API key to that server (credential leak). Additionally, the baseURL could point to internal network addresses (SSRF), allowing scanning of internal services.
- **Suggestion**: Validate baseURL against an allowlist of known provider domains (e.g., openrouter.ai, dashscope.aliyuncs.com, api.openai.com). Alternatively, use the persisted/trusted provider config from BrainStore instead of accepting baseURL from the event payload. At minimum, block private/internal IP ranges and non-HTTPS URLs.

### [5] Empty catch block swallows JSON parse error in embedding validation
- **File**: `services/airi-brain/src/handlers/embedding.ts`:158
- **Category**: error-handling
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: In the embedding model validation handler, a bare catch block with only a comment (`catch { /* use HTTP status */ }`) silently swallows any JSON.parse failure. The project's CLAUDE.md and error_handling rules explicitly forbid `catch(e){}`.
- **Suggestion**: Bind the error and log at debug level: `catch (parseErr) { log.withFields({ provider, model, rawBody: body.slice(0, 200) }).debug('Could not parse error response as JSON, using HTTP status') }`.

## P1 - High (Should Fix)

### [6] Duplicate sendEmbeddingConfig logic in memory and embedding stores
- **File**: `packages/stage-ui/src/stores/modules/memory.ts`:93
- **Category**: code-quality
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The sendEmbeddingConfig function is duplicated nearly identically in both useMemoryModuleStore (memory.ts) and useEmbeddingStore (embedding.ts). Both stores also independently listen to the 'embedding:config:status' event and maintain their own parallel embedding state. This violates DRY and SRP.
- **Suggestion**: Remove the embedding config logic from the memory store entirely. Have the memory settings page use the dedicated useEmbeddingStore for embedding state.

### [7] API keys stored in plaintext in SQLite without encryption
- **File**: `services/airi-brain/src/store.ts`:105
- **Category**: security
- **Confidence**: 92
- **Reported by**: review-code
- **Description**: API keys for LLM, embedding, and provider configs are stored as plaintext in the SQLite database (embedding_config, llm_config, provider_configs tables). If the database file is compromised (backup leak, directory traversal), all API keys are exposed in the clear.
- **Suggestion**: Encrypt API keys at rest using a key derived from a machine-level secret (OS keychain, DPAPI, or environment variable). At minimum, document the security implication and ensure the database file has restrictive permissions (0600).

### [8] JSON.parse on DB data without try/catch in BrainStore.getActivitySummary
- **File**: `services/airi-brain/src/store.ts`:227
- **Category**: error-handling
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: getActivitySummary() calls JSON.parse on two columns (highlights, breakdown) from SQLite without any try/catch. If corrupted data is stored, this throws an unhandled error that crashes the caller. Same pattern previously identified and fixed in McpServerStore (safeJsonParse).
- **Suggestion**: Wrap both JSON.parse calls in try/catch, returning sensible defaults with a warning log that includes the date and raw column value.

### [9] LLM and Embedding adapter HTTP logic untested
- **File**: `services/airi-brain/src/adapters.ts`:9
- **Category**: test-quality
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: createLlmProviderAdapter and createEmbeddingProviderAdapter contain critical HTTP integration logic: URL construction with base URL normalization, Authorization header injection, OpenAI-compatible API request/response parsing, JSON structured output handling, and error handling for HTTP failures. All untested.
- **Suggestion**: Create `services/airi-brain/src/__tests__/adapters.test.ts`. Test URL construction, headers, response parsing, dimension caching, and error handling with Test Double endpoints.

### [10] Hardcoded embedding dimension default (1536) may cause vector DB mismatch
- **File**: `services/airi-brain/src/adapters.ts`:82
- **Category**: code-quality
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The embedding adapter starts with a hardcoded dimension of 1536. This value is returned by the dimension getter before any actual embedding call. If the VectorStore uses this during initialization but the actual model produces different dimensions (768, 1024, 3072), this causes insertion failures or silent data corruption.
- **Suggestion**: Make the dimension lazy-initialized: either perform a probe embed call during adapter creation, or make consumers handle dimension-unknown state.

### [11] JSON.parse on DB data without try/catch in BrainStore.getProviderConfigs
- **File**: `services/airi-brain/src/store.ts`:347
- **Category**: error-handling
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: getProviderConfigs() calls JSON.parse on the config_json column without try/catch. A single corrupted row will crash the entire config restore flow, losing all provider configs.
- **Suggestion**: Wrap in try/catch per row. On parse failure, log a warning with the provider_id and skip the corrupted row.

### [12] Misleading 'pre-stringified responses' comment in server-runtime
- **File**: `packages/server-runtime/src/index.ts`:44
- **Category**: comments
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: The comment says 'pre-stringified responses' but the RESPONSES object contains functions that return plain objects, not pre-stringified strings. The send helper calls stringify() at send-time.
- **Suggestion**: Change to: '// Response factory functions. Use the `send` helper to serialize and transmit.'

### [13] Stale adapter closure after provider reconfiguration
- **File**: `services/airi-brain/src/adapters.ts`:12
- **Category**: architecture
- **Confidence**: 88
- **Reported by**: review-code
- **Description**: createLlmProviderAdapter and createEmbeddingProviderAdapter capture the current providers handle at creation time via closure. When a user reconfigures the provider, the old adapters hold stale references. If rebuildPipeline fails, stale adapters are permanently active.
- **Suggestion**: Have the adapters read from the providers object dynamically with a null check, so they always reflect the latest provider config.

### [14] New embedding module store has no tests
- **File**: `packages/stage-ui/src/stores/modules/embedding.ts`:8
- **Category**: test-quality
- **Confidence**: 88
- **Reported by**: review-tests
- **Description**: The embedding module store is a new Pinia store (109 lines) with config validation logic, WebSocket event subscription, initialization guards, and dispose cleanup. Other module stores have dedicated test files, but this one has none.
- **Suggestion**: Create `packages/stage-ui/src/stores/modules/embedding.test.ts` following the pattern in memory.test.ts.

### [15] New LLM module store has no tests
- **File**: `packages/stage-ui/src/stores/modules/llm.ts`:8
- **Category**: test-quality
- **Confidence**: 88
- **Reported by**: review-tests
- **Description**: The LLM module store is structurally identical to the embedding store (109 lines) with the same config validation pattern. Zero tests. Config validation errors could silently break AI functionality.
- **Suggestion**: Create `packages/stage-ui/src/stores/modules/llm.test.ts`.

### [16] BrainStore constructor initTables() has no error handling
- **File**: `services/airi-brain/src/store.ts`:54
- **Category**: error-handling
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: The constructor calls initTables() which runs a large SQL block creating 7+ tables. If any statement fails, the error propagates raw with no context. The object is left in a partially initialized state.
- **Suggestion**: Wrap initTables() in try/catch that adds context: `throw new Error('BrainStore initialization failed', { cause: err })`.

### [17] Provider sync store handles credential data with no tests
- **File**: `packages/stage-ui/src/stores/modules/provider-sync.ts`:7
- **Category**: test-quality
- **Confidence**: 87
- **Reported by**: review-tests
- **Description**: useProviderSyncStore manages bidirectional sync of provider credentials between frontend localStorage and backend SQLite. Contains complex credential-checking logic and sync-pause mechanism. Touches security-sensitive data (API keys). Zero tests.
- **Suggestion**: Create `packages/stage-ui/src/stores/modules/provider-sync.test.ts`.

### [18] Graceful shutdown ignores errors from dispose functions
- **File**: `services/airi-brain/src/index.ts`:174
- **Category**: error-handling
- **Confidence**: 87
- **Reported by**: review-errors
- **Description**: gracefulShutdown calls 5 cleanup functions sequentially without any try/catch. If any early function throws, subsequent ones (client.close, documentStore.close) are skipped, leading to resource leaks. documentStore.close() is particularly important for SQLite WAL checkpoint flushing.
- **Suggestion**: Wrap each cleanup call in its own try/catch, or use a loop that logs and continues. Ensure process.exit(0) runs regardless.

### [19] Optional chaining silently returns empty string when LLM returns no choices
- **File**: `services/airi-brain/src/adapters.ts`:37
- **Category**: error-handling
- **Confidence**: 86
- **Reported by**: review-errors
- **Description**: If the LLM response has no choices, the function silently returns an empty string. This is error-as-valid-state: an empty string is indistinguishable from a legitimate response. Callers process empty strings producing nonsensical results.
- **Suggestion**: Check for missing choices explicitly and throw a descriptive error.

### [20] Evening pipeline logs error but never surfaces failure to frontend
- **File**: `services/airi-brain/src/handlers/evening-pipeline.ts`:107
- **Category**: error-handling
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: The evening pipeline catches all errors and only logs at warn level. The frontend gets no actionable error message -- just a generic 60-second timeout. A failure in phase 1 silently skips phases 2-4.
- **Suggestion**: Send an error event back to the client in the catch block with the specific error message.

### [21] Unhandled VectorStore.create() failure silently disables memory features
- **File**: `services/airi-brain/src/index.ts`:132
- **Category**: architecture
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: If VectorStore.create() fails, the entire evening pipeline and memory extraction subsystem is silently disabled. The error is logged at 'warn' level only. The frontend has no way to know that memory features are unavailable.
- **Suggestion**: Log at 'error' level. Send a status event to the frontend. Consider retrying with exponential backoff.

### [22] Evening pipeline has no cron service wired
- **File**: `services/airi-brain/src/handlers/evening-pipeline.ts`:103
- **Category**: integration
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: registerEveningPipeline accepts an optional cronService parameter but the caller in index.ts never passes one. The daily 23:00 cron job is never registered. The evening pipeline can only be triggered manually via WebSocket event.
- **Suggestion**: Wire a real cron service. If intentionally deferred, add a comment and surface the manual trigger path to users.

### [23] createBrainProviders env-var logic untested
- **File**: `services/airi-brain/src/providers.ts`:57
- **Category**: test-quality
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: createBrainProviders reads 8 environment variables with asymmetric fallback logic (embedding vars fall back to LLM vars for provider/apiKey but not model/baseURL). This subtle behavior is completely untested.
- **Suggestion**: Create `services/airi-brain/src/__tests__/providers.test.ts`. These are pure functions needing no mocks.

### [24] Embedding handler CORS proxy logic untested
- **File**: `services/airi-brain/src/handlers/embedding.ts`:58
- **Category**: test-quality
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: registerEmbeddingHandler contains a multi-strategy model listing proxy, a model validation endpoint, and config persistence. All untested.
- **Suggestion**: Test pushStatus logic, config:update handler, and model:validate flow with Test Doubles.

### [25] Embedding adapter returns empty array on missing data
- **File**: `services/airi-brain/src/adapters.ts`:105
- **Category**: error-handling
- **Confidence**: 84
- **Reported by**: review-errors
- **Description**: The embedding adapter silently returns an empty array when the API response has no data. An empty embedding vector is invalid for vector DB operations and produces incorrect search/dedup results.
- **Suggestion**: Throw when the embedding is empty: `if (embedding.length === 0) throw new Error('Embedding API returned empty vector')`.

### [26] Pipeline component failures logged-only with no status surfacing
- **File**: `services/airi-brain/src/pipeline.ts`:57
- **Category**: error-handling
- **Confidence**: 82
- **Reported by**: review-errors
- **Description**: createPipeline() catches initialization failures for 3 components and only logs warnings. No way for frontend or monitoring to know the pipeline is partially broken.
- **Suggestion**: Add a status field to PipelineComponents so callers can inspect which components failed.

### [27] setupApp message handler exceeds 100 lines with deep nesting (215 lines)
- **File**: `packages/server-runtime/src/index.ts`:198
- **Category**: code-quality
- **Confidence**: 82
- **Reported by**: review-simplify
- **Description**: The WebSocket message handler spans 215 lines with a switch statement with 4 cases and 4 levels of nesting.
- **Suggestion**: Extract each switch case into a named function.

## P2 - Medium (Consider)

### [28] Unsafe `as` casts on model listing response without type guard
- **File**: `packages/stage-ui/src/stores/providers/unified/dashscope.ts`:63
- **Category**: code-quality | **Confidence**: 88 | **Reported by**: review-code

### [29] In-memory mutable state in desktop-shell handler
- **File**: `services/airi-brain/src/handlers/desktop-shell.ts`:18
- **Category**: architecture | **Confidence**: 82 | **Reported by**: review-code

### [30] Dual initialization of embedding and LLM stores (App.vue + onboarding.ts)
- **File**: `packages/stage-ui/src/stores/onboarding.ts`:116
- **Category**: integration | **Confidence**: 80 | **Reported by**: review-code

### [31] Provider config sync sends all API keys over WebSocket on every change
- **File**: `packages/stage-ui/src/stores/modules/provider-sync.ts`:15
- **Category**: code-quality | **Confidence**: 78 | **Reported by**: review-code

### [32] Unbounded activity_events table with no cleanup or rotation
- **File**: `services/airi-brain/src/store.ts`:67
- **Category**: architecture | **Confidence**: 85 | **Reported by**: review-code

### [33] console.error used in production code paths (onboarding.ts)
- **File**: `packages/stage-ui/src/stores/onboarding.ts`:120
- **Category**: code-quality | **Confidence**: 80 | **Reported by**: review-code

### [34] Memory store test does not cover new embedding config and search result features
- **File**: `packages/stage-ui/src/stores/modules/memory.test.ts`:1
- **Category**: test-quality | **Confidence**: 82 | **Reported by**: review-tests

### [35] Activity store test does not cover new summaryStatus and triggerSummary
- **File**: `packages/stage-ui/src/stores/modules/activity.test.ts`:1
- **Category**: test-quality | **Confidence**: 82 | **Reported by**: review-tests

### [36] Pipeline creation and rebuild logic untested
- **File**: `services/airi-brain/src/pipeline.ts`:30
- **Category**: test-quality | **Confidence**: 80 | **Reported by**: review-tests

### [37] DashScope provider metadata untested
- **File**: `packages/stage-ui/src/stores/providers/unified/dashscope.ts`:12
- **Category**: test-quality | **Confidence**: 78 | **Reported by**: review-tests

### [38] New plugin-protocol event types added without contract tests
- **File**: `packages/plugin-protocol/src/types/events.ts`:1
- **Category**: test-quality | **Confidence**: 78 | **Reported by**: review-tests

### [39] server-runtime superjson.parse change untested for edge cases
- **File**: `packages/server-runtime/src/index.ts`:203
- **Category**: test-quality | **Confidence**: 76 | **Reported by**: review-tests

### [40] VectorStore.create() fire-and-forget in authenticated callback
- **File**: `services/airi-brain/src/index.ts`:138
- **Category**: error-handling | **Confidence**: 85 | **Reported by**: review-errors

### [41] DashScope listModels has no try/catch on dynamic import and fetch
- **File**: `packages/stage-ui/src/stores/providers/unified/dashscope.ts`:53
- **Category**: error-handling | **Confidence**: 80 | **Reported by**: review-errors

### [42] API keys stored as plaintext JSON in SQLite config_json column
- **File**: `services/airi-brain/src/store.ts`:329
- **Category**: security | **Confidence**: 78 | **Reported by**: review-errors

### [43] Misleading eslint-disable-next-line around console.log in channel-server
- **File**: `packages/stage-ui/src/stores/mods/api/channel-server.ts`:131
- **Category**: comments | **Confidence**: 88 | **Reported by**: review-comments

### [44] Placeholder comment disguising incomplete implementation in initializeListeners
- **File**: `packages/stage-ui/src/stores/mods/api/channel-server.ts`:164
- **Category**: comments | **Confidence**: 85 | **Reported by**: review-comments

### [45] Missing JSDoc on exported BrainStore class methods
- **File**: `services/airi-brain/src/store.ts`:51
- **Category**: comments | **Confidence**: 82 | **Reported by**: review-comments

### [46] Missing JSDoc on exported registerEmbeddingHandler function
- **File**: `services/airi-brain/src/handlers/embedding.ts`:24
- **Category**: comments | **Confidence**: 85 | **Reported by**: review-comments

### [47] Missing JSDoc on exported registerLlmHandler and registerProvidersHandler
- **File**: `services/airi-brain/src/handlers/llm.ts`:24
- **Category**: comments | **Confidence**: 83 | **Reported by**: review-comments

### [48] Missing JSDoc on exported useEmbeddingStore and useLlmStore
- **File**: `packages/stage-ui/src/stores/modules/embedding.ts`:8
- **Category**: comments | **Confidence**: 80 | **Reported by**: review-comments

### [49] Missing JSDoc on exported useProviderSyncStore
- **File**: `packages/stage-ui/src/stores/modules/provider-sync.ts`:7
- **Category**: comments | **Confidence**: 80 | **Reported by**: review-comments

### [50] Near-duplicate LLM and Embedding store modules (~90% identical)
- **File**: `packages/stage-ui/src/stores/modules/llm.ts`:1
- **Category**: simplification | **Confidence**: 95 | **Reported by**: review-simplify

### [51] Triplicated apiKey/baseURL extraction from provider config
- **File**: `packages/stage-ui/src/stores/modules/memory.ts`:104
- **Category**: simplification | **Confidence**: 92 | **Reported by**: review-simplify

### [52] Near-duplicate LLM and Embedding backend handler modules
- **File**: `services/airi-brain/src/handlers/llm.ts`:1
- **Category**: simplification | **Confidence**: 90 | **Reported by**: review-simplify

### [53] Repeated try/catch error message extraction pattern (6+ occurrences)
- **File**: `services/airi-brain/src/pipeline.ts`:58
- **Category**: simplification | **Confidence**: 88 | **Reported by**: review-simplify

### [54] createPipeline has 3 near-identical try/catch blocks for component init
- **File**: `services/airi-brain/src/pipeline.ts`:46
- **Category**: simplification | **Confidence**: 93 | **Reported by**: review-simplify

### [55] autoEnableModules has 8 identical try/catch blocks
- **File**: `packages/stage-ui/src/stores/onboarding.ts`:65
- **Category**: code-quality | **Confidence**: 95 | **Reported by**: review-simplify

### [56] createLlmHandle and createEmbeddingHandle are identical functions
- **File**: `services/airi-brain/src/providers.ts`:120
- **Category**: simplification | **Confidence**: 88 | **Reported by**: review-simplify

### [57] Duplicated normalizeBaseUrl function across frontend providers
- **File**: `packages/stage-ui/src/stores/providers/unified/dashscope.ts`:5
- **Category**: simplification | **Confidence**: 85 | **Reported by**: review-simplify

### [58] Repeated dispose pattern across all module stores
- **File**: `packages/stage-ui/src/stores/modules/activity.ts`:87
- **Category**: simplification | **Confidence**: 87 | **Reported by**: review-simplify

### [59] Duplicated LlmConfig and EmbeddingConfig types across store.ts and providers.ts
- **File**: `services/airi-brain/src/store.ts`:19
- **Category**: code-quality | **Confidence**: 82 | **Reported by**: review-simplify

### [60] Duplicated fetch request pattern in LLM adapter methods
- **File**: `services/airi-brain/src/adapters.ts`:14
- **Category**: code-quality | **Confidence**: 85 | **Reported by**: review-simplify

## P3 - Low (Optional)

### [61] Redundant type assertion in index.ts
- **File**: `services/airi-brain/src/index.ts`:59
- **Category**: code-quality | **Confidence**: 78 | **Reported by**: review-code

### [62] Redundant comment '// Initialize stores' in use-modules-list.ts
- **File**: `packages/stage-ui/src/composables/use-modules-list.ts`:34
- **Category**: comments | **Confidence**: 85 | **Reported by**: review-comments

### [63] Redundant comment '// Define category display names' in use-modules-list.ts
- **File**: `packages/stage-ui/src/composables/use-modules-list.ts`:170
- **Category**: comments | **Confidence**: 82 | **Reported by**: review-comments

### [64] Redundant inline comment '// verify' in server-runtime
- **File**: `packages/server-runtime/src/index.ts`:272
- **Category**: comments | **Confidence**: 78 | **Reported by**: review-comments

### [65] Redundant comment '// helper send function' in server-runtime
- **File**: `packages/server-runtime/src/index.ts`:70
- **Category**: comments | **Confidence**: 78 | **Reported by**: review-comments

### [66] Magic number 0.85 for dedup threshold in pipeline
- **File**: `services/airi-brain/src/pipeline.ts`:89
- **Category**: simplification | **Confidence**: 80 | **Reported by**: review-simplify

### [67] Duplicate possibleEvents arrays in client and server channel store
- **File**: `packages/stage-ui/src/stores/mods/api/channel-server.ts`:23
- **Category**: simplification | **Confidence**: 78 | **Reported by**: review-simplify

## Positive Observations
- Clean vertical slice delivery: LLM and embedding configuration flows end-to-end from settings UI through WebSocket protocol to brain service persistence and context-engine pipeline initialization.
- Proper use of @guiiai/logg structured logging throughout all new brain service handlers with consistent field-based context.
- Good error handling patterns: all async handlers have try/catch blocks, errors are logged with context, and status is pushed to the frontend.
- Protocol events properly typed in plugin-protocol/events.ts with shared interface definitions for both UI and backend consumers.
- SQLite persistence for provider configs, LLM config, and embedding config ensures configuration survives restarts -- a significant improvement over previous in-memory-only patterns.
- Pipeline rebuild on config change uses debouncing (200ms) to avoid unnecessary reconstructions during rapid edits.
- Clean removal of unused gaming modules (Factorio, Minecraft) and memory short/long-term split -- reduces maintenance surface.
- Existing Pinia store tests follow good patterns: real Pinia instances via createTestingPinia with stubActions:false, behavioral assertions.
- BrainStore uses parameterized SQL queries throughout -- zero string concatenation for SQL, consistent with project best practices.
- The provider-sync store implements a clean sync-pause mechanism to avoid echo loops during restore from backend.
- Network I/O in adapters.ts consistently checks response.ok and throws with HTTP status + body context.
- WebSocket event handlers properly restore persisted config from DB on startup.
- Desktop shell handler has proper .catch() on the promise chain inside setInterval, avoiding the throw-in-timer bug.
- The evening-pipeline.ts JSDoc on runEveningPipeline is excellent: numbered list clearly describes the 5-phase pipeline.
- Guard clauses and early returns are used effectively throughout.
- The pipeline architecture cleanly separates concerns: providers.ts for config, adapters.ts for adaptation, pipeline.ts for orchestration.
- Named constants are used for timing values (WINDOW_POLL_INTERVAL_MS, DEFAULT_HEARTBEAT_TTL_MS).
- Individual functions are generally short and well-scoped -- most under 30 lines.
- The server-runtime change to use superjson.parse with proper try/catch is a clean fix.

## Recommended Action Plan
1. **Fix 5 P0 issues first**: Remove the TODO comment, add the empty catch block logging, fix the SSRF vulnerability with a baseURL allowlist, and create initial test files for airi-brain (store.test.ts and evening-pipeline.test.ts).
2. **Address 22 P1 issues in a structured pass**: Group by theme --
   - *Security (2)*: API key encryption at rest, plus the plaintext config_json column.
   - *Error handling (8)*: Add try/catch around JSON.parse on DB reads, fix error-as-valid-state in adapters (throw on empty LLM/embedding responses), surface pipeline failures to frontend, fix graceful shutdown with per-call try/catch.
   - *Testing (6)*: Create test files for embedding store, LLM store, provider-sync store, providers.ts, and embedding handler.
   - *Architecture (3)*: Fix stale adapter closure, surface VectorStore failure, wire cron service.
   - *Code quality (2)*: Deduplicate sendEmbeddingConfig, fix hardcoded dimension.
   - *Comments (1)*: Fix misleading 'pre-stringified' comment.
3. **Address P2 duplication in a single refactoring pass**: Extract shared utilities (resolveProviderCredentials, errorMessage, initComponent, useDisposers, normalizeBaseUrl, createModelHandle, shared types.ts). This batch addresses 11 of the 33 P2 findings.
4. Run `/ultra-review recheck` to verify all P0 and P1 fixes.
