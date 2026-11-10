import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialLayer,
  MaterializationReceipt,
  ModelFailure,
  ModelFault,
  ProviderName,
} from '@omne-harness/model-contract'
import type {
  CredentialPort,
  MaterializedTransport,
  ModelCommands,
  ModelTransport,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract/provider'

/** The credential a send reads: the layer the request fixed for its supplier's provider. */
export type CredentialSelection = Readonly<{
  provider: ProviderName
  layer: CredentialLayer
}>
export type SendStart =
  | Readonly<{ kind: 'started'; facts: AsyncIterable<TransportFact> }>
  /**
   * `fault` marks a final credential or transport refusal. The boundary records it as the
   * terminal of the not-sent dispatch.
   */
  | Readonly<{ kind: 'refused'; failure: ModelFailure; fault?: ModelFault }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

/** All current-qualification changes and dispatch claims use this same synchronous owner. */
export interface SendCoordinator<P> {
  check(input: SendDemand<P>, stage: 'access' | 'prepare'): Outcome<void, ModelFailure>
  withinCurrent(
    input: SendDemand<P>,
    receipt: MaterializationReceipt,
    window: string,
    start: (selection: CredentialSelection) => SendStart,
  ): SendStart
}
export interface SendResource {
  readonly transport: ModelTransport
  /**
   * Uses a private credential slot, keyed by credential item, and clears that slot before
   * returning, including on throw.
   */
  startWithCredential(
    materialized: MaterializedTransport,
    secrets: ReadonlyMap<string, string>,
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
  credentials: CredentialPort<P>
  resources: SendResources<P>
  maxRetainedAttempts: number
}>
