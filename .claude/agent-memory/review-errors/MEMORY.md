# Review-Errors Agent Memory

## Project Patterns

- **SQL**: DocumentStore uses `better-sqlite3` with parameterized queries (good pattern)
- **Vector DB**: VectorStore wraps `@lancedb/lancedb` — LanceDB uses raw filter strings for delete, which is an injection risk surface
- **No typed errors**: As of 2026-02-18, storage layer has no custom error types (e.g., StorageError, DocumentStoreError)
- **No try/catch**: Storage modules have zero error handling — raw library errors propagate to callers

## Common Issues in This Codebase

- I/O methods without try/catch (storage, capture modules)
- LanceDB filter strings accepted as raw user-supplied text
- Use-after-close patterns (VectorStore nullifies db without guard)
- Constructor resource leaks (DB opened, init fails, no cleanup)
- Bare catch blocks: `catch { return false }` pattern in ScreenshotPipeline.tick() -- error param not even bound
- Fire-and-forget async: `void this.tick()` in start()/setInterval without error surfacing
- Error-as-valid-state: catch returns same value as a normal code path (false = dedup skip AND error)
- Callback errors swallowed: onContext callback inside try block, errors caught by catch-all
- Error messages lack input context (buffer size, timestamp, provider info)
- **onError optional pattern**: Both ScreenshotPipeline and ActivityMonitor use optional `onError` callback. When not provided, errors from onContext callbacks are silently swallowed via `this.onError?.(error)`.
- **Consistent wrapping**: Both pipelines use `new Error(msg, { cause })` for error wrapping -- good pattern but messages still lack operational context.
- **Orchestrator no try/catch**: createAnimaOrchestrator's handleProcessedContext callback has zero error handling; relies entirely on ActivityMonitor's onContext try/catch.
- **TRIGGER_EMOTION_MAP gap**: Trigger name lookup silently skips unmapped triggers -- no warning/error logged.
- **Setup log-only error handler**: setup-orchestrator.ts onError only logs, no circuit-breaking or escalation.
- **Inconsistent callback wrapping**: In llm.ts streamFromAiSdk, onChunk/onFinish wrap onStreamEvent in try/catch, but onError does not -- can cause promise hang.
- **Empty config silently accepted**: createAiSdkModel accepts empty baseURL/apiKey, deferring failure to network call with confusing error.
- **Promise.all for cleanup**: [FIXED in iter2] McpClientManager.disconnectAll() and McpHub.connectEnabled() now use Promise.allSettled.
- **JSON.parse on DB data without try/catch**: [FIXED in iter2] McpServerStore now has safeJsonParse with context in error messages.
- **Shutdown resource leak**: [FIXED in iter2] McpHub.shutdown() now uses try/finally for store.close().
- **disconnectAll swallows failures**: McpClientManager.disconnectAll detects failures but only clears the map -- never logs/throws/returns failure info.
- **removeServer bare catch**: McpHub.removeServer catches disconnect errors without binding or logging the error.
- **aggregateTools no per-server error handling**: One failing server aborts entire tool aggregation loop.
- **AiOrchestrator zero error handling**: createAiOrchestrator has no try/catch in any method -- all I/O errors (LLM calls, MCP connections, skill loading) propagate raw.
- **Promise.all for independent I/O**: AiOrchestrator.initialize() uses Promise.all for mcpHub.connectEnabled() + skillRegistry.loadAll() -- partial failure causes resource leak (same pattern we saw in iter1 McpHub, now fixed to allSettled there).

- **Bare catch pattern recurring**: skill-loader.ts has two bare `catch {}` blocks (no error binding) -- same pattern as ScreenshotPipeline.tick(). This is a codebase-wide habit.
- **parseSkillMd context gap**: Error messages don't include filePath despite having it as a parameter -- same issue as capture modules.

- **Consumption layer onError pattern**: ReportGenerator, SmartTip, SmartTodo all use the same dual-path: onError provided -> callback + fallback return; onError absent -> re-throw. onError callback itself is never wrapped in try/catch.
- **Error-as-valid-state in consumption**: ReportGenerator returns empty DailySummary on error, SmartTodo returns empty suggestions, SmartTip returns null -- all indistinguishable from legitimate "nothing to report" results.
- **SmartTip validates LLM output, SmartTodo does not**: Inconsistent validation across sibling classes.
- **Embedding I/O in dedup loop**: SmartTodo.dedup() has per-item embedding calls with no per-item error handling; one failure loses all suggestions.

- **MCP server handlers zero error handling**: anima-mcp-server.ts registers 2 tools + 2 resources, all with async handlers that call dependency methods (memoryAccess, contextAccess) without any try/catch. Same pattern as AiOrchestrator -- raw I/O errors propagate to external MCP clients.
- **UI store clean pattern**: mcp.ts Pinia store is synchronous-only with sensible defaults -- good example of error-free-by-design in the UI layer.
- **Throw-in-timer pattern**: ClipboardMonitor re-throws from setInterval callback when onError absent -- process-killing bug. Same risk exists in any class using onError optional pattern with timer/event callbacks.
- **Callback-in-try pattern continues**: ClipboardMonitor.poll() puts onChange inside try block, same misattribution pattern as ScreenshotPipeline/ActivityMonitor. This is now 3 instances of the same bug across the codebase.
- **Shortcut handler no try/catch**: ShortcutManager registers callbacks via registerFn that call onAction without error handling -- uncaught in async Electron handler context.
- **unregisterAllFn no try/catch**: Can leave ShortcutManager in inconsistent registered state, blocking re-registration.

- **FolderMonitor required onError**: FolderMonitor makes onError required (not optional) -- first module to break the optional onError pattern. Good evolution.
- **FolderMonitor separate callback try/catch**: onChange wrapped in its own try/catch, not lumped into a catch-all. Improvement over ScreenshotPipeline/ActivityMonitor/ClipboardMonitor pattern, but error message still lacks event context.
- **DocumentProcessor no try/catch on I/O**: All 4 extraction methods (PDF/DOCX/XLSX/TXT) let raw library errors propagate. Same pattern as storage modules and capture modules.
- **Dynamic import without try/catch**: DocumentProcessor uses 3 dynamic imports (pdfjs-dist, mammoth, exceljs) that produce cryptic ERR_MODULE_NOT_FOUND when deps missing.
- **PDF resource leak**: doc.destroy() not in finally block -- leaks on page extraction failure.
- **Partial watch failure silent**: FolderMonitor.start() resolves successfully even if all directory watches fail (errors only go to callback).

- **Channel handler log-only pattern**: All 3 channel classes (Email, Feishu, DingTalk) iterate message handlers in try/catch but only log errors -- no failure surfacing to channel owner. Same fault-isolation-without-observability pattern.
- **Channel sendMessage no try/catch**: Email (smtpTransport.sendMail), Feishu (client.im.message.create), DingTalk (webhook sender) all lack try/catch on I/O -- raw library errors propagate without channel context. Same recurring pattern as storage/capture modules.
- **Feishu API response code unchecked**: client.im.message.create returns { code: number } but code is never checked -- API-level failures appear as success.
- **DingTalk error-as-valid-state**: handleBotMessage returns { status: 'SUCCESS' } on parse errors -- tells platform message was processed, preventing retry. Same anti-pattern as ScreenshotPipeline.tick().
- **DingTalk SSRF risk**: defaultWebhookSender sends HTTP POST to arbitrary URL from sessionWebhook field without domain validation.
- **Email disconnect resource leak**: Sequential cleanup in single try block -- same pattern as McpHub.shutdown() before fix.
- **Channel DI pattern (good)**: All 3 channels accept deps via constructor for testability -- clean Imperative Shell design.
- **Channel status handlers (good)**: setStatus iterates handlers with individual try/catch -- correct fault isolation.

- **ContextMerger good wrapping**: ContextMerger.merge() and EntityExtractor.extract() both use `new Error(msg, { cause })` consistently, but messages still lack operational context (source count, text length).
- **LLM structured output not validated**: classifyActivity and EntityExtractor trust generateStructured return shape without runtime validation. SmartTip validates, SmartTodo and now ContextMerger/EntityExtractor do not -- inconsistency growing.
- **Silent activity type fallback**: validateActivityType returns 'other' for invalid LLM output without logging -- same pattern as TRIGGER_EMOTION_MAP silent skip.
- **Promise.all for LLM calls (lower risk)**: ContextMerger uses Promise.all for 3 LLM calls. Unlike DB/MCP resource patterns, LLM calls don't leak resources, but partial failure wastes successful results.
- **FC/IS separation (good)**: ContextMerger exports pure functions separately and tests them independently -- clean Functional Core.

- **ModelRouter no try/catch on LLM I/O**: generateText/generateStructured call providers without try/catch -- same recurring pattern. Raw errors propagate without tier/taskType context.
- **Stats-before-await corruption**: ModelRouter increments tierCalls/taskCalls BEFORE the await, so failed calls corrupt cost/routing stats. New variant of error-as-valid-state.
- **Silent override fallback**: routingOverrides can map to 'local' tier that doesn't exist; getProvider silently falls back via ?? without logging.
- **DeduplicationTracker clean**: Pure counter class, no I/O, error-free by design -- same good pattern as Pinia store mcp.ts.
- **classifyTask pure function (good)**: Clean FC separation, deterministic keyword matching, no side effects.

- **BrainStore JSON.parse without try/catch**: store.ts has 3 instances of JSON.parse on DB data (getActivitySummary highlights/breakdown, getProviderConfigs config_json) without try/catch. Same pattern as McpServerStore before fix.
- **BrainStore constructor no error handling**: initTables() runs large SQL exec in constructor with no catch -- constructor resource leak pattern seen in VectorStore.
- **Adapters error-as-valid-state**: LLM adapter returns '' and embedding adapter returns [] when API returns no data -- indistinguishable from valid empty responses, corrupts downstream processing.
- **Pipeline warn-only pattern**: createPipeline catches component init failures and only logs warn. No status surfacing mechanism for partial failures.
- **Evening pipeline no client error feedback**: Catches errors and logs, but never sends error event to the frontend client that triggered the pipeline. Frontend falls back to 60s timeout with generic error.
- **Graceful shutdown sequential cleanup**: index.ts gracefulShutdown calls 5 dispose/close functions without try/catch -- same bug as McpHub.shutdown() before fix.
- **Empty catch in embedding validation**: embedding.ts line 158 has `catch { /* use HTTP status */ }` -- bare catch, P0 pattern.
- **Provider config sync**: API keys stored as plaintext JSON in SQLite. Uses parameterized queries (good) but no encryption at rest.
- **Desktop shell handler good .catch()**: Unlike ClipboardMonitor, has proper .catch() on setInterval promise chain -- avoided throw-in-timer bug.
- **Frontend stores clean**: Embedding, LLM, Activity, Memory, ProviderSync Pinia stores are synchronous-only with sensible defaults -- error-free-by-design UI layer.
- **Server-runtime superjson.parse fix**: Changed from message.json() to superjsonParse with proper try/catch -- clean fix.

## Reviewed Files Log

- 2026-02-18: activity-monitor.ts, activity-monitor.test.ts, types.ts, index.ts (task-4 activity monitor)
- 2026-02-18: screenshot-pipeline.ts, screenshot-processor.ts, phash.ts (task-3 screenshot pipeline)
- 2026-02-18: orchestrator.ts, orchestrator.test.ts, setup-orchestrator.ts, index.ts (task-7 integration checkpoint)
- 2026-02-18: use-ai-sdk.ts, llm.ts (task-8 AI SDK migration)
- 2026-02-18: server-store.ts, transport-factory.ts, mcp-client-manager.ts, mcp-hub.ts (task-9 mcp-hub)
- 2026-02-19: server-store.ts, transport-factory.ts, mcp-client-manager.ts, mcp-hub.ts, types.ts, index.ts (task-9 mcp-hub iter2 -- 3 prior P1s fixed)
- 2026-02-19: skill-loader.ts, skill-registry.ts, context-integration.ts (task-10 skills-engine iter1 -- 2 P0 bare catches, 1 P1 missing context)
- 2026-02-19: ai-orchestrator.ts, ai-orchestrator.test.ts, package.json (task-11 integration checkpoint iter1 -- 0 P0, 3 P1 missing try/catch on I/O, 1 P2)
- 2026-02-19: report-generator.ts, smart-tip.ts, smart-todo.ts (task-13 smart-generation iter1 -- 0 P0, 5 P1, 2 P2)
- 2026-02-20: anima-mcp-server.ts, recommended-servers.ts, mcp.ts, McpManager.vue (task-17 mcp-panel-server iter1 -- 0 P0, 4 P1)
- 2026-02-20: active-window.ts, clipboard-monitor.ts, global-shortcuts.ts, types.ts (task-18 desktop-shell iter1 -- 0 P0, 5 P1, 2 P2)
- 2026-02-20: folder-monitor.ts, document-processor.ts, text-chunker.ts, document-processor.test.ts, folder-monitor.test.ts (task-19 file-monitor-doc-processor iter1 -- 0 P0, 4 P1, 1 P2, 1 P3)
- 2026-02-21: email/index.ts, feishu/index.ts, dingtalk/index.ts (task-20 channels-extra iter1 -- 0 P0, 7 P1, 2 P2, 1 P3)
- 2026-02-21: context-merger.ts, entity-extractor.ts, types.ts, index.ts, tests (task-22 context-merger iter1 -- 0 P0, 2 P1, 2 P2)
- 2026-02-21: 5 phase3-checkpoint integration test files (task-23 integration checkpoint phase3 iter1 -- 0 P0, 0 P1, 1 P2, 1 P3; test-only code, mostly clean)
- 2026-02-21: model-router.ts, phash.ts (DeduplicationTracker), index.ts, 3 test files (task-24 performance-cost-control iter1 -- 0 P0, 2 P1, 1 P2)
- 2026-03-04: 21 files across airi-brain service + stage-ui stores + server-runtime (main iter1 -- 1 P0, 8 P1, 3 P2)
