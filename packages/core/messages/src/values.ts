import {
  contentBlockFromRepresentation,
  copyJsonValue,
  type JsonValue,
  type JsonNumber,
  type OpaqueJson,
  type ContentBlock,
  type ToolResultBlock,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseScopeLayerIdentity,
  parseTenantId,
  type OpaqueIdentifier,
  type ScopeLayerIdentity,
} from '@omne-harness-lite/identity-values'
import type { ModelProfileRef } from '@omne-harness-lite/model-profile'
import type {
  Message,
  ModelInvocationRecord,
  ReminderSource,
  PlainMessageBlock,
  AssistantMessage,
  ToolMessageResult,
  ModelCallCreatedPayload,
} from './types.ts'
import { validate } from './schema.ts'

export type Wire<T> =
  T extends OpaqueIdentifier<string>
    ? string
    : T extends OpaqueJson
      ? JsonValue
      : T extends JsonNumber
        ? T
        : T extends readonly unknown[]
          ? { readonly [Key in keyof T]: Wire<T[Key]> }
          : T extends object
            ? { readonly [Key in keyof T]: Wire<T[Key]> }
            : T
export function isWireMessage(value: JsonValue): value is JsonValue & Wire<Message> {
  return validate('Message', value).valid
}
export function isWireRecord(value: JsonValue): value is JsonValue & Wire<ModelInvocationRecord> {
  return validate('ModelInvocationRecord', value).valid
}
function id<B extends string>(value: string, brand: B): OpaqueIdentifier<B> {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!('ok' in parsed)) throw new Error('validated message identifier failed branding')
  return parsed.ok
}
function block(value: unknown): ContentBlock {
  return contentBlockFromRepresentation(value)
}
function plain(value: unknown): PlainMessageBlock {
  const branded = block(value)
  switch (branded.kind) {
    case 'text': {
      if (branded.origin !== undefined) throw new Error('validated plain block has an origin')
      const { origin, ...rest } = branded
      return Object.freeze(rest)
    }
    case 'voice':
    case 'image':
    case 'file':
      return branded
    default:
      throw new Error('validated plain block has another kind')
  }
}
function assistantComplete(
  value: unknown,
): Extract<AssistantMessage, { readonly ending: 'complete' }>['blocks'][number] {
  const branded = block(value)
  if (branded.kind === 'text') return plain(value)
  if (branded.kind === 'tool_result' || (branded.kind === 'tool_call' && !branded.complete))
    throw new Error('invalid complete assistant block')
  return branded
}
function assistantInterrupted(value: unknown): AssistantMessage['blocks'][number] {
  const branded = block(value)
  if (branded.kind === 'text') return plain(value)
  if (branded.kind === 'tool_result') throw new Error('invalid assistant result block')
  return branded
}
function toolResult(value: unknown): ToolResultBlock {
  const branded = block(value)
  if (branded.kind !== 'tool_result') throw new Error('validated tool message lacks a result')
  return branded
}
function toolMessageResult(value: unknown): ToolMessageResult {
  const branded = toolResult(value)
  if (branded.outcome !== 'interrupted') return branded
  if (branded.reason.code === 'terminated_by_agent')
    throw new Error('invalid foreground tool reason')
  return Object.freeze({
    ...branded,
    reason: Object.freeze({ code: branded.reason.code, text: branded.reason.text }),
  })
}
function scope(value: Wire<ScopeLayerIdentity>): ScopeLayerIdentity {
  const parsed = parseScopeLayerIdentity(value)
  if (!('ok' in parsed)) throw new Error('validated scope failed branding')
  return parsed.ok
}
function profileRef(value: Wire<ModelProfileRef>): ModelProfileRef {
  return value.origin === 'official'
    ? value
    : Object.freeze({ ...value, scope: scope(value.scope) })
}
/** Shape-only transport adapter; complete record judgment remains with its receiver. */
export function brandRecord(source: unknown): ModelInvocationRecord {
  const copied = copyJsonValue(source)
  if ('failed' in copied || !isWireRecord(copied.ok))
    throw new TypeError('ModelInvocationRecord Schema representation required')
  const value: Wire<ModelInvocationRecord> = copied.ok
  if (value.kind === 'model_call_created')
    return Object.freeze({ ...value, creationKey: id(value.creationKey, 'CreationKey') })
  if (
    value.kind === 'model_call_ended' &&
    value.ending === 'undispatched' &&
    value.creationKey !== undefined
  )
    return Object.freeze({ ...value, creationKey: id(value.creationKey, 'CreationKey') })
  if (value.kind === 'model_call_acknowledged') {
    if (value.target.kind === 'ended') {
      const { accountingWitness, retainedResultDigest, ...common } = value
      return Object.freeze({ ...common, creationKey: id(value.creationKey, 'CreationKey') })
    }
    const witness = value.accountingWitness
    if (witness === undefined) {
      const { accountingWitness, ...common } = value
      return Object.freeze({ ...common, creationKey: id(value.creationKey, 'CreationKey') })
    }
    const tenant = parseTenantId(witness.origin.tenant)
    if (!('ok' in tenant)) throw new Error('validated witness tenant failed branding')
    const credentialScope =
      witness.credentialScope.layer === 'factory'
        ? Object.freeze({ layer: 'factory' as const })
        : scope(witness.credentialScope)
    if (credentialScope.layer !== witness.credentialScope.layer)
      throw new Error('validated witness credential scope changed layer')
    return Object.freeze({
      ...value,
      creationKey: id(value.creationKey, 'CreationKey'),
      accountingWitness: Object.freeze({
        ...witness,
        origin: Object.freeze({
          ...witness.origin,
          tenant: tenant.ok,
          session: id(witness.origin.session, 'SessionRef'),
        }),
        credentialScope,
      }),
    })
  }
  if (value.kind !== 'model_call_dispatched') return Object.freeze(value)
  if (value.credentialScope.layer === 'factory')
    return Object.freeze({
      ...value,
      profile: profileRef(value.profile),
      credentialScope: Object.freeze({ layer: 'factory' as const }),
    })
  const branded = scope(value.credentialScope)
  if (branded.layer !== 'tenant') throw new Error('validated credential scope is not tenant')
  return Object.freeze({ ...value, profile: profileRef(value.profile), credentialScope: branded })
}
function source(value: Wire<ReminderSource>): ReminderSource {
  switch (value.kind) {
    case 'background_execution_finished':
    case 'background_execution_interrupted':
      return Object.freeze({ ...value, callId: id(value.callId, 'CallId') })
    case 'system_wait_answered':
      return Object.freeze({ ...value, cardId: id(value.cardId, 'CardId') })
    case 'peer_session_note': {
      const { fromAgent, ...rest } = value
      return Object.freeze({
        ...rest,
        fromSession: id(value.fromSession, 'SessionRef'),
        ...(fromAgent === undefined ? {} : { fromAgent: id(fromAgent, 'AgentRef') }),
      })
    }
    case 'scheduled_trigger':
      return Object.freeze({ ...value, schedule: id(value.schedule, 'ScheduleRef') })
    case 'runtime_context_changed':
      return Object.freeze({ ...value, block: id(value.block, 'RuntimeContextBlockId') })
    default:
      return value
  }
}
/** Shape-only transport adapter; message uniqueness and pairing remain with its receiver. */
export function brandMessage(representation: unknown): Message {
  const copied = copyJsonValue(representation)
  if ('failed' in copied || !isWireMessage(copied.ok))
    throw new TypeError('Message Schema representation required')
  const value: Wire<Message> = copied.ok
  const base = { ...value, id: id(value.id, 'MessageId') }
  switch (value.type) {
    case 'system': {
      const blocks = value.blocks.map(item => {
        const branded = plain(item)
        if (branded.kind !== 'text') throw new Error('validated system contains non-text')
        return branded
      })
      return Object.freeze({ ...base, type: 'system', blocks: Object.freeze(blocks) })
    }
    case 'user': {
      const blocks = value.blocks.map(item => {
        const branded = block(item)
        if (
          branded.kind === 'thinking' ||
          branded.kind === 'tool_call' ||
          branded.kind === 'tool_result'
        )
          throw new Error('invalid user block')
        return branded
      })
      return Object.freeze({ ...base, type: 'user', blocks: Object.freeze(blocks) })
    }
    case 'assistant':
      if (value.ending === 'complete')
        return Object.freeze({
          ...base,
          type: 'assistant',
          response: value.response,
          ending: 'complete',
          blocks: Object.freeze(value.blocks.map(assistantComplete)),
        })
      return Object.freeze({
        ...base,
        type: 'assistant',
        response: value.response,
        ending: value.ending,
        blocks: Object.freeze(value.blocks.map(assistantInterrupted)),
      })
    case 'tool': {
      const result = toolMessageResult(value.blocks[0])
      return Object.freeze({
        ...base,
        type: 'tool',
        callId: id(value.callId, 'CallId'),
        blocks: Object.freeze([result] as const),
      })
    }
    case 'tool_internal': {
      const blocks = value.blocks.map(item => {
        const branded = plain(item)
        if (branded.visibility.toModel !== false) throw new Error('invalid internal visibility')
        return Object.freeze({
          ...branded,
          visibility: Object.freeze({ ...branded.visibility, toModel: false as const }),
        })
      })
      return Object.freeze({
        ...base,
        type: 'tool_internal',
        callId: id(value.callId, 'CallId'),
        ending: value.ending,
        blocks: Object.freeze(blocks),
      })
    }
    case 'system_reminder': {
      const brandedSource = source(value.source)
      const blocks = Object.freeze(
        value.blocks.map(item => (item.kind === 'tool_result' ? toolResult(item) : plain(item))),
      )
      const reminder = { ...base, type: 'system_reminder' as const, blocks }
      if (
        brandedSource.kind === 'runtime_context_changed' ||
        brandedSource.kind === 'runtime_context_snapshot'
      )
        return Object.freeze({ ...reminder, nature: 'state', source: brandedSource })
      if (brandedSource.kind === 'extension')
        return Object.freeze({ ...reminder, nature: value.nature, source: brandedSource })
      return Object.freeze({ ...reminder, nature: 'event', source: brandedSource })
    }
    case 'compaction':
      return Object.freeze({
        ...base,
        type: 'compaction',
        blocks: Object.freeze(value.blocks.map(plain)),
        silenced: Object.freeze(
          value.silenced.map(ref =>
            Object.freeze({
              messageId: id(ref.messageId, 'MessageId'),
              blockId: id(ref.blockId, 'BlockId'),
            }),
          ),
        ),
      })
  }
}

export function isWireCreatedPayload(
  value: JsonValue,
): value is JsonValue & Wire<ModelCallCreatedPayload> {
  return validate('ModelCallCreatedPayload', value).valid
}
/** Shape-only adapter; cross-member predicates remain with the complete judge. */
export function brandCreatedPayload(source: unknown): ModelCallCreatedPayload {
  const copied = copyJsonValue(source)
  if ('failed' in copied || !isWireCreatedPayload(copied.ok))
    throw new TypeError('ModelCallCreatedPayload Schema representation required')
  const value: Wire<ModelCallCreatedPayload> = copied.ok
  const tenant = parseTenantId(value.origin.tenant)
  if (!('ok' in tenant)) throw new Error('validated tenant failed branding')
  const origin = Object.freeze({
    ...value.origin,
    tenant: tenant.ok,
    session: id(value.origin.session, 'SessionRef'),
  })
  const { status, adopted, cause, ...common } = value
  const base = {
    ...common,
    origin,
    ref: Object.freeze({ ...value.ref, session: id(value.ref.session, 'SessionRef') }),
    creationKey: id(value.creationKey, 'CreationKey'),
    input: Object.freeze({
      ...value.input,
      basis: Object.freeze({
        ...value.input.basis,
        profile: profileRef(value.input.basis.profile),
      }),
      messages: Object.freeze(value.input.messages.map(brandMessage)),
    }),
  }
  if (value.status === 'rejected')
    return Object.freeze({ ...base, status: 'rejected', cause: value.cause })
  const credential = value.adopted.profile
  return Object.freeze({
    ...base,
    status: 'accepted',
    adopted: Object.freeze({
      ...value.adopted,
      profile: profileRef(credential),
      messages: Object.freeze(value.adopted.messages.map(brandMessage)),
    }),
  })
}
