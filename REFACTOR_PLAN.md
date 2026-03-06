# Anase 重构计划（能力可用导向）

> 目标：优先让 Anase 前端具备 `nanobot` 所需的后端能力，并在不重复建设执行层的前提下，逐步收口到统一运行时。
> 核心原则：`能力可用 > 主路径统一 > 插件化形式纯度`。

## 一、当前判断

### 已经成立的事实

- Anase 主执行链已经以 `Vercel AI SDK` 为核心，`Brain` 也已迁移到 AI SDK。
- `MCP Hub`、`Skills`、`Context Engine`、`Anima MCP Server` 对应的 native plugin 包已经实现，不再只是计划。
- 凭证安全化已经落地，前端也已经具备 `Brain-first` 的凭证同步能力。
- `plugin-sdk` 的 transport / capability / configuration / compatibility 基础能力已经补齐到可用状态。

### 当前还没完全收口的地方

- 主进程仍存在直接 new `McpHub` / `SkillRegistry` 的路径，尚未完全切到统一能力入口。
  - `setup-ai-services.ts:41` 创建独立 `McpHub`，`ai-orchestrator.ts:73` 内部又创建第二个 `McpHub`，同一进程两个实例。
- 前端 `skills` 入口仍主要走 `Brain handlers + server-runtime` 事件流，不是 plugin-native 单一入口。
- 内建插件虽然已存在于仓库 `plugins/`，但运行时装载、分发、接管主路径还没有完全闭环。
- `Context Engine` 已具备能力，但还没有成为前端聊天 / proactive / MCP 读取的唯一上下文事实源。

### 本计划的真实目标

不是追求“所有东西必须先插件化”，而是确保：

1. `nanobot` 需要的后端能力已经存在且可调用。
2. Anase 不再继续长出第二套、第三套执行内核。
3. 插件化在有收益的地方接管主路径，而不是为了概念统一强推。

---

## 二、重构原则

### R1. 能力优先

- 只要某项能力已稳定存在、可测试、可组合，就视为阶段完成。
- 插件化、MCP 化、统一 facade，是下一层优化，不是本阶段硬门槛。

### R2. 执行层唯一

- `AI SDK` 是唯一 LLM 执行内核。
- 不再新增第二套 `agent loop / tool registry / MCP glue`。

### R3. 能力层可扩展

- `Skill`：策略 / 提示 / 知识层。
- `MCP`：外部工具与资源接入协议。
- `Plugin`：宿主侧能力组织、生命周期与协作机制。
- `Context Engine`：第一方上下文内核，不作为普通可替换插件看待。

### R4. 主路径收口

- 允许过渡期双轨并存。
- 不允许继续新增第三轨。
- 后续工作重点是“把已有能力接入统一主路径”，不是继续发散设计。

---

## 三、Phase 0：执行层去重

### P0-1: 前端主链路切换到 AI SDK

- `stage-ui` 主聊天链路使用 AI SDK 原生 `streamText()` / tools / `stopWhen`
- 保留少量本地 wrapper 文件作为兼容尾项，后续再清

### P0-2: Tauri MCP 主路径退出

- 原 Tauri MCP 方案不再作为 Electron 主路径
- 历史残留引用 / 文档 / 工件可继续清理，但不阻塞当前目标

### P0-3: Brain 迁移到 AI SDK

- `services/anase-brain` 使用 AI SDK `generateText()` / `embed()`
- 不再依赖手工 fetch 作为主实现

### 状态

- [x] 主执行链去重完成
- [x] 兼容层清理完成（`stream-text.ts` / `generate-text.ts` / `message-helpers.ts` 已删除，验证器已迁移到 AI SDK `generateText`）

---

## 四、Phase 1：凭证安全化

> 这一阶段已经完成，保留为运行要求与维护项。

### P1-1: Brain 凭证存储

- `provider_credentials` 表已建立
- 支持 `AES-256-GCM`
- 运行要求：生产环境必须设置 `ANASE_ENCRYPTION_KEY`

### P1-2: Brain 凭证事件接口

- 已支持：
  - `credentials:store`
  - `credentials:get`
  - `credentials:list`
  - `credentials:delete`

### P1-3: 前端 Brain-first 同步

- 前端优先从 Brain 恢复凭证
- Brain 不可用时允许 fallback

### 状态

- [x] 完成
- [ ] 生产环境密钥约束与运维检查补齐

---

## 五、Phase 2：Plugin Host 基础设施

> 这一阶段已经基本完成，已达到“可承载能力插件”的程度。

### P2-1: Transport

- 已支持 `websocket` transport 类型
- 保留多 transport 设计空间

### P2-2: Capability 协议

- 已支持 capability offer / announce / ready / wait

### P2-3: Configuration 协议

- 已支持 configuration 生命周期

### P2-4: 版本协商

- 已支持 `exact / downgraded / rejected`

### 状态

- [x] 完成
- [ ] 运行时真实接管范围继续扩大

---

## 六、Phase 3：能力插件化（已实现）

> 这一阶段的重点不是“是否存在包”，而是“这些包是否已经把能力落地”。
> 结论：能力已落地，但主路径接管还没彻底完成。

### P3-1: MCP Hub 能力包

- `plugins/anase-plugin-mcp-hub/`
- 已暴露服务器管理与工具聚合能力

### P3-2: Anima MCP Server 能力包

- `plugins/anase-plugin-anima-mcp-server/`
- 已暴露 memory / daily summary / user-context MCP 接口

### P3-3: Skills 能力包

- `plugins/anase-plugin-skills/`
- 已暴露 `skills:list / toggle / get-by-id / context`

### P3-4: Context Engine 能力包

- `plugins/anase-plugin-context-engine/`
- 已支持：
  - memory search
  - recent memories
  - daily summary
  - user context
- 当前以共享 SQLite 只读方式接入

### 状态

- [x] 插件包实现完成
- [ ] 应用主路径全面切换完成

---

## 七、Phase 4：运行时收口（当前重点）

> 这是接下来最重要的阶段。
> 目标不是新增能力，而是让“已经做出来的能力”真正成为统一入口。

### P4-1: 主进程收口

- `apps/stage-tamagotchi` 中与 AI / MCP / Skills 相关的装配层统一
- 明确只保留一个能力入口：
  - 要么主进程 orchestrator 作为唯一 facade
  - 要么 plugin-native invoke 作为唯一 facade
- 禁止继续同时直接依赖 `McpHub`、`SkillRegistry`、plugin invoke 三套入口

### P4-2: 前端入口收口

- `skills` 前端入口统一
- `mcp` 前端入口统一
- 不再长期维持 “Brain 事件流 + plugin-native” 双入口

### P4-3: 内建插件装载闭环

- 明确内建插件从仓库构建产物进入 `userData/plugins/v1` 的流程
- 明确哪些插件默认启用
- 让 plugin host 真正承载系统能力，而不是仅作为可选实验壳

### P4-4: Context 唯一事实源

- 前端聊天上下文
- proactive 生成上下文
- MCP `user-context`
- memory query

以上都需要逐步收口到同一个 `Context Engine / Brain` 事实模型，而不是各自拼 prompt

### 状态

- [x] P4-1: 主进程 McpHub 去重 + SkillRegistry 共享 DB 单一真相源
- [x] P4-2: 前端 legacy MCP store 清理，Skills 纳入 data maintenance
- [x] P4-3: 内建插件构建 + 部署闭环（dev + prod extraResources）
- [x] P4-4: Skills context 注入聊天流（chat context provider）
- [x] P4-4 后续: Context-Engine LLM 调用注入 skills context（ReportGenerator / MemoryExtractor / SmartTip / SmartTodo）
- [x] P4-4 后续: proactive 路径 — bridge LLM enrichment 通过 AiOrchestrator.buildSystemPrompt() 已包含 skills context；template 路径不用 LLM 无需注入

---

## 八、Phase 5：可延期优化

> 这些工作有价值，但不应阻塞“能力可用”。

### O5-1: 兼容层删除 ✅

- ~~删除不再需要的本地 AI wrapper~~ → 已在 Phase 0 完成
- 残余历史适配代码（如有发现）可随手清理

### O5-2: 全量 plugin-native 接管

- 仅在收益明确时推进：
  - 第三方分发
  - 生命周期隔离
  - 权限控制
  - 热插拔

### O5-3: MCP/UI 深度统一

- 把当前设置页配置广播路径逐步替换为统一能力 facade

---

## 九、验收标准

### A. 能力验收

- [x] LLM 调用能力可用
- [x] Embedding 能力可用
- [x] MCP 多服务器接入能力可用
- [x] Skills 注册与 context 构建能力可用
- [x] Context memory / summary / user-context 能力可用
- [x] 凭证安全存储能力可用

### B. 架构验收

- [x] AI SDK 成为主执行内核
- [x] 主进程只保留一个 MCP/Skills 能力入口
- [x] 前端只保留一个 Skills/MCP 使用入口
- [x] Context 成为统一事实源（聊天 skills context + Context-Engine LLM consumers + proactive bridge 均已接入）
- [x] 内建插件装载闭环完成

### C. 风险验收

- [x] 生产环境 `ANASE_ENCRYPTION_KEY` 配置校验（启动时 warn/error 日志）
- [x] plugin-native 路径的启动顺序与降级路径验证（per-plugin try/catch，单个失败不影响其他）
- [x] 旧路径删除前完成回归测试（378 tests: tamagotchi 36 + brain 35 + context-engine 307）

---

## 十、当前状态总览

- [x] 能力迁移完成
- [x] 执行层大方向收口完成
- [x] plugin-native 能力包完成
- [x] 运行时主路径收口完成（P4-1 ~ P4-4 核心落地 + 所有后续项）
- [x] 旧路径清理（legacy wrappers 已删、duplicate McpHub 已去重、legacy MCP store 已移除、stale comments 已更新）

---

## 十一、下一步只做这 4 件事

1. 收口主进程 AI / MCP / Skills 入口，停止双轨并存继续扩大。
2. 收口前端 `skills` / `mcp` 的调用入口，选定单一 facade。
3. 做内建插件部署闭环，让 `plugins/` 产物真正进入 plugin host 运行目录。
4. 把聊天/proactive/MCP 的上下文读取收口到统一 context fact model。
