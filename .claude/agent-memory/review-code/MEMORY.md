# Review-Code Agent Memory

## Project: AIRI (proj-airi)

### Architecture
- Monorepo: pnpm workspaces + Turborepo + Cargo
- DI: `injeca` for Electron main process service wiring
- Logging: `@guiiai/logg` (useLogg pattern)
- Functional Core / Imperative Shell is the established pattern
- New domain packages: `packages/context-engine`, `packages/persona-engine`, `packages/mcp-hub`, `packages/skills-engine`
- App integration: `apps/stage-tamagotchi/src/main/services/anima/`
- UI config broadcast: `configurator.updateFor(moduleName, config)` sends WebSocket `ui:configure` messages
- Settings pages: `packages/stage-pages/src/pages/settings/` with `settingsEntry: true` route meta for auto-discovery

### Recurring Findings
- **In-memory state in Electron services**: closure-scoped mutable state without persistence. Check every `let`/`private` variable.
- **Orphan exports**: Walking skeleton PRs export functions/interfaces not yet consumed. Always trace to a live entry point.
- **No logging in new packages**: Flag missing @guiiai/logg (task-9, task-11, task-13, task-14, task-15, task-16, task-17, task-18, task-19, task-22).
- **In-memory state in Pinia stores**: UI stores (memory, todo, skills, activity) hold all data in refs with no persistence or backend fetch (task-21).
- **Unbounded in-memory collections**: Arrays used as caches/accumulators without size cap or eviction (task-13 recentEmbeddings, task-15 collectedActivities, task-16 globalHandlers, task-20 sessionWebhooks, task-21 todos/memories).
- **Silent no-op default error handlers**: `config?.onError ?? (() => {})` combined with no logging means failures vanish (task-15).
- **Unused injected dependencies**: Required deps declared but never referenced in implementation (task-15 intimacy/persona).
- **Hardcoded trigger IDs across package boundaries**: Trigger IDs duplicated between persona-engine and consumers (task-15).
- **Unsafe `as` casts at package boundaries**: Flag and suggest proper mapping functions (task-20 IMAP exists event, task-22 ActivityType cast).
- **Unused package.json dependencies**: Declared deps not imported anywhere in src (task-16 better-sqlite3, task-18 std-env). Always cross-check.
- **Unhandled async errors in handler dispatch loops**: for-of loops calling handlers without try/catch or Promise.catch (task-16 channel-registry, slack, whatsapp).
- **UI-only horizontal slices**: Settings pages that broadcast config via WebSocket but no backend handler exists (task-17 MCP panel, task-21 memory/todo/activity/skills panels). Always check both ends of the wire.
- **Duplicate utility functions across Vue components**: formatDate duplicated in MemoryManager + TodoPanel (task-21).
- **All domain types in single misnamed file**: types/memory.ts contains Todo, Activity, Skill types too (task-21).
- **Mirror types without shared contract**: UI types comment says "mirror X" but no import/contract test links them (task-21).
- **Duplicate detection by name instead of id**: UI matching recommended items by display name rather than stable ID (task-17 McpManager).
- **Registered flag set true on partial failure**: Boolean tracking registration state set unconditionally after loop, even if all registrations failed (task-18 ShortcutManager).
- **Dead interface members (ISP violation)**: Required options in interface types that implementations never call (task-18 ShortcutManagerOptions.unregister).
- **No file size limits before readFile**: DocumentProcessor reads entire files without size check, OOM risk (task-19).
- **No path validation on file read APIs**: extractText accepts arbitrary paths with no containment/traversal check (task-19).
- **SSRF via untrusted webhook URLs**: DingTalk sessionWebhook comes from incoming messages; defaultWebhookSender POSTs without URL validation (task-20).
- **Hardcoded config strings**: Email subject hardcoded to 'Message from Anima' (task-20).
- **NIH email parsing**: Naive header/body split ignores MIME/encoding. Use mailparser (task-20).
- **Fragile SDK internal coupling**: Feishu _handlers Map is internal SDK detail (task-20).
- **Horizontal-only channel additions**: Multiple channels added simultaneously with zero vertical integration (task-20).
- **Duplicate string computation in merge pipelines**: Same text formatting done in caller and callee (task-22 combinedText/generateSummary).
- **Dead code in catch blocks**: Error identity checks that can never trigger because the guarded throw is outside the try (task-22).
- **SSRF via server-side proxy endpoints**: embedding:models:list handler accepts untrusted baseURL and forwards API key via fetch (main-iter1). Check all server-side proxy/fetch patterns.
- **API keys stored plaintext in SQLite**: LLM/embedding/provider configs persisted unencrypted in brain SQLite DB (main-iter1).
- **Duplicate store logic across Pinia stores**: sendEmbeddingConfig duplicated in memory.ts and embedding.ts stores (main-iter1). Watch for copy-paste across module stores.
- **Stale closure captures in adapter pattern**: Adapters capture provider handle at creation time, become stale when providers are reconfigured (main-iter1).
- **Hardcoded dimension defaults**: Embedding adapter uses 1536 default before first real embedding call, may mismatch vector DB (main-iter1).
- **Dead cron wiring**: Optional cronService parameter never passed by caller, making scheduled features manual-only (main-iter1).
- **Dual initialization paths**: Module stores initialized in both App.vue and onboarding.ts with idempotency guard (main-iter1).
- **Unbounded SQLite tables**: activity_events grows ~8640 rows/day without cleanup (main-iter1).

### Test Patterns (Acceptable)
- StubLlmProvider + StubEmbeddingProvider with rationale comment -- correct (external LLM/embedding API).
- Real SQLite/LanceDB/CronService with temp dirs -- correct pattern.
- Pure domain functions tested via direct instantiation -- correct Functional Core testing.
- createStubChannel for Channel interface in registry tests -- correct (tests pure registry logic, not external SDK).
- createMockBoltApp / createMockBaileysSocket with Test Double rationale -- correct (external messaging APIs requiring real credentials).
- InMemoryTransport from @modelcontextprotocol/sdk for MCP server tests -- correct (tests protocol adapter, not network transport).
- Callback-based IO injection for ClipboardMonitor/ShortcutManager -- correct (Functional Core pattern, IO injected via constructor options).
- deterministicEmbed helper with Test Double rationale -- correct (external embedding API, task-19).
- createMockImapClient / createMockSmtpTransport / createMockFeishuClient / createMockStreamClient with Test Double rationale -- correct (external IMAP/SMTP/Feishu/DingTalk APIs, task-20).
- Channel pattern: constructor DI with deps factory functions (createImapClient, createSmtpTransport, etc.) -- correct Functional Core pattern.
- Pinia store tests with createPinia/setActivePinia -- correct (real Pinia instance, no mocking, task-21).
- StubLlmProvider for ContextMerger/EntityExtractor with schema-based routing -- correct (external LLM API, task-22).
