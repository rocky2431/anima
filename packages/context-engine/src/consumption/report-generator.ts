import type { ActivityBreakdownEntry, DailySummary, LlmProvider, PersonaConfig, ProcessedContext } from '../types'

export interface ReportGeneratorOptions {
  llm: LlmProvider
  persona: PersonaConfig
  onReport?: (report: DailySummary) => void
  onError?: (error: Error) => void
}

function isValidActivityBreakdownEntry(value: unknown): value is ActivityBreakdownEntry {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.app === 'string'
    && typeof obj.durationMs === 'number'
    && typeof obj.description === 'string'
  )
}

function isValidDailySummary(value: unknown): value is DailySummary {
  if (!value || typeof value !== 'object')
    return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.date === 'string'
    && Array.isArray(obj.highlights)
    && obj.highlights.every((h: unknown) => typeof h === 'string')
    && Array.isArray(obj.activityBreakdown)
    && obj.activityBreakdown.every(isValidActivityBreakdownEntry)
    && typeof obj.totalWorkDurationMs === 'number'
    && typeof obj.personalNote === 'string'
  )
}

/**
 * Generates a daily activity summary from collected ProcessedContext data.
 * Uses an LLM to synthesize highlights and a character-styled personal note.
 *
 * Flow: activity data → prompt construction → LLM generateStructured → validation → DailySummary
 */
export class ReportGenerator {
  private readonly llm: LlmProvider
  private readonly persona: PersonaConfig
  private readonly onReport?: (report: DailySummary) => void
  private readonly onError?: (error: Error) => void

  constructor(options: ReportGeneratorOptions) {
    this.llm = options.llm
    this.persona = options.persona
    this.onReport = options.onReport
    this.onError = options.onError
  }

  /**
   * Generate a daily summary from the provided activity data.
   *
   * @param activities - All ProcessedContext entries for the day to summarize.
   *   Can be empty (produces a "no activity" summary).
   * @returns A validated DailySummary. Throws if LLM fails and no onError is set;
   *   returns a fallback empty summary if onError is provided.
   */
  async generate(activities: ProcessedContext[]): Promise<DailySummary> {
    try {
      const system = this.buildSystemPrompt()
      const prompt = this.buildUserPrompt(activities)
      const schemaDescription = [
        'Return a JSON object with:',
        '- date: string (YYYY-MM-DD format)',
        '- highlights: string[] (key accomplishments/observations)',
        '- activityBreakdown: Array<{app: string, durationMs: number, description: string}>',
        '- totalWorkDurationMs: number (total working duration)',
        '- personalNote: string (character-styled closing remark)',
      ].join('\n')

      const result = await this.llm.generateStructured<DailySummary>({
        system,
        prompt,
        schemaDescription,
      })

      if (!isValidDailySummary(result)) {
        throw new Error(
          `ReportGenerator: LLM returned invalid DailySummary structure`,
        )
      }

      this.onReport?.(result)
      return result
    }
    catch (cause) {
      const error = new Error(
        `ReportGenerator failed (activities=${activities.length})`,
        { cause },
      )
      if (this.onError) {
        try { this.onError(error) }
        catch { /* onError callback itself failed */ }
        return {
          date: new Date().toISOString().slice(0, 10),
          highlights: [],
          activityBreakdown: [],
          totalWorkDurationMs: 0,
          personalNote: '',
        }
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
      '你的任务是根据用户一天的活动数据，生成一份角色化的每日总结。',
      '总结应该包含今天的亮点、活动分布和一段充满个性的结语。',
      '请保持角色一致性，用你的说话风格来写结语。',
    ].join('\n')
  }

  private buildUserPrompt(activities: ProcessedContext[]): string {
    if (activities.length === 0) {
      return '今天没有记录到任何活动。请生成一份空的每日总结。'
    }

    const activityLines: string[] = []
    for (const ctx of activities) {
      const { activity } = ctx
      const time = new Date(ctx.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
      activityLines.push(
        `[${time}] ${activity.currentApp} - ${activity.currentWindowTitle} (连续工作: ${activity.continuousWorkDurationMs}ms)`,
      )

      if (ctx.screenshot) {
        activityLines.push(`  截图描述: ${ctx.screenshot.description}`)
      }
    }

    return [
      '以下是今天的活动记录:',
      '',
      ...activityLines,
      '',
      `请根据以上活动数据，生成今天(${new Date().toISOString().slice(0, 10)})的每日总结。`,
    ].join('\n')
  }
}
