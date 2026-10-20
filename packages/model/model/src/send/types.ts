import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialId,
  CredentialPort,
  MaterializationReceipt,
  MaterializedTransport,
  ModelCommands,
  ModelFailure,
  ModelTransport,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract'

export type CredentialSelection = Readonly<{
  id: CredentialId
  scope: 'tenant' | 'factory'
}>
export type SendStart =
  | Readonly<{ kind: 'started'; facts: AsyncIterable<TransportFact> }>
  | Readonly<{ kind: 'refused'; failure: ModelFailure }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

/** All current-qualification changes and dispatch claims use this same synchronous owner. */
export interface SendCoordinator<P> {
  check(input: SendDemand<P>): Outcome<void, ModelFailure>
  withinCurrent(
    input: SendDemand<P>,
    receipt: MaterializationReceipt,
    window: string,
    start: (selection: CredentialSelection) => SendStart,
  ): SendStart
}
export interface SendResource {
  readonly transport: ModelTransport
  /** Uses a private credential slot and clears that slot before returning, including on throw. */
  startWithCredential(
    materialized: MaterializedTransport,
    value: string,
    signal: AbortSignal,
  ): AsyncIterable<TransportFact>
  release(): Promise<void>
}
export interface SendResources<P> {
  acquire(input: SendDemand<P>): Promise<Outcome<SendResource, ModelFailure>>
}
export type ModelSendBoundaryOptions<P> = Readonly<{
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P>
  credentials: CredentialPort
  resources: SendResources<P>
  maxRetainedAttempts: number
}>
