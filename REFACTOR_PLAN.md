# AIRI 架构重构计划

> 目标：AIRI 前端 + Vercel AI SDK 原生执行 + Skill/MCP 作为插件核心

## Phase 0: 清理重复 (当前)

### P0-1: 删除 xsAI 兼容层
- 删除 `packages/stage-ui/src/libs/ai/tool.ts` (replaces @xsai/tool)
- 删除 `packages/stage-ui/src/composables/use-ai-sdk.ts` 中的 `convertXsaiToolsToAiSdk()`
- 所有工具定义改用 AI SDK 原生 `tool()` 函数
- 删除 `packages/stage-ui/src/libs/ai/generate-text.ts` / `stream-text.ts` 等 xsAI wrapper
- 更新所有 import 引用

### P0-2: 删除 Tauri MCP plugin
- 删除 `crates/tauri-plugin-mcp/`
- 确认无其他代码引用此 crate
- 更新 Cargo.toml workspace members

### P0-3: Brain 迁移到 AI SDK
- `services/airi-brain/src/adapters.ts` 的手工 fetch → 使用 `generateText()` / `embed()`
- 统一使用 `@ai-sdk/openai` 的 `createOpenAI()` 创建 provider
- 移除手工 HTTP 调用代码

## Phase 1: 凭证安全化（务实方案）

> 原计划"Brain 成为唯一 LLM 出口"因流式延迟问题调整。
> 前端保持直接调 LLM API（性能优先），但凭证从 Brain 管理。

### P1-1: Brain 添加加密凭证存储表
- BrainStore 新增 provider_credentials 表
- AES-256-GCM 加密，密钥从 AIRI_ENCRYPTION_KEY 环境变量

### P1-2: Brain 添加凭证管理 handler
- 新增 handlers/credentials.ts
- 事件: credentials:store / credentials:get / credentials:list / credentials:delete

### P1-3: 前端 unified-providers 改为从 Brain 获取凭证
- 初始化时从 Brain 拉取已配置的 provider 列表
- 按需请求凭证，不持久化到 localStorage
- 无 Brain 连接时 fallback 到 localStorage（stage-web 独立模式）

## Phase 2: 补全 Plugin-SDK

### P2-1: 实现 WebSocket transport
### P2-2: 实现 capability offer/accept 协议
### P2-3: 实现 configuration validate/plan/commit
### P2-4: 版本协商支持降级
- PluginHost 新增 `supportedProtocolVersions` / `supportedApiVersions` 选项
- `negotiateVersion()` 算法：exact → downgraded → rejected 三级匹配
- Plugin 通过 `PluginStartOptions.compatibility` 声明支持的版本范围
- 无约束时默认 `exact`；host preferred 在 plugin list 中 → `exact`
- 有交集但非 preferred → `downgraded`（选最高版本）；无交集 → `rejected`
- `rejected` 时 throw + emit `module:status` phase=failed，中止初始化
- 4 个新增测试覆盖 exact/downgrade/reject 路径

## Phase 3: Skill + MCP 作为 Native Plugin

### P3-1: MCP Hub 包装为 native plugin
- `plugins/airi-plugin-mcp-hub/` — definePlugin 包装 McpHub
- 通过 InvokeEventa 暴露 servers:list/add/remove/connect + tools:aggregate
- 启动时自动连接已启用的 MCP 服务器

### P3-2: 集成 Anima MCP Server
- `plugins/airi-plugin-anima-mcp-server/` — 独立 MCP 服务器插件
- 通过 InvokeEventa 桥接 AnimaMemoryAccess / AnimaContextAccess 依赖
- 其他插件（context-engine）注册 handler 提供真实数据
- 无 provider 时工具优雅降级返回空/默认值
- 暴露 `animaMcpServerGet` 事件供应用层连接 transport (SSE/stdio)

### P3-3: Skill Registry 包装为 native plugin + 注入 system prompt
- `plugins/airi-plugin-skills/` — definePlugin 包装 SkillRegistry
- 通过 InvokeEventa 暴露 skills:list/toggle/get-by-id/context
- `skillsGetContext` 事件调用 buildSkillsContext()，修复"从未被调用"问题

### P3-4: Context Engine 升级为实时对话参与
- `plugins/airi-plugin-context-engine/` — definePlugin 包装 DocumentStore 只读访问
- 注册 P3-2 Anima MCP Server 的 provider 事件处理器（animaMemorySearch/animaMemoryRecent/animaDailySummary/animaGetUserContext）
- 暴露自有 invoke 事件供其他插件直接消费（contextEngineMemorySearch/contextEngineMemoryRecent/contextEngineDailySummary/contextEngineUserContext）
- 数据来源：与 Brain 服务共享 SQLite DB（WAL 模式并发读写），Context Engine 插件只读、Brain 负责写入
- 每日总结从 BrainStore 的 activity_summaries 表读取，表不存在时优雅降级
- 用户上下文从 DocumentStore 聚合：intimacy、profile facts、relationships、recent conversations

## 状态

- [x] 架构分析完成
- [x] Phase 0 主链路完成（AI SDK 主执行链、Tauri MCP 主路径移除）
- [ ] Phase 0 尾项清理（残余 wrapper / 兼容层文件待收口：`stage-ui/src/libs/ai/tool.ts`, `generate-text.ts`, `stream-text.ts`, `use-ai-sdk.ts` 等薄 wrapper 仍在，xsAI 已替换为 AI SDK 但封装层未删除）
- [x] Phase 1 完成（加密凭证存储、Brain 凭证管理、前端 Brain-first 同步）
- [x] Phase 2 完成（WebSocket transport、capability offer/accept、config validate/plan/commit、版本协商降级）
- [x] Phase 3 插件包实现完成（MCP Hub / Skills / Anima MCP Server / Context Engine 均已 definePlugin 包装）
- [ ] Phase 3 运行时接管未完成：
  - [ ] `ai-orchestrator.ts` 仍直接 `new McpHub()` / `new SkillRegistry()`，未切换到 plugin invoke 路径
  - [ ] 前端 skills UI 仍走 `serverChannel` → brain handlers 旧事件流（`skills:list`/`skills:toggle`），未接入 plugin invoke
  - [ ] workspace `plugins/*` 无自动部署到 `userData/plugins/v1` 的闭环
  - [ ] brain `handlers/skills.ts` 直连 SkillRegistry，与 `airi-plugin-skills` 双轨并存
