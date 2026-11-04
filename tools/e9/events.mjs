import { STAGES, clockKey, measured, unmeasured } from './metrics.mjs'

export function intervalUnion(intervals) {
  const sorted = intervals.map(interval => [...interval]).sort((a, b) => a[0] - b[0])
  let total = 0
  let end = -Infinity
  for (const [start, stop] of sorted) {
    total += Math.max(0, stop - Math.max(start, end))
    end = Math.max(end, stop)
  }
  return total
}

function time(event) {
  if (
    ![event.startMs, event.endMs].every(value => Number.isFinite(value) && value >= 0) ||
    event.endMs < event.startMs
  )
    throw new Error('invalid event time')
}

export function normalizeEvents(events, round, workload, expectedRunId) {
  if (!Array.isArray(events)) throw new Error('adapter must return an event array')
  for (const event of events) {
    if (event?.schemaVersion !== 1 || typeof event.runId !== 'string' || !event.runId.trim())
      throw new Error('invalid event schema/runId')
    if (event.round !== round) throw new Error('event belongs to wrong round')
    if (expectedRunId && event.runId !== expectedRunId) throw new Error('event runId changed')
    if (!['round-complete', 'stage', 'external-wait', 'fsync-count'].includes(event.eventKind))
      throw new Error('unsupported eventKind')
    if (event.runId !== events[0].runId) throw new Error('mixed event runId')
    if (event.eventKind !== 'fsync-count') time(event)
    if (event.eventKind === 'stage' && !STAGES.includes(event.stage))
      throw new Error('unknown stage')
    if (event.eventKind === 'external-wait') {
      if (
        !['model', 'tool'].includes(event.provider) ||
        typeof event.invocationId !== 'string' ||
        !event.invocationId ||
        !Number.isFinite(event.definedDelayMs) ||
        event.definedDelayMs < 0
      )
        throw new Error('invalid external-wait identity/delay')
    }
  }
  const completed = events.filter(event => event.eventKind === 'round-complete')
  if (completed.length !== 1) throw new Error('requires exactly one round completion')
  const whole = completed[0]
  if (!Number.isSafeInteger(whole.logCount) || whole.logCount < 0)
    throw new Error('invalid logCount')
  const waits = events.filter(event => event.eventKind === 'external-wait')
  if (new Set(waits.map(event => event.invocationId)).size !== waits.length)
    throw new Error('duplicate external-wait invocationId')
  const ownClock = clockKey(whole.clock)
  const qualified =
    ownClock &&
    waits.length > 0 &&
    waits.every(
      event =>
        clockKey(event.clock) === ownClock &&
        event.startMs >= whole.startMs &&
        event.endMs <= whole.endMs,
    )
  const intervals = {}
  const stageClocks = {}
  const stages = Object.fromEntries(
    STAGES.map(stage => {
      const rows = events.filter(event => event.eventKind === 'stage' && event.stage === stage)
      intervals[stage] = rows.map(row => ({
        clock: row.clock,
        startMs: row.startMs,
        endMs: row.endMs,
      }))
      const key = clockKey(rows[0]?.clock)
      stageClocks[stage] = rows[0]?.clock
      const valid = rows.length > 0 && key && rows.every(row => clockKey(row.clock) === key)
      return [
        stage,
        valid
          ? measured(
              intervalUnion(rows.map(row => [row.startMs, row.endMs])),
              'ms',
              'stage interval union',
            )
          : unmeasured('missing stage or unqualified stage clock'),
      ]
    }),
  )
  const syncs = events.filter(event => event.eventKind === 'fsync-count')
  if (syncs.length > 1) throw new Error('duplicate fsync-count round total')
  for (const event of syncs) {
    if (
      !['strace', 'provider-observer', 'synthetic'].includes(event.source) ||
      typeof event.traceRef !== 'string' ||
      !event.traceRef.trim() ||
      typeof event.roundAssociation !== 'string' ||
      !event.roundAssociation.trim()
    )
      throw new Error('fsync requires observation source, traceRef and roundAssociation')
    if (event.source === 'synthetic' && workload.kind !== 'synthetic')
      throw new Error('synthetic fsync cannot describe product execution')
    measured(event.count, 'count', event.source)
  }
  const count = syncs.reduce((sum, event) => sum + event.count, 0)
  return {
    runId: whole.runId,
    round,
    logEntries: whole.logCount,
    endToEnd: ownClock
      ? measured(whole.endMs - whole.startMs, 'ms', 'round-complete interval')
      : unmeasured('missing round clock'),
    ownOverhead: qualified
      ? measured(
          Math.max(
            0,
            whole.endMs -
              whole.startMs -
              intervalUnion(waits.map(event => [event.startMs, event.endMs])),
          ),
          'ms',
          'round wall-clock residue after external-wait union',
        )
      : unmeasured('missing waits or unqualified external-wait clock/range'),
    stages,
    stageClocks,
    intervals,
    externalWaits: waits,
    roundClock: whole.clock,
    fsync: syncs.length
      ? measured(count, 'count', syncs.map(event => event.source).join(','))
      : unmeasured('fsync not observed'),
  }
}
