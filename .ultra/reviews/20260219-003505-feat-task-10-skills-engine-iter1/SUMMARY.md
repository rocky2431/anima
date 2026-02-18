# Review Summary

**Session**: 20260219-003505-feat-task-10-skills-engine-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 2 P0 critical findings (bare catch blocks silently swallowing errors in skill-loader.ts)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 2 |
| P1 High | 7 |
| P2 Medium | 15 |
| P3 Low | 8 |
| **Total** | **32** (deduplicated from 33) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-comments | 6 | completed |
| review-errors | 5 | completed |
| review-simplify | 4 | completed |
| review-tests | 5 | completed |
| review-types | 5 | completed |

## P0 - Critical (Must Fix)
### [1] Bare catch silently swallows directory read errors in discoverSkills
- **File**: `packages/skills-engine/src/skill-loader.ts`:101
- **Category**: error-handling / silent-swallow
- **Confidence**: 97
- **Reported by**: review-code, review-errors
- **Description**: discoverSkills() catches all errors from readdirSync (including permission denied, broken symlinks, OS-level failures) without binding the error parameter and returns an empty array. If builtinSkillsDir or userSkillsDir is misconfigured or inaccessible, the caller (SkillRegistry.loadAll) silently gets zero skills with no indication anything went wrong. This is indistinguishable from a legitimately empty directory. Per CLAUDE.md error_handling rules, `catch (e) {}` and silent swallowing are absolutely forbidden.
- **Suggestion**: Inject or accept a logger parameter. At minimum, log a warning with the directory path and error message: `logger.warn('Failed to read skills directory', { baseDir, error: (err as Error).message })`. Ideally, distinguish 'directory does not exist' (ENOENT, acceptable) from other errors (permission denied, etc.) which should propagate.

### [2] Bare catch silently drops invalid skills during discovery
- **File**: `packages/skills-engine/src/skill-loader.ts`:121
- **Category**: error-handling / silent-swallow
- **Confidence**: 97
- **Reported by**: review-errors
- **Description**: When loadSkillFromDir throws (invalid YAML, missing required fields, file read error), the error is silently swallowed with no logging and no error parameter binding. A skill with a subtle frontmatter typo (e.g., 'naem' instead of 'name') silently disappears from the registry. The comment 'Skip invalid skills during discovery' documents the intent but does not constitute handling. Per CLAUDE.md, `catch (e) {}` is a forbidden pattern -- a bare catch without even binding the error is strictly worse.
- **Suggestion**: At minimum bind the error and log: `catch (err) { logger.warn('Skipping invalid skill', { dir: entry.name, error: (err as Error).message }) }`. Better yet, collect failed skills and return them alongside successful ones (e.g., `{ skills: Skill[], errors: { dir: string, error: Error }[] }`) so the caller can surface issues to operators.

## P1 - High (Should Fix)
### [3] Entire skills-engine package has no consumer in any app
- **File**: `packages/skills-engine/src/index.ts`:1
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: Grep for `@proj-airi/skills-engine` across the entire monorepo returns only the package's own package.json. No app (stage-tamagotchi, stage-web, server) imports this package. No service registers it via injeca. No IPC handler, event listener, or scheduled job calls into SkillRegistry or buildSkillsContext. The entire package is dead-on-arrival orphan code.
- **Suggestion**: Wire skills-engine into at least one consumer before committing. The most natural integration point is the Anima orchestrator in `apps/stage-tamagotchi/src/main/services/anima/` which already assembles system prompts.

### [4] JSDoc claims id 'must match directory name' but this is never enforced
- **File**: `packages/skills-engine/src/types.ts`:6
- **Category**: comments / misleading-constraint
- **Confidence**: 95
- **Reported by**: review-comments
- **Description**: The JSDoc on SkillMetadata.id states the id 'must match directory name', but neither validateMetadata(), loadSkillFromDir(), nor discoverSkills() verify this constraint. A skill with id 'foo' in directory 'bar/' would be silently accepted.
- **Suggestion**: Either enforce the constraint in discoverSkills() by comparing skill.metadata.id against entry.name, or soften the JSDoc to `/** Unique identifier, conventionally matches directory name */`.

### [5] Skill activation state stored only in memory (Map), not persisted
- **File**: `packages/skills-engine/src/skill-registry.ts`:10
- **Category**: architecture / in-memory-state
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: SkillRegistry stores all skill activation state (`active: boolean`) in a closure-scoped Map. If the Electron process restarts, all activation state is lost. This is the recurring 'in-memory state in Electron services' pattern. Per CLAUDE.md: 'Business state in memory' is a forbidden pattern.
- **Suggestion**: Accept a `storage` adapter in SkillsEngineConfig that persists Map<skillId, boolean> to SQLite/better-sqlite3, consistent with the existing context-engine storage pattern.

### [6] Silent catch in discoverSkills has no test for malformed SKILL.md
- **File**: `packages/skills-engine/src/skill-loader.ts`:117
- **Category**: test-quality / missing-error-path-test
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The discoverSkills function silently swallows errors when a subdirectory contains a malformed SKILL.md. No test exercises this code path. A regression that turns this into a rethrow would break discovery, and no test would catch that.
- **Suggestion**: Add a test that creates a directory with a malformed SKILL.md alongside a valid one, calls discoverSkills, and verifies the valid skill is returned while the malformed one is skipped.

### [7] parseSkillMd error messages omit filePath parameter
- **File**: `packages/skills-engine/src/skill-loader.ts`:33
- **Category**: error-handling / missing-context
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: parseSkillMd receives a filePath parameter but none of its three throw statements include it in the error message. When scanning dozens of skill directories, these errors are undebuggable without knowing which file failed.
- **Suggestion**: Include filePath in all error messages: `throw new Error(\`SKILL.md content is empty: ${filePath}\`)`.

### [8] SkillRegistry.getById() leaks mutable internal entry
- **File**: `packages/skills-engine/src/skill-registry.ts`:45
- **Category**: type-design / encapsulation-leak
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: getById() returns a direct reference to the internal Map entry. Because SkillRegistryEntry.active is mutable, any caller can bypass activate()/deactivate() by writing entry.active = true directly. This breaks the registry's encapsulation.
- **Suggestion**: Return a defensive copy: `return entry ? { ...entry, skill: { ...entry.skill } } : undefined`. Or mark fields as readonly and expose an immutable view type.

### [9] No boundary integration test for skills-engine package
- **File**: `packages/skills-engine/src/skill-registry.ts`:21
- **Category**: integration / missing-integration-test
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: No integration test proves the full flow: loadAll() -> activate skills -> buildSkillsContext() produces valid output. The unit tests test each component in isolation but no test proves Registry + ContextIntegration work together end-to-end with real SKILL.md files.
- **Suggestion**: Add an integration test that points SkillRegistry at the real `skills/` directories, calls loadAll(), activates a skill, calls buildSkillsContext(), and asserts the output contains correct Layer 1 summaries and Layer 2 body.

## P2 - Medium (Consider)
### [10] No logging infrastructure in skills-engine package
- **File**: `packages/skills-engine/src/skill-loader.ts`:1
- **Category**: code-quality / missing-logging
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The entire skills-engine package contains zero logging. No import of `@guiiai/logg`, no `useLogg` calls anywhere.
- **Suggestion**: Add `@guiiai/logg` as a dependency. Create a logger in each module.

### [11] loadSkillFromDir is async but uses only synchronous I/O
- **File**: `packages/skills-engine/src/skill-loader.ts`:79
- **Category**: simplification / unnecessary-async
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: The function is declared async and returns Promise<Skill>, but its body only uses fs.readFileSync. No await or asynchronous operation inside.
- **Suggestion**: Either commit to async I/O (fs.promises.readFile) or drop the async keyword.

### [12] Synchronous fs calls inside async functions block event loop
- **File**: `packages/skills-engine/src/skill-loader.ts`:79
- **Category**: code-quality / sync-in-async
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: Both loadSkillFromDir and discoverSkills are declared async but use synchronous fs APIs. In the Electron main process, this would freeze the UI.
- **Suggestion**: Replace synchronous calls with their async equivalents: `fs.promises.readFile`, `fs.promises.readdir`, `fs.promises.access`.

### [13] Token budget claims (<200 / <5000 tokens) are not enforced
- **File**: `packages/skills-engine/src/types.ts`:25
- **Category**: comments / unenforced-budget
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: SkillLayer1 JSDoc claims '<200 tokens' and SkillLayer2 claims '<5000 tokens'. No code enforces token counting or truncation.
- **Suggestion**: Either add token-counting validation or reword the comments to 'Target: ~200 tokens (not enforced at runtime)'.

### [14] activate() and deactivate() are near-identical methods
- **File**: `packages/skills-engine/src/skill-registry.ts`:52
- **Category**: simplification / activate-deactivate-duplication
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: The two methods are structurally identical -- only the boolean value differs.
- **Suggestion**: Extract a private setActive(id, active) helper method.

### [15] SkillMetadata.category typed as plain string, not a union
- **File**: `packages/skills-engine/src/types.ts`:11
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: category is typed as plain string but represents a finite set. The type system cannot prevent typos or invalid categories.
- **Suggestion**: Define a SkillCategory literal union type with autocomplete support.

### [16] No test for dependencies field parsing in parseSkillMd
- **File**: `packages/skills-engine/src/skill-loader.ts`:59
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The optional 'dependencies' array field handling is never tested.
- **Suggestion**: Add a test case with a SKILL.md that includes a dependencies field.

### [17] All interfaces in types.ts lack readonly modifiers
- **File**: `packages/skills-engine/src/types.ts`:5
- **Category**: type-design / missing-readonly
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: All seven interfaces are defined with mutable fields. In a Functional Core architecture, data should be immutable.
- **Suggestion**: Add readonly to all interface fields. Export Readonly<SkillRegistryEntry> view type for consumers.

### [18] Change is horizontal-only: no end-to-end path exercisable
- **File**: `packages/skills-engine/src/index.ts`:1
- **Category**: integration / horizontal-only
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: This task delivers a complete internal library but no vertical slice. No IPC handler, UI setting, CLI command, or event listener calls into skills-engine.
- **Suggestion**: Deliver a minimal vertical slice: register SkillRegistry via injeca, add IPC handlers, wire buildSkillsContext() into system prompt assembly.

### [19] SkillLayer2 type exported but never used anywhere
- **File**: `packages/skills-engine/src/types.ts`:39
- **Category**: code-quality / unused-type
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: SkillLayer2 is defined and exported but never referenced. formatLayer2Body takes a Skill, not SkillLayer2. Dead code.
- **Suggestion**: Remove SkillLayer2 or refactor formatLayer2Body to accept it.

### [20] activate/deactivate return false for both not-found and already-in-state
- **File**: `packages/skills-engine/src/skill-registry.ts`:52
- **Category**: error-handling / error-as-valid-state
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: activate() returns false when skill ID is not found. Callers cannot distinguish 'not found' from other failures.
- **Suggestion**: Throw an error for not-found or return a discriminated union.

### [21] Optional array fields not validated for element types
- **File**: `packages/skills-engine/src/skill-loader.ts`:55
- **Category**: type-design / incomplete-validation
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Optional array fields (allowedTools, dependencies, tags) are only checked with Array.isArray(). Elements could be any type from YAML parsing.
- **Suggestion**: Validate element types or use Valibot schemas at this boundary.

### [22] Error path tests use bare .toThrow() without message/type check
- **File**: `packages/skills-engine/src/__tests__/skill-loader.test.ts`:90
- **Category**: test-quality / error-assertion-specificity
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: Four error path tests assert only that an error is thrown without verifying the message or type.
- **Suggestion**: Use .toThrow(/specific message pattern/) to verify the correct error.

### [23] Reference to 'agentskills.io standard' is unverifiable
- **File**: `packages/skills-engine/src/types.ts`:1
- **Category**: comments / unverifiable-reference
- **Confidence**: 78
- **Reported by**: review-comments
- **Description**: JSDoc claims 'Follows agentskills.io standard' but no URL or documentation is provided.
- **Suggestion**: Add a URL link to the standard or remove the reference if aspirational.

### [24] No test for SkillRegistry.loadAll() idempotency (re-load)
- **File**: `packages/skills-engine/src/skill-registry.ts`:21
- **Category**: test-quality / missing-state-transition-test
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: No test verifies that calling loadAll() a second time correctly resets activation state.
- **Suggestion**: Add a test: load, activate, re-load, verify activation is reset.

## P3 - Low (Optional)
### [25] loadAll() JSDoc duplicates class-level JSDoc verbatim
- **File**: `packages/skills-engine/src/skill-registry.ts`:17
- **Category**: comments / redundant-duplication
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: loadAll() JSDoc repeats the class-level JSDoc about override behavior.
- **Suggestion**: Remove the override detail from loadAll() JSDoc, keep only at class level.

### [26] Five trivial JSDoc comments restate method names on self-documenting code
- **File**: `packages/skills-engine/src/skill-registry.ts`:35
- **Category**: comments / redundant-restating-code
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: Five methods have JSDoc that simply restates the method name and signature.
- **Suggestion**: Remove trivial JSDoc or replace with value-adding comments.

### [27] Three identical Array.isArray checks could use a loop
- **File**: `packages/skills-engine/src/skill-loader.ts`:55
- **Category**: simplification / optional-array-fields
- **Confidence**: 80
- **Reported by**: review-simplify
- **Description**: Three consecutive Array.isArray blocks follow the same pattern. Acceptable per project convention.
- **Suggestion**: Only refactor if more optional array fields are added.

### [28] Inline comment explains 'what' but not 'why' for silently skipping errors
- **File**: `packages/skills-engine/src/skill-loader.ts`:122
- **Category**: comments / missing-why
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Comment '// Skip invalid skills during discovery' describes what, not why.
- **Suggestion**: Rewrite to explain intent: '// Resilience: one malformed SKILL.md should not prevent loading other skills'.

### [29] discoverSkills could use Result pattern to surface partial failures
- **File**: `packages/skills-engine/src/skill-loader.ts`:96
- **Category**: error-handling / result-pattern-opportunity
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: discoverSkills returns Skill[] and silently drops failures. A Result pattern would surface partial failures.
- **Suggestion**: Return `Promise<{ skills: Skill[], errors: Array<{ dir: string, error: Error }> }>`.

### [30] Registry test recreates identical config object in every test case
- **File**: `packages/skills-engine/src/__tests__/skill-registry.test.ts`:41
- **Category**: simplification / test-setup-repetition
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: Same SkillRegistry instantiation appears 12 times across the test file.
- **Suggestion**: Add a createRegistry() factory helper in the describe block.

### [31] SkillLayer2 is unused -- type never constructed or referenced
- **File**: `packages/skills-engine/src/types.ts`:39
- **Category**: type-design / informational
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: SkillLayer2 is defined and exported but never used. formatLayer2Body works with Skill, not SkillLayer2.
- **Suggestion**: Either use SkillLayer2 as return type of a toLayer2() function or remove it.

### [32] buildSkillsContext not tested with all skills active
- **File**: `packages/skills-engine/src/__tests__/context-integration.test.ts`:97
- **Category**: test-quality / missing-boundary-test
- **Confidence**: 76
- **Reported by**: review-tests
- **Description**: Missing test case where all skills are active (both Layer 2 bodies present).
- **Suggestion**: Add a test: buildSkillsContext([SKILL_A, SKILL_B], [SKILL_A, SKILL_B]) and verify both bodies appear.

## Positive Observations
- Clean functional core design: parseSkillMd, validateMetadata, extractLayer1, formatLayer1Summary, formatLayer2Body are all pure functions with clear input/output -- excellent for unit testing
- Good test coverage for each module: skill-loader.test.ts (11 tests), skill-registry.test.ts (12 tests), context-integration.test.ts (10 tests) using real temp directories and real file I/O rather than mocks
- Well-defined type hierarchy (SkillMetadata, Skill, SkillLayer1, SkillRegistryEntry) with clear separation between metadata layers
- User skills properly override built-in skills with same ID via simple Map insertion order, with test coverage for this edge case
- Input validation on SKILL.md frontmatter is thorough: checks for empty content, missing frontmatter, missing required fields with descriptive error messages
- Build configuration (tsdown, vitest, tsconfig) follows existing monorepo patterns correctly; vitest.config.ts properly added to root workspace config
- JSDoc is used consistently on all exported interfaces, types, and public functions
- The Layer 1 / Layer 2 conceptual model is well-documented -- clear two-tier system prompt injection strategy
- No TODO, FIXME, HACK, PLACEHOLDER, or other forbidden comment patterns found
- No mock violations detected: all tests use real filesystem operations with temp directories, direct class instantiation, and pure function calls
- All source functions are short (<45 lines) with low cyclomatic complexity (max CC=5)
- Consistent use of early returns and guard clauses keeps nesting depth at 2 or below
- SkillSource is a proper 2-value literal union type ('builtin' | 'user') -- good discriminator
- The context-integration module is a textbook example of small pure functions composed together
- Edge cases well covered in tests: nonexistent directories, empty directories, missing frontmatter, empty content, nonexistent skill IDs

## Recommended Action Plan
1. Fix 2 P0 issues first: add error binding, logging, and context to both bare catch blocks in `packages/skills-engine/src/skill-loader.ts` (lines 101 and 121)
2. Address 7 P1 issues in a single pass: wire package to a consumer (orphan), add persistence for activation state, include filePath in error messages, add integration test, return defensive copies from getById/getAll, enforce or soften the directory-name constraint in JSDoc, add test for malformed SKILL.md resilience
3. Run `/ultra-review recheck` to verify
