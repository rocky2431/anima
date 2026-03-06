# Review Summary

**Session**: 20260218-020000-feat-task-3-screenshot-pipeline-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 1 P0 critical issue (silent error swallowing) and 8 P1 high-severity findings require attention before merge.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 1 |
| P1 High | 8 |
| P2 Medium | 11 |
| P3 Low | 2 |
| **Total** | **22** (deduplicated from 25) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 6 | completed |
| review-tests | 4 | completed |
| review-errors | 5 | completed |
| review-types | 4 | completed |
| review-comments | 3 | completed |
| review-simplify | 3 | completed |

## P0 - Critical (Must Fix)
### [1] Bare catch block silently swallows all errors in tick()
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:92
- **Category**: error-handling
- **Confidence**: 99
- **Reported by**: review-code, review-errors
- **Description**: The catch block in tick() has no error parameter binding -- the error object is completely discarded. No logging, no emission, no observability. Errors from screenshot capture, pHash computation, and VLM processing are all silently swallowed. The return value `false` is indistinguishable from a legitimate dedup skip, making it impossible for callers to differentiate between 'screenshot was similar' and 'VLM provider crashed'. The comment acknowledges logging is needed but defers it. This violates multiple CLAUDE.md forbidden patterns: `catch (e) {}` (silent swallow hides bugs) and `catch (e) { return null }` (converts error to invalid state).
- **Suggestion**: Accept a structured logger (e.g., @guiiai/logg) via ScreenshotPipelineOptions and add an onError callback. Bind the error parameter. Log at WARN level with context (which stage failed, timestamp). Return a discriminated union: `Promise<{ status: 'processed', context: ProcessedScreenshotContext } | { status: 'skipped' } | { status: 'error', error: Error }>` instead of a boolean, so callers can observe failures and distinguish dedup from error.

## P1 - High (Should Fix)
### [2] Silent catch in tick() has no test and swallows all errors
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:91
- **Category**: test-quality
- **Confidence**: 95
- **Reported by**: review-tests
- **Description**: There is no test in screenshot-pipeline.test.ts that verifies error behavior: what happens when screenshotProvider.capture() throws, when computePHash throws on corrupt data, or when vlmProvider.describeImage() throws. A caller receiving false cannot distinguish 'deduped' from 'crashed'. Each failure mode should have explicit test coverage.
- **Suggestion**: Add tests for each failure mode: (a) screenshotProvider.capture() rejects, (b) corrupt image causes computePHash to fail, (c) vlmProvider.describeImage() rejects. Verify tick() returns the expected result (or a typed result that distinguishes dedup from error). Consider returning a discriminated union like { status: 'processed' | 'deduped' | 'error', error?: Error }.

### [3] Comment says 'log and continue' but code silently swallows errors
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:93
- **Category**: comments
- **Confidence**: 95
- **Reported by**: review-comments
- **Description**: The comment states 'log and continue on next tick' but the catch block does not log anything -- it silently swallows the error and returns false. A future maintainer reading this comment would believe errors are being logged somewhere. The second line 'In production, this would use a structured logger' is a disguised TODO, which is a forbidden pattern (code should be complete or not committed).
- **Suggestion**: Either add actual logging (e.g., using @guiiai/logg structured logger) and keep the comment, or change the comment to accurately describe the current behavior. Better yet, inject a logger and actually log the error with context. Remove the aspirational 'In production...' comment -- either implement it now or track it in the task system.

### [4] ScreenshotPipeline exported but not consumed by any entry point
- **File**: packages/context-engine/src/index.ts:7
- **Category**: integration
- **Confidence**: 92
- **Reported by**: review-code
- **Description**: ScreenshotPipeline, ScreenshotProcessor, VlmProvider, and ProcessedScreenshotContext are exported from the package but have zero consumers outside of test files. The existing app integration at apps/stage-tamagotchi/src/main/services/anima/context-engine.ts still only uses ScreenshotCapture directly -- it was not updated to use the new pipeline. This is a horizontal-only change that adds library code without wiring it to any live path.
- **Suggestion**: Update apps/stage-tamagotchi/src/main/services/anima/context-engine.ts (or the appropriate entry point) to instantiate ScreenshotPipeline with an ElectronScreenshotProvider and a concrete VlmProvider. Wire start()/stop() to the app lifecycle. This proves the vertical slice: Electron capture -> pHash dedup -> VLM understanding -> context emission.

### [5] ScreenshotProcessor error wrapping test does not verify cause chain
- **File**: packages/context-engine/src/__tests__/screenshot-processor.test.ts:82
- **Category**: test-quality
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The error wrapping test verifies the outer error message but does not verify the error cause chain. The ScreenshotProcessor uses `new Error('Screenshot processing failed', { cause: error })` which preserves the original error. Without this assertion, a regression that drops the cause would not be caught.
- **Suggestion**: Add cause chain verification using `.rejects.toSatisfy()` to check that `error.cause instanceof Error && error.cause.message === 'API rate limit exceeded'`.

### [6] Test helper JSDoc incorrectly claims different colors produce different hashes
- **File**: packages/context-engine/src/__tests__/phash.test.ts:7
- **Category**: comments
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: The JSDoc states 'Different colors produce visually different images -> different hashes' but this is factually wrong for perceptual hashing. The same test file explicitly acknowledges at line 59 that solid-color images all produce the same pHash. This comment directly contradicts the known behavior documented elsewhere in the same file.
- **Suggestion**: Fix the JSDoc: '/** Create a solid-color PNG buffer for testing. Note: all solid-color images produce the same pHash (all pixels equal mean -> all bits 1). Use images with different spatial patterns to get distinct hashes. */'

### [7] lastHash dedup state stored only in memory, not persisted
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:30
- **Category**: architecture
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The pipeline's dedup state (lastHash) lives only in memory. If the Electron main process restarts, the hash is lost and the next capture sends a potentially identical screenshot through the VLM again (wasting API cost). Per CLAUDE.md: 'Business state in memory' is a forbidden pattern.
- **Suggestion**: Accept an optional persistence adapter (e.g., { loadLastHash(): Promise<string|null>, saveLastHash(hash: string): Promise<void> }) in ScreenshotPipelineOptions. The package already depends on better-sqlite3.

### [8] Fire-and-forget async calls to tick() in start()
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:50
- **Category**: error-handling
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: The `void this.tick()` calls are fire-and-forget async invocations. Combined with the catch-all-swallow, this creates a completely opaque system. If the first tick() fails (e.g., provider is misconfigured), the pipeline silently starts in an error state.
- **Suggestion**: For the initial tick, consider awaiting or chaining: `this.tick().catch(err => this.onError?.(err))`. Alternatively, make start() async and await the first tick to surface immediate configuration errors.

### [9] computePHash accepts any Buffer with no validation
- **File**: packages/context-engine/src/capture/phash.ts:15
- **Category**: code-quality
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: computePHash is a public API that accepts any Buffer and passes it directly to sharp. An empty buffer (which Electron desktopCapturer returns on permission failure) will cause sharp to throw an opaque native error. Input validation is required at this boundary.
- **Suggestion**: Add a guard: `if (!imageBuffer || imageBuffer.length === 0) throw new Error('computePHash: imageBuffer is empty or undefined')`.

## P2 - Medium (Consider)
### [10] VlmResult.activity typed as bare string instead of union
- **File**: packages/context-engine/src/types.ts:66
- **Category**: type-design
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: The `activity` field is documented as a category with known values ('coding', 'browsing', 'writing') but typed as bare `string`. Primitive obsession -- the type system cannot prevent invalid activity strings.
- **Suggestion**: Define `export type ActivityCategory = 'coding' | 'browsing' | 'writing' | 'reading' | 'communicating' | 'other'` and use it for the `activity` field.

### [11] Near-duplicate split-image pixel buffer generation across test files
- **File**: packages/context-engine/src/__tests__/screenshot-pipeline.test.ts:17
- **Category**: simplification
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: Horizontal-split and vertical-split image generation (~30 lines each) is duplicated between phash.test.ts and screenshot-pipeline.test.ts.
- **Suggestion**: Extract to shared fixture: `__tests__/fixtures/test-images.ts` with `createHorizontalSplitPng()` and `createVerticalSplitPng()`.

### [12] StubVlmProvider duplicated across two test files
- **File**: packages/context-engine/src/__tests__/screenshot-pipeline.test.ts:70
- **Category**: simplification
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: StubVlmProvider is defined in both screenshot-processor.test.ts and screenshot-pipeline.test.ts with slightly different implementations.
- **Suggestion**: Merge into a single configurable stub in `__tests__/fixtures/stub-vlm-provider.ts`.

### [13] ProcessedScreenshotContext.hash is bare string, not branded
- **File**: packages/context-engine/src/types.ts:83
- **Category**: type-design
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The `hash` field represents a 64-character binary string but is typed as bare `string`. A branded type would prevent accidental misuse.
- **Suggestion**: Define `export type PHash = string & { readonly __brand: 'PHash' }` or at minimum a type alias.

### [14] computePHash not tested with invalid/corrupt image buffer
- **File**: packages/context-engine/src/__tests__/phash.test.ts:29
- **Category**: test-quality
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: No test for invalid input: empty buffer, non-image buffer, or truncated PNG. The error contract is undocumented.
- **Suggestion**: Add boundary tests for `Buffer.alloc(0)` and `Buffer.from('not-an-image')`.

### [15] onContext callback errors silently swallowed by catch-all
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:89
- **Category**: error-handling
- **Confidence**: 82
- **Reported by**: review-errors
- **Description**: The `onContext` callback is invoked inside the try block. If the consumer's callback throws, the error is silently swallowed. The successful screenshot result is lost.
- **Suggestion**: Move the onContext call outside the try/catch, or wrap it in its own try/catch with explicit error reporting.

### [16] Concurrent tick() calls can cause race in dedup state
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:72
- **Category**: architecture
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: If a tick takes longer than intervalMs, two ticks run concurrently, both reading the same lastHash and both calling the VLM -- defeating dedup and doubling API costs.
- **Suggestion**: Add a mutex guard: `private ticking = false` with check-and-set at top of tick() and reset in finally block.

### [17] ScreenshotPipeline accepts unvalidated numeric options
- **File**: packages/context-engine/src/capture/screenshot-pipeline.ts:32
- **Category**: type-design
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Constructor does not validate that intervalMs and similarityThreshold are positive. An intervalMs of 0 would create a tight loop.
- **Suggestion**: Add validation: `if (this.intervalMs <= 0) throw new Error('intervalMs must be positive')`.

### [18] hammingDistance not tested with empty strings
- **File**: packages/context-engine/src/__tests__/phash.test.ts:108
- **Category**: test-quality
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: Empty string boundary not tested. Error test does not verify the error message content.
- **Suggestion**: Add `expect(hammingDistance('', '')).toBe(0)` and verify error message in throw test.

### [19] No VlmProvider implementation exists anywhere in the codebase
- **File**: packages/context-engine/src/types.ts:53
- **Category**: integration
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: VlmProvider is an interface with no concrete implementation. Without one, ScreenshotPipeline cannot be instantiated in any app. Walking skeleton requires end-to-end flow with real data.
- **Suggestion**: Create a concrete XsaiVlmProvider wrapping xsAI's vision model API.

### [20] Error messages lack input context for debugging
- **File**: packages/context-engine/src/processing/screenshot-processor.ts:40
- **Category**: error-handling
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: 'Screenshot processing failed' lacks context about buffer size, provider, or correlation ID.
- **Suggestion**: Include context: `throw new Error(\`Screenshot processing failed (buffer=${screenshot.buffer.length} bytes, ts=${screenshot.timestamp})\`, { cause: error })`.

## P3 - Low (Optional)
### [21] Magic number 5 for default pHash similarity threshold
- **File**: packages/context-engine/src/capture/phash.ts:67
- **Category**: simplification
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: Default threshold of 5 is a magic number repeated in two files.
- **Suggestion**: Extract to `export const DEFAULT_SIMILARITY_THRESHOLD = 5` and import in both files.

### [22] ScreenshotUnderstanding duplicates ProcessedScreenshotContext fields
- **File**: packages/context-engine/src/processing/screenshot-processor.ts:6
- **Category**: type-design
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: Same fields as ProcessedScreenshotContext minus `hash`. Manual sync burden.
- **Suggestion**: Replace with `export type ScreenshotUnderstanding = Omit<ProcessedScreenshotContext, 'hash'>`.

## Positive Observations
- Clean separation of concerns: phash (pure function), ScreenshotProcessor (single responsibility VLM wrapper), and ScreenshotPipeline (orchestrator) follow Functional Core / Imperative Shell architecture well
- Well-defined TypeScript interfaces (ScreenshotProvider, VlmProvider) enable dependency inversion at boundaries
- Test doubles correctly use '// Test Double rationale:' comments per CLAUDE.md, implementing the actual interface rather than jest.fn()
- pHash tests are exemplary Functional Core unit tests: real sharp library for image creation, pure input/output verification, no mocks
- Error wrapping in ScreenshotProcessor.process() includes cause chain for debuggability
- Pipeline tests exercise the real dedup logic through actual pHash computation (not mocked), testing collaboration between capture -> phash -> processor
- All source files well within size limits (largest is 109 lines); functions are short with clear single responsibilities; maximum nesting depth is 2 levels
- Guard clauses and early returns used consistently (start() returns early if timer exists, hammingDistance throws early on length mismatch)
- Pure functions in phash.ts correctly belong to the Functional Core with no class wrappers
- Named constant HASH_SIZE = 8 demonstrates good naming practice over magic numbers
- ScreenshotPipeline has good encapsulation with all fields private and controlled mutation through methods
- JSDoc comments on all exported interfaces and functions follow project conventions consistently
- Algorithm description in computePHash JSDoc accurately matches the 3-step implementation
- Interface JSDoc comments in types.ts explain 'why' rather than restating type signatures
- ScreenshotCapture.capture() and ScreenshotProcessor.process() both use { cause: error } for error chaining

## Recommended Action Plan
1. Fix 1 P0 issue first: replace the bare catch block in tick() with proper error binding, logging via structured logger, and an onError callback. Consider returning a discriminated union instead of boolean.
2. Address 8 P1 issues in a single pass -- many are interconnected:
   - Items [2], [3], [8] all relate to the same catch block and error observability; fixing [1] addresses them together
   - Items [4], [19] are the integration/orphan issues: wire ScreenshotPipeline to an entry point with a real VlmProvider
   - Items [5], [6], [9] are targeted fixes (cause chain test, JSDoc correction, input validation)
   - Item [7] (persisted dedup state) can be a persistence adapter with SQLite
3. Run `/ultra-review recheck` to verify all P0 and P1 issues are resolved
