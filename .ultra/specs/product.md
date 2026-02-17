# Product Specification

> **Source of Truth**: This document defines WHAT the system does and WHO it's for. Technical HOW belongs in `architecture.md`.
> **Derived from**: `INTEGRATION_PLAN.md` (Anima 原生集成方案 v3)

---

## 1. Problem Statement

### 1.1 Core Problem

> **想要 AI 陪伴的 Mac 桌面用户**缺乏一个**主动关心、有记忆、有人格**的数字伙伴，因为现有 AI 助手都是**被动、无记忆、无情感**的工具，导致用户无法获得持续的、有温度的 AI 陪伴体验。

**一句话定位**：一个住在你 Mac 上的、理解你的、会主动关心你的 AI 伙伴。

### 1.2 Current Solutions & Pain Points

| Current Solution | Pain Point | Impact |
|------------------|------------|--------|
| ChatGPT / Claude 对话 | 被动：用户提问 → AI 回答 → 结束，每次对话从零开始 | 无连续感，无法形成陪伴关系 |
| Character.ai / JanitorAI | 仅聊天，无法感知用户实际活动，无桌面集成 | 互动单一，与真实生活割裂 |
| SillyTavern 本地方案 | 需要技术门槛，无主动触发能力，无上下文感知 | 仅技术用户可用，无"生活感" |
| Neuro-sama (非开源) | 不开源，仅直播时可互动，无法自定义 | 无法私有化拥有 |

---

## 2. Personas

### Persona 1: 知识工作者（小明）

| Attribute | Description |
|-----------|-------------|
| **Role** | 开发者 / 设计师 / 写作者，日均 Mac 使用 8h+ |
| **Goals** | 在长时间桌面工作中获得陪伴感、健康提醒、智能辅助 |
| **Pain Points** | 久坐忘记休息、任务过多难以管理、工作中缺乏情感交流 |
| **Behaviors** | 频繁切换编辑器/浏览器/通讯工具，偶尔打开游戏/视频放松 |
| **Technical Level** | Intermediate — 能安装 App，能配置 API Key，不愿折腾 Python 环境 |

### Persona 2: 数字生活爱好者（小红）

| Attribute | Description |
|-----------|-------------|
| **Role** | 对 AI / 虚拟角色感兴趣的年轻用户 |
| **Goals** | 拥有一个有人格、有记忆、能成长的私有 AI 角色 |
| **Pain Points** | 现有 AI 角色无法记住自己、对话千篇一律、无法感知生活 |
| **Behaviors** | 喜欢与 AI 角色闲聊、分享日常、定制角色人设和外表 |
| **Technical Level** | Beginner — 希望开箱即用，安装 DMG 即可使用 |

### Persona 3: 开发者 / 扩展者（Hacker）

| Attribute | Description |
|-----------|-------------|
| **Role** | 想在 Anima 上构建新能力的技术用户 |
| **Goals** | 通过 MCP Server / Skills 扩展 Anima 能力，接入自有系统 |
| **Pain Points** | 现有 AI 助手封闭、不可扩展、无法接入内部工具 |
| **Behaviors** | 编写 SKILL.md、搭建 MCP Server、贡献开源插件 |
| **Technical Level** | Advanced — 能编写代码，理解 MCP 协议 |

---

## 3. User Scenarios

### Scenario 1: 工作日主动关心

| Element | Description |
|---------|-------------|
| **Persona** | 知识工作者（小明） |
| **Context** | 工作日下午，小明已连续编码 2 小时 |
| **Goal** | Anima 主动提醒休息，不打断工作流 |
| **Steps** | 1. ContextEngine 检测连续活动 >2h → 2. ProactiveTrigger 匹配 T03(休息提醒) → 3. PersonaEngine 生成角色化回复 → 4. 角色气泡弹出"工作了好久了，休息一下？" |
| **Success Outcome** | 用户感受到被关心，短暂休息后回到工作 |
| **Failure Handling** | 用户忽略 → 渐进退避（冷却 x1.5），不重复骚扰 |

### Scenario 2: 晚间每日总结

| Element | Description |
|---------|-------------|
| **Persona** | 知识工作者（小明） |
| **Context** | 晚上 20-22 点，用户有当天活动数据 |
| **Goal** | Anima 生成今日活动总结，萃取重要记忆 |
| **Steps** | 1. CronService 触发晚间总结 → 2. 并行收集活动/截图/对话/待办 → 3. LLM 萃取重要事件+偏好 → 4. 角色化输出 "今天你做了XXX，好棒啊~" → 5. 新记忆存入 LanceDB |
| **Success Outcome** | 用户了解今日概况，角色记住重要事件 |
| **Failure Handling** | 无足够活动数据 → 跳过总结或简短问候 |

### Scenario 3: MCP 能力扩展

| Element | Description |
|---------|-------------|
| **Persona** | 开发者 / 扩展者（Hacker） |
| **Context** | 用户希望 Anima 能操作 GitHub |
| **Goal** | 通过 MCP 管理面板一键添加 GitHub MCP Server |
| **Steps** | 1. 打开设置 > MCP 服务器 > 推荐列表 → 2. 选择 mcp-server-github → 3. 配置 Token → 4. Anima 自动发现 12 个 GitHub tools → 5. 对话中说"帮我看一下最新 PR" |
| **Success Outcome** | Anima 通过 MCP 调用 GitHub API，返回 PR 列表 |
| **Failure Handling** | MCP Server 连接失败 → 显示错误 + 建议检查配置 |

### Scenario 4: 角色情感成长

| Element | Description |
|---------|-------------|
| **Persona** | 数字生活爱好者（小红） |
| **Context** | 用户持续使用 Anima 两周，亲密度从 stranger 到 friend |
| **Goal** | 角色的称呼、语气、主动行为随亲密度变化 |
| **Steps** | 1. 日常对话积累亲密度 (+1/次, 上限 5/日) → 2. 深度对话 +3, 采纳建议 +2 → 3. 达到 friend(36+) → 4. 称呼变为昵称，开始主动调侃和分享发现 |
| **Success Outcome** | 用户感受到角色的成长和关系深化 |
| **Failure Handling** | 亲密度不会负增长，避免用户受挫 |

### Scenario 5: 多频道消息接入

| Element | Description |
|---------|-------------|
| **Persona** | 知识工作者（小明） |
| **Context** | 用户配置了 Slack 和 Email 频道 |
| **Goal** | Anima 在用户不在桌面时通过配置的频道发送关心 |
| **Steps** | 1. 用户离开 Mac >30min → 2. 重要日期提醒触发 (T07) → 3. Anima 通过 Slack 发送角色化提醒 → 4. 用户可在 Slack 中回复 |
| **Success Outcome** | Anima 跨平台触达用户 |
| **Failure Handling** | 频道不可用 → 降级到下一优先级频道或等用户回到桌面 |

---

## 4. User Stories & Features

### 4.1 Feature List

| ID | Feature | Priority | Acceptance Criteria |
|----|---------|----------|---------------------|
| F1 | Skills 系统 (SKILL.md 渐进加载) | P0 | 内置 Skills 可加载到 system prompt，用户可安装/卸载自定义 Skills |
| F2 | MCP Hub (多服务器注册+Client) | P0 | 支持 stdio/SSE/HTTP 三种传输，可连接 3+ MCP Server 并聚合 tools |
| F3 | 上下文感知引擎 (截图+VLM+活动监控) | P0 | 定时截图 → pHash 去重 → VLM 理解 → 向量存储，ActivityMonitor 产出上下文 |
| F4 | 人格引擎 (情绪状态机+亲密度) | P0 | 6 种情绪状态自动转换，亲密度 5 阶段影响称呼和行为 |
| F5 | 主动对话触发系统 | P0 | 11 种触发条件运行正常，频率限制 3 次/小时、15 次/天 |
| F6 | 四层记忆架构 (LanceDB+SQLite) | P0 | 工作/实时/结构化/文档四层存储，每日记忆萃取运行 |
| F7 | Agent Loop (AI SDK 6) | P0 | LLM 调用层迁移到 AI SDK 6，maxSteps Agent Loop 跑通 |
| F8 | CronService (定时任务) | P1 | 支持 at/every/cron 三种调度，驱动晚间总结和主动对话 |
| F9 | 智能生成 (日报+Tips+Todo+活动监控) | P1 | 晚间总结、智能提示、智能待办、活动监控角色化输出 |
| F10 | WhatsApp 频道 | P1 | baileys 接入，消息收发正常 |
| F11 | Slack 频道 | P1 | @slack/bolt 接入，消息收发正常 |
| F12 | Email 频道 | P1 | imapflow + nodemailer 接入 |
| F13 | 飞书频道 | P2 | @larksuiteoapi/node-sdk 接入 |
| F14 | 钉钉频道 | P2 | Stream 协议自实现 |
| F15 | 文件监控 + 文档处理器 | P2 | @parcel/watcher 监控 + pdf.js/mammoth 解析 |
| F16 | ContextMerger (上下文合并) | P2 | 多源上下文合并算法 |
| F17 | Desktop Shell (macOS 集成) | P2 | 活动窗口检测、剪贴板监听、全局快捷键 |
| F18 | Anima MCP Server (暴露自身能力) | P2 | 其他 AI 工具可通过 MCP 调用 Anima 的记忆/上下文 |
| F19 | MCP 管理面板 UI | P2 | 设置中的 MCP 服务器增删改查 + 推荐列表 |
| F20 | Skills 管理面板 + 预置 Skills | P2 | Skills 浏览/安装/卸载 UI，9 个预置 Skills |

**Priority Guide**: P0 = Phase 0-1 必须完成, P1 = Phase 2 核心能力, P2 = Phase 3 全能交互

### 4.2 User Stories

#### Story 1: 主动休息提醒

**As a** 知识工作者
**I want to** Anima 在我连续工作超过 2 小时后主动提醒我休息
**So that** 我不会因为过度专注而忽略健康

**Acceptance Criteria**:
- [ ] ContextEngine 能检测连续工作时长
- [ ] ProactiveTrigger 在 >2h 时触发 T03
- [ ] PersonaEngine 生成角色化提醒（非机械通知）
- [ ] 90 分钟冷却期内不重复触发
- [ ] 全屏应用时静默

**Links to**: F3, F4, F5

#### Story 2: 晚间记忆萃取

**As a** 任何用户
**I want to** Anima 在每天晚上自动总结今天的活动并记住重要事件
**So that** 角色能在未来的对话中引用今天发生的事

**Acceptance Criteria**:
- [ ] CronService 在 23:00 或关机时触发萃取
- [ ] LLM 从短期记忆中提取 importance > 7/10 的事件
- [ ] 新记忆向量化存入 LanceDB，去重后合并
- [ ] 次日对话可检索到昨天记忆

**Links to**: F6, F8, F9

#### Story 3: MCP 能力扩展

**As a** 技术用户
**I want to** 通过 MCP 管理面板一键连接外部 MCP Server
**So that** Anima 能获得新能力（GitHub、搜索、数据库等）

**Acceptance Criteria**:
- [ ] MCP Registry 支持 stdio/SSE/HTTP 三种传输
- [ ] 工具自动聚合传入 LLM 上下文
- [ ] 懒加载连接（不活跃的 Server 不占进程）
- [ ] UI 显示 Server 状态、工具数量

**Links to**: F2, F18, F19

#### Story 4: Skills 自定义

**As a** 想定制 AI 行为的用户
**I want to** 通过编写或安装 SKILL.md 教会 Anima 新技能
**So that** 无需代码即可扩展角色的知识和行为

**Acceptance Criteria**:
- [ ] 遵循 agentskills.io 标准 SKILL.md 格式
- [ ] 三层渐进加载 (metadata → body → resources)
- [ ] 内置 Skills + 用户自定义 Skills 共存
- [ ] Skills 内容注入 system prompt

**Links to**: F1, F20

---

## 5. Features Out (Explicitly NOT Building)

| Feature | Reason NOT Building | Future Consideration |
|---------|---------------------|---------------------|
| Python sidecar / 内嵌 Python 运行时 | Mac 桌面应用要求零 Python 依赖；Python 生态通过 MCP 协议外部接入 | Never (MCP 是永久方案) |
| 自训练模型 / Fine-tuning | 只调 API 不训练模型，本地推理用 node-llama-cpp | Never |
| 手机原生版本 (iOS/Android 独立 App) | 专注 Mac 桌面体验，AIRI 已有 stage-pocket 移动方案 | Phase 4+ |
| 语音连续后台监听 | 隐私红线：只在用户按语音键时才录音 | Never |
| Windows / Linux 桌面版 | 先聚焦 Mac 体验做到极致 | Phase 4+ |
| MoChat 频道 | 复杂度 4/5 (895 行)，ROI 不高 | P3 (可选) |
| 全量 Python AI 框架 (LangChain/LlamaIndex) | TypeScript 生态完全胜任 LLM API 调用场景 | Never |

---

## 6. Success Metrics

### 6.1 Product Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| 日活启动率 (DAU/Install) | 0% | >60% | App 启动事件统计 |
| 主动对话触发成功率 | 0% | >80% 不被忽略 | 用户响应 / 触发总数 |
| 平均亲密度成长速率 | 0 | >2 points/day (活跃用户) | SQLite 亲密度表 |
| MCP Server 连接成功率 | 0% | >95% | MCP Registry 健康检查 |
| 记忆检索相关度 | 0% | >85% top-3 相关 | LanceDB 向量搜索 precision@3 |

### 6.2 Technical Metrics

| Metric | Target |
|--------|--------|
| App 冷启动时间 | <3s (轻量模式) |
| 主动对话响应延迟 | <2s (感知→输出) |
| 内存占用 (轻量模式) | <100MB |
| 内存占用 (完整模式) | <500MB |
| LLM API 成本 (活跃用户/月) | <$5 (分层路由+pHash 去重+本地兜底) |

### 6.3 User Experience Metrics

| Metric | Target |
|--------|--------|
| 用户觉得角色"有人格" | >70% (问卷) |
| 主动关心"恰到好处" | >75% (不觉得打扰) |
| 记忆准确性 ("它记得我说过的") | >80% |

---

**Document Status**: Approved
**Last Updated**: 2026-02-18
**Source**: INTEGRATION_PLAN.md v3 (4 位专家 Agent 综合输出)
