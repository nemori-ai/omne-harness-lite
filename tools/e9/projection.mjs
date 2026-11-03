// R2-D133：只转换调用者已经采到的事实；时钟读取、运行关联与发行接线归采集方。
const STAGES = Object.freeze({
  session: 'sessionIO',
  context: 'projectionInterpretation',
  agent: 'agentProgression',
})

export const TOOL_WAIT_GAP = Object.freeze({
  id: 'L-TOOL-WAIT-BATCH-E',
  owner: 'L-TOOL / Reduce',
  reason: '工具等待事件形状尚未按批次E采用；本投影不猜测或生成工具等待。',
})

const text = value => typeof value === 'string' && value.trim().length > 0
const finiteTime = value => Number.isFinite(value) && value >= 0
const reading = value =>
  value != null &&
  ['process', 'clock', 'generation'].every(key => text(value[key])) &&
  finiteTime(value.atMs)
const sameClock = (a, b) => ['process', 'clock', 'generation'].every(key => a[key] === b[key])
const interval = (a, b) => reading(a) && reading(b) && sameClock(a, b) && b.atMs >= a.atMs
const clockOf = value => ({
  processId: value.process,
  clockId: value.clock,
  generation: value.generation,
})

function resultFor(input) {
  if (
    !input ||
    !text(input.runId) ||
    !Number.isSafeInteger(input.round) ||
    input.round < 1 ||
    input.round > 200
  )
    throw new TypeError('projection requires an experiment runId and round 1..200')
  return {
    schemaVersion: 1,
    runId: input.runId,
    round: input.round,
    events: [],
    origins: [],
    diagnostics: [],
    gaps: [structuredClone(TOOL_WAIT_GAP)],
    sources: structuredClone(input),
  }
}

function issue(result, code, source, detail) {
  result.diagnostics.push({ code, source, ...(detail === undefined ? {} : { detail }) })
}

function emit(result, value, source) {
  result.origins.push({ eventIndex: result.events.length, source })
  result.events.push({ schemaVersion: 1, runId: result.runId, round: result.round, ...value })
}

function stage(result, name, start, end, outcome, source) {
  if (outcome !== 'ok') {
    issue(result, 'segment-outcome-not-ok', source, { outcome })
    return
  }
  if (!interval(start, end)) {
    issue(result, 'segment-clock-or-time-invalid', source)
    return
  }
  emit(
    result,
    {
      eventKind: 'stage',
      stage: STAGES[name],
      clock: clockOf(start),
      startMs: start.atMs,
      endMs: end.atMs,
    },
    source,
  )
}

/** 投影已经录制的单个完整区间，不推断其配对正确性、轮完成或日志数。 */
export function projectSegmentInterval(input) {
  const result = resultFor(input)
  if (!Object.hasOwn(STAGES, input.segment))
    issue(result, 'unsupported-segment', 'interval', { segment: input.segment })
  else stage(result, input.segment, input.start, input.end, input.outcome, 'interval')
  return result
}

function identityFields(event) {
  if (event.segment === 'session') return ['operation', 'session']
  if (event.segment === 'context') return ['operation', 'execution']
  return ['pass', 'execution']
}

function validIdentity(event) {
  if (event.segment === 'session')
    return text(event.operation) && (event.session === null || text(event.session))
  if (!text(event.execution)) return false
  return event.segment === 'context'
    ? ['prepare', 'derive', 'resume', 'read'].includes(event.operation)
    : ['accept', 'run'].includes(event.pass)
}

function memberEvents(result, input, samples) {
  const open = new Map()
  const seen = new Set()
  const completed = []
  for (const [index, sample] of samples.entries()) {
    const source = { stream: 'memberEvents', indices: [index] }
    const event = sample?.event
    if (event?.kind === 'round-complete') {
      completed.push({ event, reading: sample.reading, source })
      continue
    }
    if (event?.kind !== 'segment' || !Object.hasOwn(STAGES, event.segment)) {
      issue(result, 'unsupported-member-event', source)
      continue
    }
    if (
      !['start', 'end'].includes(event.phase) ||
      !Number.isSafeInteger(event.span) ||
      event.span < 1 ||
      !reading(sample.reading) ||
      !validIdentity(event)
    ) {
      issue(result, 'invalid-member-boundary', source)
      continue
    }
    if (event.segment === 'session' && event.session !== null && event.session !== input.session) {
      issue(result, 'session-mismatch', source)
      continue
    }
    // 各成员各自计数；同号span不能跨成员或跨时钟配对。
    const key = JSON.stringify([
      sample.reading.process,
      sample.reading.clock,
      sample.reading.generation,
      event.segment,
      event.span,
    ])
    if (event.phase === 'start') {
      if (seen.has(key)) {
        issue(result, 'duplicate-segment-start', source)
        continue
      }
      seen.add(key)
      open.set(key, { event, reading: sample.reading, index })
      continue
    }
    const start = open.get(key)
    if (!start) {
      issue(result, 'orphan-segment-end', source)
      continue
    }
    open.delete(key)
    const pair = { stream: 'memberEvents', indices: [start.index, index] }
    if (!identityFields(event).every(field => event[field] === start.event[field])) {
      issue(result, 'segment-identity-mismatch', pair)
      continue
    }
    stage(result, event.segment, start.reading, sample.reading, event.outcome, pair)
  }
  for (const start of open.values())
    issue(result, 'segment-end-missing', { stream: 'memberEvents', indices: [start.index] })
  return completed
}

function completion(result, input, completed) {
  if (completed.length !== 1) {
    issue(
      result,
      completed.length ? 'round-completion-duplicate' : 'round-completion-missing',
      'memberEvents',
    )
    return undefined
  }
  const item = completed[0]
  const { event } = item
  if (event.outcome !== 'completed')
    issue(result, 'round-outcome-not-completed', item.source, { outcome: event.outcome })
  if (
    !text(input.session) ||
    !text(input.sessionRun) ||
    event.session !== input.session ||
    event.run !== input.sessionRun
  )
    issue(result, 'round-identity-mismatch', item.source)
  if (!['revision', 'entry', 'operation'].every(key => text(event[key])))
    issue(result, 'round-terminal-provenance-missing', item.source)
  if (!reading(input.roundStart)) issue(result, 'round-start-unmeasured', 'roundStart')
  else if (!interval(input.roundStart, item.reading))
    issue(result, 'round-clock-or-time-invalid', item.source)
  const count = input.logCount
  if (
    count?.state !== 'measured' ||
    count.unit !== 'count' ||
    !Number.isSafeInteger(count.value) ||
    count.value < 0 ||
    !text(count.source)
  )
    issue(result, 'log-count-unmeasured', 'logCount')
  return item
}

function modelEvents(result, input, events, terminal) {
  const invocations = new Set()
  for (const [index, event] of events.entries()) {
    const source = { stream: 'modelEvents', indices: [index] }
    if (!event || event.runId !== input.runId || event.round !== input.round) {
      issue(result, 'model-round-mismatch', source)
      continue
    }
    if (event.outcome !== 'completed') {
      issue(result, 'model-outcome-not-completed', source, { outcome: event.outcome })
      continue
    }
    if (
      !interval(event.start, event.end) ||
      event.elapsedMs?.state !== 'measured' ||
      event.elapsedMs.value !== event.end.atMs - event.start.atMs
    ) {
      issue(result, 'model-clock-or-time-invalid', source)
      continue
    }
    if (event.eventKind === 'stage-interval' && event.stage === 'model-request-preparation') {
      emit(
        result,
        {
          eventKind: 'stage',
          stage: 'requestAssembly',
          clock: clockOf(event.start),
          startMs: event.start.atMs,
          endMs: event.end.atMs,
        },
        source,
      )
      continue
    }
    if (
      event.eventKind !== 'external-wait-interval' ||
      event.stage !== 'model-fixed-delay' ||
      event.provider !== 'measured-fixed-delay-model'
    ) {
      issue(result, 'unsupported-model-event', source)
      continue
    }
    if (
      !interval(event.actualStart, event.actualEnd) ||
      !sameClock(event.start, event.actualStart) ||
      event.start.atMs !== event.actualStart.atMs ||
      event.end.atMs !== event.actualEnd.atMs
    ) {
      issue(result, 'model-actual-interval-mismatch', source)
      continue
    }
    if (
      !text(event.invocationId) ||
      event.definedDelay?.unit !== 'ms' ||
      !finiteTime(event.definedDelay.value)
    ) {
      issue(result, 'model-wait-identity-or-delay-invalid', source)
      continue
    }
    if (invocations.has(event.invocationId)) {
      issue(result, 'model-invocation-duplicate', source)
      continue
    }
    invocations.add(event.invocationId)
    if (
      reading(input.roundStart) &&
      (!sameClock(input.roundStart, event.actualStart) ||
        event.actualStart.atMs < input.roundStart.atMs ||
        (reading(terminal?.reading) && event.actualEnd.atMs > terminal.reading.atMs))
    ) {
      issue(result, 'model-wait-outside-round-clock-or-range', source)
      continue
    }
    emit(
      result,
      {
        eventKind: 'external-wait',
        provider: 'model',
        invocationId: event.invocationId,
        definedDelayMs: event.definedDelay.value,
        clock: clockOf(event.actualStart),
        startMs: event.actualStart.atMs,
        endMs: event.actualEnd.atMs,
      },
      source,
    )
  }
}

/**
 * 纯批投影。memberEvents是同步回调时附reading的原事件；采集者负责分轮与真实身份。
 * diagnostics非空时不发schema1轮完成，原始完成/失败/取消仍在sources保留。
 * gaps只描述工具等待尚未采用；实际有Tool调用时必须声明requiresToolWait。
 */
export function projectRound(input) {
  const result = resultFor(input)
  for (const name of ['memberEvents', 'modelEvents', 'toolEvents'])
    if (input[name] !== undefined && !Array.isArray(input[name]))
      throw new TypeError(`${name} must be an array`)
  if (input.requiresToolWait !== undefined && typeof input.requiresToolWait !== 'boolean')
    throw new TypeError('requiresToolWait must be boolean')
  const completed = memberEvents(result, input, input.memberEvents ?? [])
  const terminal = completion(result, input, completed)
  modelEvents(result, input, input.modelEvents ?? [], terminal)
  if (input.requiresToolWait || input.toolEvents?.length)
    issue(result, 'tool-wait-shape-unavailable', 'toolEvents', { gap: TOOL_WAIT_GAP.id })
  if (result.diagnostics.length === 0) {
    emit(
      result,
      {
        eventKind: 'round-complete',
        clock: clockOf(input.roundStart),
        startMs: input.roundStart.atMs,
        endMs: terminal.reading.atMs,
        logCount: input.logCount.value,
      },
      terminal.source,
    )
  }
  return result
}
