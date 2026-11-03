// The pure types of the adopted request read: what the session-log Journal provider saved, in the
// same publication as the main-purpose M0 of an Agent execution of one session, about the request
// that M0 recorded (FIXED-FACTS F4). Types only: the service that carries it is in `./cordis.ts`,
// and this file imports no Cordis and no adapter. The provider keeps the request as the Agent
// checkpoint gave it and does not read it: `reference` is the model invocation reference as text,
// and `record` is the opaque state of the preparing side.
import type { Access } from '@omne-harness/legal-identity'
import type { Adoption, DurableEvidence, SessionId } from '@omne-harness/session-contract'

/** The request the last main-purpose M0 of a session recorded, as the provider saved it. */
export type SessionAdoptedRequest = Readonly<{
  /**
   * The adoption order within the session: canonical decimal text from `1`, one more for each
   * request saved. It is not an execution revision and not a publication count.
   */
  order: string
  /** The Agent execution whose M0 recorded the request. */
  execution: string
  /** The model invocation reference of the request, as the checkpoint gave it. */
  reference: string
  /** The fixed basis of the ready preparation. */
  fixed: DurableEvidence
  /**
   * The adopted context evidence of the same checkpoint (the coverage the M0 fixed); null when
   * the checkpoint had none.
   */
  coverage: DurableEvidence | null
  /** The schema that the preparing side named for `record`. */
  schema: Adoption
  /** The opaque state of the preparing side, a JSON value kept as given. */
  record: unknown
}>

/** The closed answer of one read. `value: null`: no main-purpose M0 of the session saved one. */
export type SessionAdoptedRequestRead =
  | Readonly<{ kind: 'value'; value: SessionAdoptedRequest | null }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * The narrow read of the adopted request of one session. Each call checks the access of the call
 * on the session before it reads; a read that cannot be made is `unavailable`, never `null`.
 */
export interface SessionAdoptedRequests<P> {
  readAdoptedRequest(
    input: Readonly<{ access: Access<P>; session: SessionId }>,
  ): Promise<SessionAdoptedRequestRead>
}
