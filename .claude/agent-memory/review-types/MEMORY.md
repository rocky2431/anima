# Review Types Agent Memory

## Project Type Patterns

- **context-engine**: Uses plain TypeScript interfaces (ActivityEvent, ActivityContext, ScreenshotResult) as DTOs for pure functions. No classes for domain data -- data flows through functions. ActivityEvent/ActivityContext/ActivityState/ProcessedContext lack `readonly` modifiers (potential future flag).
- **persona-engine**: PersonaEmotion is a 6-value string literal union; EmotionState is a backwards-compatible alias. TriggerCondition embeds a pure `check` function. TriggerResult now uses proper discriminated union (fixed from previous P1). xstate v5 emotion state machine with typed EmotionEvent. IntimacyState uses readonly interface + factory functions for immutable state transitions. TriggerInput and TriggerCondition still lack `readonly` modifiers (flagged P2). AnimaEmotionPayload.name is now typed as `AnimaEmotionName` literal union (fixed from previous P2).
- **VectorStore**: LanceDB wrapper class with private constructor + static factory. Good encapsulation pattern. Uses ContextVector interface for records.
- **DocumentStore**: SQLite (better-sqlite3) class with constructor initialization (WAL mode, table creation). Accepts plain interfaces without validation -- flagged.
- **Storage types (types.ts)**: ContextVector, VectorSearchResult, Conversation, Todo -- all plain interfaces, no Valibot validation at boundary.
- **Validation**: Valibot is the project standard (not Zod). Check for Valibot schema usage when reviewing type enforcement.
- **Architecture**: Functional Core / Imperative Shell. ScreenshotCapture is explicitly labeled as Imperative Shell. Pure functions in activity/ and persona-engine/.

## Orchestrator Type Patterns (Task 7)

- **AnimaOrchestrator**: Interface + factory function (`createAnimaOrchestrator`) for Imperative Shell orchestrator. Hides emotionActor, pipeline, monitor, intimacy internals as closure variables. `tickScreenshot()`/`tickActivity()` enable deterministic testing.
- **AnimaProactiveEvent**: readonly interface emitted on trigger fire. Contains ProactiveResponse, AnimaEmotionPayload, timestamp.
- **AnimaOrchestratorDeps/Config**: Dependency and config interfaces. Config uses optional fields with defaults in factory.
- `TRIGGER_EMOTION_MAP` keyed by plain `string` instead of trigger name literal union (flagged P2). Pattern: extract `TriggerName` from `ALL_TRIGGERS[number]['name']`.
- Unsafe `as PersonaEmotion` casts on xstate actor snapshot values (flagged P2). Prefer typed machine output or runtime guard.
- Millisecond config fields use bare `number` throughout (flagged P2 as primitive obsession).

## MCP Hub Type Patterns (Task 9, iter2)

- **McpServerConfig/McpServerConfigInput**: Now proper discriminated unions on `transport` field (StdioServerConfig, SseServerConfig, HttpServerConfig). FIXED from iter1's flat interfaces.
- **McpTransport**: Still a mixed union (StdioMCPTransport class instance + plain objects with `type`). Requires `as` cast. Flagged P2.
- **McpServerStore**: SQLite class. `safeRowToConfig()` now uses `isTransportType()` guard + switch -- FIXED from iter1's unsafe `as` cast. `validateConfig()` now runs on both add() and update() paths -- FIXED from iter1. Command allowlist + shell metachar validation present. BUT: `update()` still has `as McpServerConfig` cast after spread merge (flagged P1). No Valibot schemas (flagged P2).
- **McpClientManager**: Good encapsulation (private Map). `getTools()`/`aggregateTools()` still return `Record<string, unknown>` (flagged P2).
- **McpHub**: Facade composing store + client manager. ServerStatus 2-value union. ConnectEnabledResult structured result type (good).

## Skills Engine Type Patterns (Task 10)

- **SkillMetadata**: Plain interface with all-string required fields + optional string[] arrays. No readonly. `category` and `version` are plain strings (flagged P2 primitive obsession).
- **SkillSource**: Proper 2-value literal union ('builtin' | 'user'). Good.
- **Skill**: Composed type (metadata + body + source + filePath). No readonly.
- **SkillLayer1/SkillLayer2**: Two-layer architecture for token-budget-aware injection. Layer2 defined but unused (flagged P3).
- **SkillRegistry**: Class with private Map, good encapsulation. BUT getById() leaks mutable reference (flagged P1). activate()/deactivate() mutate entry in-place.
- **parseSkillMd**: Validates required fields, throws descriptive errors. But optional array elements not type-checked (flagged P2).
- **No Valibot schemas** at file I/O boundary (consistent pattern across codebase).

## AI Orchestrator Type Patterns (Task 11)

- **AiOrchestrator**: Interface + factory function (`createAiOrchestrator`). Unlike Task 7's AnimaOrchestrator which hides internals as closure vars, this one exposes mcpHub and skillRegistry as public readonly properties (flagged P2 encapsulation leak).
- **AiOrchestratorConfig**: readonly interface with optional baseSystemPrompt. Good pattern.
- **InitResult/GenerateResult**: readonly result interfaces. GenerateResult.usage inner fields lack readonly (flagged P3).
- **getTools()**: Returns `Record<string, unknown>` inherited from McpHub (flagged P2). Unsafe `as` casts in generate() to bridge to AI SDK types (flagged P2).
- **AI SDK integration**: Uses `ai` package (Vercel AI SDK v6). LanguageModelV2 interface from @ai-sdk/provider. Test doubles implement LanguageModelV2 with rationale comments.

## Cron Service Type Patterns (Task 12)

- **ScheduleMode**: Proper 3-value literal union ('at' | 'every' | 'cron'). Good.
- **CronJobRecord**: Plain interface, mutable, mixes config + runtime state. `schedule` is polymorphic `string` whose meaning depends on `mode` -- missed discriminated union opportunity (flagged P1). No readonly. get()/list() leak mutable refs (flagged P1, same as SkillRegistry pattern).
- **ScheduleOptions**: Input interface. `handler` is plain `string` with no type link to registered handlers (flagged P2).
- **JobStore**: SQLite class, good encapsulation. `mapRow()` uses unsafe `as ScheduleMode` cast (flagged P2). SQL CHECK constraint on mode is good defense-in-depth.
- **CronService**: Class with private Maps. Good encapsulation. `scheduleJob()` silently drops jobs with unregistered handler after DB save (flagged P3 architecture).
- No Valibot schemas (consistent codebase pattern).

## Smart Generation Type Patterns (Task 13)

- **LlmProvider**: Interface with `generateText` and `generateStructured<T>`. The generic T is unconstrained -- callers must add runtime validation. SmartTip does (isValidSmartTipResult), ReportGenerator/SmartTodo do NOT (flagged P1/P2).
- **EmbeddingProvider**: Clean interface with `readonly dimension`. Good.
- **DailySummary**: Plain mutable interface. `date` is plain `string` (primitive obsession for YYYY-MM-DD). No readonly.
- **SmartTipResult**: Has literal unions for `kind` and `urgency`. Best-typed output interface. Runtime-validated in SmartTip.
- **TodoSuggestion/SmartTodoResult**: Minimal interfaces, all string/array. No validation beyond null guard.
- **PersonaConfig**: readonly interface duplicated from persona-engine to avoid cross-package dep. Good readonly pattern.
- **SmartTodo.llm**: Non-readonly with public `setLlmProvider()` setter -- inconsistent with other classes (flagged P2).
- **Pattern**: Three consumption classes (ReportGenerator, SmartTip, SmartTodo) follow consistent options-object constructor + private readonly fields pattern. SmartTip is the gold standard for LLM output validation.

## Memory Pipeline Type Patterns (Task 14)

- **Storage types**: UserProfileFact, Relationship, ImportantDate, MemoryEntry -- all plain mutable interfaces. No readonly. category/dateType/relationshipType are plain `string` with JSDoc hints (flagged P2 primitive obsession).
- **Extraction types**: ExtractedMemoryItem, ExtractedProfileFact, ExtractedRelationship, ExtractedImportantDate, ExtractionResult, ExtractionInput -- all plain mutable interfaces.
- **ExtractionInput.conversations[].role**: Uses `string` instead of existing `ConversationRole` union (flagged P2).
- **MemoryExtractor**: Class with private readonly fields, options-object constructor. Has manual runtime validation (validateExtractionResult + 4 type guards) -- follows SmartTip gold-standard pattern. No Valibot but functional.
- **MemoryOrchestrator**: Class with private readonly fields. getWorkingMemory() returns spread copy as `readonly Conversation[]` (good). BUT recall() hardcodes `importance: 0` -- type promises value it cannot deliver (flagged P1).
- **VectorSource**: Properly extended with 'memory' | 'preference' | 'relationship' (good pattern -- literal union, not widened to string).
- **ConversationRole**: Now defined as literal union ('user' | 'assistant' | 'system') -- FIXED from previous plain `string` on Conversation.role.

## Evening Pipeline Type Patterns (Task 15)

- **EveningPipelineEvent**: Proper discriminated union on `type` field with 3 variants (report-generated, memories-extracted, persona-response). Each variant has specific typed `data` payload. Good pattern.
- **EveningPipeline**: Interface + factory function (`createEveningPipeline`). Hides collectedActivities and executeEveningPipeline as closure vars. Good encapsulation, follows AnimaOrchestrator pattern.
- **EveningPipelineDeps**: Plain mutable interface (no readonly). Consistent with codebase pattern.
- **EveningPipelineConfig**: Optional callbacks (onEvent, onError). Clean config pattern.
- Unsafe `as PersonaEmotion` cast on xstate snapshot (line 90) -- same recurring pattern from Task 7 (flagged P2).
- Hardcoded trigger result object (lines 91-96) not typed as TriggerResult -- bypasses trigger system types (flagged P2).
- `cronExpression` param is plain `string` (flagged P2 primitive obsession).

## Channels Extra Type Patterns (Task 16)

- **ChannelConfig**: Proper discriminated union on `platform` field (WhatsAppConfig | SlackConfig). Good pattern.
- **ChannelStatus/ChannelPlatform**: Literal unions -- consistent with codebase.
- **Channel interface**: readonly platform + status with methods. Good encapsulation.
- **SlackChannel/WhatsAppChannel**: Private fields, getter-based status, DI via constructor deps. WhatsApp has rate limiting domain behavior (not anemic).
- **ChannelRegistry**: Private Map + handlers. getByPlatform() leaks mutable reference (flagged P1, same pattern as SkillRegistry/CronService). register() does not validate channel.platform matches config.platform (flagged P1).
- **Unsafe casts**: `as BaileysUpsertEvent` and `as SlackMessage` on external library event data without type guards (flagged P2).
- **ChannelOperationResult**: boolean+optional error instead of discriminated union (flagged P3, same anti-pattern as old TriggerResult).
- **No constructor validation** on config objects (flagged P2). No Valibot schemas (consistent codebase pattern).
- **IncomingMessage**: Mutable interface for immutable events. Particularly important because messages fan out to multiple handlers (flagged P2).

## File Monitor & Document Processor Type Patterns (Task 19)

- **DocumentType**: Proper 4-value literal union ('pdf' | 'docx' | 'xlsx' | 'txt'). Good.
- **DocumentExtractionResult**: All readonly fields. Uses DocumentType union. Best readonly discipline in context-engine. Good pattern.
- **TextChunk**: All readonly fields. Clean output type.
- **TextChunkerOptions**: Options interface with optional chunkSize/overlapSize. Validation done in chunkText pure function (good FC pattern).
- **FileChangeEvent**: All readonly fields. type is 3-value literal union ('create' | 'update' | 'delete'). Good.
- **FolderMonitorOptions**: Mutable watchPaths/extensions arrays (flagged P2 inconsistency -- output types are readonly but input options are not). Constructor copies by reference not value (flagged P2).
- **FolderMonitor**: Class with private readonly fields, good encapsulation. Constructor validates watchPaths non-empty, normalizes extensions. start() is idempotent. Labeled Imperative Shell (correct).
- **DocumentProcessor**: Stateless class (Imperative Shell). Has unsafe `as` casts on pdfjs-dist TextContent items and exceljs row.values (flagged P2). detectDocumentType() maps .md/.csv/.json/.log to 'txt' -- may surprise callers expecting only .txt.
- **Notable improvement**: First task in context-engine to consistently use readonly on output types. Sets new standard.

## Desktop Shell Type Patterns (Task 18)

- **ActiveWindowInfo**: Plain mutable interface (appName, windowTitle, pid). pid uses 0 as sentinel for "no data" -- ambiguous with real PID 0 (flagged P1).
- **ClipboardChange**: Mutable event interface. timestamp is bare `number` (no unit indication). No readonly (flagged P2).
- **ClipboardMonitorOptions**: DI options interface with optional pollIntervalMs, required readClipboard/onChange, optional onError. Clean pattern.
- **ShortcutAction**: Proper 4-value literal union. Good.
- **ShortcutBinding**: Simple interface (accelerator string + action union).
- **ShortcutManagerOptions**: DI options interface. Has dead `unregister` field never consumed by ShortcutManager (flagged P2).
- **ClipboardMonitor**: Class with private readonly fields. Good encapsulation. No validation on pollIntervalMs (flagged P2).
- **ShortcutManager**: Class with private readonly fields. Good encapsulation. Stores registerFn/unregisterAllFn but ignores unregister.
- **parseAppleScriptOutput**: Pure function (good FC/IS separation). Uses sentinel values (empty string, pid 0) instead of null/discriminated union.

## Email/Feishu/DingTalk Channel Type Patterns (Task 20)

- **EmailConfig/FeishuConfig/DingTalkConfig**: New config interfaces with discriminant `platform` field, extending ChannelConfig discriminated union. Good pattern. EmailConfig has nested imap/smtp objects with auth credentials. FeishuConfig.receiveIdType is a 3-value literal union (good).
- **EmailChannel/FeishuChannel/DingTalkChannel**: All follow established channel pattern: private fields, getter-based status, DI via constructor deps, implements Channel interface. Good encapsulation (8/10).
- **Optional deps anti-pattern**: All 3 channels accept deps as optional constructor param, store null, throw at connect() if missing (flagged P1). Should be required at construction.
- **Unsafe casts**: `as { path, count, prevCount }` on IMAP exists data (Email), `as DingTalkBotMessage` on JSON.parse (DingTalk), `as { text?: string }` on JSON.parse (Feishu) -- all flagged P2. Consistent with Task 16's `as BaileysUpsertEvent`/`as SlackMessage`.
- **StatusChangeHandler**: Type alias + onStatusChange()/statusHandlers boilerplate duplicated across all 3 files (flagged P3). Candidate for extraction to shared types or base class.
- **ChannelRegistry FIXES from Task 16**: getByPlatform() now returns spread copy (P1 fixed). register() now validates platform match (P1 fixed).
- **IncomingMessage**: Still mutable despite fan-out (re-flagged P2, originally Task 16).
- **No config validation**: No Valibot schemas on new configs (flagged P2, consistent codebase pattern).

## Context Merger Type Patterns (Task 22)

- **ActivityType**: 7-value literal union. Good domain modeling for activity classification.
- **ContextSource**: Plain mutable interface. `source` field is 5-value literal union (good). `importance` is bare `number` with 0-1 JSDoc constraint (flagged P2). No readonly (flagged P2).
- **ExtractedEntities**: Plain mutable interface with 5 string[] arrays. No readonly (flagged P2).
- **MergedContext**: Output type, fully mutable. Regresses from Task 19's readonly standard (DocumentExtractionResult, TextChunk, FileChangeEvent). Flagged P2.
- **ContextMerger**: Class with private readonly fields, good encapsulation. Clean FC/IS split: pure functions exported separately (deduplicateStrings, mergeKeywords, computeImportance, selectTopSources). validateActivityType uses ReadonlySet guard + 'other' fallback (defensive, good). maxSources not validated in constructor (flagged P3).
- **EntityExtractor**: Class with private readonly llm. **No runtime validation of LLM output** -- trusts generateStructured<ExtractedEntities> blindly (flagged P1). Contrast with SmartTip/MemoryExtractor gold-standard pattern.
- **Pattern**: Promise.all for parallel LLM calls (entity extraction, classification, summary). Good performance pattern.

## UI Panel Type Patterns (Task 21)

- **MemoryEntryUI**: Mirrors backend MemoryEntry but IMPROVES category from `string` to `MemoryCategory` literal union. Good type narrowing at UI boundary.
- **MemoryCategory**: 5-value literal union + `MEMORY_CATEGORIES` const array (as const) for iteration. Good pattern.
- **TodoUI**: Mirrors backend Todo exactly -- inherits illegal state (completed/completedAt mismatch, flagged P2). toggleTodo() maintains invariant correctly at runtime.
- **SkillUI**: category/version still plain `string` (flagged P2 primitive obsession, mirrors backend). source is proper literal union.
- **All interfaces mutable**: No readonly (flagged P3). Vue/Pinia reactivity context makes this less critical than backend types.
- **Store modules**: Pinia composition API stores. Use immutable update patterns (spread copies). Expose raw refs (standard Pinia pattern). getSkillById() leaks mutable reference (flagged P2, recurring pattern).
- **Pattern**: UI types mirror backend types with `UI` suffix, with opportunity to add type narrowing at boundary (MemoryCategory is the example to follow).

## Performance & Cost Control Type Patterns (Task 24)

- **TaskType**: 4-value literal union ('classification' | 'extraction' | 'generation' | 'summarization'). Good.
- **ModelTier**: 3-value literal union ('lightweight' | 'standard' | 'local'). Good.
- **ModelRouterOptions**: Nested providers object (required lightweight/standard, optional local). `routingOverrides` uses `Partial<Record<TaskType, ModelTier>>` -- type-safe but can specify 'local' without a local provider (flagged P2).
- **RoutingStats**: Output interface, mutable (flagged P2). getStats() returns spread copies of internal counters (good runtime protection).
- **ModelRouter**: Implements LlmProvider interface -- transparent proxy pattern. Private readonly fields, good encapsulation. Labeled Imperative Shell. classifyTask is pure function (Functional Core). LOCAL_ELIGIBLE_TASKS uses ReadonlySet (good).
- **DeduplicationStats**: Output interface, mutable (flagged P2). deduplicationRate is bare number 0-1 (primitive obsession).
- **DeduplicationTracker**: Private counters, clean minimal API. Good encapsulation. Appended to phash.ts (colocated with hash functions).
- **Pattern**: routingOverrides allows invalid config (override to 'local' without local provider) -- getProvider silently falls back. Constructor should validate.

## Common Issues in This Codebase

- Primitive obsession for timestamps/durations (bare `number` throughout)
- Boolean flag + empty string sentinel values instead of discriminated unions (FIXED in persona-engine TriggerResult)
- No branded types yet -- worth flagging but walking skeleton context lowers severity
- Documented union values in JSDoc but typed as plain `string` (MemoryEntry.category, ImportantDate.dateType, Relationship.relationshipType)
- Todo type allows illegal state: completed=true with completedAt=null (and vice versa)
- No Valibot validation at Imperative Shell boundaries (DocumentStore accepts unvalidated interfaces)
- Pattern: manual LLM output validation with type guards is acceptable alternative to Valibot (SmartTip, MemoryExtractor)
