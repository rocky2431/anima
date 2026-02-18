# Review Summary

**Session**: 20260218-111046-feat-task-8-ai-sdk-migration-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 1 P0 critical finding (untested critical path) and 9 P1 findings exceed thresholds

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 1 |
| P1 High | 9 |
| P2 Medium | 11 |
| P3 Low | 5 |
| **Total** | **26** (deduplicated from 27) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 6 | completed |
| review-comments | 3 | completed |
| review-errors | 5 | completed |
| review-simplify | 4 | completed |
| review-tests | 5 | completed |
| review-types | 4 | completed |

## P0 - Critical (Must Fix)
### [1] streamFromAiSdk: 94 lines of new streaming logic with zero tests
- **File**: `packages/stage-ui/src/stores/llm.ts`:121
- **Category**: test-quality / missing-test-critical-path
- **Confidence**: 97
- **Reported by**: review-tests
- **Description**: The new streamFromAiSdk function is the entire point of this feature (AI SDK migration) and contains complex logic: chunk type dispatching (text-delta, tool-call, tool-result), promise settlement with resolveOnce/rejectOnce, finish reason mapping (note: AI SDK uses 'tool-calls' with a hyphen vs xsAI's 'tool_calls' with underscore), error propagation via onError callback, and a fallback resolution via result.text promise. None of this is tested. This is the critical path for the feature -- if it doesn't work, the entire AI SDK migration is broken.
- **Suggestion**: Add integration tests for streamFromAiSdk that verify: (1) text-delta chunks are forwarded correctly via onStreamEvent, (2) tool-call chunks are converted with JSON.stringify(chunk.input) for args, (3) tool-result chunks forward toolCallId and output, (4) finishReason 'tool-calls' with waitForTools=true does NOT resolve the promise, (5) error propagation via onError rejects the promise, (6) the result.text fallback resolution works when onFinish does not fire.

## P1 - High (Should Fix)
### [2] onError handler missing try/catch around onStreamEvent callback
- **File**: `packages/stage-ui/src/stores/llm.ts`:181
- **Category**: error-handling / inconsistent-error-wrapping
- **Confidence**: 95
- **Reported by**: review-code, review-errors
- **Description**: The onError handler in streamFromAiSdk calls `options?.onStreamEvent?.(...)` without a try/catch, unlike the onChunk and onFinish handlers which both wrap their onStreamEvent calls in try/catch. If the onStreamEvent callback throws, `rejectOnce(error)` is never reached -- the wrapping Promise hangs forever.
- **Suggestion**: Wrap the onError handler body in try/catch consistent with onChunk and onFinish.

### [3] useAiSdk flag stored but never passed to llmStore.stream()
- **File**: `packages/stage-ui/src/stores/modules/consciousness.ts`:15
- **Category**: integration / orphan-wiring
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The consciousness store exposes a `useAiSdk` boolean setting, and the LLM store accepts `useAiSdk?: boolean` in StreamOptions to branch between xsAI and AI SDK streaming. However, the primary caller in chat.ts does NOT pass `useAiSdk` in the options object. The user can toggle the setting in the UI, but it has zero effect -- the AI SDK path is unreachable.
- **Suggestion**: In `packages/stage-ui/src/stores/chat.ts` where llmStore.stream() is called, read the consciousness store's useAiSdk value and pass it as `useAiSdk: consciousnessStore.useAiSdk` in the StreamOptions.

### [4] StreamEvent 'finish' variant uses `& any`, destroying type safety
- **File**: `packages/stage-ui/src/stores/llm.ts`:15
- **Category**: type-design / invariant-expression
- **Confidence**: 95
- **Reported by**: review-types
- **Description**: The StreamEvent discriminated union has `{ type: 'finish' } & any` for its finish variant. Intersecting with `any` erases all type information -- the compiler will accept any property access on finish events without error. The new streamFromAiSdk function relies on this type, so the unsafety propagates into the new code.
- **Suggestion**: Replace `({ type: 'finish' } & any)` with a properly typed variant: `{ type: 'finish', finishReason: string }`.

### [5] stream() useAiSdk branch routing is untested
- **File**: `packages/stage-ui/src/stores/llm.ts`:278
- **Category**: test-quality / missing-test-routing-logic
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The stream() method now branches between streamFrom and streamFromAiSdk based on the useAiSdk flag. No test verifies that useAiSdk:true routes to the AI SDK path or that useAiSdk:false/undefined continues using xsAI.
- **Suggestion**: Add integration tests verifying both routing paths with a real or environment-gated endpoint.

### [6] models() silently converts URL error to empty array
- **File**: `packages/stage-ui/src/stores/llm.ts`:297
- **Category**: error-handling / error-as-valid-state
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: When listModels fails due to an invalid URL, the error is caught and an empty array is returned. This makes it impossible for callers to distinguish between 'no models available' and 'configuration error'.
- **Suggestion**: At minimum, log a warning with the invalid URL so operators can diagnose configuration issues.

### [7] resolveXsaiTools extracted function lacks dedicated tests
- **File**: `packages/stage-ui/src/stores/llm.ts`:102
- **Category**: test-quality / missing-test-new-code
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: resolveXsaiTools was extracted from inline streamFrom logic and is now shared by both streaming paths. It has branching logic but no test exercises this function directly.
- **Suggestion**: Test resolveXsaiTools behavior: returns undefined when supportsTools is false, returns merged tools array when true, handles tools as async function, handles tools as direct array, handles undefined tools option.

### [8] consciousness store useAiSdk state has no test coverage
- **File**: `packages/stage-ui/src/stores/modules/consciousness.ts`:15
- **Category**: test-quality / missing-test-new-state
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: A new useAiSdk boolean state was added to the consciousness store. No test file exists for the consciousness store at all. The state's default value, localStorage persistence key, and store exposure are all untested.
- **Suggestion**: Create `packages/stage-ui/src/stores/modules/consciousness.test.ts` testing default value, localStorage key, and store exposure.

### [9] Message type cast between xsAI and AI SDK may lose/corrupt data
- **File**: `packages/stage-ui/src/stores/llm.ts`:142
- **Category**: architecture / message-contract-mismatch
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The xsAI Message type is cast to AI SDK's ModelMessage[] via `as unknown as` double-cast. The two SDK message formats have structural differences (role enum, content parts schema, tool result encoding) that can cause silent data corruption or runtime errors.
- **Suggestion**: Create an explicit `convertXsaiMessagesToAiSdk()` adapter function that maps each message role and content format correctly, with unit tests for edge cases.

### [10] resolveXsaiTools I/O calls (mcp/debug) lack error wrapping
- **File**: `packages/stage-ui/src/stores/llm.ts`:114
- **Category**: error-handling / missing-error-context
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: The resolveXsaiTools function calls three async I/O operations without any try/catch or error wrapping. If mcp() or debug() fails, the raw error propagates without context about which tool source failed.
- **Suggestion**: Wrap tool source calls in try/catch and throw with context: `throw new Error('Failed to resolve tools for model ${model}', { cause: err })`.

## P2 - Medium (Consider)
### [11] waitForTools comment only describes xsAI finish reason string
- **File**: `packages/stage-ui/src/stores/llm.ts`:26
- **Category**: comments / incomplete-documentation
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: The inline comment states the finish reason string is 'tool_calls' (underscore), but the AI SDK path uses 'tool-calls' (hyphen). The comment is incomplete and misleading for the AI SDK path.
- **Suggestion**: Update comment to reflect both variants.

### [12] Duplicate settled/resolveOnce/rejectOnce pattern across stream functions
- **File**: `packages/stage-ui/src/stores/llm.ts`:134
- **Category**: simplification / near-duplicate-code
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: The settled/resolveOnce/rejectOnce pattern appears identically in both streamFrom and streamFromAiSdk (~10 lines of identical logic).
- **Suggestion**: Extract a `createSettledPromise()` utility returning `{ promise, resolveOnce, rejectOnce }`.

### [13] streamFromAiSdk exceeds 50-line threshold at 73 lines
- **File**: `packages/stage-ui/src/stores/llm.ts`:121
- **Category**: simplification / function-length
- **Confidence**: 88
- **Reported by**: review-simplify
- **Description**: streamFromAiSdk is 73 lines with 4-level nesting. Handles three concerns: model/tool setup, promise settling, and streaming event mapping.
- **Suggestion**: Extract a `createAiSdkChunkHandler` function for the onChunk callback to reduce to ~40 lines.

### [14] API key and baseURL fall back to empty string silently
- **File**: `packages/stage-ui/src/stores/llm.ts`:124
- **Category**: code-quality / security-sensitive-fallback
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: If chatConfig.baseURL or chatConfig.apiKey are undefined/null, they silently default to empty strings, causing malformed URLs or generic 401 errors that are hard to debug.
- **Suggestion**: Add fail-fast validation before creating the model.

### [15] AiSdkModelConfig.provider is bare `string` instead of literal union
- **File**: `packages/stage-ui/src/composables/use-ai-sdk.ts`:13
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The `provider` field is typed as `string | undefined` but only 'anthropic' and everything-else are meaningful. Typos like `'gooogle'` compile silently.
- **Suggestion**: Type as `provider?: 'anthropic' | 'openai'`.

### [16] onChunk callback has 4-level nesting with if/else if chain
- **File**: `packages/stage-ui/src/stores/llm.ts`:145
- **Category**: simplification / deep-nesting
- **Confidence**: 82
- **Reported by**: review-simplify
- **Description**: The onChunk handler uses an if/else if chain to dispatch on chunk.type at 4 levels of nesting.
- **Suggestion**: Replace else-if chain with guard clauses using early returns.

### [17] No integration test proving AI SDK stream path works end-to-end
- **File**: `packages/stage-ui/src/composables/use-ai-sdk.test.ts`:1
- **Category**: integration / boundary-without-integration-test
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The test file covers tool conversion and model creation but no integration test proves streamFromAiSdk works with a real or test-double AI SDK provider.
- **Suggestion**: Add at least one integration test for streamFromAiSdk using a Test Double AI SDK provider with documented rationale.

### [18] createAiSdkModel accepts empty baseURL/apiKey without validation
- **File**: `packages/stage-ui/src/stores/llm.ts`:123
- **Category**: error-handling / silent-invalid-config
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: Empty strings from null/undefined chatConfig values are passed to createAiSdkModel. This defers failure to network calls with confusing error messages.
- **Suggestion**: Add early validation: `if (!config.baseURL || !config.apiKey) throw new Error(...)`.

### [19] Multiple `as unknown as` casts bypass type system at SDK boundary
- **File**: `packages/stage-ui/src/stores/llm.ts`:122
- **Category**: type-design / type-cast-safety
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Three unsafe double-casts (`as unknown as X`) bridge between xsAI and AI SDK types. If either SDK changes types, these casts silently produce runtime errors.
- **Suggestion**: Create typed adapter functions with Valibot validation rather than casting.

### [20] streamFromAiSdk fallback resolution lacks error context
- **File**: `packages/stage-ui/src/stores/llm.ts`:188
- **Category**: error-handling / missing-error-context
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: The fallback `Promise.resolve(result.text).then(...).catch(rejectOnce)` passes errors to rejectOnce without context about the fallback path.
- **Suggestion**: Wrap: `catch(err => rejectOnce(new Error('AI SDK stream text resolution failed', { cause: err })))`.

### [21] use-ai-sdk.test.ts missing error/edge case tests for createAiSdkModel
- **File**: `packages/stage-ui/src/composables/use-ai-sdk.test.ts`:116
- **Category**: test-quality / boundary-condition-missing
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: createAiSdkModel tests cover happy paths but miss boundary conditions: empty baseURL, empty apiKey, unknown provider string, trailing slash edge cases.
- **Suggestion**: Add edge case tests for empty inputs, unknown provider string, and trailing slash normalization.

## P3 - Low (Optional)
### [22] JSDoc references 'AI SDK 6' version that will rot
- **File**: `packages/stage-ui/src/composables/use-ai-sdk.ts`:18
- **Category**: comments / version-pinning-rot
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Both JSDoc comments reference 'AI SDK 6' by major version number that will become stale.
- **Suggestion**: Replace 'AI SDK 6' with 'AI SDK' (unversioned).

### [23] Exported interface AiSdkModelConfig lacks JSDoc
- **File**: `packages/stage-ui/src/composables/use-ai-sdk.ts`:8
- **Category**: comments / missing-jsdoc
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: The exported AiSdkModelConfig interface has no JSDoc comment. The 'provider' field especially deserves documentation.
- **Suggestion**: Add JSDoc describing the config shape and documenting the 'provider' field behavior.

### [24] streamFrom marginally exceeds 50-line threshold at 52 lines
- **File**: `packages/stage-ui/src/stores/llm.ts`:48
- **Category**: simplification / function-length
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: streamFrom is 52 lines, just over the guideline. Would be resolved by extracting the settled-promise utility.
- **Suggestion**: Extract settled promise pattern from finding [12].

### [25] StreamOptions.useAiSdk boolean flag controls code path dispatch
- **File**: `packages/stage-ui/src/stores/llm.ts`:28
- **Category**: type-design / boolean-flag-dispatch
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: Boolean flag dispatch between two streaming implementations is a mild type design smell, though pragmatically reasonable for migration.
- **Suggestion**: Consider separate entry points or document the flag's intended removal timeline.

### [26] Provider detection in createAiSdkModel uses only string match
- **File**: `packages/stage-ui/src/composables/use-ai-sdk.ts`:57
- **Category**: code-quality / provider-detection-heuristic
- **Confidence**: 75
- **Reported by**: review-code
- **Description**: Simple string equality check for provider detection works for two providers but will need extension.
- **Suggestion**: Consider a provider registry pattern when a third provider is needed.

## Positive Observations
- Clean adapter pattern: convertXsaiToolsToAiSdk is a pure function with no side effects, well-documented, and thoroughly unit tested with 6 test cases covering edge cases.
- Feature flag approach: useAiSdk is gated behind a localStorage setting defaulting to false, making the migration opt-in and safe to ship incrementally.
- Consistent promise settlement pattern: Both streamFrom and streamFromAiSdk use the settled/resolveOnce/rejectOnce guard pattern to prevent double resolution.
- Good refactoring: resolveXsaiTools was extracted as a shared helper, eliminating duplication between the two streaming paths.
- Catalog-based dependency management: AI SDK packages added via pnpm catalog with pinned versions ensures consistency across the monorepo.
- Three TODO/FIXME comments were removed and replaced with proper descriptive comments (sanitizeMessages, tool incompatibility errors, tools parameter).
- The defensive comment on line 187 explains a non-obvious fallback mechanism -- a good 'why' comment that will help future maintainers.
- use-ai-sdk.test.ts uses direct instantiation with real xsaiTool() objects -- no mocks, no fakes, proper Functional Core testing.
- No mock violations detected in the test file (no jest.fn, vi.fn, vi.mock, InMemory*, Mock*, Fake* patterns).
- Test file uses real xsAI tool() builder with zod schemas, proving the actual conversion pipeline works end-to-end.
- Guard clause pattern used effectively in createAiSdkModel (early return for anthropic provider).
- consciousness.ts change is minimal and clean -- a single reactive ref addition with no complexity increase.
- The sanitizeMessages function is short, pure, and well-commented.
- AiSdkModelConfig interface cleanly separates the configuration concerns from the model creation logic.
- The settled flag pattern (let settled = false) is a well-implemented guard against race conditions in promise resolution.
- onChunk and onFinish handlers correctly wrap onStreamEvent callbacks in try/catch, forwarding errors to rejectOnce.

## Recommended Action Plan
1. Fix 1 P0 issue first: add tests for streamFromAiSdk (the entire feature's critical path)
2. Fix the orphan-wiring P1 [3]: wire useAiSdk from consciousness store to chat.ts caller -- without this the feature is unreachable
3. Fix the promise-hang P1 [2]: add try/catch to onError handler -- this is a 3-line fix that prevents infinite hangs
4. Fix the type-safety P1 [4]: replace `& any` on StreamEvent finish variant
5. Address the message-contract P1 [9]: create explicit adapter instead of double-cast -- prevents silent data corruption
6. Add remaining test coverage for P1 findings [5], [7], [8]
7. Address remaining P1 error-handling findings [6], [10] in a single pass
8. Run `/ultra-review recheck` to verify
