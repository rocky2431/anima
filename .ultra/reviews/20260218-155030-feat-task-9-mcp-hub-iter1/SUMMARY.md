# Review Summary

**Session**: 20260218-155030-feat-task-9-mcp-hub-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 1 P0 security finding (command injection) and 10 P1 findings (error handling, orphan code, type safety, resource leaks)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 1 |
| P1 High | 10 |
| P2 Medium | 17 |
| P3 Low | 5 |
| **Total** | **33** (deduplicated from 34) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 9 | completed |
| review-tests | 6 | completed |
| review-errors | 7 | completed |
| review-types | 7 | completed |
| review-comments | 2 | completed |
| review-simplify | 3 | completed |

## P0 - Critical (Must Fix)
### [1] User-controlled command passed to stdio transport without sanitization
- **File**: `packages/mcp-hub/src/transport-factory.ts`:16
- **Category**: security / command-injection
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The `command` and `args` fields from McpServerConfig are passed directly to Experimental_StdioMCPTransport which spawns a child process. These values originate from user input via McpServerConfigInput and are stored in SQLite, but there is zero sanitization or allowlisting. Any user (or code path) that can call addServer() can execute arbitrary system commands. The only validation is that the field is non-empty for stdio transport. This is a command injection vector if mcp-hub is ever exposed to untrusted input (e.g., via IPC, API endpoint, or UI form).
- **Suggestion**: Add an allowlist of permitted commands (e.g., ['npx', 'node', 'python']) or validate command against a safe pattern. At minimum, validate that `command` does not contain shell metacharacters (;, |, &, $, backticks). Consider whether args should be restricted as well. Document the threat model: if only trusted admins can register servers, note that explicitly in code comments and enforce it at the API boundary.

## P1 - High (Should Fix)
### [2] Package has no consumer -- entire mcp-hub is orphan code
- **File**: `packages/mcp-hub/src/index.ts`:1
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: No package in the monorepo depends on @proj-airi/mcp-hub. A grep for '@proj-airi/mcp-hub' across all package.json files returns only the package's own package.json. The exports are not imported by any app (stage-tamagotchi, stage-web, server) or other package. Per CLAUDE.md orphan detection rules, code without a live entry point is dead-on-arrival.
- **Suggestion**: Wire mcp-hub into at least one consumer before merging. For example: (1) Add @proj-airi/mcp-hub as a dependency of apps/stage-tamagotchi or apps/server, (2) Import McpHub in the Anima orchestrator or a new IPC handler, (3) Provide a minimal end-to-end path: UI button -> IPC -> McpHub.addServer() -> McpHub.connectServer() -> tools available to LLM.

### [3] McpServerConfig allows invalid transport/field combinations
- **File**: `packages/mcp-hub/src/types.ts`:3
- **Category**: type-design / illegal-state-representable
- **Confidence**: 95
- **Reported by**: review-types
- **Description**: McpServerConfig and McpServerConfigInput use flat optional fields for transport-specific properties. When transport is 'stdio', command is required but typed as optional; when transport is 'sse' or 'http', url is required but typed as optional. The type permits illegal states. Runtime validation in validateInput partially compensates but only for the add() path.
- **Suggestion**: Refactor into a discriminated union keyed on transport: type StdioServerConfig = { transport: 'stdio'; command: string; args?: string[]; url?: never }; type SseServerConfig = { transport: 'sse'; url: string; headers?: Record<string, string>; command?: never }; etc.

### [4] JSON.parse without try/catch on DB-sourced data in rowToConfig
- **File**: `packages/mcp-hub/src/server-store.ts`:181
- **Category**: error-handling / missing-try-catch
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: rowToConfig calls JSON.parse on args and headers columns read from SQLite. If stored data is corrupted or manually tampered with, JSON.parse throws a SyntaxError that will propagate unhandled from any read operation (getAll, getById, getEnabled). This is an I/O boundary where defensive parsing is required.
- **Suggestion**: Wrap each JSON.parse in try/catch. On parse failure, throw a typed error: `throw new Error('Corrupted args for server ${row.id}', { cause: err })`.

### [5] update() skips all input validation, can persist invalid state
- **File**: `packages/mcp-hub/src/server-store.ts`:95
- **Category**: type-design / missing-validation
- **Confidence**: 92
- **Reported by**: review-types
- **Description**: The update() method applies a partial merge without re-validating the resulting config. A caller can change transport to 'stdio' without providing command, or change transport to 'http' while leaving url undefined. This can corrupt the database with configs that fail at connection time.
- **Suggestion**: After merging partial onto existing, call validateInput() (or a new validateConfig()) before persisting.

### [6] Transport resource leak when createMCPClient fails in connect()
- **File**: `packages/mcp-hub/src/mcp-client-manager.ts`:18
- **Category**: error-handling / resource-leak
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: If createTransport succeeds (spawning a stdio child process) but createMCPClient subsequently throws, the transport is never closed. For stdio transports this leaves an orphaned child process. The transport reference is lost since it was never stored in the clients map.
- **Suggestion**: Wrap in try/catch. In the catch block, check if transport has a close/destroy method and call it before re-throwing.

### [7] connectEnabled() fails fast via Promise.all, leaving servers unconnected
- **File**: `packages/mcp-hub/src/mcp-hub.ts`:52
- **Category**: error-handling / partial-failure
- **Confidence**: 90
- **Reported by**: review-code, review-errors
- **Description**: connectEnabled uses Promise.all, which rejects on the first failure. If one of N enabled servers fails to connect, the remaining servers may not complete their connection. In a hub managing multiple MCP servers, one bad server should not prevent connecting to the rest.
- **Suggestion**: Use Promise.allSettled instead. Return a result summary: `{ connected: string[], failed: Array<{ id: string, error: string }> }`.

### [8] aggregateTools silently overwrites tools with duplicate names
- **File**: `packages/mcp-hub/src/mcp-client-manager.ts`:58
- **Category**: code-quality / tool-name-collision
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: When multiple MCP servers expose tools with the same name, Object.assign silently overwrites the first with the second. The last server iterated wins. This is a correctness bug: the user registered both servers expecting both tools to be available, but one is silently dropped.
- **Suggestion**: Namespace tools by server (e.g., `serverName__toolName`) or detect collisions and return a diagnostic.

### [9] shutdown() leaks store if disconnectAll() throws
- **File**: `packages/mcp-hub/src/mcp-hub.ts`:66
- **Category**: error-handling / resource-leak
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: If disconnectAll() throws, store.close() is never called. The SQLite database connection is leaked. Shutdown is a cleanup path where all resources must be released regardless of individual failures.
- **Suggestion**: Use try/finally to guarantee store cleanup: `async shutdown(): Promise<void> { try { await this.clientManager.disconnectAll() } finally { this.store.close() } }`.

### [10] Promise.all in disconnectAll() aborts remaining disconnects on failure
- **File**: `packages/mcp-hub/src/mcp-client-manager.ts`:36
- **Category**: error-handling / partial-failure
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: disconnectAll uses Promise.all for cleanup. If one client.close() rejects, the remaining disconnect promises may not complete. This leaves stale entries in the clients Map and potentially orphaned transports/processes.
- **Suggestion**: Replace with Promise.allSettled. Clear the clients Map after all attempts complete.

### [11] McpClientManager stores connection state only in memory Map
- **File**: `packages/mcp-hub/src/mcp-client-manager.ts`:11
- **Category**: architecture / in-memory-state
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The clients Map is the sole record of which servers are connected. On process crash or unexpected restart, this state is lost silently. After restart, there is no mechanism to detect stale stdio child processes that may still be running.
- **Suggestion**: (1) Add a startup routine that calls connectEnabled() automatically. (2) Consider persisting a 'last_connected_at' column. (3) Document that connection state is intentionally ephemeral and why.

## P2 - Medium (Consider)
### [12] McpClientManager.getTools() error path untested
- **File**: `packages/mcp-hub/src/__tests__/mcp-client-manager.test.ts`:94
- **Category**: test-quality / missing-error-path
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: McpClientManager.getTools() throws 'Server not connected' when called with an unknown server ID, but no test verifies this error path.
- **Suggestion**: Add a test: `it('throws when getting tools for non-connected server', () => { await expect(manager.getTools('non-existent')).rejects.toThrow('Server not connected') })`.

### [13] McpHub.connectServer() with invalid ID untested
- **File**: `packages/mcp-hub/src/__tests__/mcp-hub.test.ts`:31
- **Category**: test-quality / missing-error-path
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: McpHub.connectServer() throws 'MCP server not found' for non-existent IDs, but this error path has no test.
- **Suggestion**: Add test: `it('throws when connecting non-existent server', async () => { await expect(hub.connectServer('bad-id')).rejects.toThrow('MCP server not found') })`.

### [14] Near-identical sse/http cases in createTransport switch
- **File**: `packages/mcp-hub/src/transport-factory.ts`:22
- **Category**: simplification / near-duplicate-code
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: The 'sse' and 'http' cases are structurally identical. The only difference is the type literal string. Can be collapsed via fall-through case grouping.
- **Suggestion**: Use `case 'sse': case 'http': { ... }` with `config.transport` as the type value.

### [15] McpTransport union lacks common discriminant property
- **File**: `packages/mcp-hub/src/transport-factory.ts`:5
- **Category**: type-design / non-discriminated-union
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: The union mixes a class instance (no 'type' property) with two plain objects that have a 'type' discriminant, making it non-discriminated and requiring unsafe casts.
- **Suggestion**: Wrap all three variants with a consistent discriminant property.

### [16] rowToConfig crashes on malformed JSON in args/headers columns
- **File**: `packages/mcp-hub/src/server-store.ts`:174
- **Category**: error-handling / json-parse-crash
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: If the SQLite database contains malformed JSON, JSON.parse will throw an unhandled exception, making the entire store unusable.
- **Suggestion**: Wrap JSON.parse in a try-catch with context about which row and column failed.

### [17] No JSDoc on exported classes/functions (3 classes, 1 function)
- **File**: `packages/mcp-hub/src/index.ts`:1
- **Category**: comments / missing-documentation
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The package exports McpHub, McpClientManager, McpServerStore, and createTransport -- all without any JSDoc documentation.
- **Suggestion**: Add JSDoc to each exported class and its public methods. At minimum, document McpHub (the primary facade).

### [18] Duplicate url/command validation in store and transport factory
- **File**: `packages/mcp-hub/src/server-store.ts`:142
- **Category**: simplification / duplicate-validation
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: The same transport-specific validation is performed in both McpServerStore.validateInput and createTransport. If the rules evolve, both must be updated in lockstep.
- **Suggestion**: Extract a shared validateTransportConfig() function.

### [19] McpHub.updateServer() and getServer() have no tests
- **File**: `packages/mcp-hub/src/__tests__/mcp-hub.test.ts`:15
- **Category**: test-quality / missing-coverage
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: McpHub exposes updateServer() and getServer() as public API methods with no hub-level tests.
- **Suggestion**: Add hub-level tests for updateServer and getServer in mcp-hub.test.ts.

### [20] No Valibot schema validation at Imperative Shell boundary
- **File**: `packages/mcp-hub/src/server-store.ts`:39
- **Category**: type-design / no-boundary-validation
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: McpServerStore uses manual if-checks instead of the project-standard Valibot for boundary validation. Manual validation is incomplete and fragile.
- **Suggestion**: Define a Valibot schema for McpServerConfigInput and call v.parse() at the store boundary.

### [21] removeServer leaves store entry if disconnect throws
- **File**: `packages/mcp-hub/src/mcp-hub.ts`:33
- **Category**: error-handling / inconsistent-state
- **Confidence**: 82
- **Reported by**: review-errors
- **Description**: If clientManager.disconnect(id) throws, store.remove(id) is never reached. The server config remains in the database while the user intended to remove it.
- **Suggestion**: Use try/catch to handle disconnect failure gracefully, then always call store.remove(id).

### [22] Unsafe 'as' cast on DB row transport field bypasses type safety
- **File**: `packages/mcp-hub/src/server-store.ts`:174
- **Category**: type-design / unsafe-cast
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: McpServerRow.transport is cast to TransportType with 'as'. If the DB contains an invalid value, the cast silently produces an invalid config.
- **Suggestion**: Add a runtime guard: `function isTransportType(s: string): s is TransportType { return ['stdio', 'sse', 'http'].includes(s) }`.

### [23] No structured logging anywhere in the package
- **File**: `packages/mcp-hub/src/mcp-hub.ts`:1
- **Category**: architecture / missing-logging
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The entire mcp-hub package has zero logging. Server connections, disconnections, failures, tool aggregation, config changes -- none are logged.
- **Suggestion**: Inject @guiiai/logg via useLogg() pattern consistent with the rest of the monorepo.

### [24] update() skips transport-specific validation after merge
- **File**: `packages/mcp-hub/src/server-store.ts`:95
- **Category**: code-quality / update-validation-bypass
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The add() method validates, but update() merges without re-validating the result.
- **Suggestion**: Call this.validateInput(updated) after the merge in update().

### [25] aggregateTools/getTools return Record<string, unknown> losing all type info
- **File**: `packages/mcp-hub/src/mcp-client-manager.ts`:49
- **Category**: type-design / weak-return-type
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Both methods return Promise<Record<string, unknown>>, erasing all type information about MCP tool definitions.
- **Suggestion**: Use the return type from @ai-sdk/mcp's client.tools() directly or define a typed alias.

### [26] No JSDoc on exported interfaces defining the public contract
- **File**: `packages/mcp-hub/src/types.ts`:1
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: McpServerConfig and McpServerConfigInput have no JSDoc explaining conditionally-required fields.
- **Suggestion**: Add JSDoc to both interfaces, annotating transport-specific requirements.

### [27] connectEnabled() partial failure behavior untested
- **File**: `packages/mcp-hub/src/__tests__/mcp-hub.test.ts`:55
- **Category**: test-quality / missing-boundary
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: No test verifies the partial-failure scenario when one of multiple enabled servers fails to connect.
- **Suggestion**: Add a test with one valid and one invalid server to document the failure behavior.

### [28] Echo fixture ignores tool parameters -- tool invocation untested
- **File**: `packages/mcp-hub/src/__tests__/fixtures/echo-mcp-server.ts`:9
- **Category**: test-quality / fixture-quality
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: The fixture tools ignore input parameters and no test actually invokes a tool via callTool.
- **Suggestion**: Enhance the fixture to accept parameters and add a tool invocation test.

## P3 - Low (Optional)
### [29] Timestamp fields use bare 'number' (recurring primitive obsession)
- **File**: `packages/mcp-hub/src/types.ts`:12
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: createdAt and updatedAt are typed as bare 'number'. A branded type like 'EpochMs' would express intent. Severity lowered to P3 because this is a codebase-wide pattern.
- **Suggestion**: Define a branded type or add JSDoc annotation: `/** Unix epoch milliseconds */`.

### [30] Transport factory returns heterogeneous union type with plain objects
- **File**: `packages/mcp-hub/src/transport-factory.ts`:5
- **Category**: code-quality / type-safety
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The McpTransport type mixes a class instance with plain object literals. The plain objects lack 'start'/'close' methods. The cast on mcp-client-manager.ts:20 is a red flag.
- **Suggestion**: Verify whether @ai-sdk/mcp's createMCPClient accepts plain objects for SSE/HTTP and document accordingly.

### [31] Merge sse/http validation branches in validateInput
- **File**: `packages/mcp-hub/src/server-store.ts`:151
- **Category**: simplification / conditional-merge
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: Two consecutive if-statements check the same condition for two transport types that share the same requirement.
- **Suggestion**: Merge into: `if ((input.transport === 'sse' || input.transport === 'http') && !input.url) { throw new Error(...) }`.

### [32] All errors are generic Error -- no typed error hierarchy
- **File**: `packages/mcp-hub/src/server-store.ts`:98
- **Category**: error-handling / no-typed-errors
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: All error throws use plain `new Error(message)`. Callers cannot programmatically distinguish error types without parsing message strings.
- **Suggestion**: Create typed error classes (McpServerNotFoundError, McpTransportError, etc.) or use a Result type.

### [33] No test for duplicate server name behavior
- **File**: `packages/mcp-hub/src/__tests__/server-store.test.ts`:27
- **Category**: test-quality / missing-boundary
- **Confidence**: 75
- **Reported by**: review-tests
- **Description**: McpServerStore.add() does not enforce unique names, and no test documents whether this is intentional.
- **Suggestion**: Add a test that documents the expected behavior for duplicate names.

## Positive Observations
- Server config is persisted in SQLite (better-sqlite3 with WAL mode) rather than in memory -- follows the 12-factor stateless principle correctly
- Tests use real SQLite databases (temp files) and a real stdio MCP server fixture -- no mocks, no InMemoryRepository, no jest.fn(). Excellent adherence to testing rules
- The echo-mcp-server.ts test fixture is a real MCP server using @modelcontextprotocol/sdk, not a fake -- integration tests prove actual MCP protocol round-trip
- Clean separation of concerns: types.ts (domain), server-store.ts (persistence), transport-factory.ts (factory), mcp-client-manager.ts (connection lifecycle), mcp-hub.ts (facade)
- Parameterized queries throughout server-store.ts -- no SQL string concatenation
- Input validation in server-store.ts validateInput() catches transport-specific missing fields at the boundary
- Good test coverage: persistence across reconnect, boundary/invalid-input, and end-to-end lifecycle tests
- No forbidden comment patterns (TODO/FIXME/HACK/PLACEHOLDER) found in any file
- Zero mock violations in the test suite: real SQLite, real MCP server process, proper dev/prod parity
- All functions are short (< 40 lines), consistent early returns, maximum nesting depth of 2
- Constructor in McpServerStore properly cleans up DB on init failure with try/catch + close + re-throw
- Transport factory has exhaustive switch with default case for unknown transport types
- ServerStatus is a 2-value literal union rather than a boolean, enabling future states
- Separation of McpServerConfig (persisted) from McpServerConfigInput (creation) follows command/query separation

## Recommended Action Plan
1. Fix 1 P0 issue first: sanitize or allowlist commands in transport-factory.ts before they reach Experimental_StdioMCPTransport
2. Address 10 P1 issues in a single pass -- they cluster into 3 themes:
   - **Error handling** (5 findings): Replace Promise.all with Promise.allSettled in connectEnabled/disconnectAll, add try/finally to shutdown, add try/catch around JSON.parse in rowToConfig, add transport cleanup in connect()
   - **Type safety** (3 findings): Refactor McpServerConfig to discriminated union, add validation to update(), fix type system to prevent illegal states
   - **Integration** (2 findings): Wire mcp-hub into at least one consumer, document in-memory connection state design decision
3. Run `/ultra-review recheck` to verify
