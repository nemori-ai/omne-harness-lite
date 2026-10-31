// Permits and their consumption (SPEC AU-11, AU-03, AU-06). A permit is one allowed action that a
// consumer must consume exactly once at its linearization point. A consumed permit stays
// consumed: a later check denies, and a later consume answers with the original fact.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decisionEvidence,
  type DecisionEvidence,
  type DurableEvidence,
  type EffectiveArguments,
} from './evidence.ts'
import type { AdmissionOperation, AdmissionTarget } from './operation.ts'

declare const permitBrand: unique symbol
export type PermitId = string & { readonly [permitBrand]: 'PermitId' }

export type PermitIdFailure = Readonly<{
  field: 'PermitId'
  reason: 'type' | 'empty' | 'length' | 'character'
}>

/** The longest permit text, in UTF-16 code units. */
export const PERMIT_ID_MAX_LENGTH = 256

// Printable ASCII without space, as the other members mint their identities.
const PERMIT_TEXT = /^[\x21-\x7e]+$/u

/** Decodes a permit text. The brand says the text is well formed; it does not prove the permit exists. */
export function decodePermitId(value: unknown): Outcome<PermitId, PermitIdFailure> {
  if (typeof value !== 'string') return fail({ field: 'PermitId', reason: 'type' })
  if (value.length === 0) return fail({ field: 'PermitId', reason: 'empty' })
  if (value.length > PERMIT_ID_MAX_LENGTH) return fail({ field: 'PermitId', reason: 'length' })
  if (!PERMIT_TEXT.test(value)) return fail({ field: 'PermitId', reason: 'character' })
  // The checks above are the only way to mint the brand. A brand has no runtime value to build.
  return succeed(value as PermitId)
}

/** The reference a consumer keeps, for example in a Tool acceptance record. The tenant is part of the key. */
export type PermitRef = Readonly<{ tenant: TenantId; permit: PermitId }>

/** Where a permit was consumed: the consumer's own stable position. */
export type ConsumerPosition = Readonly<{ owner: string; work: string; position: string }>

/** What a permit allows: one operation on one target with one digest of arguments, and the evidence of the expression or decision that granted it. */
export type PermitGrant = Readonly<{
  ref: PermitRef
  operation: AdmissionOperation
  target: AdmissionTarget
  arguments: EffectiveArguments
  granted: DurableEvidence
}>

export type ConsumptionFact = Readonly<{
  permit: PermitRef
  consumer: ConsumerPosition
  evidence: DecisionEvidence
}>

export type PermitState =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'consumed'; fact: ConsumptionFact }>

export type PermitLookup =
  | Readonly<{ kind: 'found'; grant: PermitGrant; state: PermitState }>
  /** No permit under this tenant and text. A permit of another tenant looks the same. */
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type ConsumeOutcome =
  | Readonly<{ kind: 'consumed'; fact: ConsumptionFact }>
  /** The permit was consumed before. The fact says by whom; a repeat of the same consumer recognizes itself. */
  | Readonly<{ kind: 'already-consumed'; fact: ConsumptionFact }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type GrantOutcome =
  | Readonly<{ kind: 'granted'; grant: PermitGrant }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The read and consume side, for the consumer at its linearization point. */
export interface PermitLedger {
  lookup(input: Readonly<{ permit: PermitRef }>): Promise<PermitLookup>
  consume(
    input: Readonly<{ permit: PermitRef; consumer: ConsumerPosition }>,
  ): Promise<ConsumeOutcome>
}

/** The grant side, for the owner of an expression or a decision that produces a permit. */
export interface PermitGrantor {
  grant(
    input: Readonly<{
      tenant: TenantId
      operation: AdmissionOperation
      target: AdmissionTarget
      arguments: EffectiveArguments
      granted: DurableEvidence
    }>,
  ): Promise<GrantOutcome>
}

type Entry = { readonly grant: PermitGrant; state: PermitState }

function tenantKey(tenant: TenantId): string | null {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : null
}

function entryKey(ref: PermitRef): string | null {
  const tenant = tenantKey(ref.tenant)
  return tenant === null ? null : `${tenant}#${ref.permit}`
}

/**
 * The in-memory reference ledger. It keys every permit by the tenant and the permit text, so a
 * permit of one tenant is `unknown` under another. It is not durable: a process exit loses it.
 * It stands in until a durable provider exists.
 */
export function inMemoryPermitLedger(): Readonly<{ grantor: PermitGrantor; ledger: PermitLedger }> {
  const entries = new Map<string, Entry>()
  let sequence = 0

  const nextPermit = (): PermitId => {
    sequence += 1
    const decoded = decodePermitId(`pmt_${sequence}`)
    if ('failure' in decoded) throw new Error('the ledger minted a permit text it cannot decode')
    return decoded.ok
  }

  const grant: PermitGrantor['grant'] = input => {
    const tenant = tenantKey(input.tenant)
    if (tenant === null)
      return Promise.resolve({
        kind: 'unavailable',
        diagnostic: 'the tenant is not a minted TenantId',
      })
    const permit = nextPermit()
    const ref: PermitRef = Object.freeze({ tenant: input.tenant, permit })
    const issued: PermitGrant = Object.freeze({
      ref,
      operation: Object.freeze({ owner: input.operation.owner, name: input.operation.name }),
      target: Object.freeze({
        owner: input.target.owner,
        kind: input.target.kind,
        key: input.target.key,
      }),
      arguments: Object.freeze({ digest: input.arguments.digest }),
      granted: Object.freeze({
        owner: input.granted.owner,
        record: input.granted.record,
        revision: input.granted.revision,
        digest: input.granted.digest,
      }),
    })
    entries.set(`${tenant}#${permit}`, { grant: issued, state: Object.freeze({ kind: 'open' }) })
    return Promise.resolve({ kind: 'granted', grant: issued })
  }

  const lookup: PermitLedger['lookup'] = input => {
    const key = entryKey(input.permit)
    const entry = key === null ? undefined : entries.get(key)
    if (entry === undefined) return Promise.resolve({ kind: 'unknown' })
    return Promise.resolve({ kind: 'found', grant: entry.grant, state: entry.state })
  }

  const consume: PermitLedger['consume'] = input => {
    const key = entryKey(input.permit)
    const entry = key === null ? undefined : entries.get(key)
    if (entry === undefined) return Promise.resolve({ kind: 'unknown' })
    if (entry.state.kind === 'consumed')
      return Promise.resolve({ kind: 'already-consumed', fact: entry.state.fact })
    sequence += 1
    const consumer: ConsumerPosition = Object.freeze({
      owner: input.consumer.owner,
      work: input.consumer.work,
      position: input.consumer.position,
    })
    const fact: ConsumptionFact = Object.freeze({
      permit: entry.grant.ref,
      consumer,
      evidence: decisionEvidence(`consumption/${key}`, String(sequence), { permit: key, consumer }),
    })
    entry.state = Object.freeze({ kind: 'consumed', fact })
    return Promise.resolve({ kind: 'consumed', fact })
  }

  return Object.freeze({
    grantor: Object.freeze({ grant }),
    ledger: Object.freeze({ lookup, consume }),
  })
}
