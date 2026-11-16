import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelStreamObservation, ModelStreamReferences } from '@omne-harness/model-contract'
import type { SessionHistory, SessionId } from '@omne-harness/session-contract'

export type ObservationRefreshPolicy = Readonly<{
  interval: number
  backoff: number
  maxAttempts: number
  deadline: number
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

export const INTERVAL_FLOOR = 100

export type ObservationDiagnostic = Readonly<{
  code:
    | 'observation.policy-clamped'
    | 'observation.current-timeout'
    | 'observation.late-discarded'
    | 'observation.locate-transient'
  detail: string
}>

export type SessionObservationPorts<P> = Readonly<{
  history: Pick<SessionHistory<P>, 'begin' | 'next' | 'since'>
  streams: ModelStreamReferences<P>
  observer: ModelStreamObservation<P>
  notices: (
    target: Readonly<{ tenant: TenantId; session: SessionId }>,
    onCommit: (kinds: readonly string[]) => void,
  ) => () => void
  wait: (milliseconds: number, signal: AbortSignal) => Promise<'elapsed' | 'cancelled'>
  policy: ObservationRefreshPolicy
  locatePages: number
  historyKinds: readonly string[]
  diagnose: (diagnostic: ObservationDiagnostic) => void
}>
