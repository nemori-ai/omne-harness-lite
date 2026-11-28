import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialLayer,
  MaterializationReceipt,
  ModelFailure,
  ModelFault,
  ProviderName,
  Supplier,
} from '@omne-harness/model-contract'
import type {
  CostLookupAnswer,
  CredentialPort,
  LiveSession,
  MaterializedLiveTransport,
  MaterializedTransport,
  ModelCommands,
  ModelTransport,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract/provider'

export type CredentialSelection = Readonly<{
  provider: ProviderName
  layer: CredentialLayer
}>
export type SendStart =
  | Readonly<{ kind: 'started'; facts: AsyncIterable<TransportFact> }>
  | Readonly<{ kind: 'started-live'; session: LiveSession }>
  | Readonly<{ kind: 'refused'; failure: ModelFailure; fault?: ModelFault }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>

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
  startWithCredential(
    materialized: MaterializedTransport,
    secrets: ReadonlyMap<string, string>,
    signal: AbortSignal,
  ): AsyncIterable<TransportFact>
  /** Opens the live session of a live binding, with the secrets only in the connection. */
  openWithCredential(
    materialized: MaterializedLiveTransport,
    secrets: ReadonlyMap<string, string>,
    signal: AbortSignal,
  ): LiveSession
  release(): Promise<void>
}
export interface SendResources<P> {
  acquire(input: SendDemand<P>): Promise<Outcome<SendResource, ModelFailure>>
  /** Asks the route of a supplier what one earlier request cost; the secrets go into a header only. */
  lookupCost?(
    input: Readonly<{ supplier: Supplier; request: string; secrets: ReadonlyMap<string, string> }>,
    signal: AbortSignal,
  ): Promise<CostLookupAnswer>
}
export type ModelSendBoundaryOptions<P> = Readonly<{
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P>
  credentials: CredentialPort<P>
  resources: SendResources<P>
  maxRetainedAttempts: number
}>
