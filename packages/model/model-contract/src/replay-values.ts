import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  isReplayTag,
  type AssistantMessage,
  type Message,
  type MessageId,
} from '@omne-harness/message'
import type {
  ForeignThinking,
  ReplayDeclaration,
  ReplayDiagnostic,
  ReplayOmission,
  ReplayProjection,
  ReplayProjectionInput,
  ReplayTreatment,
} from './profile.ts'
import type { ModelFailure } from './result.ts'
import { decodeModelCallId } from './identity-values.ts'
import type { ModelCallId } from './root.ts'

const FOREIGN_THINKING: readonly ForeignThinking[] = ['omit', 'text', 'adapter']

function isForeignThinking(value: unknown): value is ForeignThinking {
  return FOREIGN_THINKING.some(item => item === value)
}

function invalid(index: number, reason: string) {
  return fail({ kind: 'invalid', field: `suppliers[${index}].replay`, reason } as const)
}

const REPLAY_KEYS: ReadonlySet<PropertyKey> = new Set(['produces', 'accepts', 'foreignThinking'])

type DeclaredReplay = Readonly<{ produces?: unknown; accepts?: unknown; foreignThinking?: unknown }>

function ownData(raw: object, key: PropertyKey): { value: unknown } | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(raw, key)
  if (descriptor === undefined || descriptor.enumerable !== true) return undefined
  return 'value' in descriptor ? { value: descriptor.value } : undefined
}

function readDeclared(raw: unknown): DeclaredReplay | undefined {
  if (raw === undefined) return {}
  if (raw === null) return undefined
  const proto: unknown = Object.getPrototypeOf(raw)
  if (proto !== Object.prototype && proto !== null) return undefined
  const read: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(raw)) {
    const field = REPLAY_KEYS.has(key) ? ownData(raw, key) : undefined
    if (field === undefined) return undefined
    read[String(key)] = field.value
  }
  return read
}

function readItems(raw: readonly unknown[]): unknown[] | undefined {
  const items: unknown[] = []
  for (let position = 0; position < raw.length; position += 1) {
    const item = ownData(raw, position)
    if (item === undefined) return undefined
    items.push(item.value)
  }
  return items
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalArray(value: unknown): value is readonly unknown[] | undefined {
  return value === undefined || Array.isArray(value)
}

function checkTags(produces: string, accepts: readonly unknown[] | undefined): string[] | string {
  if (!isReplayTag(produces)) return 'produces'
  if (accepts === undefined || !accepts.every(isReplayTag)) return 'accepts'
  if (new Set(accepts).size !== accepts.length) return 'accepts-duplicate'
  return accepts.includes(produces) ? [...accepts] : 'accepts-lacks-produces'
}

export function judgeReplayDeclaration(
  supplier: Readonly<{ provider: string; model: string; replay?: unknown }>,
  index: number,
): Outcome<ReplayDeclaration, Extract<ModelFailure, { kind: 'invalid' }>> {
  const declared = readDeclared(supplier.replay)
  if (declared === undefined) return invalid(index, 'replay')
  if (!isOptionalText(declared.produces)) return invalid(index, 'produces')
  if (!isOptionalArray(declared.accepts)) return invalid(index, 'accepts')
  const produces = declared.produces ?? `${supplier.provider}/${supplier.model}`
  const accepts = declared.accepts === undefined ? [produces] : readItems(declared.accepts)
  const tags = checkTags(produces, accepts)
  if (typeof tags === 'string') return invalid(index, tags)
  const foreignThinking = declared.foreignThinking === undefined ? 'omit' : declared.foreignThinking
  if (!isForeignThinking(foreignThinking)) return invalid(index, 'foreign-thinking')
  return succeed(Object.freeze({ produces, accepts: Object.freeze(tags), foreignThinking }))
}

export function projectReplay(input: ReplayProjectionInput): ReplayProjection {
  const accepted: ReadonlySet<string> = new Set(input.declaration.accepts)
  const treatments: ReplayTreatment[] = []
  const diagnostics: ReplayDiagnostic[] = []
  const prefix = createPrefix(input.system, input.tools)
  input.messages.forEach((message, index) => {
    if (message.role === 'assistant') {
      const omission = omissionOf(message, input, accepted, prefix.current())
      const treatment = treat(message, index, omission === null, input.declaration.foreignThinking)
      treatments.push(treatment)
      const diagnostic =
        omission === null || omission === 'off' ? null : diagnose(message, omission)
      if (diagnostic !== null) diagnostics.push(diagnostic)
      prefix.add(message, treatment.continuable)
    } else prefix.add(message, null)
  })
  return Object.freeze({
    treatments: Object.freeze(treatments),
    diagnostics: Object.freeze(diagnostics),
    prefix: prefix.current(),
  })
}

// T1: the first rule that holds decides; null carries the state.
function omissionOf(
  message: AssistantMessage,
  input: ReplayProjectionInput,
  accepted: ReadonlySet<string>,
  prefix: string,
): ReplayOmission | 'off' | null {
  const { replay } = message
  if (input.off) return 'off'
  if (replay === undefined || !accepted.has(replay.scope)) return 'scope'
  if (!input.formats.has(replay.format)) return 'format'
  if (input.resent.has(message.id)) return 'resent'
  if (input.binding === 'none') return null
  if (replay.prefix === undefined) return 'no-prefix'
  return changedPart(replay.prefix, prefix)
}

const PARTS = [
  ['h', 'prefix-history'],
  ['s', 'prefix-system'],
  ['t', 'prefix-tools'],
  ['p', 'prefix-projection'],
] as const

function changedPart(recorded: string, current: string): ReplayOmission | null {
  const was = new Map(recorded.split('.').map(part => [part.slice(0, 1), part]))
  const now = new Map(current.split('.').map(part => [part.slice(0, 1), part]))
  for (const [key, reason] of PARTS) if (was.get(key) !== now.get(key)) return reason
  return null
}

// The prefix is four digests in our own form: the history before a message, the system prompt,
// the tool declarations, and the carry decisions taken so far.
function createPrefix(system: unknown, tools: unknown) {
  let history = digest(['history'])
  let projection = digest(['projection'])
  const fixed = `s:${digest(system)}.t:${digest(tools)}`
  return {
    current: () => `h:${history}.${fixed}.p:${projection}`,
    add(message: Message, carried: boolean | null) {
      history = digest([history, message])
      if (carried !== null) projection = digest([projection, message.id, carried])
    },
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      // The keys of one object are distinct, so no two compare equal.
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`)
      .join(',')}}`
  return value === undefined ? 'null' : JSON.stringify(value)
}

// Two FNV-1a 64-bit passes with different offsets: equality of prefixes only, no secret in them.
function digest(value: unknown): string {
  const text = canonical(value)
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  let a = 0xcbf29ce484222325n
  let b = 0x84222325cbf29ce4n
  for (let index = 0; index < text.length; index += 1) {
    const code = BigInt(text.charCodeAt(index))
    a = ((a ^ code) * prime) & mask
    b = ((b ^ (code + 0x9en)) * prime) & mask
  }
  return a.toString(16).padStart(16, '0') + b.toString(16).padStart(16, '0')
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

function diagnose(message: AssistantMessage, reason: ReplayOmission): ReplayDiagnostic | null {
  const { replay } = message
  if (replay === undefined || replay.at.length === 0) return null
  return Object.freeze({
    message: message.id,
    scope: replay.scope,
    format: replay.format,
    omittedParts: replay.at.length,
    reason,
  })
}

export function continuedMessages(projection: ReplayProjection): ReadonlySet<MessageId> {
  return new Set(projection.treatments.filter(item => item.continuable).map(item => item.message))
}

/** The call a reply names in its replay mark: the one whose output its reasoning state is metered by. */
export function replaySourceCall(message: Message): ModelCallId | null {
  if (message.role !== 'assistant' || message.replay?.call === undefined) return null
  const decoded = decodeModelCallId(message.replay.call)
  return 'ok' in decoded ? decoded.ok : null
}
