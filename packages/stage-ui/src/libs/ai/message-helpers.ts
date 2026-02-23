/**
 * Message factory helpers — replaces `@xsai/utils-chat`'s `message` export.
 *
 * Provides terse constructors for OpenAI-format chat messages.
 */

import type { CommonContentPart, Message, SystemMessage, UserMessage } from '../../types/ai-messages'

export const message = {
  system: (content: string): SystemMessage => ({ role: 'system', content }),
  user: (content: string | CommonContentPart[]): UserMessage => ({ role: 'user', content }),
  assistant: (content: string) => ({ role: 'assistant' as const, content }),
  messages: (...msgs: Message[]): Message[] => msgs,
  imagePart: (url: string, detail?: 'auto' | 'low' | 'high') => ({
    type: 'image_url' as const,
    image_url: { url, detail },
  }),
}
