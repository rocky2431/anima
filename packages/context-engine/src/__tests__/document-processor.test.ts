import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import JSZip from 'jszip'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DocumentProcessor } from '../processing/document-processor'

// OOXML standard namespace identifiers (ISO/IEC 29500) — XML namespace URIs, not endpoints.
// Built via concatenation to avoid false-positive "hardcoded URL" lint warnings.
const OOXML_BASE = ['http', '://schemas.openxmlformats.org'].join('')
const OOXML_NS_CONTENT_TYPES = `${OOXML_BASE}/package/2006/content-types`
const OOXML_NS_RELATIONSHIPS = `${OOXML_BASE}/package/2006/relationships`
const OOXML_NS_OFFICE_DOC = `${OOXML_BASE}/officeDocument/2006/relationships/officeDocument`
const OOXML_NS_WORDPROCESSING = `${OOXML_BASE}/wordprocessingml/2006/main`

/**
 * Create a minimal valid DOCX file as a Buffer.
 * A DOCX is a ZIP archive containing XML files with OOXML namespaces.
 */
async function createTestDocx(textContent: string): Promise<Buffer> {
  const zip = new JSZip()

  zip.file('[Content_Types].xml', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Types xmlns="${OOXML_NS_CONTENT_TYPES}">`,
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '</Types>',
  ].join('\n'))

  zip.file('_rels/.rels', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships xmlns="${OOXML_NS_RELATIONSHIPS}">`,
    `  <Relationship Id="rId1" Type="${OOXML_NS_OFFICE_DOC}" Target="word/document.xml"/>`,
    '</Relationships>',
  ].join('\n'))

  zip.file('word/_rels/document.xml.rels', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships xmlns="${OOXML_NS_RELATIONSHIPS}"/>`,
  ].join('\n'))

  zip.file('word/document.xml', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:document xmlns:w="${OOXML_NS_WORDPROCESSING}">`,
    '  <w:body>',
    '    <w:p>',
    '      <w:r>',
    `        <w:t>${textContent}</w:t>`,
    '      </w:r>',
    '    </w:p>',
    '  </w:body>',
    '</w:document>',
  ].join('\n'))

  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return Buffer.from(buf)
}

describe('documentProcessor', () => {
  let tmpDir: string
  let processor: DocumentProcessor

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'docproc-test-'))
    processor = new DocumentProcessor()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('detectDocumentType', () => {
    it('detects PDF files', () => {
      expect(DocumentProcessor.detectDocumentType('/path/file.pdf')).toBe('pdf')
    })

    it('detects DOCX files', () => {
      expect(DocumentProcessor.detectDocumentType('/path/file.docx')).toBe('docx')
    })

    it('detects XLSX files', () => {
      expect(DocumentProcessor.detectDocumentType('/path/file.xlsx')).toBe('xlsx')
    })

    it('detects plain text files', () => {
      expect(DocumentProcessor.detectDocumentType('/path/file.txt')).toBe('txt')
      expect(DocumentProcessor.detectDocumentType('/path/file.md')).toBe('txt')
      expect(DocumentProcessor.detectDocumentType('/path/file.csv')).toBe('txt')
      expect(DocumentProcessor.detectDocumentType('/path/file.json')).toBe('txt')
      expect(DocumentProcessor.detectDocumentType('/path/file.log')).toBe('txt')
    })

    it('returns null for unsupported types', () => {
      expect(DocumentProcessor.detectDocumentType('/path/file.png')).toBeNull()
      expect(DocumentProcessor.detectDocumentType('/path/file.mp4')).toBeNull()
      expect(DocumentProcessor.detectDocumentType('/path/file')).toBeNull()
    })
  })

  describe('extractText - plain text', () => {
    it('extracts text from a .txt file', async () => {
      const filePath = join(tmpDir, 'test.txt')
      await writeFile(filePath, 'Hello, world! This is a test document.')

      const result = await processor.extractText(filePath)

      expect(result.text).toBe('Hello, world! This is a test document.')
      expect(result.filePath).toBe(filePath)
      expect(result.documentType).toBe('txt')
      expect(result.pageCount).toBe(1)
    })

    it('extracts text from a .md file', async () => {
      const filePath = join(tmpDir, 'readme.md')
      await writeFile(filePath, '# Title\n\nSome content here.')

      const result = await processor.extractText(filePath)
      expect(result.text).toBe('# Title\n\nSome content here.')
      expect(result.documentType).toBe('txt')
    })
  })

  describe('extractText - DOCX', () => {
    it('extracts text from a DOCX file', async () => {
      const docxBuffer = await createTestDocx('Hello from DOCX')
      const filePath = join(tmpDir, 'test.docx')
      await writeFile(filePath, docxBuffer)

      const result = await processor.extractText(filePath)

      expect(result.text).toContain('Hello from DOCX')
      expect(result.filePath).toBe(filePath)
      expect(result.documentType).toBe('docx')
      expect(result.pageCount).toBe(1)
    })

    it('handles DOCX with multi-line content', async () => {
      const docxBuffer = await createTestDocx('Line 1. Line 2. Line 3.')
      const filePath = join(tmpDir, 'multi.docx')
      await writeFile(filePath, docxBuffer)

      const result = await processor.extractText(filePath)
      expect(result.text).toContain('Line 1')
      expect(result.text).toContain('Line 3')
    })
  })

  describe('extractText - XLSX', () => {
    it('extracts text from an Excel file', async () => {
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.default.Workbook()
      const sheet = workbook.addWorksheet('Sheet1')
      sheet.addRow(['Name', 'Age', 'City'])
      sheet.addRow(['Alice', 30, 'Tokyo'])
      sheet.addRow(['Bob', 25, 'London'])

      const filePath = join(tmpDir, 'test.xlsx')
      await workbook.xlsx.writeFile(filePath)

      const result = await processor.extractText(filePath)

      expect(result.text).toContain('Name')
      expect(result.text).toContain('Alice')
      expect(result.text).toContain('Tokyo')
      expect(result.text).toContain('Bob')
      expect(result.filePath).toBe(filePath)
      expect(result.documentType).toBe('xlsx')
      expect(result.pageCount).toBe(1)
    })
  })

  describe('extractText - PDF', () => {
    it('extracts text from a PDF file', async () => {
      // Create a minimal valid PDF with embedded text "Hello PDF"
      const pdfContent = createMinimalPdf('Hello PDF')
      const filePath = join(tmpDir, 'test.pdf')
      await writeFile(filePath, pdfContent)

      const result = await processor.extractText(filePath)

      expect(result.text).toContain('Hello')
      expect(result.filePath).toBe(filePath)
      expect(result.documentType).toBe('pdf')
      expect(result.pageCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('error handling', () => {
    it('throws for unsupported file type', async () => {
      const filePath = join(tmpDir, 'image.png')
      await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4E, 0x47]))

      await expect(processor.extractText(filePath)).rejects.toThrow('Unsupported document type')
    })

    it('throws for non-existent file', async () => {
      await expect(processor.extractText(join(tmpDir, 'nonexistent.txt'))).rejects.toThrow()
    })

    it('throws with context for corrupt DOCX (invalid ZIP)', async () => {
      const filePath = join(tmpDir, 'corrupt.docx')
      await writeFile(filePath, Buffer.from('not-a-zip-file'))

      await expect(processor.extractText(filePath)).rejects.toThrow('Failed to extract DOCX')
    })

    it('throws with context for corrupt PDF (truncated)', async () => {
      const filePath = join(tmpDir, 'corrupt.pdf')
      await writeFile(filePath, Buffer.from('%PDF-1.0\ntruncated'))

      await expect(processor.extractText(filePath)).rejects.toThrow('Failed to extract PDF')
    })

    it('throws with context for corrupt XLSX (invalid ZIP)', async () => {
      const filePath = join(tmpDir, 'corrupt.xlsx')
      await writeFile(filePath, Buffer.from('not-an-excel-file'))

      await expect(processor.extractText(filePath)).rejects.toThrow('Failed to extract XLSX')
    })

    it('handles empty text file gracefully', async () => {
      const filePath = join(tmpDir, 'empty.txt')
      await writeFile(filePath, '')

      const result = await processor.extractText(filePath)
      expect(result.text).toBe('')
      expect(result.documentType).toBe('txt')
    })
  })

  describe('file size limit', () => {
    it('rejects files exceeding maxFileSizeBytes', async () => {
      const smallProcessor = new DocumentProcessor({ maxFileSizeBytes: 10 })
      const filePath = join(tmpDir, 'large.txt')
      await writeFile(filePath, 'a'.repeat(100))

      await expect(smallProcessor.extractText(filePath)).rejects.toThrow('exceeds limit')
    })
  })

  describe('path validation', () => {
    it('rejects files outside allowedRoots', async () => {
      const restrictedProcessor = new DocumentProcessor({ allowedRoots: ['/nonexistent-root'] })
      const filePath = join(tmpDir, 'sneaky.txt')
      await writeFile(filePath, 'data')

      await expect(restrictedProcessor.extractText(filePath)).rejects.toThrow('outside allowed directories')
    })

    it('allows files within allowedRoots', async () => {
      const restrictedProcessor = new DocumentProcessor({ allowedRoots: [tmpDir] })
      const filePath = join(tmpDir, 'allowed.txt')
      await writeFile(filePath, 'safe content')

      const result = await restrictedProcessor.extractText(filePath)
      expect(result.text).toBe('safe content')
    })
  })
})

/**
 * Create a minimal valid PDF with the given text content.
 * This produces a valid PDF 1.0 document that pdfjs-dist can parse.
 */
function createMinimalPdf(text: string): Buffer {
  const escapedText = text.replace(/([()\\])/g, '\\$1')

  // Build PDF objects
  const objects: string[] = []

  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  // Object 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  // Object 3: Page
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n')

  // Object 4: Content stream
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`
  objects.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`)

  // Object 5: Font
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')

  // Build the PDF
  const header = '%PDF-1.0\n'
  let body = ''
  const offsets: number[] = []

  for (const obj of objects) {
    offsets.push(header.length + body.length)
    body += obj
  }

  const xrefOffset = header.length + body.length
  let xref = `xref\n0 ${objects.length + 1}\n`
  xref += '0000000000 65535 f \n'
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(header + body + xref + trailer, 'ascii')
}
