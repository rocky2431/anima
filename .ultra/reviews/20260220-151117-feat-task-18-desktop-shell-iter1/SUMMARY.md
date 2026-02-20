# Review Summary

**Session**: 20260220-151117-feat-task-18-desktop-shell-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 11 P1 findings exceed the threshold of 3

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 11 |
| P2 Medium | 18 |
| P3 Low | 3 |
| **Total** | **32** (deduplicated from 32) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-comments | 5 | completed |
| review-errors | 7 | completed |
| review-simplify | 2 | completed |
| review-tests | 5 | completed |
| review-types | 5 | completed |

## P1 - High (Should Fix)
### [1] Package @proj-airi/desktop-shell has no consumer in monorepo
- **File**: packages/desktop-shell/package.json:1
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The new @proj-airi/desktop-shell package exports getActiveWindow, ClipboardMonitor, and ShortcutManager, but no other package or app in the monorepo imports or depends on it. A grep for '@proj-airi/desktop-shell' and 'desktop-shell' across all .ts, .json, and .vue files returns only self-references. This is orphan code -- dead-on-arrival with no live entry point in any application.
- **Suggestion**: Wire the package into at least one consumer (e.g., apps/stage-tamagotchi Electron main process services) before committing. Add it as a dependency in the consumer's package.json and import/instantiate its exports from a service that runs at app startup.

### [2] No structured logging in desktop-shell package
- **File**: packages/desktop-shell/src/active-window.ts:1
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The entire desktop-shell package (active-window.ts, clipboard-monitor.ts, global-shortcuts.ts) contains zero logging. Errors in getActiveWindow are rejected but never logged. ClipboardMonitor and ShortcutManager delegate errors to an optional onError callback but produce no structured log output. The project standard requires @guiiai/logg (useLogg pattern) for all new packages.
- **Suggestion**: Add @guiiai/logg as a dependency and create per-module loggers (useLogg('desktop-shell:active-window'), etc.). Log at INFO level on start/stop lifecycle events, WARN on recoverable errors, and ERROR on fatal failures.

### [3] ShortcutManager.registered set true even when registrations fail
- **File**: packages/desktop-shell/src/global-shortcuts.ts:31
- **Category**: code-quality / logic-error
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: After iterating over all bindings, line 49 unconditionally sets this.registered = true regardless of how many registrations actually succeeded. If all registrations fail, the manager still reports isRegistered === true and subsequent registerAll() calls become no-ops. Consumers cannot retry registration after transient failures.
- **Suggestion**: Track whether at least one binding registered successfully. Set this.registered = true only if successCount > 0, or track per-binding registration state.

### [4] throw inside setInterval callback causes uncaught exception
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:54
- **Category**: error-handling / uncaught-in-timer
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: When onError is not provided, the catch block re-throws inside a setInterval callback. Throwing from a timer callback results in an uncaught exception that will crash the Node.js process. Unlike synchronous callers, there is no call stack to catch this throw. This is a process-killing bug in production.
- **Suggestion**: Never re-throw from a timer callback. Either require onError in the constructor (make it non-optional), or add a fallback that logs and stops the monitor.

### [5] start() lacks try/catch on initial readClipboard() call
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:26
- **Category**: error-handling / missing-try-catch
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: The start() method calls this.readClipboard() without any error handling. If the clipboard read fails, a raw error propagates to the caller with no context. The poll() method properly wraps readClipboard errors, but start() does not. This inconsistency means the first read can crash while subsequent reads are handled.
- **Suggestion**: Wrap the initial readClipboard() call in try/catch with the same error handling pattern used in poll().

### [6] onChange callback errors caught by poll() catch-all
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:47
- **Category**: error-handling / callback-error-misattribution
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: The onChange callback is called inside the try block of poll(). If onChange throws, the error is caught and wrapped as 'ClipboardMonitor poll failed', which misattributes the error. The caller's callback error is treated as a clipboard read failure.
- **Suggestion**: Move the onChange call outside the try block, or wrap it in its own try/catch with a distinct error message.

### [7] onAction callback in shortcut handler has no error handling
- **File**: packages/desktop-shell/src/global-shortcuts.ts:33
- **Category**: error-handling / missing-try-catch
- **Confidence**: 92
- **Reported by**: review-errors
- **Description**: The callback passed to registerFn calls this.onAction without any try/catch. This callback executes asynchronously when the user presses the shortcut -- if onAction throws, the error propagates uncaught from the Electron global shortcut handler.
- **Suggestion**: Wrap the onAction call in try/catch and report errors via reportError.

### [8] unregisterAllFn() called without try/catch -- inconsistent state
- **File**: packages/desktop-shell/src/global-shortcuts.ts:57
- **Category**: error-handling / missing-try-catch
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: If unregisterAllFn() throws, the registered flag remains true, leaving the ShortcutManager in an inconsistent state. The next call to registerAll() would return early and the system would be stuck with no working shortcuts and no way to re-register.
- **Suggestion**: Wrap in try/finally: `try { this.unregisterAllFn() } finally { this.registered = false }`.

### [9] ActiveWindowInfo uses pid 0 as sentinel, conflicting with real PID 0
- **File**: packages/desktop-shell/src/active-window.ts:21
- **Category**: type-design / sentinel-value-ambiguity
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: parseAppleScriptOutput returns { appName: '', windowTitle: '', pid: 0 } when there is no output. PID 0 is a valid Unix process (kernel/init). Callers cannot distinguish 'no active window detected' from 'the kernel process is frontmost'. The empty-string + zero sentinel pattern makes illegal states representable.
- **Suggestion**: Return null when no data is available, or use a discriminated union result type: { ok: true, info: ActiveWindowInfo } | { ok: false, reason: string }.

### [10] ShortcutManager marks registered=true even when all registrations fail (test gap)
- **File**: packages/desktop-shell/src/global-shortcuts.ts:49
- **Category**: test-quality / missing-behavioral-coverage
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The test at global-shortcuts.test.ts:62-78 verifies errors are emitted but never asserts manager.isRegistered afterward -- missing the bug where registered=true even when zero shortcuts succeeded. This is both a logic bug in the implementation and a gap in test coverage.
- **Suggestion**: Add a test case: after registerAll() where every binding fails with onError set, assert that manager.isRegistered is false.

### [11] ClipboardMonitor.start() unhandled throw when readClipboard fails on init (test gap)
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:26
- **Category**: test-quality / missing-error-path
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: No test covers the scenario where readClipboard throws during the initial read in start(). The onError handler is only used inside poll(), so callers have no way to handle this gracefully through the callback.
- **Suggestion**: Add a test: construct ClipboardMonitor with readClipboard that throws on first call, call start(), verify the error behavior.

## P2 - Medium (Consider)
### [12] getActiveWindow hardcodes macOS AppleScript with no platform guard
- **File**: packages/desktop-shell/src/active-window.ts:5
- **Category**: architecture / platform-portability
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The getActiveWindow function uses osascript which only works on macOS. No runtime platform check exists. The package lists std-env as a dependency for platform detection but never imports it.
- **Suggestion**: Add an explicit platform check that rejects with a clear error message on non-macOS platforms.

### [13] std-env declared as dependency but never imported
- **File**: packages/desktop-shell/package.json:39
- **Category**: code-quality / unused-dependency
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: std-env is declared as a runtime dependency but no source file imports from it. Dead weight suggesting an incomplete platform detection implementation.
- **Suggestion**: Either remove std-env or use it for the platform guard in active-window.ts.

### [14] ShortcutManagerOptions.unregister is declared but never used
- **File**: packages/desktop-shell/src/types.ts:30
- **Category**: architecture / dead-interface-member
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The interface requires an 'unregister' function for per-shortcut removal, but ShortcutManager never stores or calls it. Consumers must provide dead code.
- **Suggestion**: Remove 'unregister' from ShortcutManagerOptions or implement per-binding unregistration.

### [15] ClipboardMonitor.lastText is ephemeral in-memory state
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:10
- **Category**: architecture / in-memory-state
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: On service restart, lastText resets to empty string, triggering a spurious onChange event for whatever is currently in the clipboard. If stop/start is cycled, stale lastText from the previous run is kept.
- **Suggestion**: Re-read the clipboard on start() to avoid false positives on restart, or accept an optional initialText parameter.

### [16] DEFAULT_BINDINGS hardcodes shortcut accelerators
- **File**: packages/desktop-shell/src/global-shortcuts.ts:3
- **Category**: forbidden-pattern / hardcoded-config
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: Shortcut key accelerators are hardcoded as compile-time constants with no mechanism for user override.
- **Suggestion**: Document that DEFAULT_BINDINGS is a fallback; the consumer should load custom bindings from persisted user preferences.

### [17] registerAll() sets registered=true even when some bindings fail
- **File**: packages/desktop-shell/src/global-shortcuts.ts:49
- **Category**: error-handling / partial-failure-silent
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: After the for-loop, this.registered is set to true unconditionally regardless of per-binding failures. Callers cannot determine that only some shortcuts are active.
- **Suggestion**: Track per-binding registration state or return a result object from registerAll().

### [18] parseAppleScriptOutput returns valid-looking empty result on failure
- **File**: packages/desktop-shell/src/active-window.ts:20
- **Category**: error-handling / error-as-valid-state
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: Empty AppleScript output returns { appName: '', windowTitle: '', pid: 0 } which is indistinguishable from a legitimate result.
- **Suggestion**: Return null for empty/unparseable input so callers can distinguish 'no data' from a window with empty fields.

### [19] No JSDoc on exported interfaces/types in types.ts
- **File**: packages/desktop-shell/src/types.ts:1
- **Category**: comments / missing-jsdoc
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: 6 public types exported with zero JSDoc. Consumers need to understand semantics: what does pid=0 mean? Is timestamp epoch-ms or epoch-seconds?
- **Suggestion**: Add JSDoc to each exported interface/type with field-level documentation for non-obvious semantics.

### [20] No JSDoc on exported functions in active-window.ts
- **File**: packages/desktop-shell/src/active-window.ts:19
- **Category**: comments / missing-jsdoc
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: parseAppleScriptOutput and getActiveWindow lack JSDoc. Platform restriction, timeout, and expected input format are undocumented.
- **Suggestion**: Add JSDoc documenting macOS-only requirement, 5000ms timeout, error behavior, and input format.

### [21] No JSDoc on ClipboardMonitor class and public methods
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:5
- **Category**: comments / missing-jsdoc
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: ClipboardMonitor class and 3 public members have no JSDoc. Polling mechanism, idempotent start/stop, and throw behavior are undocumented.
- **Suggestion**: Add JSDoc describing poll-based clipboard change detection, idempotent start/stop, and initial clipboard read behavior.

### [22] No JSDoc on ShortcutManager class and public methods
- **File**: packages/desktop-shell/src/global-shortcuts.ts:10
- **Category**: comments / missing-jsdoc
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: ShortcutManager class, 3 public members, and DEFAULT_BINDINGS constant all lack JSDoc. Partial failure behavior and accelerator format are undocumented.
- **Suggestion**: Add JSDoc documenting idempotent registerAll, partial failure behavior, and Electron-style accelerator syntax.

### [23] ShortcutManagerOptions.unregister is accepted but never consumed
- **File**: packages/desktop-shell/src/types.ts:30
- **Category**: type-design / dead-interface-field
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: Type contract violation: the interface promises per-shortcut unregistration but the constructor never stores or uses the 'unregister' function.
- **Suggestion**: Remove 'unregister' from the interface or implement and expose it in ShortcutManager.

### [24] ClipboardMonitor accepts zero or negative pollIntervalMs without validation
- **File**: packages/desktop-shell/src/clipboard-monitor.ts:13
- **Category**: type-design / missing-constructor-validation
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: No validation that pollIntervalMs is positive. Passing 0 or negative values creates a setInterval with undefined behavior.
- **Suggestion**: Add a guard: if (this.pollIntervalMs <= 0) throw new Error('pollIntervalMs must be positive').

### [25] ClipboardChange and ActiveWindowInfo are mutable event/result interfaces
- **File**: packages/desktop-shell/src/types.ts:1
- **Category**: type-design / missing-readonly
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Both interfaces represent immutable data (snapshots and events) but lack readonly modifiers, allowing accidental mutation by consumers.
- **Suggestion**: Add readonly to all fields on both interfaces.

### [26] registerAll() has 3-level nesting; extract single-binding registration
- **File**: packages/desktop-shell/src/global-shortcuts.ts:26
- **Category**: simplification / extract-method
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: registerAll() reaches nesting depth 3. Extracting per-binding registration into a private method reduces nesting and makes the loop body trivially scannable.
- **Suggestion**: Extract a private registerBinding(binding) method containing the try/catch block.

### [27] No integration test for ClipboardMonitor with real system clipboard
- **File**: packages/desktop-shell/src/__tests__/clipboard-monitor.test.ts:1
- **Category**: test-quality / missing-integration-test
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: Unlike active-window which has an integration test, ClipboardMonitor has no test proving it works with the real system clipboard API.
- **Suggestion**: Add clipboard-monitor.integration.test.ts with describe.runIf() for desktop environment gating.

### [28] No integration test for ShortcutManager with real Electron globalShortcut
- **File**: packages/desktop-shell/src/__tests__/global-shortcuts.test.ts:1
- **Category**: test-quality / missing-integration-test
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: No integration test proving the wiring works with Electron's real globalShortcut.register/unregisterAll APIs.
- **Suggestion**: Add global-shortcuts.integration.test.ts with conditional describe.runIf for Electron environment detection.

### [29] ShortcutManagerOptions.unregister is accepted but never used or tested
- **File**: packages/desktop-shell/src/global-shortcuts.ts:10
- **Category**: test-quality / dead-parameter
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: All tests pass 'unregister: () => {}' but ShortcutManager never stores or uses it. Dead parameter increases API surface for no reason.
- **Suggestion**: Implement and test per-accelerator unregister, or remove the parameter.

## P3 - Low (Optional)
### [30] No comment documenting macOS-only scope of active-window
- **File**: packages/desktop-shell/src/active-window.ts:5
- **Category**: comments / walking-skeleton-scope
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: The active-window module is macOS-only via AppleScript with no comment indicating the platform constraint.
- **Suggestion**: Add a file-level comment: /** Platform: macOS only. Uses osascript/AppleScript. */

### [31] Redundant 'as ShortcutAction' casts on DEFAULT_BINDINGS literals
- **File**: packages/desktop-shell/src/global-shortcuts.ts:3
- **Category**: simplification / redundant-type-assertion
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: With 'as const' the per-element 'as ShortcutAction' casts add no type safety and clutter each line.
- **Suggestion**: Replace with 'as const satisfies readonly ShortcutBinding[]' on the array.

### [32] ClipboardChange.timestamp and pollIntervalMs use bare number for ms values
- **File**: packages/desktop-shell/src/types.ts:11
- **Category**: type-design / primitive-obsession
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: timestamp does not indicate its unit. pollIntervalMs has the 'Ms' suffix convention but timestamp does not.
- **Suggestion**: At minimum, add JSDoc: /** Unix epoch milliseconds */ timestamp: number.

## Positive Observations
- Clean Functional Core / Imperative Shell separation: ClipboardMonitor and ShortcutManager accept IO callbacks via constructor options, keeping core logic pure and testable without mocks
- Excellent test coverage with thorough edge cases: empty input, unicode, double-start idempotency, error propagation with and without onError handlers
- Proper error wrapping with cause chains: new Error('...', { cause: err }) provides debuggable error context throughout
- getActiveWindow uses execFile with timeout (5000ms) rather than exec, avoiding shell injection and preventing hangs
- Test for ClipboardMonitor uses vi.useFakeTimers for deterministic timer testing -- clean and reliable approach
- Integration test for active-window guards with describe.runIf(platform() === 'darwin') and includes a sensible osascript availability check
- No forbidden patterns (TODO/FIXME/HACK/PLACEHOLDER/TEMP) found in any source files
- Error messages include context (e.g., 'Failed to register shortcut: ${binding.accelerator}')
- parseAppleScriptOutput tests are exemplary Functional Core unit tests: no mocks, direct input/output, comprehensive edge cases
- ShortcutAction is a proper 4-value literal union -- consistent with codebase best practices for domain enumerations
- Dependency injection via options interfaces keeps Imperative Shell concerns testable without requiring mocks of system APIs
- Types cleanly separated into dedicated types.ts file
- All functions are short (<30 lines), consistent with project conventions
- Named constant DEFAULT_POLL_INTERVAL_MS used instead of magic number

## Recommended Action Plan
1. Fix 11 P1 issues, starting with the 5 error-handling gaps (throw-in-timer, missing-try-catch in start(), onChange misattribution, onAction uncaught, unregisterAll inconsistent state) -- these are process-stability bugs
2. Fix the registerAll() logic error (registered=true unconditionally) and add the missing test assertion
3. Address the sentinel value ambiguity in parseAppleScriptOutput (return null instead of zeroed object)
4. Wire the package to at least one consumer (apps/stage-tamagotchi) to resolve the orphan-code finding
5. Add structured logging with @guiiai/logg
6. Address 18 P2 issues: JSDoc, unused dependency, missing integration tests, type design improvements
7. Run `/ultra-review recheck` to verify
