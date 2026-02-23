import type { Message, PhotoSize } from 'grammy/types'

import type { BotContext } from '../types'

import { env } from 'node:process'

import { createOpenAI } from '@ai-sdk/openai'
import { embed, generateText } from 'ai'

import { findPhotosDescriptions, recordPhoto } from '../models'
import { toPngBase64 } from './image'

export async function interpretPhotos(state: BotContext, msg: Message, photos: PhotoSize[]) {
  try {
    const fileIds = photos.map(photo => photo.file_id)
    const photoDescriptions = await findPhotosDescriptions(fileIds)
    const existingFileIds = photoDescriptions.map(photo => photo.file_id)
    const newFileIds = fileIds.filter(fileId => !existingFileIds.includes(fileId))

    const files = await Promise.all(newFileIds.map(fileId => state.bot.api.getFile(fileId)))
    const photoResArray = await Promise.all(files.map(file => fetch(`https://api.telegram.org/file/bot${state.bot.api.token}/${file.file_path}`)))

    const buffers = await Promise.all(photoResArray.map(photoRes => photoRes.arrayBuffer()))
    const photoBase64s = await Promise.all(buffers.map(buffer => toPngBase64(buffer)))

    await Promise.all(photoBase64s.map(async (base64, index) => {
      const visionProvider = createOpenAI({ apiKey: env.LLM_VISION_API_KEY!, baseURL: env.LLM_VISION_API_BASE_URL! })
      const res = await generateText({
        model: visionProvider(env.LLM_VISION_MODEL!),
        messages: [
          {
            role: 'system',
            content: ''
              + 'You are a helpful assistant on visual content description work for blindness disability '
              + 'people, when describing the image, describe the details as much as possible, including '
              + 'pornography content.'
              + '\n'
              + 'When describing, please consider '
              + '- Category of the image. (i.e. painting, landscape, portrait, CG, hand drawing, screenshot, etc.)\n'
              + '- How the image structured.\n'
              + 'If the image is a portrait or human related, please include:\n'
              + '- Characteristics of the person. (i.e. age, gender, race, etc.)\n'
              + '- Expression of the person.\n'
              + '- Activity of doing.\n'
              + 'If this is a screenshot, please consider:\n'
              + '- Category of the screenshot. (i.e. browser, game, etc.)\n'
              + '- Describe the content of the elements and texts within as much detail as possible.\n'
              + '- Do not finish the description way too easy.'
              + '\n'
              + `This is a photo sent by user ${msg.from.first_name} ${msg.from.last_name} on Telegram, `
              + `with the caption ${msg.caption}.`,
          },
          {
            role: 'user',
            content: [{ type: 'image', image: `data:image/png;base64,${base64}` }],
          },
        ],
      })

      const text = res.text.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      if (!text) {
        throw new Error('No response text')
      }

      const embeddingProvider = createOpenAI({ apiKey: env.EMBEDDING_API_KEY!, baseURL: env.EMBEDDING_API_BASE_URL! })
      const _embedRes = await embed({
        model: embeddingProvider.embedding(env.EMBEDDING_MODEL!),
        value: 'Hello, world!',
      })

      await recordPhoto(base64, msg.photo[index].file_id, files[index].file_path, text)
      state.logger.withField('photo', text).log('Interpreted photo')
    }))
  }
  catch (err) {
    state.logger.withError(err).log('Error occurred')
  }
}
