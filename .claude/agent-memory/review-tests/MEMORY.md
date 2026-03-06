# Review-Tests Agent Memory

## Project Test Patterns (Confirmed)

- **Test framework**: Vitest (not Jest) -- imports from `vitest` not `jest`
- **Mock detection**: Scan for `vi.fn()`, `vi.mock()`, `vi.spyOn()` in addition to jest patterns
- **Test double pattern**: External LLM APIs use `// Test Double rationale:` comment convention
- **MCP testing**: Real MCP echo server at `packages/mcp-hub/src/__tests__/fixtures/echo-mcp-server.ts`
- **Skills testing**: Real skills at `packages/skills-engine/skills/` (companion-persona, proactive-care)
- **Temp DB pattern**: Tests create SQLite DBs in `os.tmpdir()` temp dirs, cleaned in afterEach
- **Monorepo**: pnpm workspace, packages reference each other via `workspace:^`

## Common Findings in This Project

- Error paths frequently undertested in integration code
- Boundary conditions for empty inputs often missing
- Test doubles for external APIs (LLM, external services) are acceptable with rationale comment
- Tests that manually wire components instead of using factory functions (e.g., registering own handler vs using createEveningPipeline) -- misleading test names
- scheduleDaily / cron-based methods often untested in pipeline modules

## Key Packages for Context

- `@proj-airi/context-engine`: DocumentStore, VectorStore, MemoryOrchestrator, MemoryExtractor, ReportGenerator
- `@proj-airi/cron-service`: CronService with SQLite-backed scheduling
- `@proj-airi/persona-engine`: createEmotionActor, createIntimacyState, generateResponse
