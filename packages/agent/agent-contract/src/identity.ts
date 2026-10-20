// Identity and value types of the Agent contract (README, "身份、原位置与纯求值"), the decoders of
// the branded identities, and the structure judgments of the values that cross a boundary as data.
// Every function here is pure and returns an `Outcome`. None throws, except that `judgeAccess`
// runs the principal judgment that the caller injects and does not catch what it throws.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

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
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type Evidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type ConsumerRef = Readonly<{
  owner: string
  work: string
  position: string
  purpose: string
}>
export type Authority = Readonly<{
  execution: AgentExecutionId
  executionAttachment: ExecutionAttachmentId
  instance: AgentInstanceId
  generation: string
  source: Evidence
}>
export type Continuation = Readonly<{
  position: string
  definition: Adoption
  schema: Adoption
  value: JsonValue
}>
/** An RFC 3339 UTC instant, for example `2026-10-17T08:00:00Z`. */
export type AgentInstant = string

/** Why a text is not an Agent identity. `field` names the identity type that the caller asked for. */
export type IdentityFailure<K extends string = string> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'character'
}>

/**
 * Why a value is not the structure that a judgment expects. `field` names the member that failed,
 * or, for a nested structure, the path to it (`source.owner`). It names the structure itself when
 * the value is not an object at all.
 */
export type StructureFailure = Readonly<{
  field: string
  reason: 'type' | 'empty' | 'unknown-field' | 'missing' | 'identity'
}>

/** The longest identity text, in UTF-16 code units. */
export const AGENT_IDENTITY_MAX_LENGTH = 256

// Printable ASCII without space. Agent mints its own identities inside this lexicon, as Tool does.
const IDENTITY_TEXT = /^[\x21-\x7e]+$/u

type IdentityDecoder<T extends AgentIdentity<string>, N extends string> = (
  value: unknown,
) => Outcome<T, IdentityFailure<N>>

/**
 * The one rule of every identity decoder: a string, not empty, at most
 * `AGENT_IDENTITY_MAX_LENGTH` units, printable ASCII without space. Each decoder below only names
 * its identity, so a new identity adds one line and the rule stays written once.
 */
function decoderOf<T extends AgentIdentity<string>, N extends string>(
  name: N,
): IdentityDecoder<T, N> {
  return value => {
    if (typeof value !== 'string') return fail({ field: name, reason: 'type' })
    if (value.length === 0) return fail({ field: name, reason: 'empty' })
    if (value.length > AGENT_IDENTITY_MAX_LENGTH) return fail({ field: name, reason: 'length' })
    if (!IDENTITY_TEXT.test(value)) return fail({ field: name, reason: 'character' })
    // The checks above are the only way to mint the brand. A brand has no runtime value to build.
    return succeed(value as T)
  }
}

/**
 * Decodes the text of an `AgentInstanceId`. A decode gives the brand only: it does not prove that
 * the instance exists or that the caller may use it. The same holds for every decoder below.
 */
export const decodeAgentInstanceId = decoderOf<AgentInstanceId, 'AgentInstanceId'>(
  'AgentInstanceId',
)
/** Decodes the text of a `StepId`. Gives the brand only, not existence or eligibility. */
export const decodeStepId = decoderOf<StepId, 'StepId'>('StepId')
/** Decodes the text of an `ActionId`. Gives the brand only, not existence or eligibility. */
export const decodeActionId = decoderOf<ActionId, 'ActionId'>('ActionId')
/** Decodes the text of a `PassageId`. Gives the brand only, not existence or eligibility. */
export const decodePassageId = decoderOf<PassageId, 'PassageId'>('PassageId')
/** Decodes the text of a `CardRoundId`. Gives the brand only, not existence or eligibility. */
export const decodeCardRoundId = decoderOf<CardRoundId, 'CardRoundId'>('CardRoundId')
/** Decodes the text of an `ActionBatchId`. Gives the brand only, not existence or eligibility. */
export const decodeActionBatchId = decoderOf<ActionBatchId, 'ActionBatchId'>('ActionBatchId')
/** Decodes the text of an `AgentExecutionId`. Gives the brand only, not existence or eligibility. */
export const decodeAgentExecutionId = decoderOf<AgentExecutionId, 'AgentExecutionId'>(
  'AgentExecutionId',
)
/** Decodes the text of an `ExecutionAttachmentId`. Gives the brand only, not existence or eligibility. */
export const decodeExecutionAttachmentId = decoderOf<
  ExecutionAttachmentId,
  'ExecutionAttachmentId'
>('ExecutionAttachmentId')
/** Decodes the text of an `AgentRegistrationId`. Gives the brand only, not existence or eligibility. */
export const decodeAgentRegistrationId = decoderOf<AgentRegistrationId, 'AgentRegistrationId'>(
  'AgentRegistrationId',
)
/** Decodes the text of an `AgentOperationId`. Gives the brand only, not existence or eligibility. */
export const decodeAgentOperationId = decoderOf<AgentOperationId, 'AgentOperationId'>(
  'AgentOperationId',
)
/** Decodes the text of an `ExecutionRevision`. Gives the brand only, not existence or eligibility. */
export const decodeExecutionRevision = decoderOf<ExecutionRevision, 'ExecutionRevision'>(
  'ExecutionRevision',
)
/** Decodes the text of an `InputId`. Gives the brand only, not existence or eligibility. */
export const decodeInputId = decoderOf<InputId, 'InputId'>('InputId')
/** Decodes the text of an `InputBatchId`. Gives the brand only, not existence or eligibility. */
export const decodeInputBatchId = decoderOf<InputBatchId, 'InputBatchId'>('InputBatchId')
/** Decodes the text of a `ConsumptionId`. Gives the brand only, not existence or eligibility. */
export const decodeConsumptionId = decoderOf<ConsumptionId, 'ConsumptionId'>('ConsumptionId')

type OwnMembers = Readonly<Record<string, unknown>>

function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** One own member as name and value, or `undefined` for a symbol key and for an accessor. */
function dataMember(value: object, key: string | symbol): [string, unknown] | undefined {
  if (typeof key !== 'string') return undefined
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (description === undefined || !('value' in description)) return undefined
  return [key, description.value]
}

function readMembers(value: unknown): OwnMembers | undefined {
  if (!isPlainObject(value)) return undefined
  const members: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    const member = dataMember(value, key)
    if (member === undefined) return undefined
    members[member[0]] = member[1]
  }
  return members
}

/**
 * The own data members of a plain object, or `undefined` for anything else: a primitive, an array,
 * an instance with another prototype, an accessor, a symbol key, or an object whose reflection
 * throws. An accessor is refused instead of read, so a judgment never runs the caller's code.
 */
function ownMembers(value: unknown): OwnMembers | undefined {
  try {
    return readMembers(value)
  } catch {
    return undefined
  }
}

const refusal = (field: string, reason: StructureFailure['reason']) =>
  fail<StructureFailure>({ field, reason })

/** A member that a structure requires, read through one rule for presence, type and emptiness. */
function textMember(members: OwnMembers, name: string): Outcome<string, StructureFailure> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const text = members[name]
  if (typeof text !== 'string') return refusal(name, 'type')
  if (text.length === 0) return refusal(name, 'empty')
  return succeed(text)
}

function unknownMember(members: OwnMembers, known: readonly string[]): string | undefined {
  return Object.keys(members).find(key => !known.includes(key))
}

/** A structure of non-empty text members and nothing else. */
function judgeTextRecord<K extends string>(
  value: unknown,
  structure: string,
  names: readonly K[],
): Outcome<Readonly<Record<K, string>>, StructureFailure> {
  const members = ownMembers(value)
  if (members === undefined) return refusal(structure, 'type')
  // Every name in `names` is written below before the copy is returned, so the cast only names it.
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

/**
 * Judges the structure of an `Adoption`: exactly `owner`, `name`, `revision` and `digest`, each a
 * non-empty string. The judgment gives the shape only; it does not prove that the owner issued it.
 */
export function judgeAdoption(value: unknown): Outcome<Adoption, StructureFailure> {
  return judgeTextRecord(value, 'Adoption', ADOPTION_FIELDS)
}

/**
 * Judges the structure of an `Evidence`: exactly `owner`, `record`, `revision` and `digest`, each a
 * non-empty string. The judgment gives the shape only; it does not prove that the record exists.
 */
export function judgeEvidence(value: unknown): Outcome<Evidence, StructureFailure> {
  return judgeTextRecord(value, 'Evidence', EVIDENCE_FIELDS)
}

/**
 * Whether a value is a `TenantId` that legal-identity minted. Legal-identity proves it by
 * registry membership: `encode` accepts only values that `parse` or `tenant()` built.
 */
function isTenantId(value: unknown): value is TenantId {
  // `encode` types its parameter as `TenantId`, but its check is membership in a registry, which
  // takes any value. The assertion only lets the unknown value reach that check.
  return tenantCodec.encode(value as TenantId).ok
}

/**
 * Judges the structure of an `Access<P>`: exactly `principal` and `tenant`. The caller injects the
 * judgment of its own principal, because this package does not know what a principal is. The
 * tenant must be a `TenantId` that legal-identity minted. A failure of the principal keeps its
 * reason and prefixes its field with `principal.`.
 */
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

/** A member whose text an identity decoder judges. Any decoder failure is one `identity` refusal. */
function identityMember<T extends AgentIdentity<string>>(
  members: OwnMembers,
  name: string,
  decode: (value: unknown) => Outcome<T, IdentityFailure>,
): Outcome<T, StructureFailure> {
  if (!Object.hasOwn(members, name)) return refusal(name, 'missing')
  const decoded = decode(members[name])
  return 'failure' in decoded ? refusal(name, 'identity') : decoded
}

/** The `source` member: an Evidence structure, whose own failure is kept under the path `source.`. */
function sourceMember(members: OwnMembers): Outcome<Evidence, StructureFailure> {
  if (!Object.hasOwn(members, 'source')) return refusal('source', 'missing')
  const source = judgeEvidence(members['source'])
  if (!('failure' in source)) return source
  const { field, reason } = source.failure
  return refusal(field === 'Evidence' ? 'source' : `source.${field}`, reason)
}

/**
 * Judges the structure of an `Authority`: exactly `execution`, `executionAttachment`, `instance`,
 * `generation` and `source`. The three identities go through their decoders, and a failure of any
 * decoder is `identity` for that member. `generation` is a non-empty string, and `source` is an
 * `Evidence`. The members are read in the order of the type. The judgment gives the shape only; it
 * does not prove that the execution attachment is current.
 */
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
