# Review Summary

**Session**: 20260221-021800-feat-task-21-ui-panels-iter1-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 4 P1 findings exceed the threshold (P1 > 3); in-memory state, horizontal-only delivery, unbounded collection, and missing type contracts require resolution

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 4 |
| P2 Medium | 16 |
| P3 Low | 9 |
| **Total** | **29** (deduplicated from 30) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 8 | completed |
| review-tests | 7 | completed |
| review-errors | 0 | completed |
| review-types | 5 | completed |
| review-comments | 6 | completed |
| review-simplify | 4 | completed |

## P1 - High (Should Fix)
### [1] All 4 stores hold business state only in memory, no persistence
- **File**: packages/stage-ui/src/stores/modules/memory.ts:7
- **Category**: architecture / in-memory-state
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: All four new Pinia stores (memory, todo, skills, activity) store their data exclusively in reactive refs with no persistence layer. Memories, todos, skills, and activities are all lost on page reload. The todo store is especially problematic because it supports addTodo/deleteTodo/toggleTodo as write operations that go nowhere -- the user performs actions that silently disappear. The memory and skills stores also support deleteMemory and toggleSkill which have the same ephemeral mutation problem.
- **Suggestion**: Wire these stores to either (a) localStorage/IndexedDB for client-side persistence, (b) IPC calls to the Electron main process with SQLite-backed storage, or (c) an API endpoint. At minimum, todos created by the user MUST survive page refresh. For the read-only panels (memory, activity, skills), implement the data-fetching path so the stores actually receive data from context-engine / skills-engine backends.

### [2] UI-only horizontal slice: no backend data source wired for any panel
- **File**: packages/stage-ui/src/stores/modules/activity.ts:20
- **Category**: integration / horizontal-only-change
- **Confidence**: 92
- **Reported by**: review-code
- **Description**: setMemories, setActivities, setSummary, setSkills, and setTodos are the only entry points for populating these stores, but no production code ever calls them -- only test files do. All four settings panels will render empty states permanently. This is a horizontal-only change: four complete UI panels with no vertical connection to any data source (context-engine, skills-engine, or any IPC/API). The stores expose setter functions that are dead code in production.
- **Suggestion**: Implement at least one vertical slice: pick one panel (e.g. memory) and wire it end-to-end from context-engine through IPC to the store. For others, add onMounted hooks in each settings page that fetch data via IPC calls to the Electron main process, or via WebSocket/HTTP API when running in stage-web.

### [3] Todo store has unbounded growth with no size cap
- **File**: packages/stage-ui/src/stores/modules/todo.ts:25
- **Category**: architecture / unbounded-collection
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: addTodo appends to the todos array without any maximum size check. Since this is an in-memory-only store, a user (or automated process calling addTodo) can grow the array indefinitely, consuming unbounded memory. Similarly, the memory store's setMemories accepts arbitrary-length arrays. The activity store's setActivities has the same issue. None of the stores implement pagination, virtual scrolling, or size caps.
- **Suggestion**: Add a MAX_ITEMS constant (e.g. 1000 for todos, configurable for memories). In addTodo, check against the cap before inserting. For the list views, implement virtual scrolling or pagination if the data set can be large. This becomes critical once persistence is added and real data flows in.

### [4] UI types mirror context-engine types but no shared contract
- **File**: packages/stage-ui/src/types/memory.ts:1
- **Category**: integration / missing-contract
- **Confidence**: 88
- **Reported by**: review-code
- **Description**: The comment explicitly states these types 'mirror the context-engine types', but there is no shared interface, import, or contract test validating that the UI types actually match the backend types. If context-engine changes its MemoryEntry shape, these UI types will silently drift. The same applies to ActivityEntryUI, SkillUI, and TodoUI -- all are standalone definitions with no contract binding to their backend counterparts.
- **Suggestion**: Create a shared contract package (or add to an existing shared package like stage-shared) defining the canonical types. Both context-engine and stage-ui should import from the shared contract. Alternatively, add a contract test that imports both types and verifies structural compatibility.

## P2 - Medium (Consider)
### [5] Non-null assertion on selectedMemory in delete button handler
- **File**: packages/stage-ui/src/components/scenarios/memory/MemoryManager.vue:160
- **Category**: code-quality / non-null-assertion
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The delete button in the detail panel uses a non-null assertion (selectedMemory!.id). While the v-if guard provides runtime safety, the non-null assertion bypasses TypeScript's null checking.
- **Suggestion**: Use optional chaining with an early return guard, or extract the delete handler into a named function that checks for null.

### [6] formatDate and formatDuration duplicated across components
- **File**: packages/stage-ui/src/components/scenarios/memory/MemoryManager.vue:27
- **Category**: code-quality / duplicated-utility
- **Confidence**: 82
- **Reported by**: review-code
- **Description**: The formatDate function is duplicated identically in MemoryManager.vue and TodoPanel.vue. Additionally, formatDate uses toLocaleDateString() without locale parameter, which may produce inconsistent results.
- **Suggestion**: Extract into a shared composable or utils module. Pass the i18n locale to toLocaleDateString for consistent formatting.

### [7] All UI types for 4 unrelated domains packed into single memory.ts
- **File**: packages/stage-ui/src/types/memory.ts:1
- **Category**: code-quality / type-file-organization
- **Confidence**: 80
- **Reported by**: review-code
- **Description**: The file contains type definitions for four distinct domains (memory, todo, activity, skills) but is named 'memory.ts'. The todo.ts store imports 'TodoFilter' and 'TodoUI' from '../../types/memory' which is misleading.
- **Suggestion**: Split into domain-specific type files: types/memory.ts, types/todo.ts, types/activity.ts, types/skills.ts.

### [8] JSDoc claims to 'mirror' context-engine types without enforcement
- **File**: packages/stage-ui/src/types/memory.ts:1
- **Category**: comments / misleading-reference
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: The JSDoc claims these types 'mirror the context-engine types', but there is no import, schema validation, or type-level link. If context-engine types evolve, this file will silently diverge while the comment still claims they are mirrors.
- **Suggestion**: Either import and re-export the context-engine types, or reword the comment to avoid implying a live mirror.

### [9] TodoUI allows illegal completed/completedAt combinations
- **File**: packages/stage-ui/src/types/memory.ts:25
- **Category**: type-design / illegal-state
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: TodoUI allows completed=true with completedAt=null and completed=false with completedAt=timestamp. The toggleTodo() store function maintains the invariant, but the type itself does not prevent invalid combinations.
- **Suggestion**: Replace with a discriminated union on completed status, or document as a known type gap and add a runtime guard.

### [10] No test for whitespace-only search query in memory store
- **File**: packages/stage-ui/src/stores/modules/memory.test.ts:121
- **Category**: test-quality / boundary-condition
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The memory store's filteredMemories uses .trim() to ignore whitespace-only search queries, but no test verifies this boundary condition.
- **Suggestion**: Add a test case: set searchQuery to '   ' and verify filteredMemories returns all memories.

### [11] SkillUI.category and version are plain strings
- **File**: packages/stage-ui/src/types/memory.ts:56
- **Category**: type-design / primitive-obsession
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: SkillUI.category is a plain string while the same file uses literal unions for MemoryCategory, TodoFilter, and SkillUI.source. The inconsistency suggests category should also be a literal union.
- **Suggestion**: Define a SkillCategory literal union matching known categories from the skills engine.

### [12] Todo clearCompleted untested for all-completed and none-completed
- **File**: packages/stage-ui/src/stores/modules/todo.test.ts:109
- **Category**: test-quality / boundary-condition
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: The clearCompleted tests only cover the mixed case. Two boundary conditions are missing: all completed and none completed.
- **Suggestion**: Add two tests for both boundary cases.

### [13] Skills filteredSkills has no test for zero-match search result
- **File**: packages/stage-ui/src/stores/modules/skills.test.ts:80
- **Category**: test-quality / boundary-condition
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: No test checks the case where the search query matches zero skills.
- **Suggestion**: Add test: set searchQuery to a nonexistent value and assert filteredSkills returns an empty array.

### [14] Duplicate duration formatting logic and magic numbers within ActivityTimeline.vue
- **File**: packages/stage-ui/src/components/scenarios/activity/ActivityTimeline.vue:12
- **Category**: simplification / duplication
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: The formattedDuration computed property and the formatDuration function contain near-identical logic with magic numbers (3600000, 60000) repeated 4 times. Also a minor inconsistency: formattedDuration always shows hours ('0h Xm') while formatDuration omits hours when 0.
- **Suggestion**: Extract named constants (MS_PER_HOUR, MS_PER_MINUTE), unify into a single formatDuration function, and use it in the computed property.

### [15] No JSDoc on exported useMemoryModuleStore or its public methods
- **File**: packages/stage-ui/src/stores/modules/memory.ts:6
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: Store exports 7 public methods and 4 reactive properties with zero documentation. Non-obvious side effects (deleteMemory clears selection) are undocumented.
- **Suggestion**: Add store-level JSDoc and document non-obvious methods.

### [16] No JSDoc on exported useTodoModuleStore or its public methods
- **File**: packages/stage-ui/src/stores/modules/todo.ts:7
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: 6 public methods and 2 computed properties with no documentation. addTodo's silent discard of empty input and toggleTodo's completedAt side-effect are worth documenting.
- **Suggestion**: Add JSDoc to the store and its public methods.

### [17] No JSDoc on exported useSkillsModuleStore or its public methods
- **File**: packages/stage-ui/src/stores/modules/skills.ts:6
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: 4 public methods and 2 computed properties with no JSDoc. The filteredSkills multi-field search logic is non-obvious.
- **Suggestion**: Add JSDoc, particularly on filteredSkills and toggleSkill.

### [18] No JSDoc on exported useActivityModuleStore or its public methods
- **File**: packages/stage-ui/src/stores/modules/activity.ts:6
- **Category**: comments / missing-documentation
- **Confidence**: 80
- **Reported by**: review-comments
- **Description**: 3 public methods and 3 computed properties with no JSDoc. The activities ref is declared but never consumed by any computed property.
- **Suggestion**: Add JSDoc explaining the store's role and why activities is stored separately from todaySummary.

### [19] getSkillById returns mutable reference to store entry
- **File**: packages/stage-ui/src/stores/modules/skills.ts:40
- **Category**: type-design / encapsulation-leak
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: getSkillById() returns a direct reference to the array element. External code can mutate the skill object without going through store actions.
- **Suggestion**: Return a spread copy or use a Readonly<SkillUI> return type.

### [20] Activity store personalNote field never asserted in tests
- **File**: packages/stage-ui/src/stores/modules/activity.test.ts:67
- **Category**: test-quality / missing-coverage
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: No test asserts that personalNote is preserved after setSummary's shallow spread copy.
- **Suggestion**: Add assertion: expect(store.todaySummary?.personalNote).toBe('Productive day!').

### [21] No test for filtering/operations on empty collections
- **File**: packages/stage-ui/src/stores/modules/memory.test.ts:121
- **Category**: test-quality / boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: Across all four stores, no test verifies that filtering an empty collection returns an empty array rather than undefined or error.
- **Suggestion**: Add a simple test per store verifying filter on empty collection returns [].

## P3 - Low (Optional)
### [22] Identical formatDate function duplicated across two components
- **File**: packages/stage-ui/src/components/scenarios/memory/MemoryManager.vue:27
- **Category**: simplification / duplication
- **Confidence**: 90
- **Reported by**: review-simplify
- **Description**: The same formatDate function appears in both MemoryManager.vue and TodoPanel.vue.
- **Suggestion**: Extract to a shared utility module.

### [23] All UI interfaces lack readonly modifiers
- **File**: packages/stage-ui/src/types/memory.ts:6
- **Category**: type-design / readonly-discipline
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: All 7 interfaces use mutable fields. Readonly fields would express that consumers should not directly mutate entries.
- **Suggestion**: Add readonly to all interface fields. Informational for walking skeleton.

### [24] Timestamp and duration fields use bare number throughout
- **File**: packages/stage-ui/src/types/memory.ts:12
- **Category**: type-design / primitive-obsession
- **Confidence**: 75
- **Reported by**: review-types
- **Description**: Multiple fields use bare number for timestamps and durations. Branded types would prevent mixing units.
- **Suggestion**: Define branded types (UnixTimestampMs, DurationMs). Low priority for walking skeleton.

### [25] Empty state template pattern repeated across 4 new components
- **File**: packages/stage-ui/src/components/scenarios/memory/MemoryManager.vue:115
- **Category**: simplification / extractable-pattern
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: All 4 new components plus existing McpManager share an identical empty state pattern. At 5 occurrences this crosses the 3-use extraction threshold.
- **Suggestion**: Extract an EmptyState.vue component with icon and message props.

### [26] Unnecessary vi.mock('vue-i18n') in all four test files
- **File**: packages/stage-ui/src/stores/modules/memory.test.ts:10
- **Category**: test-quality / unnecessary-mock
- **Confidence**: 95
- **Reported by**: review-tests
- **Description**: All four test files mock vue-i18n, but none of the source modules import or use it. Unnecessary boilerplate.
- **Suggestion**: Remove the vi.mock('vue-i18n') block from all four test files.

### [27] Misleading test name: 'called with null' but calls clearSelection()
- **File**: packages/stage-ui/src/stores/modules/memory.test.ts:111
- **Category**: test-quality / test-naming
- **Confidence**: 95
- **Reported by**: review-tests
- **Description**: Test named 'should clear selection when called with null' but actually calls store.clearSelection(), not selectMemory(null).
- **Suggestion**: Rename to 'should clear selection via clearSelection()' and move to a separate describe block.

### [28] Template section comments restate visually obvious structure
- **File**: packages/stage-ui/src/components/scenarios/memory/MemoryManager.vue:34
- **Category**: comments / redundant-comment
- **Confidence**: 76
- **Reported by**: review-comments
- **Description**: 17 template section comments across 4 components mostly restate what is visually obvious from the template structure.
- **Suggestion**: Consider removing the most obvious ones; keep those marking non-obvious sections.

### [29] Toggle and filter buttons lack accessible labels
- **File**: packages/stage-ui/src/components/scenarios/skills/SkillsManager.vue:94
- **Category**: code-quality / accessibility
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: Skill toggle, memory delete, todo checkbox, and category filter buttons all lack aria-label attributes.
- **Suggestion**: Add :aria-label attributes to all icon-only buttons.

## Positive Observations
- Clean separation of concerns: Pinia stores handle state logic, Vue components handle presentation, types are defined separately.
- Proper use of storeToRefs for reactive destructuring from Pinia stores -- avoids reactivity loss.
- All user-facing strings properly externalized to i18n YAML files with parameterized interpolation.
- Immutable update patterns used throughout stores (spread operator, filter, map) instead of direct array mutation.
- Settings pages correctly use the settingsEntry route meta pattern for automatic discovery in the settings layout.
- Empty state handling present in all four components with appropriate fallback UI.
- Good input validation in addTodo: trims whitespace and rejects empty strings before creating a todo.
- Store tests are thorough and use real Pinia instances -- no mocking of store internals.
- Zero forbidden patterns (TODO/FIXME/HACK/XXX/PLACEHOLDER/TEMP) found across all new files.
- All 4 Pinia stores are synchronous-only with no I/O operations -- error-free-by-design pattern.
- All 4 Vue components are purely presentational with no async operations -- no error handling needed.
- Memory store correctly nullifies selectedMemory when deleted item was selected -- avoids stale reference bugs.
- All store modules are well-structured with short functions, low cyclomatic complexity, and shallow nesting.
- Consistent use of early returns and guard clauses throughout stores.
- Template code uses the project-standard :class array pattern for readable UnoCSS class grouping.
- MemoryCategory is a proper 5-value literal union -- good type narrowing at UI boundary.
- Factory functions (createMemory, createTodo, createSkill, createSummary) with override support make tests readable.
- Edge cases like nonexistent IDs and toggle round-trips are tested across stores.
- State reset tests verify all state fields return to initial values.
- Store modules follow consistent Pinia composition API pattern with clear separation.
- Store code is clean and self-documenting with good function names.

## Recommended Action Plan
1. Address 4 P1 issues: wire at least one vertical slice to a backend data source, add collection size caps, and establish shared type contracts
2. Fix 16 P2 issues in a single pass -- group by theme: code quality (5), comments/docs (5), test gaps (5), type design (3), simplification (1)
3. Run `/ultra-review recheck` to verify
