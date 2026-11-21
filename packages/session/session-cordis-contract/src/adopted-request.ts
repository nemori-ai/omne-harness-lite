import type { Access } from '@omne-harness/legal-identity'
import type { Adoption, DurableEvidence, SessionId } from '@omne-harness/session-contract'

export type SessionAdoptedRequest = Readonly<{
  order: string
  execution: string
  reference: string
  fixed: DurableEvidence
  coverage: DurableEvidence | null
  schema: Adoption
  record: unknown
}>

export type SessionAdoptedRequestRead =
  | Readonly<{ kind: 'value'; value: SessionAdoptedRequest | null }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface SessionAdoptedRequests<P> {
  /** The request adopted for the model call named by `reference`; without one, the latest of the session. */
  readAdoptedRequest(
    input: Readonly<{ access: Access<P>; session: SessionId; reference?: string }>,
  ): Promise<SessionAdoptedRequestRead>
}
