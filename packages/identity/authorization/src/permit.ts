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

export const PERMIT_ID_MAX_LENGTH = 256

const PERMIT_TEXT = /^[\x21-\x7e]+$/u

export function decodePermitId(value: unknown): Outcome<PermitId, PermitIdFailure> {
  if (typeof value !== 'string') return fail({ field: 'PermitId', reason: 'type' })
  if (value.length === 0) return fail({ field: 'PermitId', reason: 'empty' })
  if (value.length > PERMIT_ID_MAX_LENGTH) return fail({ field: 'PermitId', reason: 'length' })
  if (!PERMIT_TEXT.test(value)) return fail({ field: 'PermitId', reason: 'character' })
  return succeed(value as PermitId)
}

export type PermitRef = Readonly<{ tenant: TenantId; permit: PermitId }>

export type ConsumerPosition = Readonly<{ owner: string; work: string; position: string }>

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
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type ConsumeOutcome =
  | Readonly<{ kind: 'consumed'; fact: ConsumptionFact }>
  | Readonly<{ kind: 'already-consumed'; fact: ConsumptionFact }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type GrantOutcome =
  | Readonly<{ kind: 'granted'; grant: PermitGrant }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface PermitLedger {
  lookup(input: Readonly<{ permit: PermitRef }>): Promise<PermitLookup>
  consume(
    input: Readonly<{ permit: PermitRef; consumer: ConsumerPosition }>,
  ): Promise<ConsumeOutcome>
}

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
