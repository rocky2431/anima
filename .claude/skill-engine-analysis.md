# Skill Engine 深度分析

## 执行摘要

AIRI 的 **Skill 引擎**是一个轻量级的**动态指令系统**，用于为 LLM 注入上下文化的行为指南。它 **NOT** 是 LLM 的 function calling 工具层，也不是插件系统的一部分。相反，它是**系统提示（system prompt）增强**和**能力声明**的机制。

---

## 1. Skill 引擎架构

### 1.1 核心概念

**Skill** = 结构化的行为指南集合
- **SKILL.md 文件**：YAML frontmatter + Markdown 正文
- **前置数据**：元数据（id, name, category, version, description, tags, allowedTools?, dependencies?）
- **正文**：详细的指令文本（供 LLM 阅读）

```yaml
---
id: proactive-care
name: Proactive Care
category: wellbeing
version: 1.0.0
description: Enables proactive check-ins based on activity patterns
allowedTools:
  - schedule_reminder
  - check_activity
dependencies:
  - companion-persona
---

# Proactive Care
Guide the AI to proactively care for the user...
```

### 1.2 三层架构（系统提示注入）

```
Layer 1: Metadata Summary (lightweight, for all skills)
├─ id, name, category, description
└─ ~200 tokens per prompt

Layer 2: Full Body (detailed, for ACTIVE skills only)
├─ Complete instructions
└─ Injected into system prompt

System Prompt Structure:
├─ ## Available Skills (Layer 1: all skills)
├─ ## Active Skill Instructions (Layer 2: only active)
└─ [Persona template] + [Other system context]
```

**关键设计**：
- **层级分离**：避免过度膨胀 prompt token 使用
- **激活控制**：只有激活的 skill 才注入完整指令
- **声明性**：skill 定义与执行分离

### 1.3 核心模块

#### `SkillRegistry`
```typescript
class SkillRegistry {
  // 双层源：builtin + user（用户可覆盖内置 skill）
  loadAll(): Promise<void>
  getAll(): SkillRegistryEntry[]
  getActive(): Skill[]
  activate(id: string): boolean
  deactivate(id: string): boolean
}
```

状态：
- **Immutable entries** 存储 (ID → Skill + active flag)
- **持久化**：active 状态保存到 BrainStore（SQLite）

#### `Skill Loader`
```typescript
// 目录扫描 → SKILL.md 解析 → Skill 对象
discoverSkills(baseDir: string, source: 'builtin' | 'user')
  → DiscoverResult { skills: Skill[], errors: Error[] }

parseSkillMd(content: string)
  → validate frontmatter → extract body → return Skill
```

#### `Context Integration`
```typescript
// 为 system prompt 生成最终文本
buildSkillsContext(allSkills: Skill[], activeSkills: Skill[]): string
  → "## Available Skills\n... + \n## Active Skill Instructions\n..."

extractLayer1(skill: Skill): SkillLayer1
  → { id, name, category, description }

formatLayer2Body(skill: Skill): string
  → "### Skill: {name}\n\n{body}"
```

---

## 2. Context-Engine 架构

### 2.1 三层内存系统

```
Context-Engine = 活动→记忆→消费 的管道

Capture Layer (活动捕获)
├─ ActivityMonitor: 监听应用切换、窗口焦点
├─ ScreenshotPipeline: 截屏 → VLM 理解 → pHash
└─ FolderMonitor: 文件变化事件
        ↓
Processing Layer (处理)
├─ DocumentProcessor: 解析 PDF/DOCX/TXT
├─ ScreenshotProcessor: VLM 理解（Activity/Entities/Description）
├─ EntityExtractor: 从文本提取实体
├─ ContextMerger: 多源数据合并+去重
└─ TextChunker: 文本分块（检索准备）
        ↓
Consumption Layer (消费)
├─ MemoryOrchestrator: 三层内存协调
│  ├─ Layer 1: Working Memory (RAM, 最近 N 对话)
│  ├─ Layer 2: Real-time Memory (向量搜索)
│  └─ Layer 3: Structured Memory (关系/事实/日期)
├─ MemoryExtractor: 从对话提取结构化记忆
├─ ReportGenerator: 每日活动总结
├─ SmartTip: 智能提示（基于活动）
└─ SmartTodo: 待办建议（从对话/活动）
```

### 2.2 数据流

```
用户活动
  ↓
[ActivityMonitor] 捕获 app/window/duration
  ↓
[ProcessedContext] { activity, screenshot?, timestamp }
  ↓
[Evening Pipeline]
  ├─ [ReportGenerator.generate(activities)] → DailySummary
  ├─ [MemoryExtractor.extract(activities)] → ExtractionResult
  └─ [MemoryOrchestrator.persistExtractionResults()]
       ↓ vector embed + store
```

### 2.3 关键接口

#### `LlmProvider`（context-engine 使用）
```typescript
interface LlmProvider {
  generateText: (options: { system, prompt }) => Promise<string>
  generateStructured: <T>(options: { system, prompt, schemaDescription }) => Promise<T>
}
```

**注意**：No tool calling, no function definitions。纯 text/structured 生成。

#### `MemoryOrchestrator`
```typescript
interface MemoryOrchestratorOptions {
  documentStore: DocumentStore
  vectorStore: VectorStore
  embedding: EmbeddingProvider
  workingMemoryCapacity?: number
}

// Recall memories by semantic similarity
recall(query: { text, topK?, threshold? }): Promise<MemoryRecallResult[]>
```

---

## 3. Persona-Engine 架构

### 3.1 核心职能

**Persona-Engine** = **主动触发引擎** + **情感状态机**

```
触发条件评估 → 情感调节 → 模板化响应

Input: TriggerInput {
  continuousWorkDurationMs
  isFullscreen
  currentApp
  currentHour, currentMinute
  isFirstActivityToday
  previousAppCategory
  matchedImportantDate
  hasNearDeadlineTodos
  windowSwitchesInLast5Min
  previousFocusDurationMs
  timeSinceLastActivityMs
  intimacyStage
}

   ↓

[evaluateTriggers(input, emotionState, doNotDisturbState)]
  → T01_MORNING_GREETING
  → T02_NOON_CARE
  → T03_REST_REMINDER
  → T04_ENTERTAINMENT_SWITCH
  → T05_LATE_NIGHT
  → T06_EVENING_SUMMARY
  → T07_IMPORTANT_DATE
  → T08_TASK_DUE
  → T09_HIGH_FREQUENCY_SWITCH
  → T10_BIG_TASK_COMPLETE
  → T11_RETURN_TO_DESKTOP

   ↓

[Emotion State Machine (xstate)]
  emotion ∈ { idle, curious, caring, worried, sleepy, excited }
  intensity: 0.0-1.0

   ↓

[generateResponse(trigger, emotion)] → ProactiveResponse {
  message: string
  emotion: EmotionState
  triggerId: string
}

   ↓

[Do Not Disturb Policy]
  ├─ maxPerHour, maxPerDay
  ├─ quietHours
  ├─ consecutiveIgnores → cooldown backoff
  └─ trigger priority bypass
```

### 3.2 响应生成

**不涉及 LLM**。使用**模板映射**：

```typescript
const RESPONSE_TEMPLATES: Record<string, Partial<Record<EmotionState, string>>> = {
  'morning-greeting': {
    excited: '早上好呀！新的一天开始了，今天也要加油哦～',
    idle: '早安。新的一天开始了。',
    // ...
  },
  // ...
}
```

**选择策略**：
1. 根据 `triggerId` 查表
2. 根据当前 `emotion` 获取模板
3. 直接返回模板文本（零 LLM 开销）

### 3.3 不包含的内容

- ❌ Skill 引用
- ❌ Context-engine 集成（只接收结构化的 TriggerInput）
- ❌ 动态 LLM 生成
- ❌ Tool calling

---

## 4. Skill 与 Context-Engine 的边界

### 4.1 Skill 的用途

| 场景 | Skill 角色 |
|------|----------|
| **系统提示增强** | ✅ 为 LLM 注入行为指南 |
| **能力声明** | ✅ 声明哪些 LLM tool 可用 |
| **记忆提取（prompt）** | ✅ 可被 MemoryExtractor/ReportGenerator 使用 |
| **触发条件** | ❌ Persona-engine 不依赖 skill |
| **记忆存储** | ❌ Context-engine 不读取 skill 内容 |
| **函数调用工具** | ❌ 不是 LLM function calling 的实现 |
| **插件** | ❌ 不在 plugin-sdk 中 |

### 4.2 当前集成现状

**Skill 在 airi-brain 中的使用**：

```typescript
// services/airi-brain/src/handlers/skills.ts

// 1. Registry 初始化 + 加载
registry = new SkillRegistry({
  builtinSkillsDir: process.env.AIRI_SKILLS_BUILTIN_DIR,
  userSkillsDir: process.env.AIRI_SKILLS_USER_DIR,
})
await registry.loadAll()

// 2. 恢复 active 状态（从 BrainStore DB）
const savedStates = brainStore.getAllSkillStates()
for (const entry of registry.getAll()) {
  if (savedStates.has(entry.id)) {
    if (savedStates.get(entry.id))
      registry.activate(id)
    else registry.deactivate(id)
  }
}

// 3. 广播给前端
client.send({ type: 'skills:list', data: { skills: registry.getAll() } })

// 4. 处理切换事件
client.onEvent('skills:toggle', (event) => {
  const { id, active } = event.data
  registry[active ? 'activate' : 'deactivate'](id)
  brainStore.setSkillActive(id, active)
  client.send({ type: 'skills:toggled', data: { id, active, success } })
})
```

**Missing Integration**：
- `buildSkillsContext()` 未被调用
- Skill 内容未注入 LLM prompt
- `allowedTools`, `dependencies` 字段未被使用

---

## 5. Skill vs. LLM Tool Calling

### 5.1 当前 LLM 集成（AI SDK / xsAI）

**airi-brain 的 LLM 接口**：

```typescript
// packages/context-engine/src/types.ts
interface LlmProvider {
  generateText(options: { system, prompt }): Promise<string>
  generateStructured<T>(options: { system, prompt, schemaDescription }): Promise<T>
}

// adapters.ts
async generateStructured<T>(options: {
  system: string
  prompt: string
  schemaDescription: string
}): Promise<T> {
  // 调用 AI SDK 的 generateObject()
  // NO function calling, NO tools definition
}
```

**特点**：
- ✅ 纯 structured output（via JSON schema description）
- ❌ 零 function calling 支持
- ❌ 无 tool 定义机制

### 5.2 Skill allowedTools 的用途

当前在代码中 **未使用**：

```typescript
// types.ts
export interface SkillMetadata {
  readonly allowedTools?: string[] // ← 存在但未读取
}

// SKILL.md 示例
allowedTools:
-schedule_reminder
- check_activity
```

**推测的意图**（但未实现）：
1. **声明**：此 skill 可以调用哪些工具
2. **权限控制**：用户激活 skill → 自动启用关联的 tool access
3. **约束检查**：LLM 仅允许调用已声明的 tool

**现状**：Skill 文件可以声明，但系统未读取或利用此信息。

---

## 6. Skill × Plugin System

### 6.1 为什么 Skill 不属于 Plugin System

| 维度 | Plugin SDK | Skill Engine |
|------|-----------|--------------|
| **生命周期** | 完整的 init/setup 钩子 + xstate | 静态加载 → activate/deactivate |
| **入口点** | `PluginHost.load()` + channels | 文件系统扫描 |
| **通信** | Channel + RPC 接口 | 无运行时通信 |
| **状态管理** | 持久化配置 + 事件流 | 仅 active 标志 |
| **隔离** | 进程隔离（可选） | 内存中的数据 |
| **扩展能力** | 监听/发送自定义事件 | 只能通过 LLM prompt 影响行为 |

**结论**：
- ✅ Plugin = **可执行的扩展程序**（有代码、有运行时）
- ✅ Skill = **静态指令库**（只有文本、通过 LLM 注入生效）

### 6.2 Skill 的正确位置

```
Application
├─ Plugin System (server-sdk, plugin-sdk)
│  └─ 动态加载可执行的服务/handler
├─ Skill Engine (skills-engine)
│  └─ 静态 LLM prompt 增强
├─ Persona Engine (persona-engine)
│  └─ 条件触发 + 情感状态
└─ Context Engine (context-engine)
   └─ 活动/记忆/消费 管道
```

---

## 7. Persona-Engine × Context-Engine × Skill Engine 的关系

### 7.1 完整的响应流程

```
用户交互
  ↓
[Context-Engine/ActivityMonitor] 捕获活动
  ↓
[Persona-Engine/evaluateTriggers] 检查条件
  ├─ 满足 → TriggerResult { triggered: true, triggerId, suggestedEmotion }
  └─ 不满足 → TriggerResult { triggered: false }

  ↓ IF triggered

[Emotion State Machine] 转移情感状态

  ↓
[generateResponse(trigger, emotion)]
  → 模板查表 → 返回文本

  ↓
[Skill Engine???]
  ← 当前未连接
  ← 可能的角色：为 LLM 提供深层 prompt context？
```

### 7.2 Skill 可能的使用场景

**场景 A：主动响应增强（目前未实现）**
```
[Trigger 激发] → [查询活跃 Skill]
  → [构建 system prompt]
     = Persona template + Active skills
  → [LLM 生成更上下文化的响应]
```

**场景 B：对话中的上下文注入**
```
用户消息 + 活动上下文
  → [buildSkillsContext(allSkills, activeSkills)]
  → 注入 system prompt
  → LLM 根据 skill 指引生成回复
```

**场景 C：记忆提取提示词**
```
[MemoryExtractor/MemoryOrchestrator]
  → 构建提取 prompt
  → 可选择包含 active skill 的指引
  → 强化记忆分类
```

---

## 8. 完整架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     AIRI Brain Services                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend (Desktop/Web)                                          │
│  └─ 用户点击激活/停用 Skill                                      │
│     └─ [skills:toggle] event → brain                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ╔════════════════════════════════════════════════════════════╗ │
│  ║ Handler Layer (services/airi-brain/src/handlers/*.ts)      ║ │
│  ╠════════════════════════════════════════════════════════════╣ │
│  ║                                                            ║ │
│  ║ [skills.ts] ←→ SkillRegistry                              ║ │
│  ║   • loadAll() from builtin + user dirs                   ║ │
│  ║   • activate(id) / deactivate(id)                        ║ │
│  ║   • getAll() / getActive()                               ║ │
│  ║   • Broadcast to frontend                                ║ │
│  ║   ← DB: persist active states                            ║ │
│  ║                                                            ║ │
│  ║ [persona.ts] ←→ Persona-Engine                            ║ │
│  ║   • evaluateTriggers(TriggerInput) → TriggerResult        ║ │
│  ║   • generateResponse(trigger, emotion) → message          ║ │
│  ║   • Emotion state machine (xstate)                        ║ │
│  ║   • DO NOT call Skill-Engine                             ║ │
│  ║                                                            ║ │
│  ║ [evening-pipeline.ts] ←→ Context-Engine                  ║ │
│  ║   • ReportGenerator.generate(activities)                  ║ │
│  ║   • MemoryExtractor.extract(...)                          ║ │
│  ║   • MemoryOrchestrator.persistExtractionResults(...)      ║ │
│  ║   • LLM provider (text/structured generation)             ║ │
│  ║   • NO tool calling support                               ║ │
│  ║   • MISSING: buildSkillsContext() injection?              ║ │
│  ║                                                            ║ │
│  ╚════════════════════════════════════════════════════════════╝ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ╔════════════════════════════════════════════════════════════╗ │
│  ║ Engine Packages (packages/*/src)                           ║ │
│  ╠════════════════════════════════════════════════════════════╣ │
│  ║                                                            ║ │
│  ║ [skills-engine/]                                          ║ │
│  ║   SkillRegistry → SkillLoader → context-integration       ║ │
│  ║   • Scope: static skill loading + Layer 1/2 formatting    ║ │
│  ║   • Does NOT execute skills                              ║ │
│  ║   • Does NOT call LLM                                    ║ │
│  ║   • Does NOT integrate with Persona/Context              ║ │
│  ║                                                            ║ │
│  ║ [persona-engine/]                                         ║ │
│  ║   • Proactive triggers + Emotion state machine             ║ │
│  ║   • Skill-independent                                      ║ │
│  ║   • Context-independent (only reads TriggerInput)         ║ │
│  ║   • Response templates (no LLM)                           ║ │
│  ║                                                            ║ │
│  ║ [context-engine/]                                         ║ │
│  ║   • Capture: ActivityMonitor, ScreenshotPipeline          ║ │
│  ║   • Process: DocumentProcessor, ContextMerger             ║ │
│  ║   • Consume: MemoryOrchestrator, ReportGenerator           ║ │
│  ║   • LLM calls: text/structured only (NO tools)            ║ │
│  ║   • Skill-independent (but could consume skill context?)  ║ │
│  ║                                                            ║ │
│  ╚════════════════════════════════════════════════════════════╝ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Persistence (BrainStore / SQLite)                               │
│   • skill active states                                         │
│   • activity events                                             │
│   • memory embeddings (vector store)                            │
│   • personas, todos, relationships                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. 当前缺陷与建议

### 9.1 Skill Integration Gap

**当前状态**：
```typescript
// ✅ SkillRegistry 完整实现 + 前端交互
// ✅ Skill 文件格式定义清晰
// ✅ Layer 1/2 格式化逻辑完成
// ❌ buildSkillsContext() 从未被调用
// ❌ allowedTools / dependencies 未被读取
// ❌ 无处将 skill context 注入 LLM prompt
```

### 9.2 推荐方案

#### Option A: 为 LLM 生成增强 System Prompt

```typescript
// providers.ts 或 pipeline 中
const allSkills = registry.getAll()
const activeSkills = registry.getActive()
const skillContext = buildSkillsContext(
  allSkills.map(e => e.skill),
  activeSkills
)

// 在 ReportGenerator/MemoryExtractor 中
const system = [
  personaTemplate,
  skillContext, // ← 注入
  otherContext
].filter(Boolean).join('\n\n')

await llm.generateStructured({ system, prompt, schemaDescription })
```

**优点**：
- Skill 内容直接影响 LLM 行为
- 符合设计意图（Layer 1 + Layer 2）
- 最小化 token 开销（只注入 active skills）

**缺点**：
- 需要修改 LLM 调用处
- 增加 prompt 复杂度

#### Option B: 为 Tool Calling 准备基础

```typescript
// 仅当启用 function calling 时
if (capabilities.includes('tool_calling')) {
  const activeSkills = registry.getActive()
  const tools = activeSkills
    .flatMap(skill =>
      (skill.metadata.allowedTools ?? []).map(toolId => ({
        name: toolId,
        description: `Tool declared by skill: ${skill.metadata.id}`
      }))
    )

  // 传递给 AI SDK
  const result = await generateObject({
    tools,
    system,
    prompt
  })
}
```

**优点**：
- 为未来的 tool calling 支持铺平道路
- `allowedTools` 字段得到利用

**缺点**：
- 当前 AI SDK 集成不支持
- 需要先升级 LLM 配置

---

## 10. 总结

| 组件 | 职能 | 是否互依 |
|------|------|--------|
| **Skill-Engine** | LLM prompt 增强库（文本） | ✅ 可被 LLM 使用 |
| **Persona-Engine** | 条件触发 + 情感状态机 | ❌ 完全独立 |
| **Context-Engine** | 活动→记忆 pipeline | ❌ 自成一体 |
| **Plugin-SDK** | 动态服务加载 | ❌ 独立系统 |

**关键发现**：
1. **Skill Engine 是声明式的**，不是可执行的
2. **Persona-Engine 不需要 Skill**（使用模板）
3. **Context-Engine 不依赖 Skill**（但可选择注入）
4. **当前 Skill-Engine 核心功能完整，但集成不完整**
5. **allowedTools / dependencies 预留但未使用**

**最高优先级改进**：
1. 在 ReportGenerator/MemoryExtractor 中调用 `buildSkillsContext()`
2. 将 skill context 注入系统提示
3. 验证效果：测试 active skill 是否影响 LLM 输出
