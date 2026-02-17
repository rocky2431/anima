# Architecture Design

> **Purpose**: This document defines HOW the system is built. Based on arc42 template.
> **Derived from**: `INTEGRATION_PLAN.md` (Anima 原生集成方案 v3)
> **Reference**: [arc42.org](https://arc42.org)

---

## 1. Introduction & Goals

### 1.1 Requirements Overview

| Requirement | Priority | Impact on Architecture |
|-------------|----------|----------------------|
| 主动感知用户活动并关心 | P0 | 需要 ContextEngine (截图+VLM+活动监控) + ProactiveTrigger |
| 有人格、有情绪、有记忆 | P0 | 需要 PersonaEngine (状态机+亲密度) + 四层记忆架构 |
| 零 Python 依赖的 Mac 桌面应用 | P0 | TypeScript 全栈 + MCP 协议桥接外部生态 |
| 无限扩展能力 (MCP+Skills) | P0 | MCP Hub 多服务器 + Skills Engine 知识层 |
| 多频道消息触达 | P1 | channels-extra 统一 Channel 接口 |
| AI Agent 智能决策 | P0 | AI SDK 6 Agent Loop + Anthropic Agent 模式 |

### 1.2 Quality Goals

| Priority | Quality Goal | Scenario |
|----------|--------------|----------|
| 1 | Performance | App 冷启动 <3s，主动对话 感知→输出 <2s |
| 2 | Privacy | 截图/记忆全部本地处理，仅脱敏后的对话内容经 LLM API |
| 3 | Extensibility | 用户可通过 MCP Server + SKILL.md 扩展能力，无需修改源码 |
| 4 | UX | 不打扰原则：最多 3 次/小时、15 次/天，全屏免打扰 |
| 5 | Cost Efficiency | 分层模型路由 + pHash 去重 → 活跃用户月 LLM 成本 <$5 |

### 1.3 Stakeholders

| Role | Expectations |
|------|--------------|
| 终端用户 | 开箱即用、有陪伴感、不打扰、数据隐私 |
| 开发者/扩展者 | MCP/Skills 生态、清晰 API、良好文档 |
| 维护者 | 单语言栈 (TS)、模块化、可测试 |

---

## 2. Constraints

### 2.1 Technical Constraints

| Constraint | Reason |
|------------|--------|
| TypeScript 全栈，零 Python 依赖 | Mac 桌面应用不能要求用户安装 Python；Python 通过 MCP 外部接入 |
| Electron 桌面框架 | 复用 AIRI 已有 stage-tamagotchi 基础设施 |
| LLM API 调用（非本地训练） | 不训练模型，通过 API 调用 + 本地 node-llama-cpp 兜底 |
| macOS 优先 | 先聚焦 Mac 体验，跨平台后续考虑 |
| 复用 AIRI monorepo | 扩展现有包结构，不另起项目 |

### 2.2 Organizational Constraints

| Constraint | Reason |
|------------|--------|
| 1-2 人开发 | 个人/小团队项目，约 2.5 个月工期 |
| 总工时约 40-50 人天 | 含 MCP + Skills + AI SDK 迁移 |

### 2.3 Conventions

| Convention | Description |
|------------|-------------|
| Code style | ESLint via @moeru/eslint-config，UnoCSS，kebab-case |
| Commit format | Conventional Commits |
| Branch strategy | main + feature branches |
| DI | injeca 依赖注入容器 |
| IPC | @moeru/eventa 类型安全 IPC/RPC |
| Validation | Valibot schemas |
| Bundling | tsdown for libraries, Vite/electron-vite for apps |

---

## 3. Context & Scope

### 3.1 Business Context

```
                         ┌──────────────────────┐
      [用户 Mac 桌面] ──→│      Anima.app       │←── [LLM API Providers]
                         │                      │     (OpenAI/Anthropic/
      [用户语音] ────────→│  Electron 双进程      │      Google/Ollama...)
                         │  · 主进程 (Node.js)  │
   [外部 MCP Servers] ──→│  · 渲染进程 (Vue 3)  │←── [MCP Servers]
                         │                      │     (GitHub/Search/DB...)
   [通讯频道] ←──────────│                      │
   (Slack/WhatsApp/      └──────────────────────┘
    飞书/Email/QQ)
```

| Actor/System | Input | Output |
|--------------|-------|--------|
| 用户 | 对话文本、语音、桌面活动 | 角色化回复、主动关心、提醒 |
| LLM API | Prompt + Context | 生成文本、结构化输出、VLM 理解 |
| MCP Servers | Tool 定义 + Resources | Tool 调用结果、外部数据 |
| 通讯频道 | 外部消息 | 角色消息、通知 |

### 3.2 Technical Context

| Interface | Protocol | Data Format |
|-----------|----------|-------------|
| LLM API | HTTPS | JSON (AI SDK 6 统一接口) |
| MCP Servers | stdio / SSE / Streamable HTTP | JSON-RPC |
| Electron IPC | Eventa RPC | TypeScript typed events |
| WebSocket (server-runtime) | ws://localhost:6121/ws | JSON events |
| 通讯频道 | 各自协议 (WebSocket/IMAP/HTTP) | JSON / Protocol Buffers |

---

## 4. Solution Strategy

### 4.1 Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **语言** | TypeScript 全栈 + MCP 桥接 | App 单语言，MCP 连接一切外部生态 |
| **LLM SDK** | Vercel AI SDK 6 (从 xsAI 迁移) | 内置 MCP Client + Agent Loop + 2.8M 周下载 |
| **MCP SDK** | @ai-sdk/mcp + @modelcontextprotocol/sdk | 官方标准 v2 stable |
| **桌面框架** | Electron (已有 stage-tamagotchi) | 复用已有基础设施 |
| **向量存储** | LanceDB (Rust 嵌入式) | 原生向量搜索 HNSW，Node.js binding，零依赖 |
| **结构化存储** | SQLite (better-sqlite3) | 成熟，Electron 广泛使用 |
| **本地推理** | node-llama-cpp | 零 sidecar，Node.js 进程内直接跑 llama.cpp |
| **截图** | Electron desktopCapturer + sharp | 原生 API，已有 electron-screen-capture |
| **文件监控** | @parcel/watcher | Rust 实现，性能好 |
| **定时任务** | croner | TS 原生 cron，无跨语言 |
| **DI 容器** | injeca (已有) | 模块生命周期管理 |

### 4.2 Architecture Patterns

| Pattern | Applied To | Rationale |
|---------|------------|-----------|
| Augmented LLM | 所有交互的底座 | LLM + Tools(MCP) + Memory(LanceDB) + Knowledge(Skills) |
| Routing | 用户消息入口 | 分类意图 → 闲聊/工具请求/上下文查询/复杂任务 |
| Prompt Chaining | 主动关心流程 | 感知 → 理解 → 决策 → 生成 → 输出 |
| Parallelization | 多源信息收集 | 晚间总结并行收集活动/待办/截图/对话 |
| Evaluator-Optimizer | 记忆萃取 | 生成摘要 → 评估重要性 → 去重 → 存储 |

### 4.3 Cost Control Strategy

| Strategy | Savings |
|----------|---------|
| 分层模型路由 (分类用 Haiku/Flash，生成用 Sonnet/4o) | 60-70% |
| 按需加载 MCP Tools (不传全部 tool 定义) | 30-50% token |
| pHash 去重 (截图内容未变不调 VLM) | 70-80% VLM 调用 |
| 本地模型兜底 (高频低质任务用 node-llama-cpp) | 100% 免费 |
| OpenAI Batch API (非实时任务 50% 折扣) | 50% |

---

## 5. Building Block View

### 5.1 Level 1: 进程模型

```
┌───────────────────────────────────────────────────┐
│                  Anima.app (DMG)                   │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  Electron 主进程 (Node.js)                    │ │
│  │  ├── injeca DI 容器                           │ │
│  │  ├── server-runtime (ws://localhost:6121/ws)  │ │
│  │  ├── PersonaEngine (情绪+亲密度+记忆)          │ │
│  │  ├── ContextEngine (截图+文件+活动)            │ │
│  │  ├── MCP Hub (多服务器注册+Client)             │ │
│  │  ├── Skills Engine (SKILL.md 渐进加载)         │ │
│  │  ├── CronService (定时调度)                    │ │
│  │  ├── channels-extra (Slack/WhatsApp/Email...) │ │
│  │  ├── desktop-shell (macOS 集成)               │ │
│  │  └── 本地存储 (LanceDB + SQLite)              │ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │  Electron 渲染进程 (Vue 3 + Pinia)            │ │
│  │  ├── Live2D/3D 角色渲染 + 表情动画             │ │
│  │  ├── 聊天界面 + 语音交互                       │ │
│  │  ├── 活动时间线 / 日报 / 待办面板               │ │
│  │  ├── 记忆管理 / 设置 / MCP 面板                │ │
│  │  └── 三种模式: 悬浮窗 / 全窗口 / 状态栏         │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  数据: ~/Library/Application Support/anima/        │
│  ├── lance/        (LanceDB 向量数据)              │
│  ├── anima.db      (SQLite 结构化数据)             │
│  ├── screenshots/  (截图缓存)                      │
│  ├── skills/       (用户自定义 Skills)              │
│  └── mcp-servers/  (MCP 配置与状态)                │
└───────────────────────────────────────────────────┘
```

### 5.2 Level 2: 新增包结构

| Component | Responsibility | Technology |
|-----------|----------------|------------|
| `packages/context-engine` | 截图捕获、文件监控、VLM 理解、上下文合并、向量/文档存储 | sharp, @parcel/watcher, AI SDK 6, LanceDB, SQLite |
| `packages/persona-engine` | 情绪状态机、亲密度追踪、记忆编排、主动对话触发、人设模板 | xstate (状态机), AI SDK 6 |
| `packages/mcp-hub` | MCP 多服务器注册表、Client 管理、Anima MCP Server、传输工厂 | @ai-sdk/mcp, @modelcontextprotocol/sdk |
| `packages/skills-engine` | SKILL.md 加载器、Skills 注册、安装/卸载、context 集成 | gray-matter (frontmatter), 文件系统 |
| `packages/channels-extra` | 统一 Channel 接口 + WhatsApp/Slack/Email/飞书/钉钉实现 | baileys, @slack/bolt, imapflow, @larksuiteoapi/node-sdk |
| `packages/cron-service` | at/every/cron 三种定时调度 | croner |
| `packages/desktop-shell` | macOS 活动窗口检测、剪贴板监听、全局快捷键 | AppleScript bridge, N-API addon |

### 5.3 扩展已有包

| Package | Extension |
|---------|-----------|
| `packages/electron-screen-capture` | 周期截图 + pHash 去重 |
| `packages/stage-ui` | 记忆管理 UI、活动时间线、MCP/Skills 管理面板 |
| `packages/stage-pages` | 上下文面板页面 |
| `packages/plugin-protocol` | 新增事件类型 |
| `apps/stage-tamagotchi` | injeca DI 集成所有新模块 |

---

## 6. Runtime View

### 6.1 主动关心流程 (Prompt Chaining)

```
ActivityMonitor 检测变化
    │
    ├── ScreenshotCapture (60s 周期)
    │     └── pHash 去重 → VLM 内容提取 → LanceDB
    │
    ├── 系统级 (10s 轮询)
    │     └── 活动窗口标题 + 应用名
    │
    └── ProcessedContext
          │
          ├── ProactiveTrigger 匹配条件
          │     (连续工作>2h? 切换娱乐? 深夜工作?)
          │
          ├── PersonaEngine 生成回复
          │     (情绪状态 + 亲密度 → 角色化语气)
          │
          └── 输出
                ├── UI 气泡 (用户在桌面)
                ├── macOS 通知 (用户不在桌面)
                └── Channel 消息 (用户离线)
```

### 6.2 Agent Tool 调用流程

```
用户消息
    │
    ├── Router: 分类意图
    │     ├── "闲聊" → PersonaEngine 直接回复
    │     ├── "工具请求" → Agent Loop + MCP Tools
    │     ├── "上下文查询" → 记忆检索 + ContextEngine
    │     └── "复杂任务" → Orchestrator-Workers
    │
    └── Agent Loop (AI SDK 6 maxSteps)
          │
          ├── System Prompt
          │     ├── 角色身份 (PersonaTemplate)
          │     ├── Skills Metadata Summary
          │     └── 当前情绪/亲密度状态
          │
          ├── Tools
          │     ├── 内置核心工具
          │     ├── MCP 聚合工具 (按需加载)
          │     └── Active Skill 的 allowed-tools
          │
          └── Context
                ├── 工作记忆 (最近 N 轮对话)
                ├── 相关长期记忆 (向量 top-k)
                ├── 当前活动上下文
                └── Active Skill Body
```

### 6.3 每日记忆萃取流程

```
CronService 触发 (23:00 或关机)
    │
    ├── Parallelization: 并行收集
    │     ├── 活动监控摘要
    │     ├── 截图上下文 (今日)
    │     ├── 对话历史 (今日)
    │     └── 待办变化
    │
    ├── Evaluator: LLM 萃取
    │     ├── 新偏好发现
    │     ├── 重要事件 (importance > 7/10)
    │     └── 关系变化
    │
    └── Optimizer: 合并去重
          ├── 与长期记忆合并
          ├── 向量化存入 LanceDB
          └── 结构化元数据存入 SQLite
```

---

## 7. Deployment View

### 7.1 Infrastructure

```
┌─────────────────────────────────────────────────┐
│              用户 Mac                             │
│                                                  │
│  ┌─────────────┐                                │
│  │ Anima.app   │  单一 DMG 安装包                │
│  │ (Electron)  │  零外部依赖                     │
│  └──────┬──────┘                                │
│         │                                       │
│  ┌──────┴──────────────────────────────────┐    │
│  │ ~/Library/Application Support/anima/     │    │
│  │ ├── lance/       (LanceDB)              │    │
│  │ ├── anima.db     (SQLite)               │    │
│  │ ├── screenshots/ (缓存, 自动清理)        │    │
│  │ ├── skills/      (用户 Skills)           │    │
│  │ └── mcp-servers/ (MCP 配置)              │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  可选外部进程 (MCP Servers via stdio):            │
│  ├── mcp-server-github (npx)                    │
│  ├── mcp-server-brave-search (npx)              │
│  └── pageindex-mcp (pip, 可选)                  │
└─────────────────────────────────────────────────┘
          │
          │ HTTPS (LLM API)
          ▼
┌─────────────────────┐
│ LLM API Providers   │
│ · OpenAI / Anthropic│
│ · Google / Ollama   │
│ · OpenRouter / etc  │
└─────────────────────┘
```

### 7.2 Environments

| Environment | Purpose | Distribution |
|-------------|---------|--------------|
| Development | 本地开发 | `pnpm dev:tamagotchi` |
| Production | 用户安装 | DMG (macOS), electron-builder |
| Nix | 可重现构建 | `nix run github:moeru-ai/airi` |

### 7.3 Build & Distribution

```
pnpm build:tamagotchi → electron-vite build → electron-builder → DMG
```

---

## 8. Crosscutting Concepts

### 8.1 Privacy & Security

| Aspect | Approach |
|--------|----------|
| 截图处理 | 全部本地 → pHash 去重 → VLM 理解（仅文本描述发给 LLM，不上传原图） |
| 记忆存储 | 本地 LanceDB + SQLite，不云同步 |
| 数据脱敏 | 对话发送 LLM API 前可脱敏 |
| 权限控制 | 截图白名单/黑名单、银行 App 自动跳过、无隐身模式截图 |
| 录音 | 仅按键触发，禁止后台监听 |
| 遗忘权 | 每条记忆可查看/编辑/删除，一键清除所有 |

### 8.2 Error Handling

| Layer | Strategy |
|-------|----------|
| MCP Server 连接 | 自动重连 + 降级（不可用的 Server 标记离线，不影响其他） |
| LLM API 调用 | 分层模型 fallback（主模型失败 → 备选 → 本地 node-llama-cpp） |
| 截图处理 | 无权限时降级运行（关闭截图，仅用窗口标题） |
| 频道连接 | 单频道失败不影响其他频道 |

### 8.3 Logging & Monitoring

| Aspect | Approach |
|--------|----------|
| 应用日志 | @guiiai/logg 结构化日志 |
| 错误追踪 | PostHog (已集成) |
| 性能预算 | 轻量模式 ~100MB / 完整模式 ~500MB |

---

## 9. Architectural Decisions

### ADR-001: TypeScript 全栈 + MCP 协议桥接（不用 Python sidecar）

| Aspect | Description |
|--------|-------------|
| **Context** | 需要 AI 生态能力（VLM、向量搜索、文档理解），但 Mac 桌面应用不能要求用户安装 Python |
| **Decision** | TypeScript 作为应用核心语言，MCP 协议连接任意语言的外部 AI 服务 |
| **Consequences** | 零 Python 依赖 = 极佳安装体验；Python 高级能力（PageIndex 等）通过 MCP Server 按需接入 |

### ADR-002: AI SDK 6 替代 xsAI 作为 LLM SDK

| Aspect | Description |
|--------|-------------|
| **Context** | xsAI (~5k 周下载) 无内置 MCP Client 和 Agent Loop |
| **Decision** | 迁移到 Vercel AI SDK 6 (2.8M 周下载)，保留 xsAI 作为 tool 定义兼容层 |
| **Consequences** | 获得内置 @ai-sdk/mcp + maxSteps Agent Loop + DevTools；需渐进迁移 |

### ADR-003: LanceDB 为核心向量存储（不用 PageIndex 替代）

| Aspect | Description |
|--------|-------------|
| **Context** | 80% 记忆需求是高频实时（截图/活动/对话，每 60s），PageIndex 是秒级 LLM 推理 |
| **Decision** | LanceDB (毫秒级本地向量搜索) 为核心，PageIndex 通过 MCP 按需接入深度文档理解 |
| **Consequences** | 高频场景零成本零延迟；文档深度理解能力通过 MCP 补充 |

### ADR-004: Skills + MCP 双层扩展架构

| Aspect | Description |
|--------|-------------|
| **Context** | 需要两种扩展能力：教 AI 新知识 (how to think) + 连接外部系统 (what to access) |
| **Decision** | Skills (Markdown 知识层, agentskills.io 标准) + MCP (JSON-RPC 连接层) 协同 |
| **Consequences** | 无代码扩展知识 + 标准化外部连接；用户既可写 SKILL.md 也可部署 MCP Server |

---

## 10. Quality Requirements

### 10.1 Quality Scenarios

| ID | Quality | Scenario | Measure |
|----|---------|----------|---------|
| Q1 | Performance | 用户启动 App 到角色出现 | <3s (轻量模式) |
| Q2 | Performance | ContextEngine 感知变化到角色气泡弹出 | <2s |
| Q3 | Privacy | 截图数据不离开本机 | 验证网络请求不含图片数据 |
| Q4 | UX | 主动关心不造成打扰 | 全屏免打扰 + 频率限制 + 渐进退避 |
| Q5 | Reliability | MCP Server 崩溃不影响核心功能 | 隔离 + 自动重连 + 降级 |
| Q6 | Cost | 活跃用户月 LLM 成本 | <$5 (分层路由 + 去重 + 本地兜底) |

### 10.2 Performance Budget

| Mode | Memory | CPU | GPU |
|------|--------|-----|-----|
| 轻量 (纯文字) | ~100MB | 极低 | 无 |
| 完整 (Live2D + 语音) | ~500MB | 中等 | 低 |

---

## 11. Risks & Technical Debt

### 11.1 Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WhatsApp 封号 (Baileys 非官方) | High | High | Business API 备选；限流；独立号码 |
| LLM 成本 (VLM 高频调用) | High | High | 分层路由 + pHash 去重 + 本地兜底 + Batch API |
| xsAI → AI SDK 6 迁移风险 | Med | Med | 渐进迁移，保留 xsAI 兼容层；Phase 0 集中验证 |
| MCP Server 进程管理 | Med | Med | stdio 子进程生命周期管理；参考 Claude Desktop 实现 |
| LanceDB Electron 打包 | Med | Med | 验证 electron-builder + N-API binding；SQLite+vss 备选 |
| macOS 权限 (截图/Accessibility) | Med | Med | 首次启动引导授权；无权限时降级运行 |
| Skills 安全性 | Med | Med | 用户 Skill 可能含恶意指令；需 sandbox 审核机制 |
| 工期偏差 | Med | Med | 文档处理器最复杂(5-7d)，优先验证 |
| Live2D 性能 | Low | Low | 轻量模式关闭渲染；requestAnimationFrame 优化 |

### 11.2 Technical Debt

| Item | Impact | Priority | Plan |
|------|--------|----------|------|
| AIRI crates/ (旧 Tauri 插件) | Electron 下不可用 | Low | 保留作为 reference，MCP 能力由 @ai-sdk/mcp 替代 |
| memory-pgvector (空壳) | 无实际功能 | Low | 保留为服务端方案，桌面端用 context-engine |
| DuckDB WASM (demo 级) | 仅 demo | Low | 被 LanceDB + SQLite 替代 |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — AI 连接外部工具/数据的标准协议 (JSON-RPC) |
| Skills | Agent Skills — Markdown 格式的知识层插件 (agentskills.io 标准) |
| PersonaEngine | 人格引擎 — 管理角色情绪状态、亲密度、对话风格 |
| ContextEngine | 上下文感知引擎 — 截图捕获、文件监控、VLM 理解、活动监控 |
| LanceDB | Rust 嵌入式向量数据库，用于语义搜索和记忆检索 |
| ProactiveTrigger | 主动对话触发器 — 根据上下文条件主动发起关心 |
| Walking Skeleton | 最小端到端通路 — 角色能感知用户并主动说一句话 |
| pHash | 感知哈希 — 用于截图去重，内容未变不重复调用 VLM |
| injeca | 依赖注入容器 — 管理模块生命周期和依赖关系 |
| Eventa | @moeru/eventa — 类型安全的 IPC/RPC 框架 |

---

**Document Status**: Approved
**Last Updated**: 2026-02-18
**Source**: INTEGRATION_PLAN.md v3
