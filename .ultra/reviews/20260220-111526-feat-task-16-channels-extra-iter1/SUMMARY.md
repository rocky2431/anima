# Review Summary

**Session**: 20260220-111526-feat-task-16-channels-extra-iter1
**Verdict**: REQUEST_CHANGES
**Reason**: 13 P1 findings exceed the threshold of 3 (error handling gaps, orphan wiring, missing tests, type safety issues)

## Statistics
| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 13 |
| P2 Medium | 20 |
| P3 Low | 5 |
| **Total** | **38** (deduplicated from 40) |

## Agents Run
| Agent | Findings | Status |
|-------|----------|--------|
| review-code | 9 | completed |
| review-tests | 7 | completed |
| review-errors | 8 | completed |
| review-types | 8 | completed |
| review-comments | 4 | completed |
| review-simplify | 4 | completed |

## P1 - High (Should Fix)

### [1] Message handlers invoked without try/catch or await in ChannelRegistry
- **File**: `packages/channels-extra/src/channel-registry.ts`:24
- **Category**: error-handling / fire-and-forget-handler
- **Confidence**: 92
- **Reported by**: review-code, review-errors
- **Description**: MessageHandler type signature is `(message: IncomingMessage) => void | Promise<void>`. When a handler returns a Promise (async), that promise is neither awaited nor given a .catch(). If the handler throws synchronously, the error propagates into the message event callback, potentially crashing the Slack/WhatsApp event loop. If async, the rejection is unhandled and silently lost. Additionally, if any handler throws synchronously, it aborts dispatch to subsequent handlers.
- **Suggestion**: Wrap each handler call in try/catch and handle async returns: `try { const result = handler(msg); if (result instanceof Promise) result.catch(err => logger.error('Handler error', { platform: msg.platform, error: err })); } catch (err) { logger.error('Sync handler error', { platform: msg.platform, error: err }); }`

### [2] SlackChannel.connect() has no error handling and never sets 'error' status
- **File**: `packages/channels-extra/src/slack/index.ts`:61
- **Category**: error-handling / missing-try-catch-io
- **Confidence**: 88
- **Reported by**: review-errors
- **Description**: If app.start() rejects (network error, invalid token, socket timeout), the status remains 'connecting' forever. The ChannelStatus type includes an 'error' state but neither channel implementation ever transitions to it. Consumers watching status changes get no signal that the channel has entered an error state. The caller gets the raw Bolt error with no channel context.
- **Suggestion**: Wrap the connect body in try/catch. On failure, call `this.setStatus('error')` before re-throwing a wrapped error: `throw new Error('Slack connect failed', { cause: error })`. Apply the same pattern to WhatsAppChannel.connect() and both disconnect() methods.

### [3] New package has no consumer -- orphan code
- **File**: `packages/channels-extra/src/index.ts`:1
- **Category**: integration / orphan-code
- **Confidence**: 95
- **Reported by**: review-code
- **Description**: The @proj-airi/channels-extra package exports ChannelRegistry, WhatsAppChannel, and SlackChannel, but no other package.json in the repo declares it as a dependency. There is no import, no entry point, and no handler that reaches this code. The package is dead-on-arrival until a consumer is wired.
- **Suggestion**: Add @proj-airi/channels-extra as a dependency in stage-tamagotchi (or the relevant app) and wire it through injeca DI with a minimal end-to-end path proving one message can flow through the registry.

### [4] ChannelRegistry stores all state in memory without persistence
- **File**: `packages/channels-extra/src/channel-registry.ts`:9
- **Category**: architecture / in-memory-state
- **Confidence**: 90
- **Reported by**: review-code
- **Description**: The ChannelRegistry maintains the map of registered channels and global message handlers entirely in memory. On process restart, all registrations are lost. Additionally, globalHandlers is an unbounded array that grows without limit if consumers register handlers without unsubscribing.
- **Suggestion**: Add a maxHandlers guard or log a warning when handler count exceeds a threshold. If channel registration state needs to survive restarts, persist config. If intentionally ephemeral, document that assumption explicitly.

### [5] No logging in any production source file
- **File**: `packages/channels-extra/src/channel-registry.ts`:1
- **Category**: code-quality / missing-logging
- **Confidence**: 92
- **Reported by**: review-code
- **Description**: None of the three production modules use @guiiai/logg or any structured logger. Connection lifecycle, message receipt, rate limit enforcement, and error paths all lack observability. When a channel fails to connect or a message is silently dropped, there will be zero trace in logs.
- **Suggestion**: Add `import { useLogg } from '@guiiai/logg'` and create a logger per module. Log at INFO level for connect/disconnect, WARN for rate limit, ERROR for failures, DEBUG for message receipt.

### [6] better-sqlite3 declared as dependency but never imported
- **File**: `packages/channels-extra/package.json`:41
- **Category**: code-quality / unused-dependency
- **Confidence**: 88
- **Reported by**: review-code
- **Description**: The package.json declares better-sqlite3 as a production dependency and @types/better-sqlite3 as a devDependency. No source file in the package imports or references SQLite. This inflates the install footprint and misleads consumers.
- **Suggestion**: Remove better-sqlite3 from dependencies and @types/better-sqlite3 from devDependencies.

### [7] Slack message handlers invoked without error boundary
- **File**: `packages/channels-extra/src/slack/index.ts`:124
- **Category**: error-handling / fire-and-forget-handler
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: Message handlers are called in a loop without try/catch and without awaiting. A sync throw in handler N aborts handlers N+1..end. An async rejection is silently lost. This runs inside the Bolt message callback, so a sync throw could crash the Bolt event processing.
- **Suggestion**: Wrap each handler invocation in try/catch. Await or .catch() any returned Promise. Log errors with context.

### [8] WhatsApp message handlers invoked without error boundary
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:133
- **Category**: error-handling / fire-and-forget-handler
- **Confidence**: 90
- **Reported by**: review-errors
- **Description**: Same pattern as Slack channel. Async rejections are silently lost. This executes inside a Baileys event handler, so errors could interfere with the Baileys event loop.
- **Suggestion**: Wrap each handler invocation in try/catch. Await or .catch() any returned Promise. Log errors with context.

### [9] setStatus() iterates status handlers without error isolation
- **File**: `packages/channels-extra/src/slack/index.ts`:46
- **Category**: error-handling / status-handler-unprotected
- **Confidence**: 85
- **Reported by**: review-errors
- **Description**: Both SlackChannel and WhatsAppChannel iterate over user-supplied status change handlers without try/catch. A throwing handler aborts notification of remaining handlers AND can corrupt the channel's operational flow.
- **Suggestion**: Wrap each handler call in try/catch with error logging.

### [10] onAnyMessage test never verifies message delivery
- **File**: `packages/channels-extra/src/__tests__/channel-registry.test.ts`:124
- **Category**: test-quality / missing-behavioral-coverage
- **Confidence**: 90
- **Reported by**: review-tests
- **Description**: The test for onAnyMessage only verifies the handler is subscribed and the array starts empty. It never triggers a message through any registered channel to verify that the global handler actually receives messages. The core purpose of onAnyMessage (fan-in from multiple channels) is untested.
- **Suggestion**: Add a test that registers a channel with a controllable onMessage trigger, fires a message, and asserts the global handler receives it.

### [11] SlackChannel and WhatsAppChannel connect-without-deps error untested
- **File**: `packages/channels-extra/src/slack/index.ts`:64
- **Category**: test-quality / missing-error-path
- **Confidence**: 85
- **Reported by**: review-tests
- **Description**: Both channels throw errors when called without injected dependencies, but no test verifies these error paths. These are distinct from the sendMessage-before-connect tests.
- **Suggestion**: Add tests: `new SlackChannel(config)` (no deps) then `await expect(channel.connect()).rejects.toThrow(/requires createApp/)`.

### [12] getByPlatform() leaks mutable ChannelRegistryEntry reference
- **File**: `packages/channels-extra/src/channel-registry.ts`:34
- **Category**: type-design / mutable-reference-leak
- **Confidence**: 90
- **Reported by**: review-types
- **Description**: getByPlatform() returns the internal Map entry directly, allowing callers to mutate the channel, config, and registeredAt fields. This is the same pattern previously flagged in SkillRegistry and CronService.
- **Suggestion**: Return a readonly-typed copy: `Readonly<ChannelRegistryEntry>` or a spread copy: `return entry ? { ...entry } : undefined`.

### [13] register() does not validate channel.platform matches config.platform
- **File**: `packages/channels-extra/src/channel-registry.ts`:12
- **Category**: type-design / config-platform-mismatch
- **Confidence**: 85
- **Reported by**: review-types
- **Description**: register() accepts any Channel + any ChannelConfig combination without verifying they agree on the platform discriminant. A caller could register a WhatsAppChannel with a SlackConfig.
- **Suggestion**: Add a runtime guard: `if (channel.platform !== config.platform) { throw new Error('Channel platform does not match config platform') }`.

## P2 - Medium (Consider)

### [14] Unsafe `as` cast on external event data in WhatsApp handler
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:111
- **Category**: code-quality / unsafe-cast
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The baileys socket emits `unknown` typed data. The code casts it directly to BaileysUpsertEvent without runtime validation.
- **Suggestion**: Add a runtime guard before casting: check that `data` is an object with a `messages` array property.

### [15] Unsafe `as` cast on Slack message data
- **File**: `packages/channels-extra/src/slack/index.ts`:109
- **Category**: code-quality / unsafe-cast
- **Confidence**: 85
- **Reported by**: review-code
- **Description**: The bolt message handler casts the incoming message to SlackMessage without runtime validation. Bolt sends many message subtypes with varying shapes.
- **Suggestion**: Add a runtime guard: verify that `message` has the expected string properties before processing.

### [16] WhatsApp rate limit state stored only in memory
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:44
- **Category**: architecture / in-memory-state
- **Confidence**: 82
- **Reported by**: review-code
- **Description**: The sentTimestamps array for rate limiting is purely in-memory. On restart, the rate limit resets immediately. No cross-process protection.
- **Suggestion**: Document that rate limit is per-process and non-durable. For multi-process deployments, persist to Redis/SQLite.

### [17] No JSDoc on any exported type in types.ts
- **File**: `packages/channels-extra/src/types.ts`:1
- **Category**: comments / missing-jsdoc
- **Confidence**: 90
- **Reported by**: review-comments
- **Description**: 9 public types with zero JSDoc. The Channel.sendMessage target semantics vary by platform (Slack channel ID vs WhatsApp JID).
- **Suggestion**: Add JSDoc to Channel, IncomingMessage, WhatsAppConfig/SlackConfig, and document sendMessage target semantics.

### [18] No JSDoc on ChannelRegistry class or its public methods
- **File**: `packages/channels-extra/src/channel-registry.ts`:8
- **Category**: comments / missing-jsdoc
- **Confidence**: 88
- **Reported by**: review-comments
- **Description**: 7 public members without any JSDoc. Key behaviors like 'register throws on duplicate' and 'connectAll returns per-platform results' are non-obvious.
- **Suggestion**: Add JSDoc to each public method documenting behavior, exceptions, and return values.

### [19] No JSDoc on SlackChannel class or its public API
- **File**: `packages/channels-extra/src/slack/index.ts`:28
- **Category**: comments / missing-jsdoc
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: No JSDoc on the class, constructor, or any method. The DI pattern via SlackChannelDeps is non-obvious.
- **Suggestion**: Document it wraps @slack/bolt and explain the constructor deps parameter.

### [20] No JSDoc on WhatsAppChannel class or its public API
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:36
- **Category**: comments / missing-jsdoc
- **Confidence**: 85
- **Reported by**: review-comments
- **Description**: No JSDoc. Rate limiting behavior and WhatsApp JID format for sendMessage target are not discoverable from type signatures.
- **Suggestion**: Document it wraps @whiskeysockets/baileys, the JID format, and rate limiting behavior.

### [21] Error messages lack operational context
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:92
- **Category**: error-handling / missing-error-context
- **Confidence**: 80
- **Reported by**: review-errors
- **Description**: Error messages like 'WhatsApp channel is not connected' lack target ID, current status, and config identifiers.
- **Suggestion**: Include context: `throw new Error('WhatsApp sendMessage failed: status=${this._status}, target=${target}')`.

### [22] connectAll and disconnectAll are near-identical (18 lines each)
- **File**: `packages/channels-extra/src/channel-registry.ts`:42
- **Category**: simplification / near-duplicate-code
- **Confidence**: 92
- **Reported by**: review-simplify
- **Description**: connectAll() and disconnectAll() share identical structure. Only difference is .connect() vs .disconnect(). 18 lines duplicated.
- **Suggestion**: Extract `private executeOnAll(operation)` helper. Both public methods become one-liners.

### [23] Handler add/remove pattern duplicated 5 times across files
- **File**: `packages/channels-extra/src/slack/index.ts`:53
- **Category**: simplification / repeated-pattern
- **Confidence**: 85
- **Reported by**: review-simplify
- **Description**: The push-handler / return-unsubscribe-closure pattern appears 5 times with only the array name changing.
- **Suggestion**: Extract `addHandler<T>(handlers: T[], handler: T): () => void` shared utility.

### [24] setupEventHandlers has 4-level nesting depth
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:108
- **Category**: simplification / deep-nesting
- **Confidence**: 88
- **Reported by**: review-simplify
- **Description**: 4 levels of nesting in the WhatsApp event handler. Extracting parseMessage() would reduce nesting and separate pure parsing from imperative wiring.
- **Suggestion**: Extract `parseMessage(msg): IncomingMessage | null` as a pure function.

### [25] disconnectAll fault isolation not tested
- **File**: `packages/channels-extra/src/__tests__/channel-registry.test.ts`:80
- **Category**: test-quality / missing-fault-isolation
- **Confidence**: 88
- **Reported by**: review-tests
- **Description**: connectAll has a fault isolation test but disconnectAll (with identical logic) does not.
- **Suggestion**: Add a parallel test verifying one channel failure during disconnect does not block others.

### [26] WhatsApp extendedTextMessage path untested
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:117
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 82
- **Reported by**: review-tests
- **Description**: All tests use the conversation path. The extendedTextMessage fallback (forwarded/quoted messages) is untested.
- **Suggestion**: Add a test with extendedTextMessage format.

### [27] WhatsApp message with no text content not tested
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:115
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 80
- **Reported by**: review-tests
- **Description**: Guards for messages with no message property and empty text are untested. Important for media-only messages.
- **Suggestion**: Add boundary tests for media-only messages and messages with no message property.

### [28] Slack message with empty text not tested
- **File**: `packages/channels-extra/src/slack/index.ts`:112
- **Category**: test-quality / missing-boundary-condition
- **Confidence**: 78
- **Reported by**: review-tests
- **Description**: Slack handler guards against empty/undefined text, but no test covers this. Slack sends events for edits, deletions, and subtypes with no text.
- **Suggestion**: Add a boundary test triggering a message with empty text.

### [29] ChannelStatus 'error' state never tested or transitioned to
- **File**: `packages/channels-extra/src/types.ts`:1
- **Category**: test-quality / missing-state-transition
- **Confidence**: 76
- **Reported by**: review-tests
- **Description**: ChannelStatus includes 'error' but no implementation transitions to it. Status stuck at 'connecting' after failure.
- **Suggestion**: Add a test for status after connection failure, then fix implementation.

### [30] Unsafe `as BaileysUpsertEvent` cast on unknown event data
- **File**: `packages/channels-extra/src/whatsapp/index.ts`:111
- **Category**: type-design / unsafe-cast
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: Socket event handler casts `unknown` to BaileysUpsertEvent without validation. If Baileys changes its event shape, this silently produces incorrect types.
- **Suggestion**: Add a runtime type guard function `isBaileysUpsertEvent(data)` and validate before accessing fields.

### [31] Unsafe `as SlackMessage` cast on Bolt message event
- **File**: `packages/channels-extra/src/slack/index.ts`:108
- **Category**: type-design / unsafe-cast
- **Confidence**: 88
- **Reported by**: review-types
- **Description**: Bolt message events can contain various subtypes that do not conform to SlackMessage shape. text/user/channel may be undefined.
- **Suggestion**: Add a type guard to validate the message shape before processing.

### [32] IncomingMessage and ChannelRegistryEntry lack readonly modifiers
- **File**: `packages/channels-extra/src/types.ts`:9
- **Category**: type-design / missing-readonly
- **Confidence**: 82
- **Reported by**: review-types
- **Description**: IncomingMessage is an immutable event but all fields are mutable. Handlers could accidentally modify message properties during fan-out dispatch.
- **Suggestion**: Add `readonly` to all IncomingMessage fields and ChannelRegistryEntry's config/registeredAt.

### [33] SlackChannel/WhatsAppChannel constructors accept config without validation
- **File**: `packages/channels-extra/src/slack/index.ts`:37
- **Category**: type-design / missing-constructor-validation
- **Confidence**: 80
- **Reported by**: review-types
- **Description**: Both constructors accept config without validating critical fields. botToken/appToken/authDir could be empty strings.
- **Suggestion**: Add constructor validation or define Valibot schemas for config types.

## P3 - Low (Optional)

### [34] Hardcoded test tokens in Slack test config
- **File**: `packages/channels-extra/src/__tests__/slack/slack-channel.test.ts`:12
- **Category**: code-quality / hardcoded-config
- **Confidence**: 78
- **Reported by**: review-code
- **Description**: Test file falls back to hardcoded 'test-bot-token' strings. Not real secrets, but normalizes the pattern.
- **Suggestion**: Extract test fixture configs to a shared test helper.

### [35] connectAll/disconnectAll callers must check each result manually
- **File**: `packages/channels-extra/src/channel-registry.ts`:42
- **Category**: error-handling / result-pattern-opportunity
- **Confidence**: 78
- **Reported by**: review-errors
- **Description**: Result-like pattern is good, but no ergonomic way to check if ANY channel failed without iterating.
- **Suggestion**: Consider adding AggregateError or a `hasFailures()` helper.

### [36] Slack connect() uses if/else where guard clause is cleaner
- **File**: `packages/channels-extra/src/slack/index.ts`:61
- **Category**: simplification / guard-clause
- **Confidence**: 78
- **Reported by**: review-simplify
- **Description**: WhatsApp already uses the cleaner guard-clause pattern. Slack should match for consistency.
- **Suggestion**: Flip to: `if (!this.deps) { throw ... }` then proceed with happy path.

### [37] ChannelOperationResult uses boolean+optional error instead of discriminated union
- **File**: `packages/channels-extra/src/channel-registry.ts`:3
- **Category**: type-design / result-type-design
- **Confidence**: 78
- **Reported by**: review-types
- **Description**: Allows illegal states like `{ success: true, error: new Error() }`.
- **Suggestion**: Use discriminated union: `{ success: true } | { success: false; error: Error }`.

### [38] IncomingMessage.id is plain string across both platforms
- **File**: `packages/channels-extra/src/types.ts`:10
- **Category**: type-design / primitive-obsession
- **Confidence**: 76
- **Reported by**: review-types
- **Description**: id carries platform-specific semantics (Slack ts vs WhatsApp key.id). Branded type would prevent accidental cross-platform comparison.
- **Suggestion**: Consider branded type `MessageId` or at minimum add JSDoc documenting format.

## Positive Observations
- Clean Channel interface design with proper readonly properties and unsubscribe pattern (returns dispose function from onMessage/onStatusChange)
- Discriminated union for ChannelConfig using platform literal types provides compile-time safety when adding new channel types
- Test Double rationale comments properly documented for both Slack and WhatsApp external service stubs
- Fault isolation in ChannelRegistry.connectAll() -- one channel failure does not prevent others from connecting
- Good test coverage: lifecycle, message dispatch, bot filtering, rate limiting, unsubscribe, pre-connect guard, duplicate registration prevention
- Zero forbidden patterns (TODO/FIXME/HACK/PLACEHOLDER/TEMP) found across all source files
- All functions are short (under 30 lines), cyclomatic complexity per function stays in the 1-4 range
- Error coercion pattern (error instanceof Error ? error : new Error(String(error))) handles non-Error throws correctly
- Dependency injection via constructor deps parameter enables testability without module-level mocks
- Channel registry tests cover the full CRUD lifecycle: register, retrieve, list, unregister, and duplicate prevention

## Recommended Action Plan
1. **Fix 6 error-handling P1s in a single pass**: Add try/catch + error logging to all handler dispatch loops (3 message handler loops + 2 setStatus loops + connect() error handling). This addresses findings [1], [2], [7], [8], [9] and enables the 'error' status state
2. **Add structured logging**: Import @guiiai/logg in all 3 production modules, log lifecycle events -- this resolves finding [5] and improves the error handler suggestions from step 1
3. **Fix 2 type-safety P1s**: Add platform-mismatch guard to register() and return readonly copies from getByPlatform()/listAll() -- findings [12], [13]
4. **Remove unused dependency**: Delete better-sqlite3 from package.json -- finding [6]
5. **Add 3 missing test scenarios**: onAnyMessage delivery, connect-without-deps errors, disconnectAll fault isolation -- findings [10], [11], [25]
6. **Wire the package to a consumer**: Add @proj-airi/channels-extra as a dependency in the target app and create a minimal integration -- finding [3]
7. Run `/ultra-review recheck` to verify P1 count drops below threshold
