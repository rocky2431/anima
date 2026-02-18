# Review Summary

**Session**: 20260219-011700-feat-task-11-integration-checkpoint-iter1-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 6 P1 findings exceed the threshold of 3 -- error handling gaps across all I/O boundaries and orphan code with no entry point wiring

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 6 |
| P2 Medium | 13 |
| P3 Low | 5 |
| **Total** | **24** (deduplicated from 24) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 6 | completed |
| review-tests | 3 | completed |
| review-errors | 4 | completed |
| review-types | 4 | completed |
| review-comments | 3 | completed |
| review-simplify | 4 | completed |

## P1 - High (Should Fix)
### [1] createAiOrchestrator is orphan code with no entry point wiring
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:66
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: createAiOrchestrator is exported but not imported by any entry point: no setup file (compare with createAnimaOrchestrator which has setup-orchestrator.ts), no DI registration via injeca, no IPC handler, no event listener. The only consumer is the test file. Grepping the entire apps/stage-tamagotchi/src tree and the full monorepo confirms zero non-test imports. This is dead-on-arrival code per the orphan detection rule.
- **Suggestion**: Create a setup-ai-orchestrator.ts (similar to setup-orchestrator.ts) that wires createAiOrchestrator into the Electron main process, registers it with injeca DI, and exposes it via IPC to the renderer. Without entry point wiring, this code cannot execute in production.

### [2] No logging in ai-orchestrator module (@guiiai/logg not used)
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:1
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The ai-orchestrator module has zero logging. @guiiai/logg is not imported. The sibling orchestrator.ts in the same directory uses useLogg for structured logging. Key operations that need logging: initialize() (MCP connection results, skills loaded count), generate() (LLM call start/finish, token usage, duration), shutdown() (cleanup status). Without logging, production debugging of MCP connection failures, LLM errors, or performance issues will be impossible.
- **Suggestion**: Add `import { useLogg } from '@guiiai/logg'` and create a logger: `const log = useLogg('ai-orchestrator').useGlobalConfig()`. Log at INFO level in initialize() (connected/failed counts), generate() (model ID, message count, token usage, duration_ms), and shutdown(). Log at ERROR level for failures.

### [3] generate() has no error handling around generateText LLM call
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:125
- **Category**: error-handling / missing-try-catch
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: The generateText() call performs an external LLM API request (network I/O) with zero error handling. This is the most critical I/O operation in the orchestrator. Network timeouts, rate limits, invalid API keys, model unavailability, and malformed responses will all produce raw, untyped exceptions that propagate to the caller with no context about what operation failed or what inputs were used.
- **Suggestion**: Wrap in try/catch. Catch operational errors (network, rate-limit, auth) and re-throw as a typed OrchestratorError with context. Include model ID, message count, and whether tools were provided. Consider distinguishing retryable (network timeout, rate limit) from non-retryable (auth, invalid model) errors.

### [4] initialize() uses Promise.all for independent I/O -- partial failure unhandled
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:80
- **Category**: error-handling / missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: initialize() runs mcpHub.connectEnabled() and skillRegistry.loadAll() via Promise.all(). If skillRegistry.loadAll() throws, Promise.all rejects immediately while mcpHub.connectEnabled() may still be running. The MCP connection result is lost, creating zombie connections with no reference for cleanup. No try/catch around the Promise.all means raw filesystem errors propagate without orchestrator context.
- **Suggestion**: Replace Promise.all with Promise.allSettled to handle each result independently. Inspect each result: if skills failed, include the error in InitResult (add a skillsError field) rather than throwing.

### [5] shutdown() does not protect against errors -- resources may leak
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:151
- **Category**: error-handling / missing-try-catch
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: shutdown() calls mcpHub.shutdown() without try/catch. If mcpHub.shutdown() throws, the error propagates raw. If future cleanup steps are added after mcpHub.shutdown(), an error from MCP shutdown would prevent them from running. The pattern should use try/finally to ensure all cleanup runs.
- **Suggestion**: Add try/catch with contextual error wrapping. If additional cleanup is added later, use try/finally to ensure all resources are released.

### [6] No error path tests for AiOrchestrator.initialize() failures
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:292
- **Category**: test-quality / missing-error-path
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The orchestrator's initialize() method handles MCP connection failures by returning them in mcpFailed, but no test verifies this failure path. No test for: (1) MCP server that fails to connect, (2) generateText throwing an error, (3) aggregateTools failing when no servers connected. Since this is the integration checkpoint, failure modes are critical to validate.
- **Suggestion**: Add integration tests for MCP server connection failures (invalid command), generate() error propagation (throwing model), and getTools() before initialize().

## P2 - Medium (Consider)
### [7] generate() has no error handling - raw errors propagate
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:121
- **Category**: error-handling / missing-error-context
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The generate() method calls generateText() with no try/catch. The sibling orchestrator.ts wraps operations in try/catch with errorHandler that adds context. This is an Imperative Shell boundary that should handle errors gracefully.
- **Suggestion**: Wrap the generateText call in try/catch. On failure, log the error with context (model ID, message count, system prompt length) and re-throw a typed error with context.

### [8] buildSystemPrompt() has hidden mutation - activates skills cumulatively
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:95
- **Category**: code-quality / hidden-side-effect
- **Confidence**: 88
- **Reported by**: review-code
- **Description**: buildSystemPrompt() mutates the SkillRegistry by calling activate() for each provided skill ID, but never deactivates previously activated skills. Calling buildSystemPrompt(['a']) then buildSystemPrompt(['b']) results in both being active. The method name suggests a pure builder/getter but actually mutates shared state.
- **Suggestion**: Either deactivate all skills before activating the requested ones, or separate concerns: make activate/deactivate explicit caller responsibilities and make buildSystemPrompt() purely read current state.

### [9] No config validation - empty paths produce confusing downstream errors
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:66
- **Category**: code-quality / missing-input-validation
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: AiOrchestratorConfig fields are not validated. An empty string for mcpDbPath creates an in-memory SQLite database (silent behavior change). Empty skills directories silently load zero skills.
- **Suggestion**: Add validation at the top of createAiOrchestrator. Consider using valibot (project standard) for schema validation.

### [10] Unsafe 'as' type casts bypass type safety in generate()
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:128
- **Category**: code-quality / unsafe-type-cast
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: Two `as` type casts force types into generateText(). The `tools` cast is particularly concerning: aggregateTools() returns Record<string, unknown> which is cast to the AI SDK's tool type.
- **Suggestion**: Define a proper return type from aggregateTools() that matches the AI SDK tool interface, or create a mapping function with runtime checks.

### [11] toolCalls/toolResults default to empty array -- hides missing data
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:136
- **Category**: error-handling / optional-chaining-hiding-errors
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: When result.toolCalls or result.toolResults are undefined/null, the code silently defaults to empty arrays. The caller cannot distinguish between 'no tool calls' and 'malformed response'.
- **Suggestion**: Log a warning when finishReason is 'tool-calls' but toolCalls is nullish.

### [12] Comment claims structure not verified by assertions
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:166
- **Category**: comments / misleading-comment
- **Confidence**: 82
- **Reported by**: review-comments
- **Description**: Comment states 'Tool should be a callable object with type and execute' but only assertion is `typeof tool === 'object'` which does not verify specific properties.
- **Suggestion**: Add assertions for 'type' and 'execute' properties, or update comment to match actual assertion.

### [13] AiOrchestrator exposes mcpHub and skillRegistry as public properties
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:47
- **Category**: type-design / encapsulation-leak
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The interface exposes mcpHub and skillRegistry as public readonly properties. While readonly prevents reassignment, it does not prevent calling mutating methods. Tests exploit this to bypass orchestrator methods. The sibling AnimaOrchestrator properly hides internals as closure variables.
- **Suggestion**: Remove from interface. Expose specific methods (addServer, activateSkill, getServerStatus). Keep as closure-scoped variables.

### [14] getTools() returns Record<string, unknown> -- propagates untyped tools
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:55
- **Category**: type-design / untyped-return
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: getTools() returns Record<string, unknown>, providing no type information. Forces unsafe casts downstream. AiOrchestrator is the integration surface and has the opportunity to define proper tool types.
- **Suggestion**: Import CoreTool from 'ai' package and use as return type: `getTools(): Promise<Record<string, CoreTool>>`.

### [15] Unsafe `as` casts in generate() bypass type safety
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:128
- **Category**: type-design / unsafe-cast
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Two unsafe casts indicate a gap between the orchestrator's own type definitions and the AI SDK's expected types.
- **Suggestion**: Use AI SDK's CoreMessage type directly in generate() signature. Fix getTools() return type to eliminate the tools cast.

### [16] No boundary tests for buildSystemPrompt with edge inputs
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:292
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: buildSystemPrompt() tested only with valid inputs. Missing: empty prompt, nonexistent skill IDs, pre-initialization calls.
- **Suggestion**: Add boundary condition tests for empty state and invalid inputs.

### [17] generate() not tested with empty messages or maxSteps edge values
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:329
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: generate() tested with single valid message only. Missing: empty messages array, maxSteps=0, maxSteps=1.
- **Suggestion**: Add boundary tests for generate() edge cases.

### [18] Test function exceeds 50 lines with inline model duplication
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:343
- **Category**: simplification / long-test-function
- **Confidence**: 82
- **Reported by**: review-simplify
- **Description**: Test function spans 71 lines with duplicated doStream implementation from createTestModel.
- **Suggestion**: Extend createTestModel to accept a doGenerate override, eliminating duplicated boilerplate.

### [19] doStream implementation duplicated in test file
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:382
- **Category**: simplification / near-duplicate-code
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: doStream block is a near-verbatim copy of createTestModel's implementation. Only textDelta and usage numbers differ.
- **Suggestion**: Consolidate by reusing createTestModel with a doGenerate override.

## P3 - Low (Optional)
### [20] Comment references transient SDK internals (v2 compat mode)
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:282
- **Category**: comments / rot-risk
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: 'v2 compat mode stores in steps' references SDK implementation details that will become stale.
- **Suggestion**: Simplify to: `// Verify tool calls are recorded in steps`.

### [21] Comment references internal dependency @ai-sdk/mcp
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.test.ts`:162
- **Category**: comments / leaky-abstraction
- **Confidence**: 76
- **Reported by**: review-comments
- **Description**: References '@ai-sdk/mcp' which is not a direct dependency of this test file.
- **Suggestion**: Reference the direct API: `// McpHub aggregated tools have a specific AI SDK-compatible structure`.

### [22] Magic number 5 as default maxSteps should be a named constant
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:130
- **Category**: simplification / magic-number
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: Default value 5 for maxSteps is not self-documenting.
- **Suggestion**: Extract to: `const DEFAULT_MAX_STEPS = 5`.

### [23] Double type assertion on messages and tools in generate()
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:128
- **Category**: simplification / type-assertion-simplification
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: Messages cast is redundant; tools cast uses complex Parameters extraction that could be simplified.
- **Suggestion**: Define `type AiSdkTools` alias, update getTools() return type, eliminate both inline casts.

### [24] GenerateResult.usage inner object fields lack readonly modifier
- **File**: `apps/stage-tamagotchi/src/main/services/anima/ai-orchestrator.ts`:34
- **Category**: type-design / readonly-consistency
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: Nested usage object properties are not readonly, allowing `result.usage.inputTokens = 999`.
- **Suggestion**: Add readonly: `{ readonly inputTokens: number | undefined, readonly outputTokens: number | undefined }`.

## Positive Observations
- Factory function pattern (createAiOrchestrator) follows the established Functional Core / Imperative Shell convention used by the sibling createAnimaOrchestrator
- Test file uses real MCP server fixture (echo-mcp-server.ts) and real SkillRegistry with real file system - excellent integration test pattern
- Test Double for LanguageModelV2 has proper rationale comment explaining why external LLM API cannot be used in tests
- Clean interface-first design: AiOrchestrator interface defined separately from implementation, enabling future alternative implementations
- End-to-end integration test exercises the full createAiOrchestrator -> initialize -> buildSystemPrompt -> getTools -> generate path
- Test verifies actual MCP tool names (echo, add) and skill content (warm, caring AI companion) - not just shape assertions
- Test Double rationale comments on both createTestModel and the inline model follow CLAUDE.md conventions perfectly
- JSDoc on AiOrchestratorConfig and AiOrchestrator interface is comprehensive and accurate
- No forbidden patterns (TODO, FIXME, HACK, XXX, PLACEHOLDER, TEMP) found in any changed file
- Real MCP server (echo-mcp-server.ts via stdio transport) is used for integration tests instead of mocking MCP connections - proper dev/prod parity
- Real SQLite databases created in temp directories for McpHub - no InMemoryRepository or mock DB
- Real SkillRegistry with real filesystem skills directory - tests prove actual SKILL.md loading works
- Test structure follows progressive integration: individual components tested first, then full orchestrator end-to-end
- Proper cleanup with afterEach removing temp directories and shutting down MCP hubs
- Good use of InitResult to surface per-server MCP connection failures (mcpFailed array) rather than throwing on first failure
- Error conversion in initialize(): String(f.error) safely converts unknown error types to strings
- Individual methods inside the orchestrator are short and focused (initialize: 15 lines, buildSystemPrompt: 21 lines, shutdown: 3 lines)
- Guard clause pattern used in buildSystemPrompt keeps nesting shallow at depth 2
- AiOrchestratorConfig uses readonly modifiers on all fields - good immutable config pattern
- InitResult and GenerateResult are well-structured readonly result types that avoid leaking implementation details

## Recommended Action Plan
1. Wire createAiOrchestrator to an entry point (setup-ai-orchestrator.ts with injeca DI + IPC) to resolve the orphan code P1
2. Add structured logging via @guiiai/logg to all I/O methods (initialize, generate, shutdown)
3. Add try/catch with contextual error wrapping to generate(), initialize() (switch to Promise.allSettled), and shutdown() -- these 3 P1s can be addressed in a single pass
4. Add error path tests for initialize() failures (invalid MCP server, skill loading failure)
5. Address the 13 P2 findings (type safety, encapsulation, boundary tests, code duplication) as follow-ups
6. Run `/ultra-review recheck` to verify
