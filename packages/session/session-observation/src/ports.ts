// What session observation needs from outside (RFC-0015 §8). The ports belong to this member; the
// assembly answers them with thin adapters over the Session and Model read faces.
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelStreamObservation, ModelStreamReferences } from '@omne-harness/model-contract'
import type { SessionHistory, SessionId } from '@omne-harness/session-contract'

/** The refresh policy. Every value is a default seed, not a promise (server-entry「刷新策略」). */
export type ObservationRefreshPolicy = Readonly<{
  /** First wait, in milliseconds. Below INTERVAL_FLOOR it is clamped to the floor. */
  interval: number
  /** Each interval-driven locate without anything new multiplies the wait by this, up to 30 × interval. */
  backoff: number
  /** Consecutive interval-driven locates without anything new before the observation ends. */
  maxAttempts: number
  /** Accumulated refresh waiting, in milliseconds, before the observation ends. */
  deadline: number
  /** Local wait for one `current` read of the Model, in milliseconds. */
  currentTimeout: number
}>

export const DEFAULT_OBSERVATION_REFRESH_POLICY: ObservationRefreshPolicy = Object.freeze({
  interval: 1000,
  backoff: 1.5,
  maxAttempts: 60,
  deadline: 30 * 60 * 1000,
  currentTimeout: 5000,
})

export const DEFAULT_LOCATE_PAGES = 4

/** The floor of `interval` that no configuration goes below. */
export const INTERVAL_FLOOR = 100

export type ObservationDiagnostic = Readonly<{
  code: 'observation.policy-clamped'
  detail: string
}>

export type SessionObservationPorts<P> = Readonly<{
  /** The Session log read face of the `reader` caller class. */
  history: Pick<SessionHistory<P>, 'begin' | 'next' | 'since'>
  streams: ModelStreamReferences<P>
  observer: ModelStreamObservation<P>
  /** Subscribes to「this session has a new commit」. Only the entry kinds come; answers the unsubscribe. */
  notices: (
    target: Readonly<{ tenant: TenantId; session: SessionId }>,
    onCommit: (kinds: readonly string[]) => void,
  ) => () => void
  /** Waits `milliseconds` unless `signal` aborts first. */
  wait: (milliseconds: number, signal: AbortSignal) => Promise<'elapsed' | 'cancelled'>
  policy: ObservationRefreshPolicy
  /** Pages one backward locate reads at most before it counts as nothing new. */
  locatePages: number
  /** The entry kinds that reading history gives. With the three fixed kinds they decide which notices wake a locate. */
  historyKinds: readonly string[]
  diagnose: (diagnostic: ObservationDiagnostic) => void
}>
