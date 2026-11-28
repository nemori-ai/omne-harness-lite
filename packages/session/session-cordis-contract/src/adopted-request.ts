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

/** The form the request adopted for a model call took for one block of one of its messages. */
export type SessionRequestChoice = Readonly<{
  message: string
  block: string
  choice: 'original' | 'derived' | 'transcript'
  mediaType: string | null
}>

export type SessionRequestChoicesRead =
  | Readonly<{ kind: 'value'; value: readonly SessionRequestChoice[] | null }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface SessionAdoptedRequests<P> {
  /** The request adopted for the model call named by `reference`; without one, the latest of the session. */
  readAdoptedRequest(
    input: Readonly<{ access: Access<P>; session: SessionId; reference?: string }>,
  ): Promise<SessionAdoptedRequestRead>
  /** The representation choices of the request adopted for the model call; null when none was recorded. */
  readRequestChoices(
    input: Readonly<{ access: Access<P>; session: SessionId; reference: string }>,
  ): Promise<SessionRequestChoicesRead>
}
