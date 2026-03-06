# Task Plan: 修复 P0 阻塞问题 — 达成 100% 集成完成度

## Goal
修复所有 typecheck 错误和测试失败，使 stage-tamagotchi typecheck、context-engine typecheck、orchestrator 测试全部通过。

## Current Phase
Phase 1 (诊断完成，待执行修复)

## 诊断结果总览

| 问题类别 | 数量 | 严重度 | 状态 |
|---------|------|--------|------|
| stage-tamagotchi typecheck 错误 | 8 | P0 | 已定位根因 |
| context-engine typecheck 错误 | 1 | P0 | 已定位根因 |
| orchestrator.test.ts 失败 | 6/16 | P0 | 已定位根因 |
| ai-orchestrator.test.ts | 11/11 通过 | OK | **已绿** |
| mcp-hub test | 74/74 通过 | OK | **已绿** |

## Phases

### Phase 1: 诊断 — `complete`
- [x] 运行 6 个验证命令
- [x] 读取所有相关源文件
- [x] 确认每个错误的根因

### Phase 2: 修复 stage-tamagotchi typecheck 错误 — `pending`

**错误 1**: `index.ts:87` — `setupDesktopShell(dependsOn)` 参数类型不匹配
- **根因**: injeca 的 `build` 回调中 `dependsOn` 是 `{ animaOrchestrator: AnimaOrchestrator }` 对象，但 `setupDesktopShell` 期望 `AnimaOrchestrator` 直接传入
- **修复**: `dependsOn` → `dependsOn.animaOrchestrator`

**错误 2-4**: `@ai-sdk/provider` 模块缺失（3 个文件引用）
- **根因**: `@ai-sdk/provider` 和 `@ai-sdk/openai` 未安装为 stage-tamagotchi 依赖
- **文件**: `ai-orchestrator.ts`, `ai-orchestrator.test.ts`, `setup-bridge.ts`, `setup-orchestrator.ts`
- **修复**: 添加 `@ai-sdk/provider` 和 `@ai-sdk/openai` 到 stage-tamagotchi 的 devDependencies

**错误 5**: `@slack/bolt` 模块缺失
- **根因**: `setup-channels.ts:35` 动态 `import('@slack/bolt')` 但类型声明不可用
- **修复**: 添加 `@slack/bolt` 类型声明或改为 `// @ts-expect-error` + 注释说明运行时可选

**错误 6**: `DEFAULT_BINDINGS` 未从 `@anase/desktop-shell` 导出
- **根因**: `global-shortcuts.ts` 定义了 `DEFAULT_BINDINGS`，但 `index.ts` 未 re-export
- **修复**: 在 `packages/desktop-shell/src/index.ts` 添加 `DEFAULT_BINDINGS` 导出

### Phase 3: 修复 context-engine typecheck 错误 — `pending`

**错误**: `model-router.test.ts:429` — `source: 'test'` 类型不匹配
- **根因**: `ContextSource.source` 限定为 `'screenshot' | 'activity' | 'document' | 'web' | 'system'`，测试中用了 `'test'`
- **修复**: 将 `source: 'test'` 改为 `source: 'activity'`（或其他有效值）

### Phase 4: 修复 orchestrator.test.ts 6 个测试失败 — `pending`

**根因**: 测试运行在本地时间 ~03:00 AM，默认 DND 安静时间为 23:00-07:00。
`canTrigger()` 检查 `currentHour` 是否在安静时间段内，结果所有触发器被静默拦截。

**影响的测试**（全部因 trigger 不触发导致断言失败）:
1. `fires rest-reminder when continuous work exceeds 2 hours` — proactiveEvents 为空
2. `transitions emotion on trigger fire: idle → worried` — emotion 状态未变
3. `maps emotion to correct AnimaEmotion payload` — animaEmotion undefined
4. `screenshot capture → VLM → activity monitor → trigger → emotion → response → UI event` — E2E 链路断
5. `start() initiates periodic activity aggregation ticks` — 定时器触发后无事件
6. `catches errors thrown by onProactiveResponse callback` — onError 未触发

**修复**: 在非 DND 测试用例中，将 `vi.setSystemTime()` 设置为确定性时间（如 `2026-02-18T10:00:00Z`），避免本地时间落入安静时段。

### Phase 5: 验证 — `pending`
- [ ] 重新运行 `pnpm -F @anase/stage-tamagotchi typecheck`
- [ ] 重新运行 `pnpm -F @anase/context-engine typecheck`
- [ ] 重新运行 orchestrator 测试
- [ ] 确认全绿

## 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| @ai-sdk 版本不兼容 | 低 | 中 | 检查 pnpm catalog 或现有版本 |
| @slack/bolt 拉入过大依赖 | 中 | 低 | 仅安装类型声明或标记为可选 |
| 修复测试时间后可能暴露新断言失败 | 低 | 中 | 逐测试验证 |

## Errors Encountered
| Error | Root Cause | Resolution |
|-------|-----------|------------|
| TS2345: setupDesktopShell param | injeca dependsOn 包装对象 vs 原始类型 | 解构 `.animaOrchestrator` |
| TS2307: @ai-sdk/provider | 未安装依赖 | 添加到 devDeps |
| TS2307: @ai-sdk/openai | 未安装依赖 | 添加到 devDeps |
| TS2307: @slack/bolt | 未安装依赖 | 类型声明或运行时可选 |
| TS2305: DEFAULT_BINDINGS | 未从 index.ts 导出 | 添加 re-export |
| TS2322: source 'test' | 不在联合类型中 | 改为有效值 |
| 6 test failures | 本地时间 3AM 落入 DND 安静时段 | 固定测试时间为 10:00 AM |
