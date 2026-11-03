// R2-D133：只转换调用者已经采到的事实；时钟读取、运行关联与发行接线归采集方。
const STAGES = Object.freeze({
  session: 'sessionIO',
  context: 'projectionInterpretation',
  agent: 'agentProgression',
})

// 固定延迟替身的原事件形状：L-MODEL tests/support/model-measurement.ts，
// L-TOOL packages/tool/tool/tests/support/tool-measurement.ts（批次E e44fea864）。
const WAITS = Object.freeze({
  model: Object.freeze({ stage: 'model-fixed-delay', provider: 'measured-fixed-delay-model' }),
  tool: Object.freeze({ stage: 'tool-fixed-delay', provider: 'measured-fixed-delay-tool' }),
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
    roundEnd: null,
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

function logCountMeasured(count) {
  return (
    count?.state === 'measured' &&
    count.unit === 'count' &&
    Number.isSafeInteger(count.value) &&
    count.value >= 0 &&
    text(count.source)
  )
}

// R2-D62 D7：AD-02 提交的 Run 终态不发 Session round-complete；本波轮边界改用读到的
// `lastTerminal()`。观察时刻是终态之后的上界，含轮询延迟；仍须终态身份、结局与证据齐备。
function observedEnd(result, input, observation) {
  const source = 'terminalObservation'
  const terminal = observation?.run?.kind === 'terminal' ? observation.run.terminal : undefined
  if (!terminal || !text(observation.source)) {
    issue(result, 'round-terminal-observation-invalid', source)
    return undefined
  }
  if (terminal.outcome !== 'completed')
    issue(result, 'round-outcome-not-completed', source, { outcome: terminal.outcome })
  if (
    !text(input.session) ||
    !text(input.sessionRun) ||
    observation.session !== input.session ||
    terminal.run !== input.sessionRun
  )
    issue(result, 'round-identity-mismatch', source)
  if (terminal.evidence == null) issue(result, 'round-terminal-provenance-missing', source)
  return { reading: observation.reading, source, basis: 'observed-terminal' }
}

function memberEnd(result, input, item) {
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
  return { reading: item.reading, source: item.source, basis: 'session-round-complete' }
}

function completion(result, input, completed) {
  const observation = input.terminalObservation
  if (completed.length > 1) {
    issue(result, 'round-completion-duplicate', 'memberEvents')
    return undefined
  }
  let end
  if (completed.length === 1) {
    end = memberEnd(result, input, completed[0])
    // 两个来源同时给出时，以提交时刻的成员事件为终点，但二者必须指向同一个Run。
    if (observation !== undefined && observation?.run?.terminal?.run !== completed[0].event.run)
      issue(result, 'round-end-sources-disagree', 'terminalObservation')
  } else if (observation !== undefined) end = observedEnd(result, input, observation)
  else {
    issue(result, 'round-completion-missing', 'memberEvents')
    return undefined
  }
  if (!end) return undefined
  if (!reading(input.roundStart)) issue(result, 'round-start-unmeasured', 'roundStart')
  else if (!interval(input.roundStart, end.reading))
    issue(result, 'round-clock-or-time-invalid', end.source)
  if (!logCountMeasured(input.logCount)) issue(result, 'log-count-unmeasured', 'logCount')
  return end
}

function waitEvent(result, input, event, provider, source, invocations, terminal) {
  const shape = WAITS[provider]
  if (
    event.eventKind !== 'external-wait-interval' ||
    event.stage !== shape.stage ||
    event.provider !== shape.provider
  ) {
    issue(result, `unsupported-${provider}-event`, source)
    return false
  }
  if (
    !interval(event.actualStart, event.actualEnd) ||
    !sameClock(event.start, event.actualStart) ||
    event.start.atMs !== event.actualStart.atMs ||
    event.end.atMs !== event.actualEnd.atMs
  ) {
    issue(result, `${provider}-actual-interval-mismatch`, source)
    return false
  }
  if (
    !text(event.invocationId) ||
    event.definedDelay?.unit !== 'ms' ||
    !finiteTime(event.definedDelay.value)
  ) {
    issue(result, `${provider}-wait-identity-or-delay-invalid`, source)
    return false
  }
  // 归一器要求整轮的等待调用标识唯一，所以模型与工具共用一个集合。
  if (invocations.has(event.invocationId)) {
    issue(result, `${provider}-invocation-duplicate`, source)
    return false
  }
  invocations.add(event.invocationId)
  if (
    reading(input.roundStart) &&
    (!sameClock(input.roundStart, event.actualStart) ||
      event.actualStart.atMs < input.roundStart.atMs ||
      (reading(terminal?.reading) && event.actualEnd.atMs > terminal.reading.atMs))
  ) {
    issue(result, `${provider}-wait-outside-round-clock-or-range`, source)
    return false
  }
  emit(
    result,
    {
      eventKind: 'external-wait',
      provider,
      invocationId: event.invocationId,
      definedDelayMs: event.definedDelay.value,
      clock: clockOf(event.actualStart),
      startMs: event.actualStart.atMs,
      endMs: event.actualEnd.atMs,
    },
    source,
  )
  return true
}

function providerEvents(result, input, provider, events, terminal, invocations) {
  let waits = 0
  for (const [index, event] of events.entries()) {
    const source = { stream: `${provider}Events`, indices: [index] }
    if (!event || event.runId !== input.runId || event.round !== input.round) {
      issue(result, `${provider}-round-mismatch`, source)
      continue
    }
    if (event.outcome !== 'completed') {
      issue(result, `${provider}-outcome-not-completed`, source, { outcome: event.outcome })
      continue
    }
    if (
      !interval(event.start, event.end) ||
      event.elapsedMs?.state !== 'measured' ||
      event.elapsedMs.value !== event.end.atMs - event.start.atMs
    ) {
      issue(result, `${provider}-clock-or-time-invalid`, source)
      continue
    }
    if (
      provider === 'model' &&
      event.eventKind === 'stage-interval' &&
      event.stage === 'model-request-preparation'
    ) {
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
    if (waitEvent(result, input, event, provider, source, invocations, terminal)) waits += 1
  }
  return waits
}

/**
 * 纯批投影。memberEvents是同步回调时附reading的原事件；采集者负责分轮与真实身份。
 * diagnostics非空时不发schema1轮完成，原始完成/失败/取消仍在sources保留。
 * 本轮实际有Tool调用时声明requiresToolWait，缺工具等待记诊断，不由模型等待顶替。
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
  const invocations = new Set()
  providerEvents(result, input, 'model', input.modelEvents ?? [], terminal, invocations)
  const toolWaits = providerEvents(
    result,
    input,
    'tool',
    input.toolEvents ?? [],
    terminal,
    invocations,
  )
  if (input.requiresToolWait && toolWaits === 0) issue(result, 'tool-wait-missing', 'toolEvents')
  if (result.diagnostics.length === 0) {
    result.roundEnd = terminal.basis
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
