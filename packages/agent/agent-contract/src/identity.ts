import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { Adoption, DurableEvidence } from '@omne-harness/exchange-refs'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  identityMember,
  ownMembers,
  refusal,
  textMember,
  unknownMember,
  type OwnMembers,
} from './structure.ts'

declare const agentIdentity: unique symbol
export type AgentIdentity<K extends string> = string & { readonly [agentIdentity]: K }
export type AgentInstanceId = AgentIdentity<'AgentInstanceId'>
export type StepId = AgentIdentity<'AgentStepId'>
export type ActionId = AgentIdentity<'AgentActionId'>
export type PassageId = AgentIdentity<'AgentPassageId'>
export type CardRoundId = AgentIdentity<'AgentCardRoundId'>
export type ActionBatchId = AgentIdentity<'AgentActionBatchId'>
export type AgentExecutionId = AgentIdentity<'AgentExecutionId'>
export type ExecutionAttachmentId = AgentIdentity<'ExecutionAttachmentId'>
export type AgentRegistrationId = AgentIdentity<'AgentRegistrationId'>
export type AgentOperationId = AgentIdentity<'AgentOperationId'>
export type ExecutionRevision = AgentIdentity<'ExecutionRevision'>
export type InputId = AgentIdentity<'AgentInputId'>
export type InputBatchId = AgentIdentity<'AgentInputBatchId'>
export type ConsumptionId = AgentIdentity<'AgentConsumptionId'>
export type ReplyAdmissionSequence = AgentIdentity<'ReplyAdmissionSequence'>
export type ReplyAdmissionPageCursor = AgentIdentity<'ReplyAdmissionPageCursor'>
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'
export type { Access } from '@omne-harness/legal-identity'
export type Authority = Readonly<{
  execution: AgentExecutionId
  executionAttachment: ExecutionAttachmentId
  instance: AgentInstanceId
  generation: string
  source: DurableEvidence
}>
export type Continuation = Readonly<{
  position: string
  definition: Adoption
  schema: Adoption
  value: JsonValue
}>
export type AgentInstant = string
declare const utcInstantText: unique symbol
export type UtcInstantText = string & { readonly [utcInstantText]: 'UtcInstantText' }

export type IdentityFailure<K extends string = string> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'character'
}>

export type StructureFailure = Readonly<{
  field: string
  reason: 'type' | 'empty' | 'unknown-field' | 'missing' | 'identity'
}>

export const AGENT_IDENTITY_MAX_LENGTH = 256

const IDENTITY_TEXT = /^[\x21-\x7e]+$/u

type IdentityDecoder<T extends AgentIdentity<string>, N extends string> = (
  value: unknown,
) => Outcome<T, IdentityFailure<N>>

function decoderOf<T extends AgentIdentity<string>, N extends string>(
  name: N,
): IdentityDecoder<T, N> {
  return value => {
    if (typeof value !== 'string') return fail({ field: name, reason: 'type' })
    if (value.length === 0) return fail({ field: name, reason: 'empty' })
    if (value.length > AGENT_IDENTITY_MAX_LENGTH) return fail({ field: name, reason: 'length' })
    if (!IDENTITY_TEXT.test(value)) return fail({ field: name, reason: 'character' })
    return succeed(value as T)
  }
}

export const decodeAgentInstanceId = decoderOf<AgentInstanceId, 'AgentInstanceId'>(
  'AgentInstanceId',
)
export const decodeStepId = decoderOf<StepId, 'StepId'>('StepId')
export const decodeActionId = decoderOf<ActionId, 'ActionId'>('ActionId')
export const decodePassageId = decoderOf<PassageId, 'PassageId'>('PassageId')
const ADMISSION_SUFFIX = '/admission'

export function admissionPassageOf(action: ActionId): ReturnType<typeof decodePassageId> {
  return decodePassageId(`${action}${ADMISSION_SUFFIX}`)
}

export function admissionActionOf(passage: PassageId): ActionId | null {
  if (!passage.endsWith(ADMISSION_SUFFIX)) return null
  const action = decodeActionId(passage.slice(0, -ADMISSION_SUFFIX.length))
  return 'ok' in action ? action.ok : null
}

export const decodeCardRoundId = decoderOf<CardRoundId, 'CardRoundId'>('CardRoundId')
export const decodeActionBatchId = decoderOf<ActionBatchId, 'ActionBatchId'>('ActionBatchId')
export const decodeAgentExecutionId = decoderOf<AgentExecutionId, 'AgentExecutionId'>(
  'AgentExecutionId',
)
export const decodeExecutionAttachmentId = decoderOf<
  ExecutionAttachmentId,
  'ExecutionAttachmentId'
>('ExecutionAttachmentId')
export const decodeAgentRegistrationId = decoderOf<AgentRegistrationId, 'AgentRegistrationId'>(
  'AgentRegistrationId',
)
export const decodeAgentOperationId = decoderOf<AgentOperationId, 'AgentOperationId'>(
  'AgentOperationId',
)
export const decodeExecutionRevision = decoderOf<ExecutionRevision, 'ExecutionRevision'>(
  'ExecutionRevision',
)
export const decodeInputId = decoderOf<InputId, 'InputId'>('InputId')
export const decodeInputBatchId = decoderOf<InputBatchId, 'InputBatchId'>('InputBatchId')
export const decodeConsumptionId = decoderOf<ConsumptionId, 'ConsumptionId'>('ConsumptionId')
export const decodeReplyAdmissionPageCursor = decoderOf<
  ReplyAdmissionPageCursor,
  'ReplyAdmissionPageCursor'
>('ReplyAdmissionPageCursor')

const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/u

export function decodeReplyAdmissionSequence(
  value: unknown,
): Outcome<ReplyAdmissionSequence, IdentityFailure<'ReplyAdmissionSequence'>> {
  const field = 'ReplyAdmissionSequence'
  if (typeof value !== 'string') return fail({ field, reason: 'type' })
  if (value.length === 0) return fail({ field, reason: 'empty' })
  if (value.length > AGENT_IDENTITY_MAX_LENGTH) return fail({ field, reason: 'length' })
  if (!CANONICAL_DECIMAL.test(value)) return fail({ field, reason: 'character' })
  return succeed(value as ReplyAdmissionSequence)
}

function judgeTextRecord<K extends string>(
  value: unknown,
  structure: string,
  names: readonly K[],
): Outcome<Readonly<Record<K, string>>, StructureFailure> {
  const members = ownMembers(value)
  if (members === undefined) return refusal(structure, 'type')
  const copy = {} as Record<K, string>
  for (const name of names) {
    const text = textMember(members, name)
    if ('failure' in text) return text
    copy[name] = text.ok
  }
  const extra = unknownMember(members, names)
  if (extra !== undefined) return refusal(extra, 'unknown-field')
  return succeed(Object.freeze(copy))
}

const ADOPTION_FIELDS = ['owner', 'name', 'revision', 'digest'] as const
const EVIDENCE_FIELDS = ['owner', 'record', 'revision', 'digest'] as const

export function judgeAdoption(value: unknown): Outcome<Adoption, StructureFailure> {
  return judgeTextRecord(value, 'Adoption', ADOPTION_FIELDS)
}

export function judgeEvidence(value: unknown): Outcome<DurableEvidence, StructureFailure> {
  return judgeTextRecord(value, 'Evidence', EVIDENCE_FIELDS)
}

function isTenantId(value: unknown): value is TenantId {
  return tenantCodec.encode(value as TenantId).ok
}

export function judgeAccess<P>(
  value: unknown,
  judgePrincipal: (value: unknown) => Outcome<P, StructureFailure>,
): Outcome<Access<P>, StructureFailure> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('Access', 'type')
  if (!Object.hasOwn(members, 'principal')) return refusal('principal', 'missing')
  if (!Object.hasOwn(members, 'tenant')) return refusal('tenant', 'missing')
  const principal = judgePrincipal(members['principal'])
  if ('failure' in principal) {
    return refusal(`principal.${principal.failure.field}`, principal.failure.reason)
  }
  if (!isTenantId(members['tenant'])) return refusal('tenant', 'type')
  const extra = unknownMember(members, ['principal', 'tenant'])
  if (extra !== undefined) return refusal(extra, 'unknown-field')
  return succeed(Object.freeze({ principal: principal.ok, tenant: members['tenant'] }))
}

const AUTHORITY_FIELDS = [
  'execution',
  'executionAttachment',
  'instance',
  'generation',
  'source',
] as const

function sourceMember(members: OwnMembers): Outcome<DurableEvidence, StructureFailure> {
  if (!Object.hasOwn(members, 'source')) return refusal('source', 'missing')
  const source = judgeEvidence(members['source'])
  if (!('failure' in source)) return source
  const { field, reason } = source.failure
  return refusal(field === 'Evidence' ? 'source' : `source.${field}`, reason)
}

export function judgeAuthority(value: unknown): Outcome<Authority, StructureFailure> {
  const members = ownMembers(value)
  if (members === undefined) return refusal('Authority', 'type')
  const execution = identityMember(members, 'execution', decodeAgentExecutionId)
  if ('failure' in execution) return execution
  const attachment = identityMember(members, 'executionAttachment', decodeExecutionAttachmentId)
  if ('failure' in attachment) return attachment
  const instance = identityMember(members, 'instance', decodeAgentInstanceId)
  if ('failure' in instance) return instance
  const generation = textMember(members, 'generation')
  if ('failure' in generation) return generation
  const source = sourceMember(members)
  if ('failure' in source) return source
  const extra = unknownMember(members, AUTHORITY_FIELDS)
  if (extra !== undefined) return refusal(extra, 'unknown-field')
  return succeed(
    Object.freeze({
      execution: execution.ok,
      executionAttachment: attachment.ok,
      instance: instance.ok,
      generation: generation.ok,
      source: source.ok,
    }),
  )
}
