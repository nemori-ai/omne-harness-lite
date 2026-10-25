// Accounts received and the window usage they derive (RQ-14), and the system recovery access
// (RQ-15). Types only: the stateful projection is in the request-context member.
import type * as M from '@omne-harness/model-contract'
import type { CallAccount } from '@omne-harness/call-account'
import type {
  Access,
  AccountingGeneration,
  Adoption,
  ContextTarget,
  DurableEvidence,
  RecoveryGrantRef,
} from './refs.js'
import type { InvalidReason, TenantModelCall } from './values.js'
import type { WindowUsageValue } from './blocks.js'
import type {
  AdoptedRequestSource,
  ContextReadEligibility,
  SourceDecision,
  SourceRead,
} from './sources.js'

/** Source and handoff association; never part of the idempotency key. */
export type AccountingOrigin = Readonly<{
  producer: 'model'
  sender: Adoption
  resultVersion: M.ResultVersion | null
}>
/** One committed original account revision of one dispatch. */
export type ReceivedAccountFact = Readonly<{
  kind: 'account'
  origin: AccountingOrigin
  target: ContextTarget
  call: TenantModelCall
  dispatch: M.DispatchId
  account: CallAccount
  committed: DurableEvidence
}>
export type ContextAccountingInput = ReceivedAccountFact
export type AccountReceipt =
  | Readonly<{
      kind: 'received'
      generation: AccountingGeneration
      change: 'inserted' | 'duplicate' | 'superseded'
    }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'conflict'; field: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ContextAccountingInbox<P> {
  receive(
    input: Readonly<{ access: Access<P>; input: ContextAccountingInput }>,
  ): Promise<AccountReceipt>
  usage(
    input: Readonly<{ access: Access<P>; target: ContextTarget }>,
  ): Promise<SourceRead<WindowUsageValue>>
}

/** System scope access for recovery only; it carries no tenant and opens no ordinary port. */
export type SystemRecoveryAccess<P> = Readonly<{
  scope: 'system'
  principal: P
  grant: RecoveryGrantRef
}>
export type AccountReplay = Readonly<{
  snapshot: DurableEvidence
  facts: AsyncIterable<ContextAccountingInput>
}>
export type RecoveryResult =
  | Readonly<{ kind: 'rebuilt'; generation: AccountingGeneration }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'conflict'; field: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ContextRecovery<P> {
  rebuildAccounts(
    input: Readonly<{
      access: SystemRecoveryAccess<P>
      target: ContextTarget
      replay: AccountReplay
    }>,
  ): Promise<RecoveryResult>
}

export interface AccountingSourceAuthority<P> {
  check(input: Readonly<{ access: Access<P>; input: ReceivedAccountFact }>): Promise<SourceDecision>
}
export interface RecoveryAuthority<P> {
  check(
    input: Readonly<{
      access: SystemRecoveryAccess<P>
      target: ContextTarget
      snapshot: DurableEvidence
      operation: 'rebuild-accounts'
    }>,
  ): Promise<SourceDecision>
  checkFact(
    input: Readonly<{
      access: SystemRecoveryAccess<P>
      target: ContextTarget
      snapshot: DurableEvidence
      input: ReceivedAccountFact
    }>,
  ): Promise<SourceDecision>
}
export type AccountingLimits = Readonly<{
  maxTargets: number
  maxFactsPerTarget: number
  maxRevisionsPerDispatch: number
}>
export type AccountingOptions<P> = Readonly<{
  sourceAuthority: AccountingSourceAuthority<P>
  readEligibility: ContextReadEligibility<P>
  adoptedSource: AdoptedRequestSource<P>
  recoveryAuthority: RecoveryAuthority<P>
  limits: AccountingLimits
}>
