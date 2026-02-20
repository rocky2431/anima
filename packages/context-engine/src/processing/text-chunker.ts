import type { TextChunk, TextChunkerOptions } from '../types'

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_OVERLAP_SIZE = 200

/**
 * Split text into overlapping chunks.
 * Pure function — no side effects, deterministic output.
 *
 * @param text - The text to chunk
 * @param options - Chunking options (chunkSize, overlapSize)
 * @returns Array of TextChunk with content, index, and offsets
 */
export function chunkText(text: string, options?: TextChunkerOptions): TextChunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlapSize = options?.overlapSize ?? DEFAULT_OVERLAP_SIZE

  if (chunkSize <= 0) {
    throw new Error(`chunkSize must be positive, got ${chunkSize}`)
  }
  if (overlapSize < 0) {
    throw new Error(`overlapSize must be non-negative, got ${overlapSize}`)
  }
  if (overlapSize >= chunkSize) {
    throw new Error(`overlapSize (${overlapSize}) must be less than chunkSize (${chunkSize})`)
  }

  if (text.length === 0) {
    return []
  }

  const chunks: TextChunk[] = []
  const step = chunkSize - overlapSize
  let offset = 0
  let index = 0

  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length)
    chunks.push({
      content: text.slice(offset, end),
      index,
      startOffset: offset,
      endOffset: end,
    })
    index++

    // If this chunk reached the end of text, stop
    if (end >= text.length) {
      break
    }

    offset += step
  }

  return chunks
}
