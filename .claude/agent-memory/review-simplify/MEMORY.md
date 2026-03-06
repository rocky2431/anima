# Review-Simplify Agent Memory

## Project Patterns
- Codebase uses plain functions for pure/functional core; classes only in imperative shell
- Named constants preferred over magic numbers (confirmed in context-engine and persona-engine)
- Functions are consistently short (<30 lines) with early returns / guard clauses
- Default parameter values sometimes duplicated across caller/callee (e.g., gap threshold)
- Test files use factory functions with Partial<T> override pattern consistently (createStub*, make*)
- Test Double rationale comments are standard practice across all test files

## Acceptable Complexity Thresholds
- Walking skeleton code is intentionally simple; cyclomatic complexity stays 1-4
- Max nesting depth observed: 2 levels
- No nested ternaries in the codebase so far

## Common Test Patterns
- MCP hub tests use try/finally for client/server cleanup (candidate for afterEach refactor)
- channels-extra tests repeat registry+channel setup across multiple tests
- Integration checkpoint tests are intentionally broad (multiple assertions per test)
- Pinia store tests use createTestingPinia with stubActions: false

## Notes
- ScreenshotCapture class in capture/screenshot.ts is documented as intentional Imperative Shell
- Persona-engine uses closure-based module pattern (setupPersonaEngine) rather than classes
- StubLlmProvider in context-engine dispatches via schemaDescription string matching (fragile pattern)
