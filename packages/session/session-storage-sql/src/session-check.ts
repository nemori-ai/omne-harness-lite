import type { DurableEvidence, RoutedInput, SessionId } from '@omne-harness/session-contract'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { encodeValue, valueDigest } from './codec.ts'
import { SESSION_PARTICIPANT } from './session-reply.ts'

// In the open and submit checks, origin is the source basis of the Agent's AcceptedInput, not the origin Session recorded.
export type SessionAdmittedInput = Pick<
  Extract<RoutedInput, { kind: 'ordinary' }>,
  'input' | 'origin'
> &
  Readonly<{ messageDigest: string }>

type AdmittedMessage = Extract<RoutedInput, { kind: 'ordinary' }>['message']

export const admittedMessageDigest = (message: AdmittedMessage): string => valueDigest(message)

type CheckScope = Readonly<{ tenant: TenantId; session: SessionId; execution: string }>

export type SessionCheck =
  | (CheckScope &
      Readonly<{
        kind: 'open'
        grant: DurableEvidence
        initial: readonly [SessionAdmittedInput, ...SessionAdmittedInput[]]
      }>)
  | (CheckScope & Readonly<{ kind: 'submit'; value: SessionAdmittedInput }>)
  | (CheckScope & Readonly<{ kind: 'attach'; grant: DurableEvidence }>)
  | (CheckScope &
      Readonly<{
        kind: 'finish'
        conclusion: 'complete' | 'failed' | 'cancelled'
        control: string | null
      }>)

export type SessionCheckResult = Readonly<{
  kind: 'checked'
  attempt: string | null
  advance: 'ordinary' | 'wind-down' | null
}>

export function sessionCheckFacts(check: SessionCheck): FactCommandV2 {
  return {
    participant: SESSION_PARTICIPANT,
    facts: { intent: 'check', check: encodeValue(check) },
  }
}

export function sessionCheckDigest(check: SessionCheck): string {
  return valueDigest(check)
}
