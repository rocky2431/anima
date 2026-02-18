import type { LlmProvider, PersonaConfig, ProcessedContext, SmartTipResult } from '../types'

export interface SmartTipOptions {
  llm: LlmProvider
  persona: PersonaConfig
  onTip?: (tip: SmartTipResult) => void
  onError?: (error: Error) => void
}

const VALID_KINDS = new Set(['alarm', 'ping', 'reminder'])
const VALID_URGENCIES = new Set(['immediate', 'soon', 'later'])

function isValidSmartTipResult(value: unknown): value is SmartTipResult {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.headline === 'string'
    && typeof obj.note === 'string'
    && typeof obj.kind === 'string'
    && typeof obj.urgency === 'string'
    && VALID_KINDS.has(obj.kind)
    && VALID_URGENCIES.has(obj.urgency)
  )
}

/**
 * Generates context-aware smart tips (caring messages, reminders, suggestions).
 * Designed to run periodically via cron-service.
 *
 * Flow: current context → prompt → LLM generateStructured → validation → SmartTipResult → spark:notify
 */
export class SmartTip {
  private readonly llm: LlmProvider
  private readonly persona: PersonaConfig
  private readonly onTip?: (tip: SmartTipResult) => void
  private readonly onError?: (error: Error) => void

  constructor(options: SmartTipOptions) {
    this.llm = options.llm
    this.persona = options.persona
    this.onTip = options.onTip
    this.onError = options.onError
  }

  /**
   * Generate a smart tip based on current user context.
   *
   * @returns SmartTipResult if a tip was generated, or null if the LLM determined
   *   no tip is needed or if the LLM returned structurally invalid data.
   *   Throws if generation fails and no onError callback was provided.
   */
  async generate(context: ProcessedContext): Promise<SmartTipResult | null> {
    try {
      const system = this.buildSystemPrompt()
      const prompt = this.buildUserPrompt(context)
      const schemaDescription = [
        'Return a JSON object with:',
        '- headline: string (short, character-styled tip headline)',
        '- note: string (detailed caring message)',
        '- kind: "alarm" | "ping" | "reminder"',
        '- urgency: "immediate" | "soon" | "later"',
        '',
        'If no meaningful tip can be generated from the context, return null.',
      ].join('\n')

      const result = await this.llm.generateStructured<SmartTipResult | null>({
        system,
        prompt,
        schemaDescription,
      })

      if (!isValidSmartTipResult(result)) {
        if (result !== null) {
          const validationError = new Error(
            `SmartTip: LLM returned invalid result structure (app=${context.activity.currentApp})`,
          )
          try { this.onError?.(validationError) }
          catch { /* onError callback itself failed */ }
        }
        return null
      }

      this.onTip?.(result)
      return result
    }
    catch (cause) {
      const error = new Error(
        `SmartTip failed (app=${context.activity.currentApp}, timestamp=${context.timestamp})`,
        { cause },
      )
      if (this.onError) {
        try { this.onError(error) }
        catch { /* onError callback itself failed */ }
        return null
      }
      throw error
    }
  }

  private buildSystemPrompt(): string {
    return [
      `你是${this.persona.name}，一个虚拟 AI 角色。`,
      `性格: ${this.persona.personality}`,
      `说话风格: ${this.persona.speakingStyle}`,
      '',
      '你的任务是根据用户当前的活动状态，生成一条贴心的智能提示。',
      '提示应该自然、关怀、符合你的角色性格。',
      '如果当前情况不需要提示，返回 null。',
    ].join('\n')
  }

  private buildUserPrompt(context: ProcessedContext): string {
    const { activity } = context
    const lines = [
      '当前用户状态:',
      `- 应用: ${activity.currentApp}`,
      `- 窗口: ${activity.currentWindowTitle}`,
      `- 连续工作时长: ${activity.continuousWorkDurationMs}ms`,
      `- 是否活跃: ${activity.isActive}`,
      `- 全屏模式: ${activity.isFullscreen}`,
      `- 最近应用: ${activity.recentApps.join(', ')}`,
    ]

    if (context.screenshot) {
      lines.push(`- 截图描述: ${context.screenshot.description}`)
    }

    lines.push('')
    lines.push('请根据以上状态生成一条智能提示。')

    return lines.join('\n')
  }
}
