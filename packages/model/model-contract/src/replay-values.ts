// Runtime values of the design section "推理回放": the replay declaration of a supplier and the
// replay projection that an adapter and a meter share. This file imports types only from the
// chapter files. Nothing here reads the payload of a reasoning state part.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isReplayTag, type AssistantMessage, type MessageId } from '@omne-harness/message'
import type {
  ForeignThinking,
  ReplayDeclaration,
  ReplayDiagnostic,
  ReplayProjection,
  ReplayProjectionInput,
  ReplayTreatment,
} from './profile.ts'
import type { ModelFailure } from './result.ts'

const FOREIGN_THINKING: readonly ForeignThinking[] = ['omit', 'text', 'adapter']

function isForeignThinking(value: unknown): value is ForeignThinking {
  return FOREIGN_THINKING.some(item => item === value)
}

function invalid(index: number, reason: string) {
  return fail({ kind: 'invalid', field: `suppliers[${index}].replay`, reason } as const)
}

const REPLAY_KEYS: readonly string[] = ['produces', 'accepts', 'foreignThinking']

/** The three keys of a stored declaration, each one as read, or absent. */
type DeclaredReplay = Readonly<{ produces?: unknown; accepts?: unknown; foreignThinking?: unknown }>

/**
 * The keys of a declaration as stored, read once each by descriptor, or `undefined` when the value
 * is not a plain object with only the three keys as enumerable data properties. An accessor is
 * never called and the prototype chain is never read. A key whose value is `undefined` is absent.
 * `undefined` as the whole value is a declaration without keys.
 */
function readDeclared(raw: unknown): DeclaredReplay | undefined {
  if (raw === undefined) return {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const proto: unknown = Object.getPrototypeOf(raw)
  if (proto !== Object.prototype && proto !== null) return undefined
  const read: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== 'string' || !REPLAY_KEYS.includes(key)) return undefined
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor))
      return undefined
    if (descriptor.value !== undefined) read[key] = descriptor.value
  }
  return read
}

/**
 * The items of a stored array, each read once by descriptor, or `undefined` when an item is a hole
 * or an accessor. An accessor is never called.
 */
function readItems(raw: readonly unknown[]): unknown[] | undefined {
  const items: unknown[] = []
  for (let position = 0; position < raw.length; position += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, position)
    if (descriptor === undefined || !('value' in descriptor)) return undefined
    items.push(descriptor.value)
  }
  return items
}

/**
 * Reads, expands and checks the declaration of the supplier at `index` of a profile definition.
 * `replay` is typed `unknown` because it comes from a store or a configuration. The success value
 * is the declaration with every default applied and is frozen: `produces` is the exact model
 * identity (recipient, `/`, model), `accepts` holds only `produces`, `foreignThinking` is `omit`.
 * The first failure in this order is returned: the shape of `replay` as stored, a `produces` that
 * is not text, an `accepts` that is not an array, `produces` (also when it is a default that is
 * too long), each item of `accepts`, duplicates, `produces` missing from `accepts`,
 * `foreignThinking`. `field` is `suppliers[index].replay`.
 */
export function judgeReplayDeclaration(
  supplier: Readonly<{ recipient: string; model: string; replay?: unknown }>,
  index: number,
): Outcome<ReplayDeclaration, Extract<ModelFailure, { kind: 'invalid' }>> {
  const declared = readDeclared(supplier.replay)
  if (declared === undefined) return invalid(index, 'replay')
  if (declared.produces !== undefined && typeof declared.produces !== 'string')
    return invalid(index, 'produces')
  if (declared.accepts !== undefined && !Array.isArray(declared.accepts))
    return invalid(index, 'accepts')
  const produces = declared.produces ?? `${supplier.recipient}/${supplier.model}`
  const accepts = declared.accepts === undefined ? [produces] : readItems(declared.accepts)
  if (!isReplayTag(produces)) return invalid(index, 'produces')
  if (accepts === undefined || !accepts.every(isReplayTag)) return invalid(index, 'accepts')
  if (new Set(accepts).size !== accepts.length) return invalid(index, 'accepts-duplicate')
  if (!accepts.includes(produces)) return invalid(index, 'accepts-lacks-produces')
  // A null is a stored value that is not a choice, so `??` would hide it.
  const foreignThinking = declared.foreignThinking === undefined ? 'omit' : declared.foreignThinking
  if (!isForeignThinking(foreignThinking)) return invalid(index, 'foreign-thinking')
  return succeed(Object.freeze({ produces, accepts: Object.freeze(accepts), foreignThinking }))
}

/**
 * The replay projection of one dispatch: one treatment for each message of the role assistant, in
 * the order of `messages`, and the diagnostics of the messages that lose reasoning state parts.
 * A message can continue when it has `replay`, its `scope` is in `accepts`, its `format` is known,
 * replay is not off and a re-dispatch does not leave it out. A part is found by `replay.at`.
 */
export function projectReplay(input: ReplayProjectionInput): ReplayProjection {
  const accepted: ReadonlySet<string> = new Set(input.declaration.accepts)
  const treatments: ReplayTreatment[] = []
  const diagnostics: ReplayDiagnostic[] = []
  input.messages.forEach((message, index) => {
    if (message.role !== 'assistant') return
    const continuable = canContinue(message, input, accepted)
    treatments.push(treat(message, index, continuable, input.declaration.foreignThinking))
    const diagnostic = continuable ? null : diagnose(message)
    if (diagnostic !== null) diagnostics.push(diagnostic)
  })
  return Object.freeze({
    treatments: Object.freeze(treatments),
    diagnostics: Object.freeze(diagnostics),
  })
}

function canContinue(
  message: AssistantMessage,
  input: ReplayProjectionInput,
  accepted: ReadonlySet<string>,
): boolean {
  const { replay } = message
  if (input.off || replay === undefined || input.resent.has(message.id)) return false
  return accepted.has(replay.scope) && input.formats.has(replay.format)
}

function treat(
  message: AssistantMessage,
  index: number,
  continuable: boolean,
  foreignThinking: ForeignThinking,
): ReplayTreatment {
  const at = message.replay?.at ?? []
  const identity = { index, message: message.id }
  return continuable
    ? Object.freeze({ ...identity, continuable: true, carry: at, thinking: 'native' })
    : Object.freeze({ ...identity, continuable: false, omit: at, thinking: foreignThinking })
}

/** The diagnostic of a message that cannot continue and so loses its parts, or null. */
function diagnose(message: AssistantMessage): ReplayDiagnostic | null {
  const { replay } = message
  if (replay === undefined || replay.at.length === 0) return null
  return Object.freeze({
    message: message.id,
    scope: replay.scope,
    format: replay.format,
    omittedParts: replay.at.length,
  })
}

/**
 * The messages that a projection continues. A re-dispatch after `replay-rejected` passes them as
 * `resent`, so none of them continues again.
 */
export function continuedMessages(projection: ReplayProjection): ReadonlySet<MessageId> {
  return new Set(projection.treatments.filter(item => item.continuable).map(item => item.message))
}
