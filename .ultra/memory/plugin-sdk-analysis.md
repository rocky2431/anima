# Plugin-SDK 生命周期和 Server-Runtime 通信模型深度分析

**日期**: 2026-03-06
**状态**: 完整分析

## 执行概要

AIRI 的插件系统采用 **xstate + @moeru/eventa** 驱动的事件型生命周期管理。系统分为两层：
- **插件主机层** (`plugin-sdk`)：本地 xstate 状态机管理
- **通信运行时** (`server-runtime`)：WebSocket 消息路由和模块发现

目前 **仅支持内存传输** (in-memory)，其他传输（WebSocket、Worker、Electron IPC）处于 TODO 状态。

---

## 1. Plugin-SDK 架构

### 1.1 核心生命周期状态机 (xstate)

**位置**: `packages/plugin-sdk/src/plugin-host/core.ts:173-259`

```
loading
  ↓ SESSION_LOADED
loaded ← → STOP
  ↓ START_AUTHENTICATION
authenticating
  ↓ AUTHENTICATED
authenticated
  ↓ ANNOUNCED
announced → START_PREPARING
  ↓
preparing → WAITING_DEPENDENCIES
  ↓ PREPARED
prepared → CONFIGURATION_NEEDED
  ↓ CONFIGURED
configured
  ↓ READY
ready ← REANNOUNCE (重启流程)
  ↓ CONFIGURATION_NEEDED / STOP

SESSION_FAILED can occur from: loading, authenticating, authenticated, announced, preparing, waiting-deps, prepared, configuration-needed, configured
```

**关键特性**：
- **16 个状态**，完全由 xstate 驱动
- **显式转移验证**：`assertTransition()` 防止非法状态跳跃
- **Lifecycle actor**: 每个会话独立持有 xstate actor 实例，保证隔离

### 1.2 插件会话 (PluginHostSession)

**接口**: `packages/plugin-sdk/src/plugin-host/core.ts:420-434`

```typescript
interface PluginHostSession {
  manifest: ManifestV1 // 插件清单
  plugin: Plugin // 已加载的插件实例
  id: string // 会话 ID (e.g. "plugin-session-0")
  index: number // 全局计数器索引
  identity: ModuleIdentity // 运行时身份 { id, kind, plugin, labels }
  phase: PluginSessionPhase // 当前生命周期阶段
  lifecycle: ActorRefFrom<xstate> // xstate actor
  transport: PluginTransport // 运输层配置
  runtime: PluginRuntime // 运行时: 'electron' | 'node' | 'web'
  channels: {
    host: EventContext // @moeru/eventa context (控制平面)
  }
  apis: PluginApis // 已绑定的 SDK API
}
```

### 1.3 文件系统加载器

**位置**: `packages/plugin-sdk/src/plugin-host/core.ts:919-1000`

**流程**：
1. 从 manifest 解析运行时相关入口点 (runtime-specific entrypoint)
   - 优先级: `entrypoints.<runtime>` → `entrypoints.default` → `entrypoints.electron`
2. 动态导入插件模块
3. 规范化导出为 `Plugin` 钩子或 `definePlugin()` 定义
4. 如果是 `definePlugin()` 则立即调用 `setup()`

**支持的导出形式**：
```typescript
// 形式 1: 直接导出 Plugin
export const plugin = { init: () => {...}, setupModules: () => {...} }

// 形式 2: definePlugin + setup
export default definePlugin('name', 'v1', async () => ({ init, setupModules }))

// 形式 3: 默认导出 Plugin
export default { init, setupModules }
```

### 1.4 PluginHost 核心方法

**位置**: `packages/plugin-sdk/src/plugin-host/core.ts:453-917`

#### `load(manifest, options)` 步骤 0-1
- 创建会话，分配唯一 ID 和身份
- 创建 Eventa 上下文（目前仅支持内存传输）
- 加载插件模块
- 转移到 `loaded` 状态

#### `init(sessionId, options)` 步骤 2-16
完整的生命周期启动流程：

**步骤 2: 认证**
```typescript
emit moduleAuthenticate: { token: "${session.id}:${session.identity.id}" }
emit moduleAuthenticated: { authenticated: true }
transition: authenticating → authenticated
```

**步骤 3: 协议协商**
```typescript
emit moduleCompatibilityRequest: { protocolVersion, apiVersion, supportedVersions? }
emit moduleCompatibilityResult: { protocolVersion, apiVersion, mode: 'exact'|'downgraded'|'rejected' }
```
- 目前硬编码 `mode: 'exact'`，不支持版本协商

**步骤 4: 模块注册表同步**
```typescript
emit registryModulesSync: { modules: [...existing sessions...] }
```

**步骤 5-6: 公告和准备**
```typescript
emit moduleAnnounce: { name, identity, possibleEvents: [] }
emit moduleStatus: { phase: 'announced'|'preparing' }
transition: announced → preparing
```

**步骤 7-10: 依赖等待和准备完成**
- 如果 `options.requiredCapabilities` 指定，等待这些能力就绪
- 调用 `plugin.init({ channels, apis })`
- 如果返回 `false` 则中止启动并转移到 `failed`

**步骤 11-13: 默认配置应用**
```typescript
await applyConfiguration(sessionId, {
  configId: `${identity.id}:default`,
  revision: 1,
  schemaVersion: 1,
  full: {}
})
emit moduleConfigurationConfigured
```

**步骤 14-15: 模块贡献**
- 调用 `plugin.setupModules({ channels, apis })`
- 插件可在此注册能力、提供者、UI 扩展

**步骤 16: 就绪**
```typescript
emit moduleStatus: { phase: 'ready' }
transition: configured → ready
```

#### `start(manifest, options)`
便利方法：`load(manifest) → init(session.id)`

#### 能力管理
```typescript
announceCapability(key, metadata)      // state: 'announced'
markCapabilityReady(key, metadata)     // state: 'ready' + 唤醒等待者
waitForCapability(key, timeoutMs)      // Promise<CapabilityDescriptor>
waitForCapabilities(keys[], timeoutMs) // Promise.all
listCapabilities()                     // CapabilityDescriptor[]
```

**能力状态机**：
```
announced → ready (markCapabilityReady)
```

---

## 2. Server-Runtime 架构

### 2.1 WebSocket 消息路由

**位置**: `packages/server-runtime/src/index.ts:75-440`

**核心流程**：
```
WebSocket.open
  ↓ (如果需要 auth)
  → peers.set(id, { authenticated: false })

WebSocket.message
  ↓ (superjson.parse + 验证)
  ↓ (检查认证，否则返回 error)
  ↓ (处理特殊事件: authenticate, announce, configure)
  ↓ (应用路由中间件)
  ↓ (广播或定向转发)

WebSocket.close / timeout
  ↓
  → unregisterModulePeer + peers.delete
```

### 2.2 认证流程

**无 token**：自动认证
```typescript
if (!authToken) {
  send(peer, RESPONSES.authenticated(instanceId))
  peers.set(peer.id, { authenticated: true, ... })
  sendRegistrySync(peer)
}
```

**有 token**：需要 `module:authenticate` 事件
```typescript
case 'module:authenticate': {
  if (authToken && event.data.token !== authToken) {
    send(peer, RESPONSES.error('invalid token'))
    return
  }
  send(peer, RESPONSES.authenticated(...))
  authPeer.authenticated = true
  sendRegistrySync(peer, parentId)
}
```

### 2.3 模块公告和发现

**事件**：`module:announce`
```typescript
event.data: { name: string, index?: number, identity: ModuleIdentity }
```

**行为**：
```typescript
registerModulePeer(peer, name, index)
// 在 peersByModule: Map<name, Map<index, AuthenticatedPeer>>
```

**发现**：
```typescript
listKnownModules() → [{name, index, identity}, ...]
sendRegistrySync(peer) → emit registry:modules:sync
```

### 2.4 模块配置转发

**事件**: `ui:configure`
```typescript
event.data: { moduleName, moduleIndex, config }
↓
target = peersByModule.get(moduleName).get(moduleIndex)
send(target.peer, { type: 'module:configure', data: { config } })
```

### 2.5 路由策略和中间件

**位置**: `packages/server-runtime/src/middlewares/route.ts:1-94`

**路由决策**：
```typescript
type RouteDecision
  = { type: 'drop' } // 丢弃事件
    | { type: 'broadcast' } // 广播给所有已认证的对等方
    | { type: 'targets', targetIds } // 转发给指定的对等方集合
```

**策略中间件**：
```typescript
interface RoutingPolicy {
  allowPlugins?: string[] // 允许列表
  denyPlugins?: string[] // 拒绝列表
  allowLabels?: string[] // 标签选择器 (allow)
  denyLabels?: string[] // 标签选择器 (deny)
}
```

**标签匹配**：支持 `key=value` 形式和正则模式

**事件级路由**：
```typescript
// 方式 1: event.route.destinations = ["module-name", { plugin: { id: "..." } }]
// 方式 2: event.data.destinations = [...]
// 方式 3: 应用策略中间件过滤
```

**默认行为**：
```typescript
if (!targetIds && !destinations)
  → broadcast to all authenticated peers
else if (targetIds)
  → send only to peers in targetIds
else if (destinations)
  → match peers against destination expressions
```

**Devtools 旁路**：
```typescript
if (event.route.bypass && allowBypass && isDevtoolsPeer(peer))
  → skip routing, broadcast directly
```

### 2.6 心跳和连接管理

**心跳消息**：
```typescript
type: 'transport:connection:heartbeat'
data: { kind: 'ping'|'pong', message: string, at: number }
```

**超时检测**：
```typescript
if (now - peer.lastHeartbeatAt > heartbeatTtlMs
  → peer.close() + peers.delete()
```

**服务器心跳周期**：
```typescript
setInterval(() => {
  for (peer in peers) {
    if (now - lastHeartbeat > TTL)
      close(peer)
  }
}, Math.max(5_000, TTL / 2))
```

---

## 3. Plugin-Protocol 类型定义

### 3.1 核心类型

**位置**: `packages/plugin-protocol/src/types/events.ts:1-300`

#### ModuleIdentity
```typescript
{
  id: string                    // 运行时唯一 ID (e.g. "telegram-01")
  kind: 'plugin'                // 仅支持插件
  plugin: PluginIdentity        // { id, version?, labels? }
  labels?: Record<string, string> // 路由标签
}
```

#### ModulePhase
```
'announced'|'preparing'|'prepared'|'configuration-needed'
'configured'|'ready'|'failed'
```

#### ModuleConfigSchema
```typescript
{
  id: string                    // 架构 ID (e.g. "airi.config.stage-ui")
  version: number               // 架构版本
  schema?: Record<string, any>  // JSON Schema-like
}
```

#### ModuleDependency
```typescript
{
  role: string                  // 逻辑角色 (e.g. "llm:orchestrator")
  optional?: boolean
  version?: string
  min?: string
  max?: string
  constraints?: Record<string, unknown>
}
```

#### ModuleContribution
```typescript
{
  capabilities?: string[]
  providers?: Array<Record<string, unknown>>
  ui?: Record<string, unknown>
  hooks?: Array<Record<string, unknown>>
  resources?: Record<string, unknown>
}
```

### 3.2 协议事件

**主要事件** (由 `@moeru/eventa defineEventa` 定义):
- `module:authenticate` → `module:authenticated`
- `module:compatibility:request` → `module:compatibility:result`
- `registry:modules:sync`
- `module:announce`
- `module:status`
- `module:prepared`
- `module:configuration:needed`
- `module:configuration:configured`
- `module:contribute:capability:*` (还未完全实现)

---

## 4. 运输层实现现状

### 4.1 Transport 类型定义

**位置**: `packages/plugin-sdk/src/plugin-host/transports/index.ts`

```typescript
type PluginTransport
  = { kind: 'in-memory' } // ✅ 已实现
    | { kind: 'websocket', url, protocols? } // 🚧 TODO
    | { kind: 'web-worker', worker } // 🚧 TODO
    | { kind: 'node-worker', worker } // 🚧 TODO
    | { kind: 'electron', target, webContentsId? } // 🚧 TODO
```

### 4.2 运行时特定实现

**Node 运行时** (`packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts`):
```typescript
switch (transport.kind) {
  case 'in-memory': return createContext()
  default: throw new Error('not implemented')
}
```

**Web 运行时** (`packages/plugin-sdk/src/plugin-host/runtimes/web/index.ts`):
```typescript
switch (transport.kind) {
  case 'in-memory': return createContext()
  default: throw new Error('not implemented')
}
```

**Eventa 适配器** (存在但未被初始化):
```typescript
// packages/plugin-sdk/src/channels/local/event-target/index.ts
createEventTargetHostChannel(eventTarget) // TODO

// packages/plugin-sdk/src/channels/remote/websocket/index.ts
createWebSocketHostChannel(webSocket) // TODO
```

### 4.3 Alpha 限制

**位置**: `packages/plugin-sdk/src/plugin-host/core.ts:487-492`

```typescript
if (transport.kind !== 'in-memory') {
  throw new Error(
    `Only in-memory transport is currently supported by PluginHost alpha. Got: ${transport.kind}`
  )
}
```

**测试** (`packages/plugin-sdk/src/plugin-host/core.test.ts:136-143`):
```typescript
it('should reject non in-memory transport for MVP', async () => {
  const host = new PluginHost({
    transport: { kind: 'websocket', url: 'ws://localhost:3000' },
  })
  await expect(host.start(testManifest, { cwd: '' }))
    .rejects
    .toThrow('Only in-memory transport is currently supported by PluginHost alpha.')
})
```

---

## 5. Server-SDK 客户端

### 5.1 Client 类

**位置**: `packages/server-sdk/src/client.ts:49-428`

**责任**：
- WebSocket 连接和生命周期管理
- 自动认证和模块公告
- 事件发送/接收
- 心跳和自动重连

**初始化**：
```typescript
new Client({
  url: 'ws://localhost:6121/ws'    // 服务器 URL
  name: string                       // 模块名称
  token?: string                     // 认证令牌
  identity?: MetadataEventSource    // 模块身份
  autoConnect: true                  // 自动连接
  autoReconnect: true                // 自动重连
  maxReconnectAttempts: -1           // 无限重试
})
```

**生命周期**：
```
Client constructor (autoConnect=true)
  ↓ _connect()
  ↓ WebSocket.onopen
  ↓ if (token) tryAuthenticate() else tryAnnounce()
  ↓ module:authenticated or module:announce
  ↓ 监听事件

失败或关闭:
  ↓ if (autoReconnect) retryWithExponentialBackoff()
```

**事件注册**：
```typescript
client.onEvent('module:authenticated', (event) => { ... })
client.onEvent('registry:modules:sync', (event) => { ... })
client.send({ type: 'custom:event', data: {...} })
```

---

## 6. 缺陷和过度设计分析

### 6.1 🚨 关键缺陷

#### 1. **传输层实现不完整** (HIGH)
- **问题**: WebSocket、Worker、Electron 传输都是占位符
- **影响**: 无法运行远程插件；系统目前被限制在单进程 in-memory 模式
- **时间线**: "alpha scope guard" 注释建议这是有意的 MVP 限制
- **修复工作**: 需要实现 WebSocket 适配器 + Electron IPC 适配器

#### 2. **协议版本协商被硬编码** (MEDIUM)
- **问题**: `moduleCompatibilityResult` 总是返回 `mode: 'exact'`，不支持降级或拒绝
- **代码** (`core.ts:597-601`):
  ```typescript
  session.channels.host.emit(moduleCompatibilityResult, {
    protocolVersion: compatibilityRequest.protocolVersion,
    apiVersion: compatibilityRequest.apiVersion,
    mode: 'exact', // ← 硬编码，无任何检查
  })
  ```
- **后果**: 无法处理版本不匹配；插件升级时无兼容性协商

#### 3. **能力系统与生命周期脱离** (MEDIUM)
- **问题**: 能力管理 (`announceCapability`, `markCapabilityReady`) 存在于 PluginHost，但与协议事件 (`module:contribute:capability:offer`) 脱离
- **现象**:
  - `init()` 中虽然调用 `waitForCapabilities()`，但外部模块注册能力的协议流程未实现
  - 测试中只能通过 `host.markCapabilityReady()` 手动标记（见 `core.test.ts:89-93`）
- **证据**: 事件协议定义中存在但未使用：`module:contribute:capability:offer` 等事件

#### 4. **模块配置协议完全缺失** (MEDIUM)
- **问题**: 协议文件定义了 `ModuleConfigValidation`, `ModuleConfigPlan` 等复杂类型，但实现仅有基本的 `moduleConfigurationConfigured`
- **差距**:
  - ✗ `module:configuration:validate:request/response`
  - ✗ `module:configuration:plan:request/response`
  - ✗ `module:configuration:commit` 流程
  - 仅有: `applyConfiguration()` → emit `moduleConfigurationConfigured`
- **代码位置**: `core.ts:739-767`

#### 5. **Hub-and-Spoke vs P2P 混合不清** (MEDIUM)
- **问题**: PluginHost 对内使用内存 Eventa，对外通过 server-sdk 使用 WebSocket，但路由策略分离
- **结果**:
  - 本地插件无法相互通信（只能通过 PluginHost）
  - 远程插件通信依赖 server-runtime 路由
  - 混合部署时的拓扑不清楚

### 6.2 设计冗余 (OVER-ENGINEERING)

#### 1. **PathResolver 在清单中但未使用**
- 协议定义了 `resolveEntrypointFor()` 的复杂优先级链 (runtime → default → electron)
- 实现没问题，但设计过度了单个入口点的选择

#### 2. **RoutingPolicy 和 RouteMiddleware 重复功能**
- `createPolicyMiddleware()` 已实现 plugin/labels 选择
- 事件级 destinations 又重复了目标指定能力
- 没有明确的层级或冲突解决规则

#### 3. **ModuleContribution 未与能力系统绑定**
- 类型定义了 UI、hooks、resources，但 PluginHost 不检查或使用它们
- 目前只有 "capabilities" 数组被（隐式地）使用

#### 4. **两套配置管理**
- `ModuleConfigSchema` + `ModuleConfigPlan` + `ModuleConfigValidation` (协议层)
- `ModuleConfigEnvelope` + `applyConfiguration()` (实现层)
- 两套未整合

### 6.3 不完整的实现

#### 1. **setupModules 钩子是可选的**
- 插件可以定义 `init()` 和 `setupModules()`
- 但两者顺序、相互依赖、何时调用未明确记录

#### 2. **failure path 处理不一致**
- `init()` 中失败自动转移到 `failed`，发出 `moduleStatus`
- 但插件内部的 `init()` 或 `setupModules()` 异常未被捕获或转义
- 测试 (`core.test.ts:115-134`) 显示只有 `init() === false` 会触发失败

#### 3. **Provider API 存根化**
- `createApis()` 返回 `{ providers: createProviders(ctx) }`
- `createProviders()` 仅返回 `listProviders()` invoke handler
- 其他资源 API (context, ui, hooks) 未实现

---

## 7. 系统成熟度评估

| 方面 | 成熟度 | 理由 |
|------|--------|------|
| **本地插件生命周期** | 🟢 70% | xstate 基础完整，但传输层缺失 |
| **远程通信** | 🔴 20% | WebSocket 仅在 server-sdk 中，未在 plugin-host 中集成 |
| **协议一致性** | 🟡 40% | 类型定义完整，但事件处理不完整 |
| **配置管理** | 🟡 30% | 基本框架存在，但验证/计划/提交流程缺失 |
| **能力发现** | 🟡 50% | Host 端能力管理可用，但模块端公告机制缺失 |
| **错误处理** | 🟡 45% | 有状态机，但异常传播不清 |
| **文档** | 🟡 50% | 代码注释详细 (core.ts:45-156)，但无用户指南 |
| **测试覆盖** | 🟢 65% | 生命周期测试完整，缺传输和复杂场景测试 |

---

## 8. "Skill + MCP 作为插件核心" 的适配性评估

### 可行性: 🟡 中等

#### ✅ 优势
1. **已有生命周期框架**: xstate 足以管理 Skill 的激活/停用/配置
2. **事件驱动架构**: Eventa 已为消息交换准备好
3. **能力管理**: `announceCapability` / `waitForCapability` 可以映射 Skill 注册
4. **模块化**: 每个 Skill/MCP Server 可以是独立插件，有自己的会话

#### ⚠️ 风险
1. **传输层缺失**: MCP 需要 stdio/SSE/WebSocket，但插件系统还不支持
2. **协议转换**: Skill 协议 → 模块协议的映射需要新的适配器
3. **供应商整合**: 如果 Skill 依赖 stage-ui providers，需要跨层通信机制
4. **资源管理**: MCP "resources" 与模块 "resources" 的区别未定义

#### 🎯 建议
1. **完成 WebSocket 传输** (优先级: **1**)
   - 启用远程 MCP servers
   - 参考 `packages/server-sdk/src/client.ts` 中的 WebSocket 逻辑

2. **实现完整协议事件** (优先级: **2**)
   - `module:configure:validate/plan/commit` 流程
   - `module:contribute:capability:*` 事件序列

3. **定义 Skill ↔ Module 适配器** (优先级: **3**)
   - Skill 工具定义 → Module 能力声明
   - Skill 执行上下文 → Module 配置 + 资源

4. **明确 Hub-and-Spoke 拓扑** (优先级: **2**)
   - 本地插件是否只能通过 Host 通信，还是可以直接相互调用？
   - 混合部署（本地 + 远程）的交互规则

---

## 9. 关键路径依赖

```
Skill Integration Ready?
  ↓ 需要:
  ├─ WebSocket Transport (packages/plugin-sdk/src/plugin-host/transports)
  ├─ MCP Server 适配器 (新建议)
  ├─ Module Configuration 完整流程
  └─ 能力协商和依赖管理
```

---

## 10. 文件引用速查表

| 组件 | 路径 | 关键方法/类 |
|------|------|-----------|
| 生命周期状态机 | `packages/plugin-sdk/src/plugin-host/core.ts` | `PluginHost`, `pluginLifecycleMachine` |
| 文件加载 | `packages/plugin-sdk/src/plugin-host/core.ts:919-1000` | `FileSystemLoader.loadPluginFor()` |
| 能力管理 | `packages/plugin-sdk/src/plugin-host/core.ts:774-848` | `announceCapability()`, `waitForCapability()` |
| WebSocket 路由 | `packages/server-runtime/src/index.ts:75-440` | `setupApp()` |
| 路由策略 | `packages/server-runtime/src/middlewares/route.ts` | `createPolicyMiddleware()`, `RoutingPolicy` |
| Server 客户端 | `packages/server-sdk/src/client.ts` | `Client` class |
| 协议类型 | `packages/plugin-protocol/src/types/events.ts` | `ModuleIdentity`, `ModulePhase`, `ProtocolEvents` |
| 测试套件 | `packages/plugin-sdk/src/plugin-host/core.test.ts` | 完整的生命周期测试 |

---

## 11. 未验证的推测

🔴 **以下需要代码验证**：
- [ ] Electron IPC 传输的选型 (未找到相关代码)
- [ ] 错误恢复的具体行为 (只看到硬转移到 failed)
- [ ] 多个 PluginHost 实例之间的隔离（认为隔离，需验证）
- [ ] provider registry 的实际注册机制 (仅找到占位符)

---

## 下一步行动

1. **立即**: 更新 MEMORY.md，标记"传输层"为首要阻碍
2. **本周**: 与 team-lead 对齐 Skill/MCP 集成的具体时间表
3. **开发**: 启动 WebSocket 传输实现（建议 2-3 天的工作量）
