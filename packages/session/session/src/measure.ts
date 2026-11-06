// The structured measurement events of Session (SPEC「测量事件」, R2-D17 DP1 取 C, R2-D49). The member
// gives the boundaries; whoever builds the instance gives the observer and reads its own clock when
// the observer is called. The call is synchronous at the boundary, so the call time is the boundary
// time. An observer that throws changes no answer of the instance.
import type {
  EntryId,
  RunId,
  SessionId,
  SessionOperationId,
  SessionRevision,
  WorkSnapshot,
} from '@omne-harness/session-contract'

/** The tenant whose work an event measures. The same legal-identity type as the access. */
export type TenantId = WorkSnapshot['tenant']

/** One face operation of Session, from the start of its work to its answer: the Session segment. */
export type SessionSegmentEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'session'
      phase: 'start'
      /** Pairs this start with its end; unique in the process. */
      span: number
      /** The face operation, for example `accept`, `finishRun` or `history.since`. */
      operation: string
      /** Null for a directory read, which names no session. */
      session: SessionId | null
      /** The tenant of the access. Absent for a directory read, whose access the measurer does not see. */
      tenant?: TenantId
    }>
  | Readonly<{
      kind: 'segment'
      segment: 'session'
      phase: 'end'
      span: number
      operation: string
      session: SessionId | null
      tenant?: TenantId
      /** `failure` for any answer that carries a failure and for a thrown error. */
      outcome: 'ok' | 'failure'
    }>

/**
 * A Run reached its terminal entry in a commit of this instance. It is the explicit round-complete
 * fact (R2-D17 P2): one round is one Run. A recalled commit and a commit of another process never
 * emit it.
 */
export type SessionRoundCompleteEvent = Readonly<{
  kind: 'round-complete'
  session: SessionId
  /** The tenant of the access that made the commit. */
  tenant?: TenantId
  /** Null when the entry payload does not carry a decodable run. */
  run: RunId | null
  /** The terminal outcome of the Run, null when the payload does not carry one. */
  outcome: string | null
  /** The commit that wrote the terminal entry. Opaque: Session holds no cumulative entry count. */
  revision: SessionRevision
  entry: EntryId
  operation: SessionOperationId
}>

export type SessionMeasureEvent = SessionSegmentEvent | SessionRoundCompleteEvent

/** Receives each event synchronously. It must not call back into the instance. */
export type SessionMeasure = (event: SessionMeasureEvent) => void

export type SessionMeasurer = Readonly<{
  /** Whether an observer was given. Work that only measurement needs is skipped without one. */
  active: boolean
  segment<T>(
    operation: string,
    session: SessionId | null,
    run: () => Promise<T>,
    failed: (answer: T) => boolean,
    /** Given when the call site knows the tenant: every mutation and single-session read does. */
    tenant?: TenantId,
  ): Promise<T>
  roundComplete(event: Omit<SessionRoundCompleteEvent, 'kind'>): void
}>

/** Counts in the process, so the instances that share an observer never reuse a span. */
let spans = 0

export function createSessionMeasurer(measure: SessionMeasure | undefined): SessionMeasurer {
  if (measure === undefined)
    return {
      active: false,
      segment: (_operation, _session, run) => run(),
      roundComplete: () => {},
    }
  const emit = (event: SessionMeasureEvent): void => {
    try {
      measure(event)
    } catch {
      // Measurement observes the instance and never decides an answer of it.
    }
  }
  return {
    active: true,
    async segment(operation, session, run, failed, tenant) {
      const span = (spans += 1)
      // An absent tenant stays absent: an `undefined` member would still be a key of the event.
      const where = tenant === undefined ? { session } : { session, tenant }
      emit({ kind: 'segment', segment: 'session', phase: 'start', span, operation, ...where })
      let outcome: 'ok' | 'failure' = 'failure'
      try {
        const answer = await run()
        outcome = failed(answer) ? 'failure' : 'ok'
        return answer
      } finally {
        emit({
          kind: 'segment',
          segment: 'session',
          phase: 'end',
          span,
          operation,
          ...where,
          outcome,
        })
      }
    },
    roundComplete: event => emit({ kind: 'round-complete', ...event }),
  }
}

type Tree = Readonly<{ kind?: unknown; entries?: unknown; value?: unknown }>

/** The member `key` of a JSON tree object (the `{kind, entries}` shape of the entry payload). */
function member(tree: unknown, key: string): unknown {
  if (typeof tree !== 'object' || tree === null) return undefined
  const { kind, entries } = tree as Tree
  if (kind !== 'object' || !Array.isArray(entries)) return undefined
  for (const item of entries as readonly Readonly<{ key?: unknown; value?: unknown }>[])
    if (item.key === key) return item.value
  return undefined
}

function text(tree: unknown): string | null {
  if (typeof tree !== 'object' || tree === null) return null
  const { kind, value } = tree as Tree
  return kind === 'string' && typeof value === 'string' ? value : null
}

/** The Run that a `run.terminal` entry closes, and how: null for a payload that does not say. */
export function terminalOf(
  payload: unknown,
): Readonly<{ run: RunId | null; outcome: string | null }> {
  const terminal = member(payload, 'terminal')
  return {
    run: text(member(terminal, 'run')) as RunId | null,
    outcome: text(member(terminal, 'outcome')),
  }
}
