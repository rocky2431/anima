import type { ModelMessage as LLMMessage } from 'ai'
import type { Message } from 'grammy/types'

import type { Action } from '../types'

import { env } from 'node:process'

import { createOpenAI } from '@ai-sdk/openai'
import { Format, useLogg } from '@guiiai/logg'
import { trace } from '@opentelemetry/api'
import { generateText } from 'ai'
import { parse } from 'best-effort-json-parser'

import { personality, systemTicking } from '../prompts'
import { div, span, vif } from '../prompts/utils'

export async function imagineAnAction(
  botId: string,
  currentAbortController: AbortController | undefined,
  messages: LLMMessage[],
  actions: { action: Action, result: unknown }[],
  globalStates: {
    unreadMessages: Record<string, Message[]>
    incomingMessages?: Message[]
  },
): Promise<Action | undefined> {
  const logger = useLogg('imagineAnAction').useGlobalConfig()
  const tracer = trace.getTracer('airi.telegram.bot')

  return await tracer.startActiveSpan('telegram.module.generate_agent_action.generate', async (s) => {
    s.setAttribute('telegram.bot.id', botId)

    let responseText = ''

    const requestMessages: LLMMessage[] = [
      {
        role: 'system',
        content: div(
          await systemTicking(),
          await personality(),
        ),
      },
      ...messages,
      {
        role: 'user',
        content: div(
          vif(
            globalStates?.incomingMessages?.length > 0,
            div(
              'Incoming messages:',
              globalStates?.incomingMessages?.filter(Boolean).map(msg => `- ${msg?.text}`).join('\n'),
            ),
          ),
          'History actions:',
          actions.map(a => `- Action: ${JSON.stringify(a.action)}, Result: ${JSON.stringify(a.result)}`).join('\n'),
          span(`
            Currently, it's ${new Date()} on the server that hosts you.
            The others in the group may live in a different timezone, so please be aware of the time difference.
          `),
          `You have total ${Object.values(globalStates.unreadMessages).reduce((acc, cur) => acc + cur.length, 0)} unread messages.`,
          'Unread messages count are:',
          Object.entries(globalStates.unreadMessages).map(([key, value]) => `ID:${key}, Unread message count:${value.length}`).join('\n'),
          'Based on the context, What do you want to do? Choose a right action from the listing of the tools you want to take next.',
          'Respond with the action and parameters you choose in JSON only, without any explanation and markups.',
        ),
      },
    ]

    try {
      const res = await tracer.startActiveSpan('llm.chat.generate_text', async (s) => {
        s.setAttribute('llm.chat.model', env.LLM_MODEL!)
        s.setAttribute('llm.chat.messages', JSON.stringify(requestMessages))
        s.setAttribute('llm.provider.api_base_url', env.LLM_API_BASE_URL!)

        const provider = createOpenAI({ apiKey: env.LLM_API_KEY!, baseURL: env.LLM_API_BASE_URL! })
        const res = await generateText({
          model: provider(env.LLM_MODEL!),
          messages: requestMessages,
          abortSignal: currentAbortController?.signal,
        })
        s.setAttribute('llm.chat.generate_text.response.full_text', res.text)

        const cleanedText = res.text.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        if (!cleanedText) {
          throw new Error('No response text')
        }

        s.setAttribute('llm.chat.generate_text.response.text', cleanedText)

        s.end()
        return { text: cleanedText, usage: res.usage }
      })

      logger.withFields({
        response: res.text,
        unreadMessages: Object.fromEntries(Object.entries(globalStates.unreadMessages).map(([key, value]) => [key, value.length])),
        now: new Date().toLocaleString(),
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      }).log('Generated action')

      const action = tracer.startActiveSpan('telegram.module.generate_agent_action.parse', (s) => {
        responseText = res.text
          .replace(/^```json\s*\n/, '')
          .replace(/\n```$/, '')
          .replace(/^```\s*\n/, '')
          .replace(/\n```$/, '')
          .trim()

        const action = parse(responseText) as Action
        s.setAttribute('telegram.bot.id', botId)
        s.setAttribute('telegram.module.generate_agent_action.parsed_action', JSON.stringify(action))

        s.end()
        return action
      })

      s.end()
      return action
    }
    catch (err) {
      logger.withField('error', err).withFormat(Format.JSON).log('Failed to generate action')
      throw err
    }
  })
}
