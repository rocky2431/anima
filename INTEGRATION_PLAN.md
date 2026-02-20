# Anima — 原生集成方案 v3 (基于 AIRI + Nanobot + MineContext)

> 由 4 位专家 Agent（桌面架构师 + 全栈工程师 + 上下文工程师 + 产品设计师）深度分析后综合输出
> v3 更新: 补充 MCP + Skills 核心扩展能力；后端语言决策深度分析
> 生成日期: 2026-02-17
> 目标: 主动式、了解用户、有人格魅力的全能型桌面陪伴 AI

---

## 目录

- [一、产品愿景](#一产品愿景)
- [二、总体架构](#二总体架构)
- [三、核心技术决策（含后端语言深度分析）](#三核心技术决策含后端语言深度分析)
- [四、能力移植决策表](#四能力移植决策表)
- [五、人格引擎设计](#五人格引擎设计)
- [六、主动对话触发系统](#六主动对话触发系统)
- [七、上下文感知引擎](#七上下文感知引擎)
- [八、分层记忆与存储方案](#八分层记忆与存储方案)
- [九、Anima Monorepo 扩展方案](#九anima-monorepo-扩展方案)
- [十、MCP 标准接入能力](#十mcp-标准接入能力)
- [十一、Agent 架构设计 (核心)](#十一agent-架构设计-核心)
- [十二、Agent Skills 开放标准接入](#十二agent-skills-开放标准接入)
- [十三、分阶段实施路线图](#十三分阶段实施路线图)
- [十四、Mac 桌面体验设计](#十四mac-桌面体验设计)
- [十五、隐私设计](#十五隐私设计)
- [十六、风险评估](#十六风险评估)

---

## 一、产品愿景

**不是工具，是伙伴。**

| 传统 AI 助手 | 我们的桌面陪伴 AI |
|-------------|-----------------|
| 被动：用户提问 → AI 回答 → 结束 | **主动**：感知用户状态 → 理解上下文 → 主动关心 → 持续陪伴 |
| 无记忆：每次对话从零开始 | **有记忆**：记住你的偏好、习惯、重要日期 |
| 机器感：千篇一律的回答风格 | **有人格**：性格特征、情绪变化、亲密度成长 |
| 单一入口：只有一个聊天框 | **全能交互**：桌面角色 + 语音 + 多频道 + 主动推送 |

**一句话定位**：一个住在你 Mac 上的、理解你的、会主动关心你的 AI 伙伴。

---

## 二、总体架构

### 2.1 进程模型：极简双进程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Anima.app (单一 DMG 安装包)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            Electron 主进程 (Node.js)                     │    │
│  │                                                         │    │
│  │  ┌─────────────┐  ┌─────────────────────────────────┐   │    │
│  │  │ injeca DI   │  │ server-runtime (内嵌)             │   │    │
│  │  │ 容器        │  │ ws://localhost:6121/ws           │   │    │
│  │  └──────┬──────┘  └──────────────┬──────────────────┘   │    │
│  │         │                        │                      │    │
│  │  ┌──────┴──────────────────────────────────────────┐    │    │
│  │  │                 核心模块                         │    │    │
│  │  │                                                 │    │    │
│  │  │  ┌──────────────┐  ┌──────────────────────┐     │    │    │
│  │  │  │ 人格引擎      │  │ 上下文感知引擎        │     │    │    │
│  │  │  │ PersonaEngine │  │ ContextEngine        │     │    │    │
│  │  │  │ · 情绪状态机  │  │ · 截图捕获+pHash     │     │    │    │
│  │  │  │ · 亲密度系统  │  │ · 文件监控           │     │    │    │
│  │  │  │ · 记忆管理器  │  │ · 处理管线(VLM+NER)  │     │    │    │
│  │  │  └──────────────┘  │ · 智能生成(4种)       │     │    │    │
│  │  │                    └──────────────────────┘     │    │    │
│  │  │  ┌──────────────┐  ┌──────────────────────┐     │    │    │
│  │  │  │ 通讯频道      │  │ 定时任务              │     │    │    │
│  │  │  │ · WhatsApp   │  │ CronService          │     │    │    │
│  │  │  │ · 飞书/钉钉  │  │ · at/every/cron      │     │    │    │
│  │  │  │ · Slack      │  │ · 主动对话触发         │     │    │    │
│  │  │  │ · Email/QQ   │  │ · 晚间总结调度         │     │    │    │
│  │  │  └──────────────┘  └──────────────────────┘     │    │    │
│  │  │                                                 │    │    │
│  │  │  ┌──────────────────────────────────────────┐   │    │    │
│  │  │  │ ★ MCP + Skills 扩展层 (无限成长能力)      │   │    │    │
│  │  │  │                                          │   │    │    │
│  │  │  │  MCP Client ─── 连接任意 MCP Server       │   │    │    │
│  │  │  │  │ · 多服务器注册表 (stdio/SSE/HTTP)      │   │    │    │
│  │  │  │  │ · 动态发现+调用外部工具                │   │    │    │
│  │  │  │  │ · 支持 Python/Go/Rust 任意语言的 MCP  │   │    │    │
│  │  │  │  │                                       │   │    │    │
│  │  │  │  MCP Server ─── 暴露自身能力给外部 AI     │   │    │    │
│  │  │  │  │ · 上下文/记忆/角色 作为 MCP Resource  │   │    │    │
│  │  │  │  │ · 搜索/总结/待办 作为 MCP Tool        │   │    │    │
│  │  │  │  │                                       │   │    │    │
│  │  │  │  Skills Engine ─── 教 AI 新行为           │   │    │    │
│  │  │  │    · SKILL.md 渐进式加载                  │   │    │    │
│  │  │  │    · 内置 + 用户自定义 + 在线安装         │   │    │    │
│  │  │  │    · 无需代码，Markdown 即插件             │   │    │    │
│  │  │  └──────────────────────────────────────────┘   │    │    │
│  │  │                                                 │    │    │
│  │  │  ┌──────────────────────────────────────────┐   │    │    │
│  │  │  │ 本地存储                                  │   │    │    │
│  │  │  │ · LanceDB (向量记忆+语义搜索)             │   │    │    │
│  │  │  │ · SQLite (结构化数据: 对话/待办/日报/设置) │   │    │    │
│  │  │  └──────────────────────────────────────────┘   │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Electron 渲染进程 (Vue3 + Pinia)          │    │
│  │                                                     │    │
│  │  · Live2D/3D 角色渲染 + 表情动画                     │    │
│  │  · 聊天界面 + 语音交互                               │    │
│  │  · 活动时间线 / 日报 / 待办面板                       │    │
│  │  · 记忆管理 / 设置                                   │    │
│  │  · 悬浮窗 / 全窗口 / 状态栏三种模式                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  数据路径: ~/Library/Application Support/anima/      │
│  ├── lance/         (LanceDB 向量数据)                       │
│  ├── anima.db        (SQLite 结构化数据)                      │
│  ├── screenshots/   (截图缓存)                               │
│  ├── skills/        (用户自定义 Skills)                       │
│  └── mcp-servers/   (MCP Server 配置与状态)                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 应用本体零 Python 依赖

**关键决策**：App 自身全部用 TypeScript 原生重写，不使用 Python sidecar。

**理由**：
1. 这是 Mac 桌面应用 —— 要求用户安装 Python 是致命的用户体验问题
2. 所有 Python 依赖都有成熟的 TS 对等库（很多 TS 版更优）
3. nanobot 核心仅 ~3,265 行，MineContext 核心模块本质是 LLM API 调用 + 数据处理
4. 单语言栈：开发效率更高，维护成本更低

> **注意**: "零 Python" 指 App 本体代码。Python AI 生态（如 PageIndex 深度文档理解）通过 MCP 协议作为**外部可选服务**接入，
> 用户按需安装，App 本身不依赖也不内嵌任何 Python 运行时。详见第三章 MCP 桥接架构。

---

## 三、核心技术决策（含后端语言深度分析）

### 3.1 后端语言决策: TypeScript + MCP 协议桥接

> **结论: TypeScript 作为应用核心语言，MCP 协议作为语言桥接层**
> 这不是"TS vs Python"的二选一，而是"TS 做主体 + MCP 连接一切"的架构。

#### 为什么不是全 Python？

| 维度 | Python 优势 | 但在本项目中... |
|------|------------|----------------|
| AI 生态最丰富 | LangChain/LlamaIndex/CrewAI 均 Python-first | 我们不训练模型，只调 API — TS 完全胜任 |
| HuggingFace/torch | 模型推理最方便 | 桌面端用 node-llama-cpp 或 Ollama 即可 |
| 数据科学 | pandas/numpy/scipy | 本项目无统计分析需求 |
| 社区 MCP Server | 大量 Python 写的 MCP Server | **通过 MCP 协议连接即可，不需要把 Python 跑在 app 里** |

#### 为什么 TypeScript 是正确选择？

| 维度 | 证据 |
|------|------|
| **Electron 原生** | 应用主进程就是 Node.js，零跨语言开销 |
| **AI SDK 生态成熟** | Vercel AI SDK 6: **2.8M 周下载量**，内置 MCP Client、Agent Loop、Streaming、DevTools |
| **MCP 官方 SDK** | `@modelcontextprotocol/sdk` TypeScript 版，v2 稳定版 Q1 2026 |
| **社区规模** | TypeScript 已在 GitHub 2025 语言报告中超越 Python |
| **Token 成本控制** | AI SDK 6 支持按需加载 tools（不用每次传全部 tool 定义），可降低数量级的 token 消耗 |
| **本地模型** | node-llama-cpp: 直接在 Node.js 进程内跑 llama.cpp，无需 sidecar |
| **部署简单** | 单一 DMG，不需要用户装 Python 环境 |

#### MCP 为什么是语言桥接的正解？

```
┌──────────────────────────────────────────────────────────────────┐
│  MCP = 让 TypeScript 应用接入整个 Python/Go/Rust AI 生态的标准    │
│                                                                  │
│  你的 App (TypeScript)                                           │
│      │                                                           │
│      ├── MCP Client ──→ Python MCP Server (LangChain Agent)      │
│      ├── MCP Client ──→ Python MCP Server (HuggingFace Pipeline) │
│      ├── MCP Client ──→ Go MCP Server (高性能搜索)                │
│      ├── MCP Client ──→ Rust MCP Server (本地计算)                │
│      └── MCP Client ──→ 任意 MCP Server (5,800+ 已有)            │
│                                                                  │
│  97M+ 月下载量 | Anthropic + OpenAI + Google + Microsoft 支持     │
│  已捐赠给 Linux Foundation (AAIF) — 行业标准已确立                │
└──────────────────────────────────────────────────────────────────┘
```

**关键洞察**: 你不需要在 app 里跑 Python，你只需要能**连接到** Python。MCP 就是这个连接器。
用户想用 Python 的 AI 能力？装一个 Python MCP Server 就行（`uvx` 一键启动），App 通过 stdio/HTTP 连接它。

#### LLM SDK 选择: xsAI → Vercel AI SDK 6 (建议升级)

| 维度 | xsAI (原 AIRI 现有) | Vercel AI SDK 6 |
|------|-----------------|-----------------|
| 周下载量 | ~5k | **2.8M** |
| MCP Client | 无 (依赖 Tauri 插件) | **内置 `@ai-sdk/mcp`** |
| Agent Loop | 无 | **内置 maxSteps + stopWhen + prepareStep** |
| Multi-provider | 20+ | 20+ (OpenAI/Anthropic/Google/Mistral/Ollama...) |
| Streaming | 有 | **一流支持，含 React/Vue hooks** |
| DevTools | 无 | **内置调试面板** |
| 结构化输出 | 有 | **generateObject + zodSchema** |
| 社区 | 小 | **最大的 TS AI 社区** |

**建议**: 将 LLM 调用层从 xsAI 迁移到 AI SDK 6，保留 xsAI 作为轻量级 tool 定义辅助。
AI SDK 6 的 `@ai-sdk/mcp` 直接解决了 MCP 多服务器连接问题，省去自建 MCP Client 的工作量。

#### 成本控制策略

| 策略 | 节省方式 | 预估节省 |
|------|---------|---------|
| **分层模型路由** | 分类/路由用 Haiku/Gemini Flash，生成/对话用 Sonnet/GPT-4o | 60-70% |
| **按需加载 Tools** | AI SDK 6 只传当前场景需要的 tool 定义 | 30-50% token |
| **pHash 去重** | 截图内容未变不调 VLM | 70-80% VLM 调用 |
| **本地模型兜底** | 高频低质任务（分类、NER）用 node-llama-cpp 本地跑 | 100% 免费 |
| **OpenAI Batch API** | 非实时任务（晚间总结、记忆萃取）走 Batch，50% 折扣 | 50% |
| **上下文窗口复用** | node-llama-cpp 支持 stateful inference，不重新评估历史 | 减少重复 token |

### 3.2 技术选型总表

| 决策 | 选择 | 备选 | 理由 |
|------|------|------|------|
| **语言** | TypeScript 全栈 + MCP 桥接 | Python sidecar | App 单语言 + MCP 连接一切 |
| **LLM SDK** | **Vercel AI SDK 6** (建议升级) | xsAI (原 AIRI 已有) | 内置 MCP Client + Agent Loop + 2.8M 周下载 |
| **MCP SDK** | @ai-sdk/mcp + @modelcontextprotocol/sdk | 自建 | 官方标准，v2 stable |
| **桌面框架** | Electron (已有 stage-tamagotchi) | Tauri | 复用已有基础设施 |
| **向量存储** | LanceDB (Rust 嵌入式) | SQLite+sqlite-vss | 原生向量搜索，Node.js binding 成熟 |
| **结构化存储** | SQLite (better-sqlite3) | DuckDB WASM | 更成熟，Electron 广泛使用 |
| **本地推理** | node-llama-cpp | Ollama (外部进程) | 零 sidecar，直接 Node.js binding |
| **通讯协议** | Anima server-runtime WebSocket | 独立 HTTP API | 复用已有事件总线 |
| **截图** | Electron desktopCapturer | mss (Python) | 原生 API，已有 electron-screen-capture |
| **文件监控** | @parcel/watcher | chokidar | Rust 实现，性能更好 |
| **文档处理** | pdf.js + mammoth + exceljs (基础) + PageIndex MCP (深度) | Python pypdf/docx | Node.js 生态 + MCP 扩展深度文档理解 |
| **定时任务** | croner (TS 原生) | Python croniter | 逻辑简单，无需跨语言 |
| **DI 容器** | injeca (已有) | - | 模块生命周期管理 |

---

## 四、能力移植决策表

### 4.1 Nanobot 能力 (~18 人天，含 Skills + MCP)

| 能力 | 原始行数 | TS 对等库 | 复杂度 | 决策 | 工时 | 优先级 |
|------|---------|----------|--------|------|------|--------|
| WhatsApp 频道 | 145 | @whiskeysockets/baileys | 1/5 | **TS 重写** (bridge 已是 Node.js) | 0.5d | P1 |
| Slack 频道 | 205 | @slack/bolt (官方, 更优) | 1/5 | **TS 重写** | 1d | P1 |
| Email 频道 | 403 | imapflow + nodemailer (更优) | 2/5 | **TS 重写** | 2d | P1 |
| Feishu 频道 | 310 | @larksuiteoapi/node-sdk (官方) | 2/5 | **TS 重写** | 1.5d | P2 |
| DingTalk 频道 | 245 | 自实现 Stream 协议 | 3/5 | **TS 重写** | 2d | P2 |
| QQ 频道 | 134 | Satori/Koishi (已有!) | - | **已有方案** | 0d | - |
| MoChat 频道 | 895 | socket.io-client | 4/5 | **TS 重写** | 4-5d | P3 |
| Cron Service | 346 | croner | 2/5 | **TS 重写** | 1.5d | P1 |
| Agent Loop | 382 | AI SDK 6 maxSteps | - | **不移植** (AI SDK 6 内置 Agent Loop) | 0d | - |
| Tool Registry | 73 | AI SDK 6 tools | - | **不移植** (AI SDK 6 原生 tool 注册) | 0d | - |
| **Skills 系统** | 229 | - | 2/5 | **TS 重写** (核心扩展能力!) | 2d | **P0** |
| **MCP 能力** | - | @ai-sdk/mcp | 3/5 | **新建** (已有基础,需升级) | 3d | **P0** |

### 4.2 MineContext 能力 (~21-29 人天)

| 模块 | 原始行数 | 关键替代方案 | 决策 | 工时 | 优先级 |
|------|---------|-------------|------|------|--------|
| ScreenshotCapture | 508 | Electron desktopCapturer + sharp | **TS 重写** (已有基础) | 1-2d | P1 |
| FolderMonitor | 472 | @parcel/watcher + crypto | **TS 重写** | 1-2d | P2 |
| ScreenshotProcessor | 590 | sharp + openai SDK | **TS 重写** | 4-5d | P1 |
| DocumentProcessor | 653 | pdf.js + mammoth + exceljs；深度理解通过 PageIndex MCP (Layer 4) | **TS 重写** (基础解析) + PageIndex MCP (深度推理) | 5-7d | P2 |
| ContextMerger | 981 | 纯算法 + openai SDK | **TS 重写** | 3-4d | P2 |
| ReportGenerator | 277 | openai SDK | **TS 重写** | 1d | P1 |
| SmartTipGenerator | 373 | openai SDK | **TS 重写** | 1d | P1 |
| SmartTodoManager | 505 | openai SDK + 向量去重 | **TS 重写** | 1-2d | P1 |
| ActivityMonitor | 343 | openai SDK | **TS 重写** | 1d | P1 |
| 存储层 | ~800 | LanceDB + better-sqlite3 | **TS 重写** | 3-4d | P1 |

### 4.3 汇总

| 维度 | 数值 |
|------|------|
| **总工时** | ~40-50 人天 (含 MCP + Skills + AI SDK 迁移) |
| **单人** | ~2.5 个月 |
| **双人并行** | ~5-6 周 |
| **Python 依赖** | **零** (Python 生态通过 MCP 协议接入) |
| **新增 TS 代码** | ~10,000-15,000 行 |
| **新增核心包** | mcp-hub, skills-engine, context-engine, persona-engine, channels-extra, cron-service, desktop-shell |

---

## 五、人格引擎设计

### 5.1 角色人设模板

```typescript
interface PersonaTemplate {
  identity: {
    name: string // 角色名
    archetype: string // "温暖学姐" | "酷酷研究员" | "活泼搭档"
    coreValues: string[] // ["真诚", "好奇", "守护"]
    backstory: string // 背景故事 (200字)
  }
  personality: {
    warmth: number // 0-100 温暖度
    curiosity: number // 0-100 好奇心
    humor: number // 0-100 幽默感
    assertiveness: number // 0-100 主见性
    sensitivity: number // 0-100 敏感度
  }
  speechStyle: {
    formality: 'casual' | 'balanced' | 'formal'
    catchPhrases: string[] // 口头禅
    avoidPatterns: string[] // 禁忌表达: ["作为AI我...", "我没有感情..."]
  }
}
```

**预置角色**：

| 角色 | 原型 | warmth | curiosity | humor | sensitivity | 风格 |
|------|------|--------|-----------|-------|-------------|------|
| 小柔 | 温暖学姐 | 90 | 70 | 60 | 85 | 日常口语，"嗯嗯""好的呀" |
| Aria | 酷酷研究员 | 55 | 95 | 40 | 60 | 简洁精确，偶尔冷幽默 |
| Mochi | 活泼搭档 | 75 | 85 | 90 | 70 | 活泼跳脱，大量 emoji |

### 5.2 情绪状态机

```
                    ┌──────────────────────────────────┐
                    v                                  │
              ┌──────────┐   用户开始活动    ┌──────────┐│
    启动 ───> │  idle     │ ──────────────> │ curious  ││
              │  (待机)   │                 │ (好奇)   ││
              └──────────┘                 └──────────┘│
                  │  ^                        │    │    │
      无活动30min │  │                   需要帮助│    │新鲜事│
                  v  │                        v    v    │
              ┌──────────┐            ┌────────┐ ┌─────┴──┐
              │ sleepy   │            │caring  │ │excited │
              │ (困困)   │            │(关心)  │ │(兴奋)  │
              └──────────┘            └────────┘ └────────┘
                                         │
                             检测到风险    │     问题解决
                                         v         │
                                     ┌────────┐    │
                                     │worried │────┘
                                     │(担忧)  │
                                     └────────┘
```

**转换条件**：

| 当前 | 触发 | 目标 | 行为 |
|------|------|------|------|
| idle | 用户首次活动 | curious | "嗯？在忙什么呢？" |
| idle | 无活动 > 30min | sleepy | "zzz...叫我一声就好~" |
| curious | 连续工作 > 2h | caring | "工作了好久了，休息一下？" |
| curious | 检测到游戏/视频 | excited | "哦哦！在玩什么？" |
| caring | 检测到情绪低迹象 | worried | "感觉你今天有点累..." |
| sleepy | 用户活动恢复 | curious | "啊，你回来啦~" |

### 5.2.1 情绪状态 → Anima 模型表情映射

> 已有完整的 `<|ACT|>` 表情驱动系统 (`packages/stage-ui/src/constants/emotions.ts`)，
> 支持 9 种表情 (Happy/Sad/Angry/Think/Surprise/Awkward/Question/Curious/Neutral)。
> 人格引擎的情绪状态需要映射到已有表情，以驱动 VRM blendShape 或 Live2D Motion Group。

| 人格引擎状态 | Anima Emotion 映射 | VRM 表情 | Live2D 动作组 | 映射说明 |
|-------------|-------------------|---------|-------------|---------|
| idle (待机) | Neutral | - | Idle | 直接映射 |
| curious (好奇) | Curious | think blend | Curious | 直接映射 |
| caring (关心) | **Happy** (低强度) | happy (intensity: 0.4) | Happy (轻柔变体) | 关心≈温和的开心 |
| worried (担忧) | **Sad** | sad blend | Sad | 担忧≈轻度难过 |
| sleepy (困困) | **Neutral** + 自定义 | 半闭眼 blendShape | Idle (慢速) | 需扩展: 添加 sleepy 表情 |
| excited (兴奋) | **Surprise** + **Happy** | surprised→happy 序列 | Surprise→Happy | 兴奋=惊喜+开心组合 |

**实现策略**：
1. **直接映射** (idle/curious): 复用已有 Emotion，零开发量
2. **强度映射** (caring): 用 `intensity` 参数区分"开心"和"关心"（0.4 vs 0.8+）
3. **组合映射** (excited): 按顺序触发两个 emotion，利用 `<|DELAY|>` 控制节奏
4. **扩展映射** (sleepy): 在 `emotions.ts` 新增 Sleepy 枚举 + 对应 VRM/Live2D 资源

```typescript
// persona-engine → Anima emotion bridge
const PERSONA_TO_ANIMA_EMOTION: Record<PersonaState, EmotionPayload | EmotionPayload[]> = {
  idle: { name: Emotion.Neutral, intensity: 1.0 },
  curious: { name: Emotion.Curious, intensity: 1.0 },
  caring: { name: Emotion.Happy, intensity: 0.4 },
  worried: { name: Emotion.Sad, intensity: 0.6 },
  sleepy: { name: Emotion.Neutral, intensity: 0.3 }, // 低强度 + 半闭眼
  excited: [
    { name: Emotion.Surprise, intensity: 0.8 }, // 先惊喜
    { name: Emotion.Happy, intensity: 1.0 }, // 再开心
  ],
}
```

### 5.3 三层认知记忆模型

> 注: 这是人格引擎的**认知模型**（工作/短期/长期），对应第八章四层**存储架构**中的 Layer 1-3。
> 深度文档理解 (Layer 4 PageIndex) 是基础设施增强，不属于人格认知模型。

```
Layer 1: 工作记忆 (Working Memory)
├── 容量: 最近 10 轮对话
├── 生命周期: 当前会话
└── 用途: 对话连贯性

Layer 2: 短期记忆 (Short-term / Episodic)
├── 容量: 今天的所有活动上下文
├── 生命周期: 24h 滚动窗口
├── 来源: ActivityMonitor + ScreenshotProcessor
└── 用途: "你刚才在看的那篇文章..."

Layer 3: 长期记忆 (Long-term / User Profile)
├── 容量: 无限，向量化存储 (LanceDB)
├── 生命周期: 永久（用户可管理）
└── 内容:
    ├── 用户画像: 工作类型、作息、偏好
    ├── 关系网络: 提到过的人名及关系
    ├── 重要日期: 生日、纪念日、DDL
    └── 对话里程碑: 重要对话片段
```

**每日记忆萃取**（23:00 或用户关机时）：
1. 收集当天短期记忆
2. LLM 萃取：新偏好 / 重要事件 (importance > 7/10) / 关系变化
3. 与长期记忆合并（去重 + 更新）
4. 向量化存入 LanceDB

### 5.4 亲密度系统

| 阶段 | 范围 | 称呼 | 主动行为 | 说话风格 |
|------|------|------|---------|---------|
| stranger | 0-15 | "你" | 仅必要通知 | 礼貌正式 |
| acquaintance | 16-35 | 用户名 | 早晚问候 | 稍微亲切 |
| friend | 36-60 | 昵称 | 主动关心+调侃 | 轻松自然 |
| closeFriend | 61-85 | 各种昵称 | 分享发现、撒娇 | 亲密随意 |
| soulmate | 86-100 | 专属昵称 | 预判需求 | 深度理解 |

**成长规则**: 日常对话 +1/次 (上限5/日)、深度对话 +3、采纳建议 +2、分享心情 +4、连续使用 +1/天

---

## 六、主动对话触发系统

### 6.1 触发条件表

| ID | 场景 | 检测条件 | 情绪 | 优先级 | 冷却 | 最低亲密度 |
|----|------|---------|------|--------|------|----------|
| T01 | 早安问候 | 当天首次活动 6-11点 | cheerful | normal | 24h | stranger |
| T02 | 午间关心 | 连续工作>2h 且 11:30-13:30 | caring | normal | 4h | acquaintance |
| T03 | 休息提醒 | 连续工作 > 2h | caring | high | 90min | acquaintance |
| T04 | 切换到娱乐 | 工作→娱乐应用 | playful | low | 2h | friend |
| T05 | 深夜工作 | > 23:00 仍在工作 | worried | high | 3h | acquaintance |
| T06 | 晚间总结 | 20-22点有活动数据 | warm | normal | 24h | friend |
| T07 | 重要日期 | 匹配长期记忆日期 | excited | critical | 24h | acquaintance |
| T08 | 任务到期 | TODO 临期 | caring | high | 30min | stranger |
| T09 | 高频切换 | 5min 内 > 10次窗口切换 | worried | normal | 1h | friend |
| T10 | 完成大任务 | 长时间聚焦后切换 | excited | normal | 2h | friend |
| T11 | 返回桌面 | 离开 > 30min 后返回 | cheerful | low | 1h | acquaintance |

### 6.2 不打扰策略

- **频率限制**: 最多 3 次/小时、15 次/天
- **免打扰时段**: 默认 23:00-07:00（critical 级别可突破）
- **全屏免打扰**: 全屏应用（游戏/演示）时静默
- **渐进退避**: 连续 3 次被忽略 → 冷却 x1.5，用户主动交互后重置
- **核心原则**: 质量 > 数量，每条消息必须携带价值

---

## 七、上下文感知引擎

### 7.1 感知层次

| 层次 | 来源 | 技术实现 | 频率 |
|------|------|---------|------|
| **系统级** | 活动窗口标题、剪贴板 | AppleScript bridge / N-API addon | 10s 轮询 |
| **截图级** | 桌面截图 VLM 理解 | Electron desktopCapturer + AI SDK 6 VLM | 可配置(默认60s) |
| **文件级** | 文档创建/修改 | @parcel/watcher | 实时 |
| **浏览器级** | 网页内容/URL | Anima web-extension (已有) | 页面切换时 |
| **对话级** | 聊天历史 | useChatSessionStore | 实时 |

### 7.2 处理管线

```
捕获 (Capture)
  │
  ├── 截图 ──→ pHash去重 ──→ VLM内容提取 ──┐
  ├── 文件 ──→ 格式检测 ──→ 文档解析/分块 ──┤
  ├── 网页 ──→ DOM提取 ──→ 文本处理 ────────┤
  └── 系统 ──→ 窗口标题+应用名 ─────────────┤
                                            │
处理 (Processing)                            v
  │                              ┌─────────────────┐
  ├── 实体提取 (NER) ───────────>│ ProcessedContext │
  ├── 关键词提取 ───────────────>│  · title        │
  ├── 类型分类 (7种) ──────────>│  · summary      │
  └── 向量化 (embedding) ──────>│  · keywords     │
                                │  · entities     │
消费 (Consumption)               │  · type         │
  │                              │  · vector       │
  ├── 活动监控 (15min) ──────────│  · importance   │
  ├── 智能提示 (1h) ─────────────└─────────────────┘
  ├── 智能待办 (30min)                    │
  └── 日报总结 (晚间)                     v
                                   ┌─────────┐
                                   │ LanceDB │ 向量存储
                                   │ SQLite  │ 结构化
                                   └─────────┘
```

### 7.3 智能生成 → 角色化输出

| MineContext 原能力 | 角色化改造 | 输出方式 |
|-------------------|-----------|---------|
| 日报 (Markdown) | **晚间对话总结** ("今天你做了XXX，好棒啊~") | context:update → LLM角色化 |
| 智能提示 (tips) | **主动关心** ("连续工作2小时了，休息一下？") | spark:notify → 角色气泡 |
| 智能待办 (todos) | **贴心提醒** ("你可能需要做XXX，要加到待办吗？") | spark:notify (reminder) |
| 活动监控 (activity) | **实时感知** (驱动情绪状态机和主动对话) | context:update (后台) |

---

## 八、分层记忆与存储方案

> **现状说明**: 原 AIRI 现有存储均不可直接复用 — `memory-pgvector` 为空壳 (仅 Client 连接无实际逻辑)，
> `stage-ui` 中的 DuckDB WASM 仅为 demo 级 memory_test。本方案是 LanceDB + SQLite **全新构建**。

### 8.1 四层记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 工作记忆 (内存)                                    │
│  ├── 最近 N 轮对话 (可配置, 默认 10)                         │
│  ├── 生命周期: 当前会话                                       │
│  └── 用途: 对话连贯性, 零延迟                                 │
│  性能: 0ms | 成本: 免费                                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 实时记忆 (LanceDB — 核心)                          │
│  ├── 截图上下文向量 (高频写入, 每 60s)                        │
│  ├── 活动模式向量 (高频查询)                                  │
│  ├── 对话记忆向量 (中频)                                      │
│  └── 用户画像 embedding (低频)                                │
│  性能: 毫秒级 | 成本: 免费 (本地)                              │
│  路径: ~/...anima/lance/                                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 结构化数据 (SQLite — 辅助)                          │
│  ├── 用户画像事实 (KV: 工作类型/作息/偏好)                     │
│  ├── 待办/日报/设置/亲密度/情绪历史                            │
│  └── MCP Server 配置 / Skills 注册表                          │
│  性能: 毫秒级 | 成本: 免费 (本地)                              │
│  路径: ~/...anima/anima.db                                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: 深度文档理解 (PageIndex via MCP — 增强)             │
│  ├── 用户打开/上传的 PDF、长文档、报告                         │
│  ├── 树结构索引 + LLM 推理检索 (非向量!)                      │
│  ├── FinanceBench 98.7% 准确率, 远超向量 RAG                  │
│  └── 通过 MCP 连接, 零 Python 依赖                            │
│  性能: 秒级 (LLM 推理) | 成本: LLM API token                 │
│  连接: @pageindex/mcp (stdio 或 HTTP)                         │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 存储技术选型

| 存储 | 技术 | 用途 | 数据路径 |
|------|------|------|---------|
| **向量存储** | LanceDB (Rust 嵌入式) | 上下文向量 + 语义搜索 + 记忆检索 | `~/...anima/lance/` |
| **结构化存储** | SQLite (better-sqlite3) | 对话/待办/日报/设置/亲密度/活动 | `~/...anima/anima.db` |
| **临时缓存** | 文件系统 | 截图缓存 (自动清理) | `~/...anima/screenshots/` |
| **文档索引** | PageIndex (via MCP) | PDF/长文档的树结构推理检索 | MCP Server 管理 |

### 8.3 为什么 LanceDB 仍是核心 (不用 PageIndex 替代)

| 维度 | LanceDB | PageIndex |
|------|---------|-----------|
| **检索方式** | 向量余弦相似度 (本地) | LLM 推理导航树结构 (API) |
| **每次查询成本** | **0 (本地计算)** | GPT-4o token (贵!) |
| **查询延迟** | **毫秒级** | 秒级 (等 LLM 推理) |
| **实时索引** | ✅ 即时插入 | ❌ 需批量建树 |
| **高频场景** | ✅ 每 60s 截图存取 | ❌ 不可承受的成本 |
| **语义相似搜索** | ✅ 原生支持 | ❌ 无此能力 |
| **文档深度理解** | ⚠️ 基础切片丢失结构 | ✅ **98.7% 准确率** |
| **多跳推理** | ❌ 需多次查询 | ✅ 天然支持 |

**结论**: Anima 80% 的记忆需求是高频实时的 (截图/活动/对话) → LanceDB 是唯一选择。
PageIndex 的强项是低频高质的文档理解 → 通过 MCP 按需接入，互补而非替代。

### 8.4 PageIndex 集成方式

```
用户打开一个 100 页 PDF
     │
     ├── DocumentProcessor (TS) 做基础解析 (提取文本/元数据)
     │     └── 结果存入 LanceDB (向量) + SQLite (元数据)
     │
     └── 如果用户提出深度问题 ("第三季度净利润比去年增长了多少?")
           │
           ├── Agent 判断: 这是多跳文档推理 → 需要 PageIndex
           │
           └── 通过 MCP 调用 PageIndex:
                 1. pageindex_index_document(pdf_path) → 建树
                 2. pageindex_query(tree_id, question) → 树推理检索
                 3. 返回精确答案 + 页码引用
```

**配置** (在 MCP Registry 中):
```json
{
  "id": "pageindex",
  "name": "PageIndex Document AI",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@pageindex/mcp"],
  "autoConnect": false,
  "enabled": true
}
```

### 8.5 LanceDB 选型依据

| 维度 | LanceDB | SQLite+sqlite-vss | DuckDB WASM | ChromaDB |
|------|---------|-------------------|-------------|----------|
| 嵌入式 | Rust 原生 | C 扩展 | WASM | Python |
| Node.js 支持 | @lancedb/lancedb (成熟) | 需编译 vss 扩展 | WASM binding | 无 |
| 向量搜索 | HNSW 原生 | HNSW via vss | 扩展不成熟 | HNSW |
| 与 Anima 兼容 | Arrow 格式 (兼容 DuckDB) | 好 | 已有但已迁移 | 不兼容 |
| Mac 桌面 | 零依赖 | 需编译 | 可用 | 需 Python |

### 8.6 memory-pgvector 处置

原 AIRI 的 `packages/memory-pgvector/` 目前是空壳（只有 Client 连接，无实际向量存储逻辑）。

**方案**: 保留为服务端部署方案，桌面端用新建的 `@anima/context-engine` 统一管理存储。

> **注**: 代码中的 `@proj-airi/` 包名将在实施阶段渐进重命名为 `@anima/`。

---

## 九、Anima Monorepo 扩展方案

### 9.1 新增 packages

```
anima/
├── packages/
│   ├── context-engine/              # 【新建】MineContext 核心能力移植 (可复用 MineContext TS 侧截图编排: screen-monitor-task.ts)
│   │   ├── src/
│   │   │   ├── capture/
│   │   │   │   ├── screenshot.ts        # 周期截图 (扩展 electron-screen-capture)
│   │   │   │   ├── folder-monitor.ts    # 文件监控 (@parcel/watcher)
│   │   │   │   └── types.ts
│   │   │   ├── processing/
│   │   │   │   ├── screenshot-processor.ts  # VLM截图理解+pHash去重
│   │   │   │   ├── document-processor.ts    # 文档解析(pdf.js+mammoth)
│   │   │   │   ├── context-merger.ts        # 上下文合并
│   │   │   │   └── entity-extractor.ts      # 实体提取
│   │   │   ├── consumption/
│   │   │   │   ├── report-generator.ts      # 日报→晚间总结
│   │   │   │   ├── smart-tip.ts             # 智能提示→主动关心
│   │   │   │   ├── smart-todo.ts            # 智能待办→贴心提醒
│   │   │   │   └── activity-monitor.ts      # 活动监控→实时感知
│   │   │   ├── storage/
│   │   │   │   ├── vector-store.ts          # LanceDB 封装
│   │   │   │   └── document-store.ts        # SQLite 封装
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── persona-engine/              # 【扩展】增强人格引擎 (复用已有表情队列/编排/ACT 解析)
│   │   ├── src/
│   │   │   ├── emotion-state-machine.ts    # 情绪状态机
│   │   │   ├── intimacy-tracker.ts         # 亲密度系统
│   │   │   ├── memory-orchestrator.ts      # 认知记忆管理 (工作/短期/长期, 底层由第八章四层存储支撑)
│   │   │   ├── proactive-trigger.ts        # 主动对话触发
│   │   │   ├── persona-template.ts         # 人设模板管理
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── channels-extra/              # 【新建】新增通讯频道
│   │   ├── src/
│   │   │   ├── base-channel.ts             # 统一 Channel 接口
│   │   │   ├── whatsapp/                   # WhatsApp (baileys)
│   │   │   ├── feishu/                     # 飞书 (@larksuiteoapi/node-sdk)
│   │   │   ├── dingtalk/                   # 钉钉 (自实现 Stream)
│   │   │   ├── slack/                      # Slack (@slack/bolt)
│   │   │   ├── email/                      # Email (imapflow+nodemailer)
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── cron-service/                # 【新建】定时任务服务
│   │   ├── src/
│   │   │   ├── cron-service.ts             # at/every/cron 三种调度
│   │   │   ├── cron-types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mcp-hub/                     # 【新建】MCP 标准接入层
│   │   ├── src/
│   │   │   ├── mcp-registry.ts            # 多服务器注册表+持久化
│   │   │   ├── mcp-client-manager.ts      # AI SDK MCP Client 管理
│   │   │   ├── anima-mcp-server.ts         # Anima 自身作为 MCP Server
│   │   │   ├── transport-factory.ts       # stdio/SSE/HTTP 传输工厂
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── skills-engine/               # 【新建】Skills 标准插件层
│   │   ├── src/
│   │   │   ├── skills-loader.ts           # SKILL.md 加载器 (遵循 agentskills.io 标准)
│   │   │   ├── skills-registry.ts         # 内置+用户 skills 注册
│   │   │   ├── skill-installer.ts         # .skill 包安装/卸载
│   │   │   ├── context-integration.ts     # 注入 system prompt
│   │   │   └── index.ts
│   │   ├── skills/                        # 内置 skills
│   │   │   ├── persona-guidelines/SKILL.md
│   │   │   ├── proactive-patterns/SKILL.md
│   │   │   ├── github/SKILL.md
│   │   │   ├── summarize/SKILL.md
│   │   │   ├── weather/SKILL.md
│   │   │   ├── skill-creator/SKILL.md
│   │   │   └── memory-management/SKILL.md
│   │   └── package.json
│   │
│   ├── desktop-shell/               # 【新建】macOS 桌面集成
│   │   ├── src/
│   │   │   ├── active-window.ts            # 活动窗口检测 (AppleScript)
│   │   │   ├── clipboard-monitor.ts        # 剪贴板监听
│   │   │   ├── global-shortcuts.ts         # 全局快捷键
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── electron-screen-capture/     # 【扩展】周期截图+pHash
│   ├── stage-ui/                    # 【扩展】新增记忆管理/活动时间线 UI
│   ├── stage-pages/                 # 【扩展】新增上下文面板页面
│   └── plugin-protocol/            # 【少量扩展】新增事件类型
│
├── apps/
│   └── stage-tamagotchi/            # 【扩展】集成新模块到 injeca DI
│
└── services/
    └── satori-bot/                  # 【复用】QQ 已通过 Satori 覆盖
```

### 9.2 stage-tamagotchi 主进程集成

通过已有的 `injeca` DI 容器注册新模块：

```typescript
// 在主进程 index.ts 中注册
const mcpHub = injeca.provide('modules:mcp-hub', {
  dependsOn: { serverChannel },
  build: () => setupMcpHub(config) // MCP 注册表 + Client 管理
})

const skillsEngine = injeca.provide('modules:skills-engine', {
  dependsOn: { mcpHub },
  build: () => setupSkillsEngine(config) // Skills 加载器 + MCP 依赖检查
})

const contextEngine = injeca.provide('modules:context-engine', {
  dependsOn: { serverChannel },
  build: () => setupContextEngine(config)
})

const personaEngine = injeca.provide('modules:persona-engine', {
  dependsOn: { contextEngine, skillsEngine, serverChannel },
  build: () => setupPersonaEngine(config) // Skills 注入人设上下文
})

const channelsExtra = injeca.provide('modules:channels-extra', {
  dependsOn: { serverChannel },
  build: () => setupExtraChannels(config)
})

const cronService = injeca.provide('modules:cron-service', {
  dependsOn: { personaEngine, contextEngine },
  build: () => setupCronService(config)
})

const desktopShell = injeca.provide('modules:desktop-shell', {
  dependsOn: { contextEngine },
  build: () => setupDesktopShell()
})

const animaMcpServer = injeca.provide('modules:anima-mcp-server', {
  dependsOn: { contextEngine, personaEngine, mcpHub },
  build: () => setupAnimaMcpServer(config) // Anima 自身暴露为 MCP Server
})
```

---

## 十、MCP 标准接入能力

> **MCP (Model Context Protocol) 让 AI 连接万物 — 这是 AI 无限成长的"硬插件"系统**

### 10.1 现有 MCP 基础 (继承自 AIRI)

现有 MCP 基础设施：

| 层级 | 位置 | 能力 | 局限 |
|------|------|------|------|
| Rust (Tauri) | `crates/tauri-plugin-mcp/` | `rmcp` 实现 Client | **仅 Tauri，Electron 不可用** |
| TS 绑定 | `packages/tauri-plugin-mcp/` | invoke 封装 | **绑定 Tauri runtime** |
| LLM 工具 | `packages/stage-ui/src/tools/mcp.ts` | 4 个 tool | **仅单服务器** |
| MCP Server 示例 | `services/twitter-services/src/adapters/mcp-adapter.ts` | 完整 SSE Server | **独立服务，未集成到桌面端** |

**核心问题**: Tauri MCP 插件在 Electron 路径下不可用，且只支持单个 MCP Server 连接。

### 10.2 升级方案: 基于 AI SDK 6 的 MCP Client

```typescript
// packages/mcp-hub/src/mcp-registry.ts
import { createMCPClient } from '@ai-sdk/mcp'

interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string // stdio: 命令 (如 "uvx mcp-server-git")
  args?: string[] // stdio: 参数
  url?: string // HTTP/SSE: 远程 URL
  env?: Record<string, string>
  autoConnect: boolean // 启动时自动连接
  enabled: boolean
}

class McpRegistry {
  private clients: Map<string, McpClient> = new Map()
  private configs: McpServerConfig[] // 持久化到 SQLite

  // 连接所有已启用的 Server
  async connectAll(): Promise<void>

  // 动态添加新 Server
  async addServer(config: McpServerConfig): Promise<void>

  // 聚合所有 Server 的 tools → 传给 AI SDK 的 generateText
  async aggregateTools(): Promise<Record<string, Tool>>

  // 按需连接: 只在 LLM 选择了某个 MCP tool 时才真正连接
  async lazyConnect(serverId: string): Promise<void>
}
```

### 10.3 MCP Client 能力矩阵

| 能力 | 说明 | 优先级 |
|------|------|--------|
| **多服务器注册表** | SQLite 存储 server 配置，支持增删改查 | P0 |
| **三种传输** | stdio (本地进程) / SSE / Streamable HTTP | P0 |
| **工具聚合** | 所有 MCP Server 的 tools 合并后传给 LLM | P0 |
| **资源读取** | 读取 MCP Server 暴露的 Resources (数据源) | P1 |
| **Prompt 模板** | 使用 MCP Server 提供的 Prompt Templates | P1 |
| **OAuth 认证** | AI SDK 6 已支持 MCP OAuth 流程 | P2 |
| **懒加载连接** | 不活跃的 Server 不占进程，按需启动 | P1 |
| **健康检查** | 定期检测 Server 存活状态 | P2 |

### 10.4 MCP Server 模式: 暴露 Anima 自身能力

让 Anima 也成为一个 MCP Server，其他 AI 工具（Claude Desktop、Cursor 等）可以连接它：

```typescript
// packages/mcp-hub/src/anima-mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const server = new McpServer({ name: 'anima-companion', version: '1.0.0' })

// Resources: 暴露上下文数据
server.resource('user-context', 'anima://context/current', async () => ({ contents: [{ uri: 'anima://context/current', text: currentActivitySummary }] }))
server.resource('memories', 'anima://memories/search/{query}', async (uri, { query }) => ({ contents: await searchMemories(query) }))

// Tools: 暴露 Anima 能力
server.tool('search_memories', { query: z.string() }, async ({ query }) => ({ content: [{ type: 'text', text: await memorySearch(query) }] }))
server.tool('get_daily_summary', { date: z.string().optional() }, async ({ date }) => ({ content: [{ type: 'text', text: await getDailySummary(date) }] }))
server.tool('send_message', { channel: z.string(), content: z.string() }, async ({ channel, content }) => ({ content: [{ type: 'text', text: await sendToChannel(channel, content) }] }))
```

**价值**: 用户在 Claude Desktop 里说"帮我查一下今天做了什么"，Claude 通过 MCP 调用 Anima 的记忆搜索。

### 10.5 预置 MCP Server 推荐列表

| MCP Server | 能力 | 安装命令 | 与 Anima 的协同 |
|------------|------|---------|----------------|
| mcp-server-filesystem | 文件读写 | `npx @modelcontextprotocol/server-filesystem` | 文件管理 |
| mcp-server-git | Git 操作 | `uvx mcp-server-git` | 代码上下文 |
| mcp-server-github | GitHub 交互 | `npx @modelcontextprotocol/server-github` | 项目协作 |
| mcp-server-brave-search | 网页搜索 | `npx @modelcontextprotocol/server-brave-search` | 信息检索 |
| mcp-server-sqlite | 数据库查询 | `uvx mcp-server-sqlite` | 数据分析 |
| mcp-server-puppeteer | 浏览器控制 | `npx @modelcontextprotocol/server-puppeteer` | 网页交互 |
| mcp-server-memory | 知识图谱 | `npx @modelcontextprotocol/server-memory` | 补充 Anima 记忆 |
| pageindex-mcp | 深度文档理解 (树结构索引 + LLM 推理检索) | `pip install pageindex && pageindex mcp` | Layer 4 记忆层：多跳文档推理、跨文档对比、精确数据提取 |

### 10.6 UI 设计: MCP 管理面板

```
┌─ 设置 > MCP 服务器 ─────────────────────────────────┐
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ [+] 添加服务器    [📦 推荐列表]    [🔄 刷新]   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ✅ GitHub       @modelcontextprotocol/server-github  │
│     Tools: 12   Status: 已连接   [⚙] [🗑]          │
│                                                      │
│  ✅ Brave Search  @modelcontextprotocol/server-brave  │
│     Tools: 3    Status: 已连接   [⚙] [🗑]          │
│                                                      │
│  ⏸ SQLite       mcp-server-sqlite                    │
│     Tools: 5    Status: 未连接 (按需启动) [⚙] [🗑]  │
│                                                      │
│  ──────────── Anima 自身 MCP Server ──────────────── │
│  🟢 anima-companion  端口: 6122                       │
│     Resources: 2  Tools: 3  [复制连接配置]           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 10.7 参考来源

- [MCP 官方规范](https://modelcontextprotocol.io/specification/2025-06-18)
- [AI SDK MCP Client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Enterprise Adoption Guide](https://guptadeepak.com/the-complete-guide-to-model-context-protocol-mcp-enterprise-adoption-market-trends-and-implementation-strategies/)

---

## 十一、Agent 架构设计 (核心)

> **Agent 是整个系统的灵魂 — MCP 和 Skills 是它的手和脑**
> **以下架构严格遵循 Anthropic 官方 Agent 最佳实践**

### 11.1 核心原则 (来自 Anthropic "Building Effective Agents")

| 原则 | 含义 | 在 Anima 中的体现 |
|------|------|------------------|
| **简单优先** | 从最简单的方案开始，只在必要时增加复杂度 | 先跑通单 LLM 调用，再加 Agent Loop |
| **可组合模式** | 用简单的可组合模式，而非复杂框架 | Prompt Chaining + Routing，不用重量级框架 |
| **工具设计 > 提示词** | 工具定义的质量比 prompt 更重要 | MCP Tool 设计遵循 Anthropic 工具规范 |
| **透明性** | 显式展示 Agent 的规划步骤 | UI 上显示 Agent 的思考过程 |
| **Context 是稀缺资源** | 最小化高信号 token 最大化效果 | Skills 渐进加载 + 工具结果裁剪 |

### 11.2 Anthropic 推荐的 Agent 模式

Anima 根据不同场景选用不同模式：

```
┌─────────────────────────────────────────────────────────────┐
│  模式 1: Augmented LLM (基础层 — 所有交互的底座)             │
│  LLM + 工具(MCP) + 记忆(LanceDB) + 知识(Skills)            │
│                                                              │
│  → 日常对话、简单问答、快速工具调用                           │
├─────────────────────────────────────────────────────────────┤
│  模式 2: Routing (智能路由)                                  │
│  分类用户意图 → 分发到专门处理链                              │
│                                                              │
│  → 用户消息到达时：                                          │
│    "闲聊" → 人格引擎直接回复                                 │
│    "工具请求" → Agent Loop + MCP                             │
│    "上下文查询" → 记忆检索 + 上下文引擎                      │
│    "复杂任务" → Orchestrator-Workers                         │
├─────────────────────────────────────────────────────────────┤
│  模式 3: Prompt Chaining (主动关心的核心流程)                │
│  感知 → 理解 → 决策 → 生成 → 输出                           │
│                                                              │
│  → ActivityMonitor 检测到变化                                │
│  → ScreenshotProcessor 理解内容                              │
│  → ProactiveTrigger 判断是否触发                             │
│  → PersonaEngine 生成角色化回复                              │
│  → 输出到 UI 或 Channel                                     │
├─────────────────────────────────────────────────────────────┤
│  模式 4: Parallelization (多源信息收集)                      │
│  并行执行独立子任务                                          │
│                                                              │
│  → 晚间总结: 并行收集 活动/待办/截图/对话 → 合并 → 生成报告  │
├─────────────────────────────────────────────────────────────┤
│  模式 5: Evaluator-Optimizer (记忆萃取)                      │
│  生成 → 评估 → 迭代改进                                     │
│                                                              │
│  → 每日记忆萃取: LLM 生成摘要 → 评估重要性 → 去重 → 存储     │
└─────────────────────────────────────────────────────────────┘
```

### 11.3 工具设计规范 (遵循 Anthropic "Writing Tools for Agents")

| 规范 | 要求 | 示例 |
|------|------|------|
| **参数命名** | 明确无歧义，用 `user_id` 而非 `user` | `search_memories({ query, date_range, limit })` |
| **结果裁剪** | 只返回高信号字段，去掉 UUID/技术细节 | 返回 `{ name, summary }` 而非全部数据库字段 |
| **可控详度** | 提供 `response_format` 参数控制输出量 | `"concise"` 省 token，`"detailed"` 含完整 ID |
| **分页过滤** | 大数据集强制分页，合理默认值 | `limit: 10`, `offset: 0` |
| **错误信息** | 可操作的错误提示，不要 stacktrace | `"No memories found for 'xyz'. Try broader keywords."` |
| **命名空间** | 按服务前缀分组 | `anima_search_memories`, `anima_get_summary` |
| **精简数量** | 少而精，不要包装每个 API endpoint | 一个 `schedule_event` 而非 3 个分散的工具 |

### 11.4 Context Engineering (上下文工程)

遵循 Anthropic "Effective Context Engineering for AI Agents":

```
┌─ Anima Agent Context Budget ────────────────────────────────┐
│                                                             │
│  System Prompt (~2000 tokens)                               │
│  ├── 角色身份 + 核心指令 (~500)                              │
│  ├── Skills Metadata Summary (~100/skill × N)               │
│  └── 当前情绪/亲密度状态 (~100)                              │
│                                                             │
│  Tools (~1500 tokens)                                       │
│  ├── 内置核心工具 (~500)                                    │
│  ├── MCP 聚合工具 (按需加载，不用全传!)                      │
│  └── Active Skill 的 allowed-tools (~200)                   │
│                                                             │
│  Retrieved Context (~2000 tokens)                           │
│  ├── 工作记忆: 最近 N 轮对话                                │
│  ├── 相关长期记忆 (向量检索 top-k)                          │
│  ├── 当前活动上下文 (ActivityMonitor 摘要)                   │
│  └── Active Skill Body (< 5000 tokens)                     │
│                                                             │
│  关键策略:                                                   │
│  · MCP Tools 按需加载 — 不活跃的 MCP Server 的工具不进 context│
│  · 工具结果清理 — 历史消息中的工具结果可被压缩/移除           │
│  · Sub-Agent — 复杂任务委托给子 Agent，只返回精炼摘要        │
│  · 对话压缩 — 接近 context 上限时摘要历史保留关键决策         │
└─────────────────────────────────────────────────────────────┘
```

### 11.5 长时运行 Agent 模式

参考 Anthropic "Effective Harnesses for Long-Running Agents":

| 模式 | 在 Anima 中的应用 |
|------|------------------|
| **Initializer Agent** | 首次启动: 扫描用户环境、建立初始用户画像、配置偏好 |
| **Progress Artifacts** | `anima-progress.json`: 跨会话记录 Agent 完成了什么、当前状态 |
| **Incremental Work** | 每次对话做一件事做好，而非试图一次性完成所有 |
| **Git-like Recovery** | 记忆版本控制: 可回滚到之前的记忆状态 |
| **Sub-Agent** | 长任务拆分: 主 Agent 协调，子 Agent 聚焦执行并返回摘要 |

---

## 十二、Agent Skills 开放标准接入

> **Agent Skills 是 Anthropic 2025.12.18 发布的开放标准 (agentskills.io)**
> **已被 Microsoft (Copilot)、OpenAI (Codex)、GitHub、Cursor、Figma、Atlassian 采纳**
> **Skills = 知识层 (教 AI 做什么) | MCP = 连接层 (让 AI 连接什么)**

### 12.1 Agent Skills 标准规范 (agentskills.io)

#### 目录结构

```
skill-name/                    # 目录名必须 = frontmatter name
├── SKILL.md                   # (必须) YAML frontmatter + Markdown 指令
├── scripts/                   # (可选) 可执行脚本 (Python/Bash/JS)
├── references/                # (可选) 参考文档，按需加载到 context
└── assets/                    # (可选) 模板、图片等静态资源
```

#### SKILL.md 格式规范

```yaml
---
name: pdf-processing                    # 必须: 1-64字符, 小写+连字符
description: >                          # 必须: 1-1024字符, 描述做什么+何时用
  Extract text and tables from PDF files, fill PDF forms,
  and merge multiple PDFs. Use when working with PDF documents.
license: Apache-2.0                     # 可选: 许可证
compatibility: Requires poppler, qpdf   # 可选: 环境要求
metadata:                               # 可选: 任意 KV 扩展
  author: example-org
  version: "1.0"
allowed-tools: Bash(git:*) Read         # 可选(实验): 预授权的工具
---

# PDF Processing

[Markdown 指令内容 — Agent 激活 skill 后加载全文]
[建议 < 500 行, < 5000 tokens]

## 详细参考
See [REFERENCE.md](references/REFERENCE.md) for API details.
```

#### 字段规则

| 字段 | 必须 | 约束 |
|------|------|------|
| `name` | 是 | 1-64字符, 仅小写字母+数字+连字符, 不以 `-` 开头/结尾, 不连续 `--`, 必须等于父目录名 |
| `description` | 是 | 1-1024字符, 描述做什么 + 何时触发 |
| `license` | 否 | 许可证名或文件引用 |
| `compatibility` | 否 | 1-500字符, 环境要求 |
| `metadata` | 否 | string→string 映射, 自由扩展 |
| `allowed-tools` | 否 | 空格分隔的工具列表 (实验性) |

#### 渐进式加载 (Progressive Disclosure)

```
┌─────────────────────────────────────────────────────────────┐
│  三层加载 — 最小化 Context 消耗                              │
│                                                              │
│  Layer 1: Metadata (~100 tokens)                             │
│  │  启动时加载所有 skill 的 name + description               │
│  │  Agent 据此判断哪个 skill 与当前任务相关                   │
│  │                                                           │
│  Layer 2: Instructions (< 5000 tokens)                       │
│  │  Agent 决定激活某 skill 时，加载 SKILL.md body 全文        │
│  │                                                           │
│  Layer 3: Resources (按需)                                   │
│     Agent 需要详细信息时，按引用路径读取 scripts/references/  │
│     脚本可直接执行而不必读入 context                          │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Skills + MCP: 互补双层架构

这是 Anthropic 定义的 Agent 标准架构，不是二选一，而是**协同**：

```
┌─────────────────────────────────────────────────────────────┐
│                    Agentic AI Stack                          │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Skills Layer (知识层)                                 │  │
│  │  "教 Agent 如何思考和行动"                              │  │
│  │                                                        │  │
│  │  · 程序性知识: 步骤、流程、领域专业                     │  │
│  │  · Markdown 编写，人人可创建                            │  │
│  │  · 渐进式加载，最小化 token 消耗                        │  │
│  │  · 示例: "代码审查流程"、"日报生成模板"、"角色人设"      │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │ 调用                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MCP Layer (连接层)                                    │  │
│  │  "让 Agent 连接外部世界"                                │  │
│  │                                                        │  │
│  │  · 标准化工具/数据接口: JSON-RPC over HTTP              │  │
│  │  · 10,000+ 现有 MCP Server                             │  │
│  │  · 100M+ 月下载量, Linux Foundation 治理                │  │
│  │  · 示例: GitHub API、数据库、搜索引擎、日历              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  协同示例:                                                   │
│  1. Skill "代码审查" 定义审查流程和评分标准 (知识)            │
│  2. MCP Server "GitHub" 提供 PR diff 数据 (连接)             │
│  3. Agent 用 Skill 的知识解读 MCP 返回的数据 → 输出审查报告  │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 Anima Skills Engine 实现

```typescript
// packages/skills-engine/src/skills-engine.ts
// 遵循 agentskills.io 标准规范

interface SkillFrontmatter {
  'name': string // 必须: 匹配目录名
  'description': string // 必须: 触发描述
  'license'?: string
  'compatibility'?: string
  'metadata'?: Record<string, string>
  'allowed-tools'?: string
}

class SkillsEngine {
  private builtinDir: string // 内置 skills (随 app 发布)
  private userDir: string // ~/...anima/skills/ (用户自定义)

  // Layer 1: 启动时加载所有 metadata → 注入 system prompt
  getSkillsSummary(): string

  // Layer 2: Agent 判断需要某 skill 时，加载 SKILL.md body
  loadSkillBody(name: string): string | null

  // Layer 3: Agent 需要详情时，读取 references/scripts/assets
  readSkillResource(name: string, path: string): string | null

  // 安装/卸载: 支持从 agentskills.io 或本地安装
  installSkill(source: string): Promise<void>
  uninstallSkill(name: string): Promise<void>

  // 验证: 使用 agentskills/skills-ref 规范校验
  validateSkill(path: string): ValidationResult
}
```

### 12.4 与 Agent 上下文集成

```
Agent Context Assembly (每次 LLM 调用时):
  │
  ├── System Prompt
  │     ├── 角色身份 (PersonaTemplate)
  │     ├── ★ Skills Metadata Summary (~100 tokens/skill)  ← 所有 skill 的 name+desc
  │     └── 对话指令
  │
  ├── Tools Definition
  │     ├── 内置工具 (截图、文件、搜索...)
  │     ├── ★ MCP Tools (来自 McpRegistry 的聚合工具)
  │     └── ★ Skill Scripts (skill 中声明 allowed-tools 的)
  │
  ├── Context
  │     ├── 记忆检索结果 (四层记忆架构, 见第八章)
  │     ├── 活动上下文 (ActivityMonitor)
  │     └── ★ Active Skill Body (当前激活的 skill 全文)
  │
  └── Conversation History
```

### 12.5 预置 Skills

| Skill | 类别 | 描述 | compatibility |
|-------|------|------|---------------|
| **companion-persona** | Core | 人设/情绪/对话风格指令；**含 `<\|ACT\|>` 表情 token 输出格式规范** | Anima Desktop |
| **proactive-care** | Core | 主动关心的场景识别、触发逻辑、回复模式；主动消息同样输出 `<\|ACT\|>` 表情 | Anima Desktop |
| **daily-summary** | Productivity | 晚间总结的格式、萃取规则、记忆保存流程 | - |
| **smart-todo** | Productivity | 从上下文中识别待办、优先级排序、提醒策略 | - |
| **code-review** | Development | 代码审查流程和评分标准 | Requires git, gh |
| **github-workflow** | Development | GitHub 交互 (PR/Issue/CI) | Requires gh |
| **web-research** | Research | 网页搜索→总结→引用 的标准流程 | - |
| **memory-curator** | Core | 记忆管理: 搜索/萃取/清理/重要性评分 | Anima Desktop |
| **skill-creator** | Meta | 教 Agent 自己创建新 skill (自举能力) | - |

### 12.6 参考来源

- [Agent Skills 官方规范](https://agentskills.io/specification)
- [Anthropic Skills 仓库](https://github.com/anthropics/skills)
- [Equipping Agents with Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills)
- [Skills vs MCP 技术对比](https://intuitionlabs.ai/articles/claude-skills-vs-mcp)
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Context Engineering for Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## 十三、分阶段实施路线图

### Phase 0: 基础设施升级 (1 周)

**目标**: 将 LLM 调用层迁移到 AI SDK 6，搭建 MCP + Skills 骨架

| 天 | 任务 | 交付物 |
|----|------|--------|
| D1-2 | LLM 层从 xsAI 迁移到 AI SDK 6 (保留 xsAI tool 定义兼容) | 基础 LLM 调用跑通 |
| D3-4 | 创建 `mcp-hub` 包骨架；实现 McpRegistry + 多服务器配置持久化 | MCP Client 基础能力 |
| D5 | 创建 `skills-engine` 包骨架；实现 SkillsLoader + ContextBuilder 集成 | Skills 加载跑通 |

**验证**: AI SDK 6 调用成功 + 能连接 1 个 MCP Server + Skills 注入 system prompt

### Phase 1: Walking Skeleton (2 周)

**目标**: 最小端到端通路 — 角色能感知用户在做什么，并主动说一句话

| 天 | 任务 | 交付物 |
|----|------|--------|
| D1-2 | 创建 `context-engine` 包骨架；实现截图捕获 (扩展 electron-screen-capture) | 定时截图能力 |
| D3-4 | 实现 ScreenshotProcessor (VLM 理解)；实现 LanceDB 向量存储 | 截图→理解→存储 |
| D5-6 | 实现 ActivityMonitor；通过 context:update 注入角色上下文 | 角色知道用户在做什么 |
| D7-8 | 创建 `persona-engine` 骨架；实现情绪状态机 + 1个触发条件 (休息提醒) | 角色主动说话 |
| D9-10 | 端到端测试；修复集成问题 | **角色感知用户工作2h后主动说"休息一下？"** |

**验证标准**: 用户在 Mac 上工作，角色能感知活动并在合适时机主动发起关心。

### Phase 2: 核心能力 + MCP/Skills (3 周)

| 周 | 任务 |
|----|------|
| W4 | SmartTipGenerator + SmartTodoManager + ReportGenerator (晚间总结) |
| W5 | 记忆系统 (四层记忆架构 + 每日萃取 + 向量检索 + PageIndex MCP)；亲密度系统 |
| W6 | **MCP 管理面板 UI + Anima MCP Server 模式**；WhatsApp + Slack 频道；CronService |

**验证**: 主动关心 + 晚间总结 + 记忆 + 2频道 + MCP 连接跑通

### Phase 3: 全能交互 + 扩展生态 (3 周)

| 周 | 任务 |
|----|------|
| W7 | Feishu + DingTalk 频道；文件监控 + 文档处理器 |
| W8 | ContextMerger；desktop-shell macOS 集成；**Skills 管理面板 + 预置 skills 移植** |
| W9 | UI 扩展（记忆管理 + 活动时间线 + 待办面板）；Email 频道；**MCP 推荐列表 + 一键安装**；性能优化 |

**验证**: 全频道 + 完整上下文 + MCP/Skills 生态 + Mac 原生体验

### 里程碑

```
Week 0    Week 1        Week 3         Week 6          Week 9
  │         │              │              │               │
  v         v              v              v               v
开始 ──→ 基础设施升级 ──→ Walking     ──→ 核心能力    ──→ 完整系统
          AI SDK 6        Skeleton        记忆+频道        全能桌面伙伴
          MCP+Skills骨架   角色主动说话     MCP管理面板      Skills生态
                          感知用户活动     晚间总结         无限扩展能力
```

---

## 十四、Mac 桌面体验设计

### 14.1 三种常驻形态

| 形态 | 说明 | 适用场景 |
|------|------|---------|
| **状态栏图标** | Menu Bar 图标 + 点击弹出快速面板 | 最轻量，专注工作时 |
| **悬浮窗** | 200x300 Live2D 角色 + 对话气泡，可拖拽 | 日常陪伴 |
| **全窗口** | 角色 + 完整聊天 + 侧边栏 (记忆/待办/时间线) | 深度交互 |

### 14.2 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+A` | 呼出/隐藏主面板 (类似 Spotlight) |
| `Cmd+Shift+V` | 快速语音输入 (按住说话) |
| `Cmd+Shift+C` | 发送剪贴板内容给 AI |
| `Cmd+Shift+L` | 切换轻量/完整模式 |
| `Escape` | 最小化到悬浮窗/状态栏 |

### 14.3 系统通知

- 用户不在桌面时 → macOS Notification Center 原生通知（支持快捷回复）
- 用户在桌面时 → 角色气泡通知（3 秒自动消失，点击展开聊天）
- 全屏应用中 → 静默或仅状态栏徽标

### 14.4 性能预算

| 模式 | 内存 | CPU | GPU |
|------|------|-----|-----|
| 轻量 (纯文字) | ~100MB | 极低 | 无 |
| 完整 (Live2D + 语音) | ~500MB | 中等 | 低 |

---

## 十五、隐私设计

### 15.1 用户可控的感知范围

```typescript
interface PrivacySettings {
  screenCapture: {
    enabled: boolean
    mode: 'whitelist' | 'blacklist'
    allowedApps: string[]
    blockedApps: string[]
    skipBankingApps: true
    skipIncognito: true
  }
  activityTracking: {
    trackAppSwitches: boolean
    trackWebsites: boolean
    trackFileOperations: boolean
  }
  audioCapture: {
    onlyWhenTriggered: true // 只有按语音键才录音
    noBackgroundListening: true // 禁止后台监听
  }
}
```

### 15.2 数据处理分层

| 层 | 处理位置 | 数据类型 |
|----|---------|---------|
| **完全本地** | Mac 本机 | 截图分析、活动模式、记忆存储、情绪逻辑 |
| **匿名化上传** | LLM API | 对话内容、摘要生成（脱敏后） |
| **用户明确授权** | 可选 | 跨设备同步、日报导出、第三方集成 |

### 15.3 记忆管理

- **透明性**: 角色引用记忆时标注来源
- **可控性**: 每条记忆可查看/编辑/删除
- **知情权**: 新增重要记忆时通知用户
- **遗忘权**: 一键清除所有记忆

---

## 十六、风险评估

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| **WhatsApp 封号** (Baileys 非官方) | 高 | Business API 备选；限流；独立号码 |
| **LLM 成本** (VLM 截图理解高频调用) | 高 | 分层模型路由 + pHash 去重 + 本地模型兜底 + Batch API |
| **xsAI → AI SDK 6 迁移** | 中 | 渐进迁移，保留 xsAI tool 定义兼容层；Phase 0 集中验证 |
| **MCP Server 进程管理** | 中 | stdio 子进程需要可靠的生命周期管理；参考 Claude Desktop 实现 |
| **LanceDB Electron 打包** | 中 | 验证 electron-builder + N-API binding；SQLite+vss 作为备选 |
| **macOS 权限** (截图/Accessibility) | 中 | 首次启动引导授权；无权限时降级运行 |
| **Skills 安全性** | 中 | 用户安装的 Skill 可能包含恶意指令；需要 sandbox 审核机制 |
| **工期估算偏差** | 中 | Phase 0 新增 1 周；文档处理器最复杂(5-7d)，优先验证 |
| **Live2D 性能** | 低 | 轻量模式关闭渲染；requestAnimationFrame 优化 |

---

## 附录: 技术选型清单

| 需求 | 选择 | npm 包 | 周下载量 |
|------|------|--------|---------|
| **LLM SDK** | **AI SDK 6** | **ai** | **>2.8M** |
| **MCP Client** | **AI SDK MCP** | **@ai-sdk/mcp** | **>100k** |
| **MCP Server** | **官方 SDK** | **@modelcontextprotocol/sdk** | **>500k** |
| 本地推理 | node-llama-cpp | node-llama-cpp | >20k |
| 向量存储 | LanceDB | @lancedb/lancedb | >10k |
| 结构化存储 | SQLite | better-sqlite3 | >300k |
| 截图 | Electron API | desktopCapturer (内置) | - |
| 图片处理 | sharp | sharp | >4M |
| 文件监控 | Parcel Watcher | @parcel/watcher | >2M |
| PDF 解析 | pdf.js | pdfjs-dist | >1M |
| DOCX 解析 | mammoth | mammoth | >200k |
| Excel 解析 | exceljs | exceljs | >800k |
| WhatsApp | Baileys | @whiskeysockets/baileys | >50k |
| Slack | Bolt | @slack/bolt | >200k |
| 飞书 | 官方 SDK | @larksuiteoapi/node-sdk | >5k |
| Email IMAP | imapflow | imapflow | >50k |
| Email SMTP | nodemailer | nodemailer | >2M |
| 定时任务 | croner | croner | >100k |
| DI 容器 | injeca | injeca (已有) | - |
| Tool 定义 | xsAI (兼容层) | @xsai/tool (已有) | - |
