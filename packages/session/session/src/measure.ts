import type {
  EntryId,
  RunId,
  SessionId,
  SessionOperationId,
  SessionRevision,
  WorkSnapshot,
} from '@omne-harness/session-contract'

export type TenantId = WorkSnapshot['tenant']

export type SessionSegmentEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'session'
      phase: 'start'
      span: number
      operation: string
      session: SessionId | null
      tenant?: TenantId
      scope?: 'system'
    }>
  | Readonly<{
      kind: 'segment'
      segment: 'session'
      phase: 'end'
      span: number
      operation: string
      session: SessionId | null
      tenant?: TenantId
      scope?: 'system'
      outcome: 'ok' | 'failure'
    }>

export type SessionRoundCompleteEvent = Readonly<{
  kind: 'round-complete'
  session: SessionId
  tenant?: TenantId
  run: RunId | null
  outcome: string | null
  revision: SessionRevision
  entry: EntryId
  operation: SessionOperationId
}>

export type SessionMeasureEvent = SessionSegmentEvent | SessionRoundCompleteEvent

// Called synchronously; it must not call back into the instance.
export type SessionMeasure = (event: SessionMeasureEvent) => void

export type SegmentOwner = TenantId | 'system'

export type SessionMeasurer = Readonly<{
  active: boolean
  segment<T>(
    operation: string,
    session: SessionId | null,
    run: () => Promise<T>,
    failed: (answer: T) => boolean,
    whose?: SegmentOwner,
  ): Promise<T>
  roundComplete(event: Omit<SessionRoundCompleteEvent, 'kind'>): void
}>

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
    } catch {}
  }
  return {
    active: true,
    async segment(operation, session, run, failed, whose) {
      const span = (spans += 1)
      const where =
        whose === undefined
          ? { session }
          : whose === 'system'
            ? { session, scope: whose }
            : { session, tenant: whose }
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

export function terminalOf(
  payload: unknown,
): Readonly<{ run: RunId | null; outcome: string | null }> {
  const terminal = member(payload, 'terminal')
  return {
    run: text(member(terminal, 'run')) as RunId | null,
    outcome: text(member(terminal, 'outcome')),
  }
}
