import type { FixedToolRequest, ToolTiming } from '@omne-harness/tool-contract'
import {
  decodeToolInstant,
  type ToolClock,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import type { DurableEvidence, ToolCallId, ToolOperationId } from '@omne-harness/tool-contract'
import { INITIAL_REVISION, mintEvidence } from './evidence.ts'
import { instantAfter } from './ledger-body-writer.ts'
import type { LedgerWrite, TenantId } from './ledger-store.ts'

export type TimerOrigin = 'threshold' | 'foreground-limit'

export const TIMER_PREFIX = 'timer:'

const LIMIT_OF: Readonly<Record<TimerOrigin, 'backgroundAfterMs' | 'foregroundMs'>> = {
  threshold: 'backgroundAfterMs',
  'foreground-limit': 'foregroundMs',
}

// A call that settles or moves to the background accumulates no more foreground time.
export const TIMERS_OFF: readonly LedgerWrite[] = (Object.keys(LIMIT_OF) as TimerOrigin[]).map(
  origin => ({ kind: 'unschedule', key: `${TIMER_PREFIX}${origin}` }),
)

export function timerOriginOf(key: string): TimerOrigin | null {
  const origin = key.slice(TIMER_PREFIX.length)
  return key.startsWith(TIMER_PREFIX) && Object.hasOwn(LIMIT_OF, origin)
    ? (origin as TimerOrigin)
    : null
}

// One due entry for each limit the request fixed, after the foreground time still left. Only a
// running foreground segment accumulates that time.
export function timerSchedules(
  request: Pick<FixedToolRequest, 'limits'>,
  timing: ToolTiming,
  now: ToolInstant | null,
): LedgerWrite[] {
  if (now === null || timing.kind !== 'running') return []
  const { accumulatedMs } = timing
  return (Object.keys(LIMIT_OF) as TimerOrigin[]).flatMap(origin => {
    const limit = request.limits[LIMIT_OF[origin]]
    if (limit === null) return []
    const left = Math.max(0, limit - Number(accumulatedMs))
    return [{ kind: 'schedule', key: `${TIMER_PREFIX}${origin}`, dueAt: instantAfter(now, left) }]
  })
}

// Tool is the controller of its own timers: their subject is this fixed evidence, never a caller's.
export function timerSubject(
  place: Readonly<{ tenant: TenantId; call: ToolCallId; operation: ToolOperationId }>,
): DurableEvidence {
  return mintEvidence('operation', place, INITIAL_REVISION, { controller: 'tool-timer' })
}

export function instantOf(clock: Pick<ToolClock, 'now'>): ToolInstant | null {
  const decoded = decodeToolInstant(clock.now())
  return 'ok' in decoded ? decoded.ok : null
}

export function segmentCloser(clock: Pick<ToolClock, 'elapsed'>) {
  return async (timing: ToolTiming): Promise<ToolTiming> => {
    if (timing.kind !== 'running') return timing
    const unknown = {
      kind: 'unknown',
      accumulatedMs: timing.accumulatedMs,
      segment: timing.segment,
      diagnostic: 'suspension-elapsed-unavailable',
    } as const
    try {
      const elapsed = await clock.elapsed(timing.segment.marker)
      if ('failure' in elapsed || !/^(0|[1-9][0-9]*)$/u.test(elapsed.ok.milliseconds))
        return unknown
      const total = BigInt(timing.accumulatedMs) + BigInt(elapsed.ok.milliseconds)
      return { kind: 'paused', accumulatedMs: total.toString() }
    } catch {
      return unknown
    }
  }
}
