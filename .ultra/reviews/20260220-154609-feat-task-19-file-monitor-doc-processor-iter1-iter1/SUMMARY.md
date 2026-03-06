# Review Summary

**Session**: 20260220-154609-feat-task-19-file-monitor-doc-processor-iter1-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 9 P1 findings exceed the threshold of 3 -- error handling gaps, missing integration wiring, and untested error paths require fixes before merge.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 9 |
| P2 Medium | 13 |
| P3 Low | 6 |
| **Total** | **28** (deduplicated from 29) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-comments | 2 | completed |
| review-errors | 6 | completed |
| review-simplify | 3 | completed |
| review-tests | 5 | completed |
| review-types | 5 | completed |

## P1 - High (Should Fix)
### [1] FolderMonitor, DocumentProcessor, chunkText have no live consumer
- **File**: packages/context-engine/src/index.ts:5
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: All three new modules are exported from the package barrel but no application or service imports them. The only references are in test files within the same package. No app in apps/ (stage-tamagotchi, stage-web, server) imports FolderMonitor, DocumentProcessor, or chunkText. This is a horizontal-only addition with no live entry point.
- **Suggestion**: Wire FolderMonitor and DocumentProcessor into at least one live entry point (e.g., stage-tamagotchi orchestrator service) to form a vertical slice. At minimum, add a TODO-free integration in the Electron main process that watches a user-configured folder and indexes documents on change.

### [2] No structured logging in FolderMonitor or DocumentProcessor
- **File**: packages/context-engine/src/capture/folder-monitor.ts:13
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: Neither FolderMonitor nor DocumentProcessor use the project's @guiiai/logg structured logging. File watcher lifecycle events (start, stop, error, subscription count) and document extraction operations (file processed, extraction time, failures) are completely invisible in production.
- **Suggestion**: Add `import { useLogg } from '@guiiai/logg'` and log key lifecycle events: watcher start/stop with directory count, file change events at debug level, extraction start/completion with duration_ms, and all error paths with context.

### [3] DocumentProcessor.extractText has no path validation
- **File**: packages/context-engine/src/processing/document-processor.ts:35
- **Category**: security / path-traversal
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: extractText accepts an arbitrary file path with no validation against path traversal or symlink attacks. If this module is ever exposed via an API or user input, an attacker could craft symlinks pointing outside the watched directory to read sensitive files. The file path is passed directly to readFile without any containment check.
- **Suggestion**: Add a `basePaths` or `allowedRoots` parameter to DocumentProcessor and validate that resolved paths (via path.resolve + fs.realpath) stay within the allowed directory tree before reading.

### [4] No file size limit before reading entire file into memory
- **File**: packages/context-engine/src/processing/document-processor.ts:50
- **Category**: performance / unbounded-read
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: extractPdf, extractDocx, and extractPlainText all call readFile() on user-provided file paths with no size check. A multi-gigabyte PDF or a maliciously large file would be read entirely into memory, causing OOM crashes in the Electron process.
- **Suggestion**: Add a configurable maxFileSizeBytes option (default e.g. 100MB) and stat the file before reading. Reject files exceeding the limit with a descriptive error.

### [5] DocumentProcessor I/O methods have no try/catch around file reads or dynamic imports
- **File**: packages/context-engine/src/processing/document-processor.ts:49
- **Category**: error-handling / missing-try-catch-io
- **Confidence**: 95
- **Reported by**: review-errors
- **Description**: extractPdf performs three fallible I/O operations (readFile, dynamic import, getDocument) with no try/catch. A corrupt PDF, missing file, or missing pdfjs-dist dependency will propagate a raw, untyped library error to the caller. The same pattern repeats in extractDocx, extractXlsx, and extractPlainText. Additionally, three dynamic imports are not wrapped in try/catch -- if any optional dependency is not installed, the caller gets a raw 'ERR_MODULE_NOT_FOUND' error with no context.
- **Suggestion**: Wrap each extraction method body in try/catch and throw a typed error with file path and operation context. For dynamic imports, provide a helpful error explaining which package to install.

### [6] PDF doc.destroy() not in finally block -- resource leak on error
- **File**: packages/context-engine/src/processing/document-processor.ts:54
- **Category**: error-handling / resource-leak
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: If any page extraction fails (getPage or getTextContent throws), doc.destroy() on line 73 is never called. The PDF document resource leaks. In a long-running process (like a folder monitor), leaked PDF document handles will accumulate.
- **Suggestion**: Wrap the page extraction loop in try/finally: `const doc = await pdfjsLib.getDocument(...).promise; try { ... } finally { await doc.destroy() }`.

### [7] FolderMonitor.start() continues silently after failed watch subscriptions
- **File**: packages/context-engine/src/capture/folder-monitor.ts:43
- **Category**: error-handling / partial-failure
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: When watcher.subscribe fails for a directory, the error is forwarded to onError but start() continues and eventually returns normally. If all directories fail, this.subscriptions will be empty, yet the caller has no signal that monitoring is completely non-functional.
- **Suggestion**: After the loop, check if zero subscriptions succeeded when watchPaths was non-empty: `if (this.subscriptions.length === 0) { throw new Error('Failed to watch any directory') }`.

### [8] DocumentProcessor: no tests for corrupt/malformed files
- **File**: packages/context-engine/src/__tests__/document-processor.test.ts:192
- **Category**: test-quality / missing-error-path
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The error handling suite only tests unsupported file types and non-existent files. It does not test corrupt/malformed files for each supported format: a truncated PDF, a corrupted DOCX (invalid ZIP), a malformed XLSX, or an empty file with a supported extension.
- **Suggestion**: Add error-path tests for each format with corrupt/malformed input. Verify that errors have meaningful context (file path, format) rather than raw library errors.

### [9] Integration test excludes FolderMonitor from the pipeline
- **File**: packages/context-engine/src/__tests__/document-pipeline.integration.test.ts:31
- **Category**: test-quality / missing-integration-test
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The integration test exercises DocumentProcessor -> chunkText -> VectorStore, but does not include FolderMonitor. Without a test wiring FolderMonitor.onChange -> DocumentProcessor.extractText -> chunkText -> VectorStore.insert, there is no proof that the full end-to-end pipeline works when a file changes on disk.
- **Suggestion**: Add an integration test that creates a FolderMonitor watching a temp dir, writes a file, and verifies chunks appear in the VectorStore after the file event.

## P2 - Medium (Consider)
### [10] Unsafe `as` casts in PDF text extraction
- **File**: packages/context-engine/src/processing/document-processor.ts:62
- **Category**: code-quality / unsafe-cast
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: Triple `as` cast chain to extract the str property from pdfjs-dist TextItem. Using Record<string, unknown> obscures the actual type and bypasses type safety.
- **Suggestion**: Import TextItem from pdfjs-dist types and use a proper type guard.

### [11] Unsafe `as` cast on Excel row.values
- **File**: packages/context-engine/src/processing/document-processor.ts:106
- **Category**: code-quality / unsafe-cast
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: ExcelJS row.values can contain Date, RichText, Error, and formula objects -- not just primitives. The cast silently discards complex types, producing locale-dependent or [object Object] output.
- **Suggestion**: Use a proper mapping function handling all ExcelJS CellValue types, or use `cell.text`.

### [12] No end-to-end path connecting FolderMonitor to DocumentProcessor
- **File**: packages/context-engine/src/capture/folder-monitor.ts:13
- **Category**: integration / horizontal-only
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: FolderMonitor and DocumentProcessor are designed to work together, but no code connects them. There is no walking skeleton showing the full file-watch -> extract -> chunk -> store flow.
- **Suggestion**: Create a DocumentPipeline orchestrator or extend the integration test to include FolderMonitor.

### [13] FolderMonitor onChange callback errors lack event context
- **File**: packages/context-engine/src/capture/folder-monitor.ts:59
- **Category**: error-handling / callback-in-try
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: The error message 'FolderMonitor onChange callback failed' does not include the filePath or event type that triggered the failure.
- **Suggestion**: Include event context: `new Error(\`FolderMonitor onChange callback failed for ${event.path} (${event.type})\`, { cause: callbackError })`.

### [14] FolderMonitor copies watchPaths by reference, not by value
- **File**: packages/context-engine/src/capture/folder-monitor.ts:24
- **Category**: type-design / encapsulation
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: The constructor stores a direct reference to the caller's watchPaths array. If the caller mutates the array after construction, the FolderMonitor's internal state changes silently.
- **Suggestion**: Copy the array: `this.watchPaths = [...options.watchPaths]`. Add `readonly` to the type.

### [15] Unsafe `as Record<string, unknown>` cast on pdfjs-dist text items (type-design)
- **File**: packages/context-engine/src/processing/document-processor.ts:63
- **Category**: type-design / unsafe-cast
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: The `in` check already narrows the type in TypeScript; the `as` casts are redundant and bypass type safety.
- **Suggestion**: Use proper type narrowing with TextItem import or a type guard function.

### [16] Unsafe `as` cast on exceljs row.values without type guard (type-design)
- **File**: packages/context-engine/src/processing/document-processor.ts:106
- **Category**: type-design / unsafe-cast
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: exceljs `row.values` returns `CellValue[]` including Date, CellErrorValue, CellRichTextValue, and more. The narrowing cast silently discards complex types.
- **Suggestion**: Define a helper handling the full CellValue union or use `String(v)` on the original type.

### [17] FolderMonitorOptions fields lack readonly, inconsistent with output types
- **File**: packages/context-engine/src/types.ts:311
- **Category**: type-design / readonly-consistency
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: Output types use readonly consistently, but FolderMonitorOptions has mutable watchPaths and extensions arrays.
- **Suggestion**: Change to `readonly watchPaths: readonly string[]` and `readonly extensions?: readonly string[]`.

### [18] Watcher callback in start() has 4 levels of nesting
- **File**: packages/context-engine/src/capture/folder-monitor.ts:43
- **Category**: simplification / deep-nesting
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: start() reaches 4 levels of nesting: for-loop > try > subscribe callback > for-loop > if > try/catch.
- **Suggestion**: Extract the watcher callback into a named private method `handleWatcherEvents(dir, err, events)`.

### [19] Duplicated type assertion for PDF text item extraction
- **File**: packages/context-engine/src/processing/document-processor.ts:62
- **Category**: simplification / redundant-type-assertion
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: The expression casts `item` to `Record<string, unknown>` twice in succession. The double cast plus verbose conditional can be simplified.
- **Suggestion**: Simplify to `.map(item => ('str' in item ? String((item as { str: unknown }).str) : ''))` or use a type guard.

### [20] FolderMonitor: delete event type not tested
- **File**: packages/context-engine/src/__tests__/folder-monitor.test.ts:47
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 88
- **Reported by**: review-tests
- **Description**: FileChangeEvent supports 'create', 'update', and 'delete', but no test covers file deletion events.
- **Suggestion**: Add a test that creates, then deletes a file and verifies event.type === 'delete'.

### [21] FolderMonitor: onError callback never verified for watcher errors
- **File**: packages/context-engine/src/__tests__/folder-monitor.test.ts:40
- **Category**: test-quality / missing-error-path
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: No test verifies the onError callback is invoked when the onChange callback throws or when the watcher reports an error.
- **Suggestion**: Add tests for onChange-throws and directory-deleted-while-monitoring scenarios.

### [22] DocumentProcessor: multi-sheet XLSX and pageCount not verified
- **File**: packages/context-engine/src/__tests__/document-processor.test.ts:152
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: XLSX test only covers a single-sheet workbook. Sheet iteration, double-newline separator, and multi-sheet pageCount are all untested.
- **Suggestion**: Add tests for multi-sheet workbooks, empty sheets, and special cell types.

## P3 - Low (Optional)
### [23] New output types use readonly consistently -- improved over prior types
- **File**: packages/context-engine/src/types.ts:265
- **Category**: type-design / positive-pattern
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: DocumentExtractionResult, TextChunk, and FileChangeEvent all use readonly on every field. This is the best readonly discipline seen in this codebase and should be the template for future types.
- **Suggestion**: Consider applying this same readonly pattern retroactively to older types in types.ts.

### [24] Error messages expose full file system paths
- **File**: packages/context-engine/src/processing/document-processor.ts:38
- **Category**: code-quality / error-message-leaks-path
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: Error messages include the full absolute file path. If errors propagate to a UI or API response, they could leak internal directory structure.
- **Suggestion**: Use a typed error class with the path stored as a property, allowing callers to decide what to expose.

### [25] DocumentProcessor.extractText could use Result pattern for expected failures
- **File**: packages/context-engine/src/processing/document-processor.ts:35
- **Category**: error-handling / result-pattern-opportunity
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: extractText throws for expected operational errors. A Result/Either pattern would let callers handle these as normal control flow.
- **Suggestion**: Consider returning `Promise<Result<DocumentExtractionResult, DocumentProcessorError>>`.

### [26] Redundant comment restates obvious loop-exit condition
- **File**: packages/context-engine/src/processing/text-chunker.ts:47
- **Category**: comments / redundant-comment
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: The comment 'If this chunk reached the end of text, stop' directly restates what `if (end >= text.length) break` does.
- **Suggestion**: Remove the comment.

### [27] Variable 'textParts' used for two different semantics
- **File**: packages/context-engine/src/processing/document-processor.ts:56
- **Category**: simplification / naming
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: Both extractPdf and extractXlsx use 'textParts' for pages vs. sheets respectively.
- **Suggestion**: Rename to 'pageTexts' in extractPdf and 'sheetTexts' in extractXlsx.

### [28] Test inline comment restates the next line of code
- **File**: packages/context-engine/src/__tests__/document-processor.test.ts:178
- **Category**: comments / redundant-comment
- **Confidence**: 76
- **Reported by**: review-comments
- **Description**: The comment restates what `createMinimalPdf('Hello PDF')` already communicates.
- **Suggestion**: Remove the comment or consolidate into a higher-level test intent comment.

## Positive Observations
- text-chunker is a clean pure function (Functional Core) with thorough input validation and clear boundary conditions -- exemplary at 56 lines with cyclomatic complexity ~4
- FolderMonitor properly handles errors in onChange callbacks by wrapping in try/catch and forwarding to onError, and requires onError (not optional) -- avoids the silent-swallow pattern
- FolderMonitor.start() is idempotent and stop() gracefully handles individual unsubscribe failures
- Types are well-documented with JSDoc and use readonly properties for immutable result objects -- best readonly discipline in this codebase
- Integration test (document-pipeline) uses real LanceDB with temp directories -- correct pattern per project rules, with proper Test Double rationale comment
- DocumentProcessor uses dynamic import for heavy dependencies (pdfjs-dist, mammoth, exceljs), reducing startup cost
- No mock violations detected: zero usage of vi.fn(), vi.mock(), vi.spyOn(), InMemoryRepository, MockXxx, or FakeXxx patterns across all test files
- document-processor.test.ts creates real files in all formats (hand-built PDF, DOCX via JSZip, XLSX via ExcelJS) rather than using fixture files or mocks
- All JSDoc comments on exported classes and functions are factually accurate, with correct Imperative Shell / Pure function architecture annotations
- The pdfjs-dist legacy build import comment is an excellent 'why' comment explaining a non-obvious technical decision
- No forbidden patterns (TODO, FIXME, HACK, XXX, PLACEHOLDER, TEMP) found in any reviewed files
- Error wrapping uses `new Error(msg, { cause })` consistently for error chain preservation
- Extension normalization in FolderMonitor constructor handles both '.txt' and 'txt' input gracefully
- All source files stay well under the 200-line threshold with clear single-responsibility

## Recommended Action Plan
1. Fix 9 P1 issues, starting with error handling in DocumentProcessor (findings 5, 6 -- add try/catch and try/finally)
2. Add path validation and file size limits to DocumentProcessor (findings 3, 4)
3. Add structured logging to FolderMonitor and DocumentProcessor (finding 2)
4. Surface total failure in FolderMonitor.start() when all subscriptions fail (finding 7)
5. Add corrupt/malformed file tests and FolderMonitor integration test (findings 8, 9)
6. Wire modules to at least one live entry point to establish a vertical slice (finding 1)
7. Address P2 unsafe casts by importing proper types from pdfjs-dist and exceljs (findings 10, 11, 15, 16, 19)
8. Run `/ultra-review recheck` to verify
