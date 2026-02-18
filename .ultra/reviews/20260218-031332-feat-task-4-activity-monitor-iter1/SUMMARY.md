# Review Summary

**Session**: 20260218-031332-feat-task-4-activity-monitor-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 6 P1 findings exceed the threshold of 3; critical issues in error handling, integration wiring, and state persistence must be addressed.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 6 |
| P2 Medium | 8 |
| P3 Low | 5 |
| **Total** | **19** (deduplicated from 21) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 5 | completed |
| review-tests | 4 | completed |
| review-errors | 3 (merged to 1) | completed |
| review-types | 4 | completed |
| review-comments | 3 | completed |
| review-simplify | 2 | completed |

## P1 - High (Should Fix)

### [F01] Business state stored only in memory without persistence
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:25
- **Category**: forbidden-pattern
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: ActivityMonitor stores all activity events, screenshot context, and timer state in closure-scoped private fields. On Electron process restart, all accumulated context is lost. Per CLAUDE.md forbidden patterns: 'Business state in memory -> Persist to DB' and twelve-factor principle #6 (Stateless): 'Critical state persisted (DB/KV/Event Store); restart-safe'. The events array is the core business state that drives context emission -- losing it silently degrades the AI character's awareness without any observable failure.
- **Suggestion**: Persist events to SQLite (DocumentStore already exists in this package) or at minimum to a file-backed store. On startup, rehydrate from persistent storage. If persistence is deferred, add a clear comment referencing the follow-up task and ensure the onContext callback downstream persists the ProcessedContext output.

```typescript
private events: ActivityEvent[] = []
private timer: ReturnType<typeof setInterval> | null = null
private screenshotContext: ProcessedScreenshotContext | undefined
```

### [F02] Error silently swallowed when onError callback is not provided; error message lacks diagnostic context; tick() returns success on failure
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:93
- **Category**: error-handling
- **Confidence**: 92
- **Reported by**: review-errors (merged from 3 findings)
- **Description**: When the onContext callback throws and no onError handler is configured, the optional chaining `this.onError?.(error)` silently discards the error. The caller has no way to know that context delivery failed. Additionally, the wrapped error message 'ActivityMonitor tick failed' does not include any context about the state when the failure occurred (number of events, current app, screenshot presence). Furthermore, tick() returns the ProcessedContext as if delivery succeeded even when onContext throws, creating an ambiguous contract for manual callers.
- **Suggestion**: Either (1) make onError required in ActivityMonitorOptions so callers must handle errors, or (2) add a fallback: `if (this.onError) { this.onError(error) } else { throw error }` so errors propagate when no handler is registered, or (3) emit a warning via console.warn as a last-resort fallback. Include diagnostic context in the error: `new Error(\`ActivityMonitor tick failed (events=${this.events.length}, app=${state.activity.currentApp}, hasScreenshot=${!!this.screenshotContext})\`, { cause })`. Consider returning a Result type or documenting the return-on-failure behavior.

```typescript
try {
  this.onContext?.(context)
}
catch (cause) {
  const error = new Error('ActivityMonitor tick failed', { cause })
  this.onError?.(error)
}

return context
```

### [F03] ActivityMonitor exported but not wired to any entry point
- **File**: `packages/context-engine/src/index.ts`:5
- **Category**: integration
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: ActivityMonitor is exported from the package barrel but not instantiated or wired anywhere in the application. The Electron app's setupContextEngine() in `apps/stage-tamagotchi/src/main/services/anima/context-engine.ts` only creates a ScreenshotCapture instance -- it does not create or start an ActivityMonitor. No IPC handler, timer, or event listener invokes it. Per CLAUDE.md integration rules: 'Code written but not reachable from any entry point is dead-on-arrival.'
- **Suggestion**: Wire ActivityMonitor into setupContextEngine() alongside ScreenshotCapture. Create an instance, call monitor.start(), and ensure monitor.stop() is called on app shutdown. Connect it to a real ActivityEvent source (e.g., Electron's powerMonitor or a periodic window-focus check).

```typescript
export { ActivityMonitor } from './consumption/activity-monitor'
export type { ActivityMonitorOptions } from './consumption/activity-monitor'
```

### [F04] Missing test: onContext throws with no onError handler
- **File**: `packages/context-engine/src/__tests__/activity-monitor.test.ts`:288
- **Category**: test-quality
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The test suite only covers the case where both onContext and onError are provided. When onContext throws and onError is NOT set, the error is silently swallowed (line 98 of activity-monitor.ts uses optional chaining `this.onError?.(error)`). This is a silent catch-and-discard pattern that violates the error handling rules. There is no test proving this behavior is intentional, and no test for when onError itself throws (which would propagate uncaught from tick()).
- **Suggestion**: Add two test cases: (1) tick() when onContext throws and onError is not provided -- verify behavior. (2) tick() when onError itself throws -- verify behavior (currently it would propagate uncaught).

### [F05] ActivityState uses boolean flag + empty string sentinels instead of discriminated union
- **File**: `packages/context-engine/src/types.ts`:35
- **Category**: type-design
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: ActivityState allows illegal combinations: isActive=false with currentApp='VS Code', or isActive=true with currentApp=''. The empty-state branch in getState() returns currentApp:'', lastActivityTimestamp:0 -- sentinel values that callers must know to check for. A discriminated union (ActiveState | InactiveState) would make illegal states unrepresentable.
- **Suggestion**: Replace with a discriminated union:
```typescript
type ActivityState = ActiveState | InactiveState

interface ActiveState {
  status: 'active'
  currentApp: string
  currentWindowTitle: string
  continuousWorkDurationMs: number
  recentApps: string[]
  lastActivityTimestamp: number
  isFullscreen: boolean
}

interface InactiveState {
  status: 'inactive'
  recentApps: string[]
  lastActivityTimestamp: number | undefined
}
```

### [F06] setInterval tick has no concurrency guard for async consumers
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:108
- **Category**: architecture
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: While tick() itself is synchronous today, the onContext callback is called within it and could trigger async operations (e.g., persisting to DB, sending over IPC). If a future change makes tick() async or the onContext callback takes longer than the interval, overlapping ticks will fire before the previous completes. Additionally, recordEvent() and trimEvents() can mutate the events array concurrently with a tick in progress if events arrive during callback execution.
- **Suggestion**: Add a concurrency guard: a private `_ticking` boolean flag that prevents re-entrant tick execution. Set it true at tick start, false at tick end (in a finally block).

```typescript
this.timer = setInterval(() => this.tick(), this.aggregationIntervalMs)
```

## P2 - Medium (Consider)

### [F07] Error in onContext silently swallowed when no onError provided (code-quality perspective)
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:93
- **Category**: code-quality
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: When onContext throws and no onError callback is configured, the error is silently swallowed. The catch block creates an Error with context (good), but onError is optional -- if not provided, the error vanishes completely. This is particularly risky during periodic setInterval ticks where failures would be completely invisible.
- **Suggestion**: Add a fallback when onError is not provided. At minimum, re-throw the error or use console.error. Better: inject a logger via constructor options and always log errors.

### [F08] Missing test: start() idempotency (double-start prevention)
- **File**: `packages/context-engine/src/__tests__/activity-monitor.test.ts`:219
- **Category**: test-quality
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The ActivityMonitor.start() method has an idempotency guard (line 105: if this.timer !== null, return). However, no test verifies this behavior. Calling start() twice could leak interval handles if the guard were removed during refactoring.
- **Suggestion**: Add a test: call start() twice, verify only one tick fires per interval (not double-ticking).

### [F09] ActivityMonitor accepts invalid configuration without validation
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:35
- **Category**: type-design
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: Constructor accepts any number for interval/threshold options including negative, zero, or NaN values. A negative aggregationIntervalMs or zero eventRetentionMs would cause incorrect behavior.
- **Suggestion**: Add validation in the constructor or use a Valibot schema for ActivityMonitorOptions to validate at the boundary.

### [F10] Exported class ActivityMonitor lacks class-level JSDoc
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:24
- **Category**: comments
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: ActivityMonitor is an exported public class (re-exported from index.ts) but has no class-level JSDoc. All other exported interfaces in this codebase have interface-level JSDoc.
- **Suggestion**: Add a class-level JSDoc comment describing its role, lifecycle (start/stop), and relationship to ProcessedContext output.

### [F11] Change delivers a horizontal layer without end-to-end path
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:1
- **Category**: integration
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: This change adds the ActivityMonitor class and its tests but does not deliver a vertical slice. There is no event source producing ActivityEvents, no consumer wired to the onContext output. The code exists as a self-contained horizontal layer.
- **Suggestion**: Wire a minimal event source and connect the onContext output to at least one downstream consumer.

### [F12] Public method tick() has non-obvious side effects undocumented
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:82
- **Category**: comments
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: The tick() method has two non-obvious side effects: (1) it clears the screenshot context after building the ProcessedContext; (2) it invokes the onContext callback and swallows errors into onError.
- **Suggestion**: Add JSDoc to tick() documenting the screenshot-clearing and error-forwarding behavior.

### [F13] Missing test: tick() return value is not asserted
- **File**: `packages/context-engine/src/__tests__/activity-monitor.test.ts`:151
- **Category**: test-quality
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: The tick() method returns a ProcessedContext object but all tests verify behavior through the onContext callback only. The return value is part of the public API and should be tested directly.
- **Suggestion**: Add a test that calls tick() directly and asserts on the returned ProcessedContext fields.

### [F14] Bare number type for timestamps and durations across new types
- **File**: `packages/context-engine/src/types.ts`:43
- **Category**: type-design
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: ActivityState.continuousWorkDurationMs, ActivityState.lastActivityTimestamp, ProcessedContext.timestamp, and ActivityMonitorOptions interval fields all use bare `number`. There is no type-level distinction between a timestamp-in-ms and a duration-in-ms.
- **Suggestion**: Introduce branded types (e.g., TimestampMs, DurationMs) with factory functions. Consider creating a shared types/branded.ts module.

## P3 - Low (Optional)

### [F15] ActivityState duplicates 5 fields from ActivityContext
- **File**: `packages/context-engine/src/types.ts`:35
- **Category**: simplification
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: ActivityState shares 5 of its 7 fields with ActivityContext. If ActivityContext changes, ActivityState must be updated manually in lockstep.
- **Suggestion**: Use `interface ActivityState extends ActivityContext { isActive: boolean; recentApps: string[] }` to eliminate duplicate field declarations.

### [F16] buildRecentApps nested conditionals can be flattened
- **File**: `packages/context-engine/src/consumption/activity-monitor.ts`:128
- **Category**: simplification
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: buildRecentApps() has 3 levels of nesting. The inner break-condition can be moved to the loop guard and the Set membership check inverted to a continue guard clause.
- **Suggestion**: Move length check into loop guard and invert Set check to continue, reducing nesting from 3 to 2 levels.

### [F17] VlmResult.activity uses plain string instead of literal union
- **File**: `packages/context-engine/src/types.ts`:99
- **Category**: type-design
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: VlmResult.activity is documented via JSDoc as having known categories but typed as plain string. A string literal union would enable exhaustive pattern matching.
- **Suggestion**: Use a known-values-plus-escape-hatch pattern: `type ActivityCategory = 'coding' | 'browsing' | 'writing' | 'gaming' | 'communication' | (string & {})`

### [F18] Duplicate empty-state test across describe blocks
- **File**: `packages/context-engine/src/__tests__/activity-monitor.test.ts`:142
- **Category**: test-quality
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: The 'reports inactive when no events recorded' test and the 'returns empty state when no events recorded' test overlap significantly. The latter is a superset.
- **Suggestion**: Remove the narrower test or add a comment linking them to clarify the overlap is intentional.

### [F19] VlmProvider JSDoc references version-specific SDK name 'AI SDK 6'
- **File**: `packages/context-engine/src/types.ts`:87
- **Category**: comments
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: The comment references 'AI SDK 6' as a specific example SDK. Version-specific references in interface documentation rot quickly.
- **Suggestion**: Remove the version number or generalize: 'Implementations wrap specific LLM SDKs (e.g., xsAI, Vercel AI SDK).'

## Positive Observations
- Clean separation between ActivityContext (pure aggregation) and ActivityMonitor (orchestration with timers/callbacks) follows the Functional Core / Imperative Shell pattern well
- Error wrapping uses Error cause chaining (`new Error(msg, { cause })`) which preserves the original stack trace
- Event retention window with configurable TTL prevents unbounded memory growth in the events array
- Tests are thorough: covers empty state, app switching, deduplication, ordering, inactivity detection, periodic ticking, event trimming, and error propagation -- all using real instances with vi.useFakeTimers() rather than mocking
- No mock violations detected: tests use direct instantiation of ActivityMonitor with real dependencies
- ActivityState and ProcessedContext types are well-documented with JSDoc and cleanly separate raw events from processed output
- Named constants for all default values instead of magic numbers
- All functions are short (under 20 lines) with clear single responsibilities
- Maximum cyclomatic complexity across all functions is approximately 4 -- well within acceptable thresholds
- Guard clause in start() prevents double-starting the timer, avoiding resource leaks from duplicate intervals
- No forbidden patterns (TODO/FIXME/HACK/PLACEHOLDER/TEMP) found in any changed file
- Test helper makeEvent() provides clean event factory with sensible defaults and override support
- Constructor uses nullish coalescing for defaults -- concise and readable
- All exported interfaces in types.ts have thorough JSDoc with field-level documentation
- Early return guard clause in getState() for empty-events case keeps the happy path flat

## Recommended Action Plan
1. Fix the 6 P1 issues -- prioritize F01 (state persistence), F02 (error handling), and F03 (entry point wiring) as they address fundamental architectural concerns
2. Address F03 and F11 together: wiring ActivityMonitor into setupContextEngine() resolves both the orphan code and horizontal-layer findings simultaneously
3. Address F02 and F04 together: fixing the silent error swallow in the implementation and adding the missing test can be done in a single pass
4. Address the 8 P2 issues in a second pass -- F09 (constructor validation) and F08 (idempotency test) are quick wins
5. Run `/ultra-review recheck` to verify all P1 issues are resolved
