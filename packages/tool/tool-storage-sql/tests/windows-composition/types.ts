import type {
  Access,
  ControlReceipt,
  ResultPage,
  ToolCommandOutcome,
  ToolDelivery,
  ToolInvocationRef,
  ToolInvokeOutcome,
  ToolInvokeRequest,
  ToolState,
} from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'

export type Invocation = Readonly<{
  reference: ToolInvocationRef
  access: Access<unknown>
  request: ToolInvokeRequest
}>
export type InvokeOptions = Readonly<{ foreignTenant?: boolean; authorizeScript?: boolean }>
export type InvocationAttempt = Readonly<{
  request: ToolInvokeRequest
  access: Access<unknown>
  outcome: ToolInvokeOutcome
}>
export type CompletedInvocation = Readonly<{
  invocation: Invocation
  state: Extract<ToolState, { phase: 'settled' }>
  result: ResultPage<ToolMessageContentBlock>
  delivery: ToolDelivery<ToolMessageContentBlock>
  text: string
}>
export type ObservedResource = Readonly<{
  call: string
  resource: ManagedResource
  stopped: 'confirmed' | 'unconfirmed' | null
}>
export type AcquisitionEvidence = Readonly<{
  call: string
  preparation: string
  origin: string
  acquisition: string
  sessionScope: string
}>
export type CleanupEvidence = Readonly<{
  provider: unknown
  storage: unknown
  knownResources: readonly ObservedResource[]
  coldEnumeration: unknown
}>
export interface WindowsAssembly {
  readonly workspace: string
  readonly outside: string
  readonly evidenceDirectory: string
  readonly resultMaxBytes: number
  invoke(
    tool: 'Shell' | 'Files',
    command: string,
    args: Readonly<Record<string, unknown>>,
    options?: InvokeOptions,
  ): Promise<Invocation>
  attempt(
    tool: 'Shell' | 'Files',
    command: string,
    args: Readonly<Record<string, unknown>>,
    options?: InvokeOptions,
  ): Promise<InvocationAttempt>
  settle(invocation: Invocation): Promise<CompletedInvocation>
  stop(invocation: Invocation): Promise<ToolCommandOutcome<ControlReceipt>>
  resources(): readonly ObservedResource[]
  acquisitions(): readonly AcquisitionEvidence[]
  authorExecutions(): Readonly<Record<string, number>>
  record(event: string, facts: unknown): Promise<void>
  close(): Promise<CleanupEvidence>
}
export type ScenarioResult = Readonly<{
  checks: Readonly<Record<string, boolean>>
  observations: unknown
}>
