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

export function continuedMessages(projection: ReplayProjection): ReadonlySet<MessageId> {
  return new Set(projection.treatments.filter(item => item.continuable).map(item => item.message))
}
