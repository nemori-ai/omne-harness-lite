import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  DurableEvidence,
  ToolStartRecord,
  ConsumerRef,
  FixedToolRequest,
  ResourceScope,
  ToolCallId,
} from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type {
  FactReceipt,
  Mutation,
  ResultPolicy,
  TextResultFactory,
  judgeToolArguments,
} from '@omne-harness/tool-contract/provider'
import type { TenantId } from './ledger-store.ts'

export type JsonLimits = Parameters<typeof judgeToolArguments>[1]

export type ToolLedgerAction =
  | 'admit'
  | 'lookup'
  | 'query-operation'
  | 'control'
  | 'accept-decision'
  | 'accept-resource'
  | 'read-process'
  | 'read-wait'
  | 'read-diagnostics'
  | 'read-result'
  | 'read-content'
  | 'release-delivery'
  | 'account'
  | 'recover'
  | 'write'

export type AccessVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ToolAccessGuard<P> {
  qualify(
    input: Readonly<{ principal: P; tenant: TenantId; call: ToolCallId; action: ToolLedgerAction }>,
  ): Promise<AccessVerdict>
}

export type SourceVerdict =
  | Readonly<{ kind: 'trusted' }>
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'forged'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ToolSourceGuard<P> {
  verify(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Promise<SourceVerdict>
}

export interface ToolFactAcknowledgementGuard<P> {
  verify(
    input: CallAccess<P> &
      Readonly<{
        start: ToolStartRecord
        source: DurableEvidence
        receipt: FactReceipt
        sourceReceipt: DurableEvidence
      }>,
  ): Promise<SourceVerdict>
}

export type GrantVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ToolGrantVerifier<P> {
  verifyGrant(
    input: Readonly<{ principal: P; tenant: TenantId; call: ToolCallId; scope: ResourceScope }>,
  ): Promise<GrantVerdict>
}

export type StartVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface ToolStartGuard<P> {
  qualifyStart(
    input: Readonly<{
      principal: P
      tenant: TenantId
      call: ToolCallId
      request: FixedToolRequest
    }>,
  ): Promise<StartVerdict>
}

export type ToolLedgerBudgets = Readonly<{
  arguments: JsonLimits
}>

export type ToolLedgerGuards<P, B extends ContentBlock> = Readonly<{
  access: ToolAccessGuard<P>
  sources: ToolSourceGuard<P>
  factAcknowledgements: ToolFactAcknowledgementGuard<P>
  grants: ReadonlyMap<string, ToolGrantVerifier<P>>
  starts: ToolStartGuard<P>
  results: TextResultFactory<B>
  policy: ResultPolicy<B>
  budgets: ToolLedgerBudgets
}>

export interface ToolInvokeAuthority<P> {
  qualify(input: Access<P> & Readonly<{ consumer: ConsumerRef }>): Promise<AccessVerdict>
  samePrincipal(input: Readonly<{ current: P; original: P }>): Promise<AccessVerdict>
}
