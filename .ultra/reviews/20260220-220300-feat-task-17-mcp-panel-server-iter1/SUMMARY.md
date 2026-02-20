# Review Summary

**Session**: 20260220-220300-feat-task-17-mcp-panel-server-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: P1 count (8) exceeds threshold of 3

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 8 |
| P2 Medium | 14 |
| P3 Low | 8 |
| **Total** | **30** (deduplicated from 30) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-tests | 5 | completed |
| review-errors | 4 | completed |
| review-types | 6 | completed |
| review-comments | 4 | completed |
| review-simplify | 3 | completed |

## P1 - High (Should Fix)
### [1] serverStatuses stored only in reactive ref, not persisted
- **File**: `packages/stage-ui/src/stores/modules/mcp.ts`:27
- **Category**: architecture / in-memory-state
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The serverStatuses map is a Vue reactive ref that resets to empty on page reload. While server configs are persisted via useLocalStorageManualReset, the connection statuses are ephemeral. No reconnection/probe logic exists in this store -- statuses will always show 'disconnected' after reload, even if servers are actually running. The updateStatus function is exposed but never called from any wiring code in this diff.
- **Suggestion**: Add an init/reconnect action to the store that probes each enabled server's actual status on mount (e.g., via McpHub.connectEnabled or a health ping). Wire this from the settings page or app bootstrap. Alternatively, accept that statuses are always 'disconnected' on load and document that the backend owns the real connection state.

### [2] createAnimaMcpServer exported but not consumed by any entry point
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:52
- **Category**: integration / orphan-code
- **Confidence**: 92
- **Reported by**: review-code
- **Description**: createAnimaMcpServer is exported from packages/mcp-hub/src/index.ts and tested, but there is no consumer anywhere in the codebase that imports and calls it. The AnimaMemoryAccess and AnimaContextAccess interfaces define contracts against context-engine, but no wiring in apps/stage-tamagotchi or any other entry point instantiates this server with real deps. This is orphan code -- it cannot be reached from any live entry point.
- **Suggestion**: Wire createAnimaMcpServer in the Electron main process service layer with real AnimaMemoryAccess/AnimaContextAccess implementations from context-engine. If context-engine is not ready, define a stub with a rationale comment and create a follow-up task.

### [3] UI store broadcasts MCP config but no integration test validates the contract
- **File**: `packages/stage-ui/src/stores/modules/mcp.ts`:90
- **Category**: integration / missing-contract-test
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The MCP module store broadcasts configuration via configurator.updateFor('mcp', ...) which sends a WebSocket message. There is no integration test or contract test proving that the backend (server-runtime or mcp-hub) understands and correctly processes this message shape. The contract between the UI and backend is unverified.
- **Suggestion**: Add a contract test that validates the output of toBackendConfig matches the expected McpServerConfigInput discriminated union from @proj-airi/mcp-hub.

### [4] MCP tool handler 'search_memories' has no try/catch
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:69
- **Category**: error-handling / missing-try-catch
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: The search_memories tool handler calls memoryAccess.searchMemories() which accesses the underlying DocumentStore/VectorStore (SQLite/LanceDB). If the backing store throws, the raw error propagates unhandled through the MCP SDK to the external client. Additionally, JSON.stringify could throw on unexpected data shapes.
- **Suggestion**: Wrap the handler body in try/catch. On error, return an MCP-protocol-appropriate error response with context (e.g., `{ content: [{ type: 'text', text: 'Failed to search memories: <message>' }], isError: true }`). Log the error with the query and limit for debuggability.

### [5] MCP tool handler 'get_daily_summary' has no try/catch
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:85
- **Category**: error-handling / missing-try-catch
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: The get_daily_summary tool handler calls contextAccess.getDailySummary() without error protection. This method performs I/O (LLM calls, DB reads). Any failure propagates as a raw unhandled exception to the MCP client. The date parameter is user-supplied and could be invalid, with no validation before passing to the dependency.
- **Suggestion**: Add try/catch with an MCP isError response. Validate the date parameter format (YYYY-MM-DD) before passing to getDailySummary. Log the error with the date input.

### [6] MCP resource handler 'user-context' has no try/catch
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:100
- **Category**: error-handling / missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: The user-context resource handler calls contextAccess.getUserContext() and JSON.stringify() without any error handling. If the context engine is not initialized or the DB connection is lost, this will throw an unhandled error through the MCP resource protocol.
- **Suggestion**: Wrap in try/catch. Return an appropriate error response or a structured error object. Log with context (uri, operation name).

### [7] MCP resource handler 'memories' has no try/catch
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:119
- **Category**: error-handling / missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: The memories resource handler calls memoryAccess.getRecentMemories(50) and JSON.stringify() without error handling. A DB failure will propagate as a raw unhandled error.
- **Suggestion**: Wrap in try/catch. Return an MCP-appropriate error or empty result with error metadata. Log with context (uri, limit=50).

### [8] useMcpModuleStore has no test file
- **File**: `packages/stage-ui/src/stores/modules/mcp.ts`:23
- **Category**: test-quality / missing-test-file
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The useMcpModuleStore Pinia store contains non-trivial business logic: addServer generates an ID and broadcasts, removeServer cleans up status, updateServer merges partials, addFromRecommended maps recommended config to UI config, toBackendConfig discriminates stdio vs http/sse. None of this logic has a corresponding test file. Other stores in stage-ui follow the pattern of having a sibling .test.ts file.
- **Suggestion**: Create `packages/stage-ui/src/stores/modules/mcp.test.ts`. Use createPinia() + setActivePinia() to test each store action.

### [9] RecommendedMcpServer uses flat optional fields instead of discriminated union
- **File**: `packages/mcp-hub/src/recommended-servers.ts`:6
- **Category**: type-design / missed-discriminated-union
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: RecommendedMcpServer has transport-specific fields (command/args for stdio, url for http/sse) all as optional on a single flat interface. This allows illegal states: a stdio server with url but no command, or an http server with command but no url. The codebase already has the correct pattern -- McpServerConfig in types.ts is a proper discriminated union.
- **Suggestion**: Model as discriminated union with RecommendedStdioServer and RecommendedHttpServer variants.

### [10] anima-mcp-server tests lack error/edge-case paths
- **File**: `packages/mcp-hub/src/__tests__/anima-mcp-server.test.ts`:45
- **Category**: test-quality / missing-error-path
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The test suite covers only happy paths. Missing: (1) search_memories with empty query, (2) limit=0 or limit=-1, (3) get_daily_summary with invalid date format, (4) what happens when dependencies throw. External MCP clients need graceful error responses.
- **Suggestion**: Add edge case tests including a failing test double that throws to verify error propagation behavior.

## P2 - Medium (Consider)
### [11] addedRecommendedIds matches by name instead of id, causing false positives
- **File**: `packages/stage-ui/src/components/scenarios/settings/McpManager.vue`:26
- **Category**: code-quality / duplicate-detection-bug
- **Confidence**: 88
- **Reported by**: review-code
- **Description**: The computed set collects server names but checks against the recommended server's display name. If a user manually adds a server named 'Filesystem', it would incorrectly disable the recommended 'Filesystem' button. If a user renames an added recommended server, the button becomes re-enabled allowing duplicates.
- **Suggestion**: Track by stable identifier (recommendedSourceId) rather than display name.

### [12] No validation on URL/command inputs before saving MCP server config
- **File**: `packages/stage-ui/src/components/scenarios/settings/McpManager.vue`:39
- **Category**: code-quality / missing-input-validation
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: handleAdd only validates that the server name is non-empty. For stdio transport, command is not checked. For http/sse transport, URL format is not validated. A user could save a config with empty command or malformed URL causing silent failures.
- **Suggestion**: Add validation: require non-empty command for stdio, require valid URL for http/sse. Show validation errors in the form UI.

### [13] No logging in anima-mcp-server tool/resource handlers
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:52
- **Category**: code-quality / missing-logging
- **Confidence**: 82
- **Reported by**: review-code
- **Description**: createAnimaMcpServer registers two tools and two resources with no logging in any handler. When external clients call these endpoints, there is no observability into what was requested, how long it took, or whether it succeeded.
- **Suggestion**: Add @guiiai/logg useLogg calls at handler start and completion, logging query parameters and result counts.

### [14] MCP settings page route exists but no backend handler processes 'mcp' config
- **File**: `packages/stage-pages/src/pages/settings/modules/mcp.vue`:1
- **Category**: integration / horizontal-only-change
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: The MCP settings page, store, and Vue component form a horizontal UI-only slice. broadcastConfig() sends a WebSocket message with moduleName='mcp', but there is no corresponding backend handler. The UI allows adding/editing/removing servers, but configuration never reaches McpHub.
- **Suggestion**: Add a handler in server-runtime or Electron main process IPC that receives 'ui:configure' messages with moduleName='mcp' and routes them to McpHub.

### [15] handleAdd duplicates server config construction for add vs edit
- **File**: `packages/stage-ui/src/components/scenarios/settings/McpManager.vue`:39
- **Category**: simplification / near-duplicate-code
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: handleAdd builds an almost identical config object in both the add and edit branches. The transport-conditional field assignments are duplicated verbatim.
- **Suggestion**: Extract shared config to a local variable, then spread with `{ ...serverFields, enabled: true }` for the add branch.

### [16] McpServerUiConfig duplicates flat optional field anti-pattern
- **File**: `packages/stage-ui/src/stores/modules/mcp.ts`:12
- **Category**: type-design / missed-discriminated-union
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: McpServerUiConfig repeats the same flat optional fields pattern. A stdio server can have url/headers, and an http server can have command/args. The toBackendConfig() already branches on transport type, proving the discriminated union is the natural shape.
- **Suggestion**: Align with McpServerConfig's discriminated union pattern. Define StdioUiConfig, SseUiConfig, HttpUiConfig variants.

### [17] MemoryResult.category and .sourceDate are plain string types
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:7
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: MemoryResult.category should use a literal union from the memory pipeline. sourceDate should be documented as ISO date. importance has no range constraint. These are domain concepts represented as raw primitives.
- **Suggestion**: Import the category type from memory pipeline types. Add JSDoc @example for sourceDate. Add range documentation for importance.

### [18] AnimaUserContext.relationships[].type and category are plain strings
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:17
- **Category**: type-design / primitive-obsession
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: The relationships array uses inline `{ name: string, type: string }` where type should reference Relationship.relationshipType from the memory pipeline. intimacyLevel has no documented valid range. This type is a contract for external MCP clients so precision matters.
- **Suggestion**: Extract to a named interface (RelationshipSummary). Import the type literal union. Add JSDoc with range for intimacyLevel.

### [19] getRecommendedServers() returns mutable reference to module constant
- **File**: `packages/mcp-hub/src/recommended-servers.ts`:87
- **Category**: type-design / mutable-reference-leak
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: The function returns a direct reference to the module-level RECOMMENDED_SERVERS array. Any caller can push/pop/mutate entries, corrupting the shared constant.
- **Suggestion**: Use `as const satisfies readonly RecommendedMcpServer[]` or return a shallow copy `[...RECOMMENDED_SERVERS]`.

### [20] Forward-looking implementation reference will rot (AnimaMemoryAccess)
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:26
- **Category**: comments / rot-risk
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The JSDoc on AnimaMemoryAccess names specific implementing classes (DocumentStore/VectorStore from context-engine). If the implementation is refactored or renamed, this comment becomes misleading.
- **Suggestion**: Remove class references. Replace with: '/** Interface for accessing memory data. Provide an implementation at the app wiring level. */'

### [21] Forward-looking implementation reference will rot (AnimaContextAccess)
- **File**: `packages/mcp-hub/src/anima-mcp-server.ts`:33
- **Category**: comments / rot-risk
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The JSDoc on AnimaContextAccess names specific implementing classes (ReportGenerator/ActivityMonitor from context-engine). Same rot risk.
- **Suggestion**: Remove class references. Replace with: '/** Interface for accessing context data. Provide an implementation at the app wiring level. */'

### [22] Public Pinia store exported with zero JSDoc
- **File**: `packages/stage-ui/src/stores/modules/mcp.ts`:23
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: useMcpModuleStore exports 11 public members with zero JSDoc comments. The project convention uses JSDoc consistently on all exported interfaces and functions.
- **Suggestion**: Add a file-level JSDoc explaining the store's purpose. Document addServer, removeServer, addFromRecommended, and toBackendConfig since their side effects are non-obvious.

### [23] recommended-servers tests miss boundary: empty list and mutation
- **File**: `packages/mcp-hub/src/__tests__/recommended-servers.test.ts`:1
- **Category**: test-quality / boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: No test verifying immutability (a caller could mutate the returned array). No test validates optional field shapes (args as string array for stdio servers).
- **Suggestion**: Add mutation safety test and structural shape tests for transport-specific fields.

### [24] testMemoryAccess/testContextAccess contract gap
- **File**: `packages/mcp-hub/src/__tests__/anima-mcp-server.test.ts`:8
- **Category**: test-quality / test-double-acceptable
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: Test doubles are acceptable with rationale comment, but no integration test proves real context-engine implementations satisfy the interfaces.
- **Suggestion**: Consider a contract test for the real implementations in a future PR.

## P3 - Low (Optional)
### [25] Export name McpServer for settings component is misleading
- **File**: `packages/stage-ui/src/components/scenarios/settings/index.ts`:4
- **Category**: code-quality / naming
- **Confidence**: 76
- **Reported by**: review-code
- **Description**: The component is exported as 'McpServer' but renders a settings management panel. The name could be confused with the actual McpServer class from @modelcontextprotocol/sdk.
- **Suggestion**: Rename the export to McpManager or McpSettings.

### [26] getStatusColor and getStatusText use if-chains over lookup maps
- **File**: `packages/stage-ui/src/components/scenarios/settings/McpManager.vue`:85
- **Category**: simplification / lookup-table
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: Two functions follow the same branching pattern over status values. Could be consolidated into lookup tables.
- **Suggestion**: Use `Record<McpServerStatus, string>` lookup tables.

### [27] recommendedServers computed wraps a pure function with no reactivity
- **File**: `packages/stage-ui/src/stores/modules/mcp.ts`:29
- **Category**: simplification / computed-over-static
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: getRecommendedServers() returns a static array with no reactive dependencies. computed() adds overhead for a value that never changes.
- **Suggestion**: Replace with direct assignment: `const recommendedServers = getRecommendedServers()`.

### [28] Function JSDoc restates what the name and return type say
- **File**: `packages/mcp-hub/src/recommended-servers.ts`:84
- **Category**: comments / redundant-comment
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: The JSDoc is nearly identical to the function name and return type. The 'one click' detail is a UI concern in a data-layer function.
- **Suggestion**: Remove the JSDoc entirely or replace with genuinely useful context.

### [29] RecommendedMcpServer.category is plain string, known values exist
- **File**: `packages/mcp-hub/src/recommended-servers.ts`:10
- **Category**: type-design / primitive-obsession
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: Only three values are used ('utilities', 'search', 'development'). A literal union would make the type self-documenting.
- **Suggestion**: Define `type RecommendedCategory = 'utilities' | 'search' | 'development' | 'data'`.

### [30] Test describe block uses camelCase instead of component name
- **File**: `packages/mcp-hub/src/__tests__/anima-mcp-server.test.ts`:45
- **Category**: test-quality / test-naming
- **Confidence**: 76
- **Reported by**: review-tests
- **Description**: Uses 'animaMcpServer' which does not match the module name or exported function name.
- **Suggestion**: Use `describe('createAnimaMcpServer', ...)`.

## Positive Observations
- Clean contract-first design: AnimaMemoryAccess and AnimaContextAccess interfaces define clear boundaries between the MCP protocol adapter and the storage layer, enabling proper dependency injection.
- Test quality for anima-mcp-server is excellent: uses real InMemoryTransport from the MCP SDK to test the full protocol round-trip (register tool -> connect -> call tool -> parse response), with proper Test Double rationale comment.
- Server config persistence uses useLocalStorageManualReset, correctly persisting user-configured servers across page reloads.
- The recommended-servers module is pure data with a clean getter function, easy to test and extend.
- The McpManager.vue component follows project conventions: UnoCSS v-bind class arrays, Iconify icons, proper i18n with vue-i18n, and idiomatic Vue 3 Composition API.
- No forbidden patterns (TODO/FIXME/HACK/PLACEHOLDER) found in any of the files.
- All functions are well under the 50-line threshold; maximum nesting depth is 2 levels.
- Guard clauses and early returns are used consistently.
- Clean separation: data definitions (recommended-servers.ts), store logic (mcp.ts), and UI (McpManager.vue) are properly isolated.
- The store properly uses nanoid for ID generation rather than raw strings or sequential numbers.
- McpServerStatus is a proper 3-value literal union ('connected' | 'disconnected' | 'error').
- toBackendConfig() correctly bridges the UI config to the backend McpServerConfigInput discriminated union, showing awareness of the type gap.

## Recommended Action Plan
1. Add try/catch error handling to all 4 MCP tool/resource handlers in `packages/mcp-hub/src/anima-mcp-server.ts` (findings 4-7) -- this is a single-pass fix with a consistent pattern
2. Wire createAnimaMcpServer to an entry point or add a backend handler for 'mcp' config messages (findings 2, 14) -- closes the vertical slice
3. Create `packages/stage-ui/src/stores/modules/mcp.test.ts` with unit tests for store actions (finding 8)
4. Add error/edge-case test paths to anima-mcp-server.test.ts (finding 10)
5. Refactor RecommendedMcpServer and McpServerUiConfig to use discriminated unions (findings 9, 16)
6. Add input validation to McpManager.vue handleAdd (finding 12)
7. Add a contract test for broadcastConfig message shape (finding 3)
8. Run `/ultra-review recheck` to verify fixes
