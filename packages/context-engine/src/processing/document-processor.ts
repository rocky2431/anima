import type { DocumentExtractionResult, DocumentProcessorOptions, DocumentType } from '../types'

import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

/**
 * Extracts text content from PDF, DOCX, XLSX, and plain text files.
 * Imperative Shell — performs file I/O and delegates to format-specific parsers.
 */
export class DocumentProcessor {
  private readonly maxFileSizeBytes: number
  private readonly allowedRoots: readonly string[] | null

  constructor(options?: DocumentProcessorOptions) {
    this.maxFileSizeBytes = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE
    this.allowedRoots = options?.allowedRoots ?? null
  }

  /**
   * Detect document type from file extension.
   * Returns null for unsupported types.
   */
  static detectDocumentType(filePath: string): DocumentType | null {
    const ext = extname(filePath).toLowerCase()
    switch (ext) {
      case '.pdf': return 'pdf'
      case '.docx': return 'docx'
      case '.xlsx': return 'xlsx'
      case '.txt':
      case '.md':
      case '.csv':
      case '.json':
      case '.log':
        return 'txt'
      default: return null
    }
  }

  /**
   * Extract text from a document file.
   * Supports PDF, DOCX, XLSX, and plain text formats.
   */
  async extractText(filePath: string): Promise<DocumentExtractionResult> {
    const documentType = DocumentProcessor.detectDocumentType(filePath)
    if (documentType === null) {
      throw new Error(`Unsupported document type: ${extname(filePath)}`)
    }

    await this.validateFilePath(filePath)

    switch (documentType) {
      case 'pdf': return this.extractPdf(filePath)
      case 'docx': return this.extractDocx(filePath)
      case 'xlsx': return this.extractXlsx(filePath)
      case 'txt': return this.extractPlainText(filePath)
    }
  }

  /**
   * Validate file path: resolve symlinks, check containment in allowed roots, check file size.
   */
  private async validateFilePath(filePath: string): Promise<void> {
    const resolvedPath = await realpath(resolve(filePath))

    if (this.allowedRoots !== null) {
      const resolvedRoots = await Promise.all(
        this.allowedRoots.map(root => realpath(resolve(root)).catch(() => resolve(root))),
      )
      const inAllowedRoot = resolvedRoots.some(root => resolvedPath.startsWith(root))
      if (!inAllowedRoot) {
        throw new Error(`File path is outside allowed directories: ${filePath}`)
      }
    }

    const fileStat = await stat(resolvedPath)
    if (fileStat.size > this.maxFileSizeBytes) {
      throw new Error(
        `File size ${fileStat.size} bytes exceeds limit of ${this.maxFileSizeBytes} bytes: ${filePath}`,
      )
    }
  }

  private async extractPdf(filePath: string): Promise<DocumentExtractionResult> {
    try {
      const buffer = await readFile(filePath)
      // Use legacy build for Node.js compatibility (avoids worker/canvas requirements)
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist')

      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
      try {
        const pageCount = doc.numPages
        const pageTexts: string[] = []

        for (let i = 1; i <= pageCount; i++) {
          const page = await doc.getPage(i)
          const textContent = await page.getTextContent()
          const pageText = textContent.items
            .map(item => ('str' in item ? String((item as { str: unknown }).str) : ''))
            .filter(s => s.length > 0)
            .join(' ')
          pageTexts.push(pageText)
        }

        return {
          text: pageTexts.join('\n'),
          filePath,
          documentType: 'pdf',
          pageCount,
        }
      }
      finally {
        await doc.destroy()
      }
    }
    catch (error) {
      throw new Error(`Failed to extract PDF from ${filePath}`, { cause: error })
    }
  }

  private async extractDocx(filePath: string): Promise<DocumentExtractionResult> {
    try {
      const buffer = await readFile(filePath)
      const mammoth = await import('mammoth')
      const result = await mammoth.default.extractRawText({ buffer })

      return {
        text: result.value,
        filePath,
        documentType: 'docx',
        pageCount: 1,
      }
    }
    catch (error) {
      throw new Error(`Failed to extract DOCX from ${filePath}`, { cause: error })
    }
  }

  private async extractXlsx(filePath: string): Promise<DocumentExtractionResult> {
    try {
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.default.Workbook()
      await workbook.xlsx.readFile(filePath)

      const sheetTexts: string[] = []

      workbook.eachSheet((worksheet) => {
        const sheetLines: string[] = []
        worksheet.eachRow((row) => {
          const cellValues = row.values as (string | number | boolean | null | undefined)[]
          // row.values is 1-indexed, first element is undefined
          const cells = cellValues.slice(1)
            .map(v => (v != null ? String(v) : ''))
            .filter(v => v.length > 0)
          if (cells.length > 0) {
            sheetLines.push(cells.join('\t'))
          }
        })
        if (sheetLines.length > 0) {
          sheetTexts.push(sheetLines.join('\n'))
        }
      })

      return {
        text: sheetTexts.join('\n\n'),
        filePath,
        documentType: 'xlsx',
        pageCount: workbook.worksheets.length,
      }
    }
    catch (error) {
      throw new Error(`Failed to extract XLSX from ${filePath}`, { cause: error })
    }
  }

  private async extractPlainText(filePath: string): Promise<DocumentExtractionResult> {
    try {
      const text = await readFile(filePath, 'utf-8')
      return {
        text,
        filePath,
        documentType: 'txt',
        pageCount: 1,
      }
    }
    catch (error) {
      throw new Error(`Failed to extract text from ${filePath}`, { cause: error })
    }
  }
}
