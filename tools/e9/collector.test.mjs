import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createRoundCollector, ProjectionError } from './collector.mjs'
import { normalizeEvents } from './events.mjs'

function fakeClock() {
  let now = 0
  return {
    read: () => ({ process: 'p', clock: 'fake', generation: 'g', atMs: (now += 1) }),
  }
}

const seg = (segment, span, phase, extra = {}) => ({
  kind: 'segment',
  segment,
  span,
  phase,
  ...(segment === 'session'
    ? { operation: 'accept', session: 's1' }
    : { execution: 'e1', ...(segment === 'agent' ? { pass: 'run' } : { operation: 'prepare' }) }),
  ...(phase === 'end' ? { outcome: 'ok' } : {}),
  ...extra,
})
const terminalState = (run, outcome = 'completed') => ({
  kind: 'terminal',
  terminal: { run, outcome, evidence: { opaque: run } },
})
const logCount = value => ({ state: 'measured', value, unit: 'count', source: 'test log' })

/** 一个同步的模型等待：起止都读采集者交出的钟，形状同 model-measurement.ts。 */
function modelWait(context, invocationId) {
  const start = context.clock.read()
  const end = context.clock.read()
  context.emit({
    runId: context.runId,
    round: context.round,
    eventKind: 'external-wait-interval',
    stage: 'model-fixed-delay',
    provider: 'measured-fixed-delay-model',
    invocationId,
    definedDelay: { value: 1, unit: 'ms' },
    start,
    end,
    actualStart: start,
    actualEnd: end,
    elapsedMs: { state: 'measured', value: end.atMs - start.atMs },
    logCount: { state: 'unmeasured', reason: 'not-provided' },
    outcome: 'completed',
  })
}

function driveMembers(collector, base, run) {
  collector.measure(seg('session', base, 'start'))
  collector.measure(seg('context', base, 'start'))
  collector.measure(seg('context', base, 'end'))
  collector.measure(seg('agent', base, 'start'))
  modelWait(collector.modelMeasurement(), `m-${run}`)
  collector.measure(seg('agent', base, 'end'))
  collector.measure(seg('session', base, 'end'))
  collector.observeTerminal({ session: 's1', run: terminalState(run), source: 'readWork' })
}

test('三轮收齐后每轮给出可被归一器接受的完整数组，轮终点依据为读到的终态', async () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock() })
  for (const round of [1, 2, 3]) {
    collector.beginRound(round)
    driveMembers(collector, round, `r${round}`)
    const result = await collector.finishRound({
      session: 's1',
      sessionRun: `r${round}`,
      logCount: logCount(round * 4),
    })
    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.roundEnd, 'observed-terminal')
    const row = normalizeEvents(collector.roundEvents(result), round, { kind: 'product' })
    assert.equal(row.ownOverhead.state, 'measured')
    for (const stage of ['sessionIO', 'projectionInterpretation', 'agentProgression'])
      assert.equal(row.stages[stage].state, 'measured')
    assert.equal(row.logEntries, round * 4)
  }
  assert.deepEqual(collector.strays(), [])
})

test('终态之后才收尾的本轮段在排空期并入本轮', async () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock(), drainMs: 1000 })
  collector.beginRound(1)
  driveMembers(collector, 1, 'r1')
  collector.measure(seg('session', 9, 'start', { operation: 'history.since' }))
  const finishing = collector.finishRound({
    session: 's1',
    sessionRun: 'r1',
    logCount: logCount(3),
  })
  collector.measure(seg('session', 9, 'end', { operation: 'history.since' }))
  const result = await finishing
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.drain.timedOut, false)
  assert.equal(result.sources.memberEvents.length, 8)
})

test('排空超时的段不被丢掉，本轮带诊断，roundEvents 拒绝交给 nextRound', async () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock(), drainMs: 5 })
  collector.beginRound(1)
  driveMembers(collector, 1, 'r1')
  collector.measure(seg('agent', 7, 'start'))
  const result = await collector.finishRound({
    session: 's1',
    sessionRun: 'r1',
    logCount: logCount(3),
  })
  assert.equal(result.drain.timedOut, true)
  assert.ok(result.diagnostics.some(issue => issue.code === 'segment-end-missing'))
  assert.equal(result.events.filter(event => event.eventKind === 'round-complete').length, 0)
  assert.throws(() => collector.roundEvents(result), ProjectionError)
  // 迟到的终点不会混进下一轮。
  collector.measure(seg('agent', 7, 'end'))
  assert.equal(collector.strays().length, 1)
})

test('轮外与封轮后到达的事件只进轮外记录，不并入任何轮', async () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock() })
  collector.measure(seg('session', 1, 'start'))
  collector.measure(seg('session', 1, 'end'))
  const early = collector.modelMeasurement()
  collector.beginRound(1)
  driveMembers(collector, 2, 'r1')
  const result = await collector.finishRound({
    session: 's1',
    sessionRun: 'r1',
    logCount: logCount(1),
  })
  assert.deepEqual(result.diagnostics, [])
  modelWait(early, 'm-early')
  modelWait({ ...collector.modelMeasurement(), round: 1 }, 'm-late')
  assert.deepEqual(
    collector.strays().map(item => item.stream),
    ['memberEvents', 'memberEvents', 'modelEvents', 'modelEvents'],
  )
})

test('失败终态、未测日志数都保留为诊断，不生成完成', async () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock() })
  collector.beginRound(1)
  driveMembers(collector, 1, 'r1')
  collector.observeTerminal({
    session: 's1',
    run: terminalState('r1', 'failed'),
    source: 'readWork',
  })
  const result = await collector.finishRound({
    session: 's1',
    sessionRun: 'r1',
    logCount: { state: 'unmeasured', reason: 'not read' },
  })
  const codes = result.diagnostics.map(issue => issue.code)
  assert.ok(codes.includes('round-outcome-not-completed'))
  assert.ok(codes.includes('log-count-unmeasured'))
  assert.throws(() => collector.roundEvents(result), /round 1 has diagnostics/)
})

test('轮次必须从 1 连续，且上一轮未结束时不能开新轮', () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock() })
  assert.throws(() => collector.beginRound(2), /expected round 1/)
  collector.beginRound(1)
  assert.throws(() => collector.beginRound(2), /still open/)
  assert.throws(() => createRoundCollector({ runId: '' }), TypeError)
})

test('观察者对任意输入都不抛出', () => {
  const collector = createRoundCollector({ runId: 'x', clock: fakeClock() })
  collector.beginRound(1)
  for (const value of [undefined, null, 3, { kind: 'segment' }, { kind: 'segment', fn: () => 1 }])
    assert.doesNotThrow(() => collector.measure(value))
})

test('给出 out 时逐轮写 projection.jsonl 与轮外记录，fsync 只附在合格轮上', async () => {
  const out = mkdtempSync(join(tmpdir(), 'e9-collector-'))
  try {
    const collector = createRoundCollector({ runId: 'x', clock: fakeClock(), out })
    collector.measure(seg('session', 1, 'start'))
    collector.beginRound(1)
    driveMembers(collector, 2, 'r1')
    const fsync = { count: 4, source: 'strace', traceRef: 't.log', roundAssociation: 'r1' }
    const result = await collector.finishRound({
      session: 's1',
      sessionRun: 'r1',
      logCount: logCount(2),
      fsync,
    })
    const row = normalizeEvents(collector.roundEvents(result), 1, { kind: 'product' })
    assert.equal(row.fsync.value, 4)
    collector.close()
    const lines = readFileSync(join(out, 'projection.jsonl'), 'utf8').trim().split('\n')
    assert.equal(JSON.parse(lines[0]).roundEnd, 'observed-terminal')
    assert.equal(
      readFileSync(join(out, 'projection-strays.jsonl'), 'utf8').trim().split('\n').length,
      1,
    )
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
