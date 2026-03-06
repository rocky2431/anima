# Findings: P0 问题诊断

## 发现时间: 2026-02-22 03:00

## 关键发现

### 1. ai-orchestrator.test.ts 和 mcp-hub 已全绿
反馈中报告这两个为失败，但当前运行结果：
- ai-orchestrator.test.ts: **11/11 通过**
- mcp-hub: **74/74 通过**（EPERM 问题已消失）

这将问题范围缩小到 3 个区域。

### 2. orchestrator 测试失败的真正根因：DND 安静时段
这是最有趣的发现。6 个测试全部因为同一根因失败：
- 测试在 ~03:00 AM 本地时间运行
- 默认 DND 配置安静时段: 23:00-07:00
- `canTrigger()` 检查 `currentHour` → 3 AM 在安静时段内 → 返回 false
- 所有 trigger 被静默拦截，proactiveEvents 数组始终为空
- 后续所有依赖 trigger 触发的断言级联失败

这不是代码 bug，是测试在不确定时间运行的环境敏感性问题。

### 3. desktop-shell 导出不完整
`DEFAULT_BINDINGS` 在 `global-shortcuts.ts` 中定义并导出为 named export，
但包的入口 `index.ts` 没有 re-export，导致外部消费者无法引用。

### 4. @ai-sdk 和 @slack/bolt 依赖缺失
这些包在 setup-bridge.ts、setup-orchestrator.ts、setup-channels.ts 中被使用，
但从未添加到 stage-tamagotchi 的 package.json。运行时依赖通过 pnpm hoist 可能偶然解析，
但类型检查时无法找到声明文件。

### 5. injeca dependsOn 解构问题
`injeca.provide()` 的 `build` 回调接收的 `dependsOn` 是一个包含所有解析后依赖的对象，
不是单个依赖值。`setupDesktopShell(dependsOn)` 应该是 `setupDesktopShell(dependsOn.animaOrchestrator)`。
