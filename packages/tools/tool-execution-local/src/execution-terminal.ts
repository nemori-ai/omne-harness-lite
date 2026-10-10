import type { FrameAccount } from '@omne-harness-lite/call-accounts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { compareInteger } from '@omne-harness-lite/session-log'
import type {
  DeliveryBasis,
  ExecutionOrigin,
  ExecutionRef,
  ExecutionTerminal,
  ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import type { createRuntimeJournal } from './runtime-journal.ts'

/** One terminal, its account and its delivery obligation use the same checked session tail. */
export function createTerminalCommitter(input: {
  readonly journal: ReturnType<typeof createRuntimeJournal>
  readonly clock: Clock
  readonly attempts: number
  readonly retry?: (attempt: number) => Promise<void>
}) {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1)
    throw new TypeError('positive terminal commit attempts required')
  return async (supplied: {
    readonly ref: ExecutionRef
    readonly origin: ExecutionOrigin
    readonly terminal: ExecutionTerminal
    readonly delivery: DeliveryBasis
    readonly startedAt: string
    readonly frames: FrameAccount | 'unknown'
    readonly recovered?: true
  }): Promise<'recorded' | 'alreadyEnded' | 'unavailable'> => {
    const captured = copyJsonValue(supplied)
    if ('failed' in captured) return 'unavailable'
    const request = captured.ok as unknown as typeof supplied
    const ended = await input.clock.now()
    if (ended === 'unavailable') return 'unavailable'
    const endedAt = instantToRfc3339(ended)
    for (let attempt = 0; attempt < input.attempts; attempt++) {
      const view = await input.journal.read(
        { tenant: request.ref.tenant, session: request.ref.session },
        request.ref.callId,
      )
      if (view.kind !== 'view') return 'unavailable'
      const value = terminalValue(request, view, endedAt)
      if (typeof value === 'string') return value
      const committed = await input.journal.commit({
        ref: request.ref,
        origin: request.origin,
        expected: view.prefix,
        values: [value],
      })
      if (committed.kind === 'view') return 'recorded'
      if (committed.reason !== 'tailChanged') return 'unavailable'
      await input.retry?.(attempt)
      // A new tail requires a new late decision. The terminal candidate itself does not change.
    }
    return 'unavailable'
  }
}

type TerminalRequest = Parameters<ReturnType<typeof createTerminalCommitter>>[0]
type TerminalView = Extract<
  Awaited<ReturnType<ReturnType<typeof createRuntimeJournal>['read']>>,
  { kind: 'view' }
>

function terminalValue(
  request: TerminalRequest,
  view: TerminalView,
  endedAt: string,
): ToolJournalPayload | 'unavailable' | 'alreadyEnded' {
  const execution = view.executions.get(request.ref.callId)
  if (!execution || !view.facts) return 'unavailable'
  if (execution.terminal) return 'alreadyEnded'
  const late =
    view.facts.runState !== 'open' ||
    compareInteger(view.facts.latestAttempt, request.origin.attempt) !== 0
  const value: ToolJournalPayload = {
    kind: 'execution_ended',
    revision: 1,
    ref: request.ref,
    terminal: request.terminal,
    delivery: request.delivery,
    account: {
      callId: request.ref.callId,
      initiator: request.ref.tenant,
      externalEffect: 'unknown',
      cost: request.recovered
        ? {
            total_usd: 'unknown',
            items: [{ service: 'tool_execution', cost_usd: 'unknown', source: 'none' }],
          }
        : { total_usd: 0, items: [] },
      frames: request.frames,
      wallClock: { startedAt: request.startedAt, endedAt },
      ...(request.terminal.outcome === 'interrupted' ? { stoppedAt: endedAt } : {}),
      ...(late ? { late: true } : {}),
    },
  }
  return value
}
