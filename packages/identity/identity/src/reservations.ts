import { createHash } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ActingForTenantPrincipal } from './principal.ts'
import { isQualification, type Qualification } from './qualification.ts'

/** Versioned, bounded routing data. Values and destination commands do not belong here. */
export type StandingBinding = Readonly<{
  version: 'standing/1'
  owner: string
  operationId: string
  principalRef: string
  destination: string
  /** The canonical tenantCodec encoding of the acting principal's tenant. */
  scopeRef: string
  targetRef: string
  inputDigest: string
}>

export type StandingRequest = Readonly<{
  binding: StandingBinding
  required: readonly Qualification[]
}>

export type StandingReservation = StandingRequest & Readonly<{ id: string }>

export type StandingTerminal = Readonly<{
  kind: 'terminal'
  reservation: StandingReservation
  outcome: 'committed' | 'aborted'
}>

/** Trusted assembly route. seal atomically aborts an absent operation or returns its terminal. */
export interface StandingDestinationResolver {
  seal(
    reservation: StandingReservation,
  ): Promise<StandingTerminal | Readonly<{ kind: 'unavailable'; diagnostic: string }>>
}

export type StandingReserveOutcome =
  | Readonly<{ kind: 'held'; reservation: StandingReservation }>
  | StandingTerminal
  | Readonly<{ kind: 'denied' | 'operation-conflict' | 'blocked' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** Read-only original-request observation. not_found is not a terminal or a release proof. */
export type StandingObservation =
  | Readonly<{ kind: 'held'; reservation: StandingReservation }>
  | StandingTerminal
  | Readonly<{ kind: 'not_found' | 'operation-conflict' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type StandingSettleOutcome =
  | StandingTerminal
  | Readonly<{ kind: 'operation-conflict' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type StandingRecoveryPage =
  | Readonly<{
      kind: 'recovered'
      examined: number
      settled: number
      /** Pass this cursor to the next bounded pass; null completes this scan. */
      next: string | null
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface StandingReservations {
  observe(request: StandingRequest): Promise<StandingObservation>
  reserve(
    input: Readonly<{
      principal: ActingForTenantPrincipal
      binding: StandingBinding
      required: readonly Qualification[]
    }>,
  ): Promise<StandingReserveOutcome>
  settle(request: StandingRequest): Promise<StandingSettleOutcome>
  recover(input?: Readonly<{ after?: string; limit?: number }>): Promise<StandingRecoveryPage>
}

const FIELDS = [
  'owner',
  'operationId',
  'principalRef',
  'destination',
  'scopeRef',
  'targetRef',
  'inputDigest',
] as const
const digest = (parts: readonly unknown[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

/** Stable reference to the issued principal's meaning; it is not a proof of issuance. */
export function standingPrincipalRef(principal: ActingForTenantPrincipal): string {
  const encoded = tenantCodec.encode(principal.tenant)
  if (!encoded.ok) throw new TypeError('standing principal requires a minted tenant')
  return `principal/1/${digest([principal.actor.component, encoded.value, principal.work.owner, principal.work.work])}`
}

/** Canonical identity, shared by Identity and destination implementations. */
export function standingReservationId(
  binding: StandingBinding,
  required: readonly Qualification[],
): string {
  return `standing/1/${digest([binding.version, ...FIELDS.map(field => binding[field]), [...new Set(required)].sort()])}`
}

export function isStandingBinding(value: unknown): value is StandingBinding {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    row['version'] === 'standing/1' &&
    FIELDS.every(field => {
      const text = row[field]
      return (
        typeof text === 'string' &&
        text.length > 0 &&
        Buffer.byteLength(text, 'utf8') <=
          (field === 'targetRef' ? 16384 : field === 'scopeRef' ? 4096 : 2048)
      )
    }) &&
    Object.keys(row).length === FIELDS.length + 1
  )
}

export function isStandingReservation(value: unknown): value is StandingReservation {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    isStandingBinding(row['binding']) &&
    Array.isArray(row['required']) &&
    row['required'].length <= 16 &&
    row['required'].every(isQualification) &&
    row['id'] === standingReservationId(row['binding'], row['required'])
  )
}
