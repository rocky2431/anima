# Review Summary

**Session**: 20260221-055400-feat-task-24-performance-cost-control-iter1-iter2
**Verdict**: COMMENT
**Reason**: 1 P1 finding (orphan code persists), down from 6 P1s in iter1

## Recheck Delta (vs iter1)

| Metric | iter1 | iter2 | Change |
|--------|-------|-------|--------|
| Verdict | REQUEST_CHANGES | COMMENT | Improved |
| P0 | 0 | 0 | -- |
| P1 | 6 | 1 | -5 |
| P2 | 14 | 1 | -13 |
| P3 | 7 | 0 | -7 |
| Total | 27 | 2 | -25 |

### Resolution Details

| # | iter1 Finding | Severity | Status | Evidence |
|---|---------------|----------|--------|----------|
| 1 | ModelRouter orphan code | P1 | UNCHANGED | Still zero production consumers; grep across apps/ returns no matches |
| 2 | DeduplicationTracker orphan code | P1 | RESOLVED | Now wired into ScreenshotPipeline via constructor injection |
| 3 | Routing stats in-memory only | P1 | DOWNGRADED to P2 | toJSON() added but no caller; downgraded because ModelRouter itself is unwired |
| 4 | Missing try/catch on LLM I/O | P1 | RESOLVED | try/catch wraps both methods, preserves original error as cause, includes routing context |
| 5 | Stats corrupted on provider failure | P1 | RESOLVED | Stats now incremented AFTER successful I/O |
| 6 | Factual comment error (extraction routing) | P1 | RESOLVED | Comment corrected to match actual routing behavior |
| 7-27 | 21 findings from other agents | P2-P3 | NOT RE-EVALUATED | Only review-code ran in recheck; review-tests, review-errors, review-types, review-comments, review-simplify did not run |

**Summary**: 4 of 6 P1s resolved, 1 downgraded to P2, 1 unchanged. The remaining P1 (orphan ModelRouter) requires orchestrator wiring that is likely deferred to an integration checkpoint task.

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 1 |
| P2 Medium | 1 |
| P3 Low | 0 |
| **Total** | **2** (deduplicated from 2) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 2 | completed |
| review-tests | -- | not run (recheck) |
| review-errors | -- | not run (recheck) |
| review-types | -- | not run (recheck) |
| review-comments | -- | not run (recheck) |
| review-simplify | -- | not run (recheck) |

## P1 - High (Should Fix)
### [1] ModelRouter exported but has zero production consumers
- **File**: packages/context-engine/src/processing/model-router.ts:121
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Delta**: UNCHANGED from iter1 #1
- **Description**: ModelRouter is exported from packages/context-engine/src/index.ts (line 24) and has comprehensive tests including a ContextMerger integration test proving interface compatibility. However, no production code path instantiates or uses ModelRouter. The orchestrator in apps/stage-tamagotchi/src/main/services/anima/orchestrator.ts creates ScreenshotPipeline with a raw VlmProvider and does not route LLM calls through ModelRouter. A grep for 'ModelRouter' and 'model-router' across apps/ returns zero matches. The ContextMerger integration test at model-router.test.ts:417-442 proves the wiring CAN work, but this is test-only proof -- no live entry point traces through ModelRouter. The toJSON() serialization method (line 183) was added but is also unused outside tests since ModelRouter itself is unwired.
- **Suggestion**: Wire ModelRouter into the AnimaOrchestrator or createAnimaOrchestrator factory. The orchestrator should accept an optional LlmProvider (defaulting to a ModelRouter wrapping the existing providers) so that ContextMerger, EntityExtractor, and other LLM consumers benefit from tiered routing in production. Alternatively, if this is intentionally deferred to a future task, document the wiring plan in a tracked issue and note the dependency.

## P2 - Medium (Consider)
### [2] ModelRouter routing stats lost on restart, toJSON() unused
- **File**: packages/context-engine/src/processing/model-router.ts:126
- **Category**: architecture / in-memory-state
- **Confidence**: 80
- **Reported by**: review-code
- **Delta**: DOWNGRADED from iter1 #3 (P1 -> P2)
- **Description**: The previous review flagged routing stats as in-memory only (P1). A toJSON() method was added (line 183-185) providing serialization capability, which partially addresses the concern. However, no code calls toJSON() or persists the serialized stats. The stats accumulate in private fields and are lost on process restart. Since ModelRouter itself is not yet wired into production (see finding #1), this is downgraded to P2 -- it becomes a real concern only once ModelRouter has live consumers. When the orchestrator wiring happens, stats should be periodically logged via structured logger or persisted to observe cost savings over time.
- **Suggestion**: When wiring ModelRouter into the orchestrator, add periodic structured logging of router.toJSON() (e.g., every N calls or on a timer) so cost savings are observable. For persistence, consider writing stats to the existing SQLite store on graceful shutdown.

## Positive Observations
- Error handling in ModelRouter is well-structured: try/catch wraps both generateText and generateStructured, preserves the original error as cause, and includes routing context (tier + task type) in the error message
- Stats are now correctly incremented AFTER successful I/O, not before -- prevents stat corruption on provider failure
- DeduplicationTracker is properly wired into ScreenshotPipeline via constructor injection with an optional external tracker, following the Functional Core / Imperative Shell pattern
- classifyTask remains a pure function with clear keyword-based classification, testable without any mocking
- toJSON() provides clean serialization of routing stats, ready for structured logging when the wiring is completed
- Test doubles (createTrackingProvider, SequentialScreenshotProvider, StubVlmProvider) all have proper rationale comments explaining they wrap external API boundaries
- ContextMerger integration test (model-router.test.ts:417-442) proves ModelRouter satisfies the LlmProvider contract end-to-end through a real ContextMerger instance
- Screenshot pipeline deduplication stats test (screenshot-pipeline.test.ts:290-308) verifies the full track/stats flow through the pipeline
- Previous review-comments-001 (incorrect comment about routing to lightweight vs local) has been fixed

## Recommended Action Plan
1. Wire ModelRouter into the AnimaOrchestrator -- this is the single remaining P1 and has persisted for 20+ sessions as the orphan-wiring pattern
2. When wiring, add structured logging of router.toJSON() to address the P2
3. The 21 findings from other agents (review-tests, review-errors, review-types, review-comments, review-simplify) were not re-evaluated -- consider running a full review if those areas were also changed
4. Run `/ultra-review recheck` after orchestrator wiring to verify
