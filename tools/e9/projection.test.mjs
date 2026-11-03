import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectRound, projectSegmentInterval, TOOL_WAIT_GAP } from './projection.mjs'
import { normalizeEvents } from './events.mjs'

const reading = (atMs, extra = {}) => ({
  process: 'p1',
  clock: 'monotonic',
  generation: 'g1',
  atMs,
  ...extra,
})
const sample = (event, atMs, extra) => ({ event, reading: reading(atMs, extra) })
const segment = (name, span, phase, extra = {}) => ({
  kind: 'segment',
  segment: name,
  span,
  phase,
  ...(name === 'session'
    ? { operation: 'finishRun', session: 's1' }
    : { execution: 'e1', ...(name === 'agent' ? { pass: 'run' } : { operation: 'prepare' }) }),
  ...(phase === 'end' ? { outcome: 'ok' } : {}),
  ...extra,
})
const terminal = (extra = {}) => ({
  kind: 'round-complete',
  session: 's1',
  run: 'r1',
  outcome: 'completed',
  revision: 'opaque',
  entry: 'entry1',
  operation: 'op1',
  ...extra,
})
const model = (extra = {}) => ({
  runId: 'experiment',
  round: 1,
  eventKind: 'external-wait-interval',
  stage: 'model-fixed-delay',
  provider: 'measured-fixed-delay-model',
  invocationId: 'm1',
  definedDelay: { value: 10, unit: 'ms' },
  start: reading(20),
  end: reading(30),
  actualStart: reading(20),
  actualEnd: reading(30),
  elapsedMs: { state: 'measured', value: 10 },
  logCount: { state: 'unmeasured', reason: 'not-provided' },
  outcome: 'completed',
  ...extra,
})
const input = (extra = {}) => ({
  runId: 'experiment',
  round: 1,
  session: 's1',
  sessionRun: 'r1',
  roundStart: reading(0),
  logCount: { state: 'measured', value: 12, unit: 'count', source: 'observed Session log entries' },
  memberEvents: [
    sample(segment('session', 1, 'start'), 1),
    sample(segment('context', 1, 'start'), 2),
    sample(segment('agent', 1, 'start'), 3),
    sample(segment('context', 1, 'end'), 40),
    sample(segment('agent', 1, 'end'), 45),
    sample(terminal(), 50),
    sample(segment('session', 1, 'end'), 51),
  ],
  modelEvents: [
    model(),
    model({
      eventKind: 'stage-interval',
      stage: 'model-request-preparation',
      start: reading(4),
      end: reading(14),
    }),
  ],
  ...extra,
})
const completions = result => result.events.filter(event => event.eventKind === 'round-complete')
const codes = result => result.diagnostics.map(issue => issue.code)

test('拒绝错误顶层形状，不将其当成空的成功记录', () => {
  for (const extra of [
    { runId: '' },
    { round: 0 },
    { round: 201 },
    { memberEvents: null },
    { modelEvents: {} },
    { requiresToolWait: 'false' },
  ])
    assert.throws(() => projectRound(input(extra)), TypeError)
})

test('实际等待不能由配置延迟推算，模型缺日志数不被拿来补轮日志数', () => {
  const result = projectRound(
    input({ modelEvents: [model({ definedDelay: { value: 999, unit: 'ms' } })] }),
  )
  const wait = result.events.find(event => event.eventKind === 'external-wait')
  assert.equal(wait.startMs, 20)
  assert.equal(wait.endMs, 30)
  assert.equal(wait.definedDelayMs, 999)
  assert.equal(completions(result)[0].logCount, 12)
  assert.equal(result.sources.modelEvents[0].logCount.state, 'unmeasured')
})

test('同号span按成员分开，保留包含式区间并接入现有schema1归一器', () => {
  const source = input()
  const copy = structuredClone(source)
  const result = projectRound(source)
  assert.deepEqual(source, copy)
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.gaps, [TOOL_WAIT_GAP])
  assert.equal(completions(result).length, 1)
  const row = normalizeEvents(result.events, 1, { kind: 'product' })
  assert.equal(row.endToEnd.value, 50)
  assert.equal(row.ownOverhead.value, 40)
  assert.equal(row.stages.sessionIO.value, 50)
  assert.equal(row.stages.projectionInterpretation.value, 38)
  assert.equal(row.stages.agentProgression.value, 42)
  assert.equal(row.stages.requestAssembly.value, 10)
  assert.equal(row.fsync.state, 'unmeasured')
  assert.equal(row.externalWaits[0].provider, 'model')
  assert.equal(row.externalWaits[0].definedDelayMs, 10)
  assert.deepEqual(result.sources, copy)
  source.memberEvents[0].event.operation = 'changed'
  assert.equal(result.sources.memberEvents[0].event.operation, 'finishRun')
})

for (const outcome of ['failed', 'cancelled', null, 'ok', 'unknown'])
  test(`终态${outcome}不能伪造成功轮`, () => {
    const source = input()
    source.memberEvents[5].event.outcome = outcome
    const result = projectRound(source)
    assert.equal(completions(result).length, 0)
    assert.ok(codes(result).includes('round-outcome-not-completed'))
    assert.equal(result.sources.memberEvents[5].event.outcome, outcome)
  })

for (const logCount of [
  undefined,
  null,
  12,
  { state: 'unmeasured', reason: 'history not read' },
  { state: 'measured', value: NaN, unit: 'count', source: 'bad' },
  { state: 'measured', value: 1.5, unit: 'count', source: 'bad' },
  { state: 'measured', value: 12, unit: 'count', source: '' },
])
  test(`日志数不可得/不合格不生成轮：${JSON.stringify(logCount)}`, () => {
    const result = projectRound(input({ logCount }))
    assert.equal(completions(result).length, 0)
    assert.ok(codes(result).includes('log-count-unmeasured'))
    assert.deepEqual(result.sources.logCount, logCount)
  })

test('不由revision、段最小起点或仅200轮计数猜完成/起点', () => {
  const source = input({ roundStart: undefined })
  const result = projectRound(source)
  assert.equal(completions(result).length, 0)
  assert.ok(codes(result).includes('round-start-unmeasured'))
  source.memberEvents = source.memberEvents.filter(x => x.event.kind !== 'round-complete')
  source.completed = 200
  assert.ok(codes(projectRound(source)).includes('round-completion-missing'))
})

for (const change of [{ run: null }, { run: 'other' }, { session: 'other' }])
  test(`轮身份拒绝：${JSON.stringify(change)}`, () => {
    const source = input()
    Object.assign(source.memberEvents[5].event, change)
    assert.equal(completions(projectRound(source)).length, 0)
  })

test('重复完成、未闭合span、孤立终点、起止身份不同均不产完成', () => {
  const base = input()
  const variants = [
    [...base.memberEvents, sample(terminal(), 52)],
    base.memberEvents.filter(x => !(x.event.segment === 'session' && x.event.phase === 'end')),
    [...base.memberEvents, sample(segment('agent', 900, 'end'), 49)],
    base.memberEvents.map(x =>
      x.event.segment === 'context' && x.event.phase === 'end'
        ? { ...x, event: { ...x.event, execution: 'another' } }
        : x,
    ),
    [...base.memberEvents, sample(segment('session', 1, 'start'), 3)],
  ]
  for (const memberEvents of variants) {
    const r = projectRound(input({ memberEvents }))
    assert.equal(completions(r).length, 0)
    assert.ok(r.diagnostics.length)
  }
})

test('跨钟/倒序不配对，失败段不投成成功stage', () => {
  for (const change of [
    { reading: reading(40, { generation: 'g2' }) },
    { reading: reading(1) },
    { event: segment('context', 1, 'end', { outcome: 'failure' }) },
  ]) {
    const source = input()
    Object.assign(source.memberEvents[3], change)
    const r = projectRound(source)
    assert.equal(completions(r).length, 0)
    assert.equal(r.events.filter(x => x.stage === 'projectionInterpretation').length, 0)
  }
})

test('相同segment重叠区间不被求和，交由现有归一器求并集', () => {
  const source = input()
  source.memberEvents.push(
    sample(segment('session', 2, 'start', { operation: 'readWork' }), 10),
    sample(segment('session', 2, 'end', { operation: 'readWork' }), 20),
  )
  const result = projectRound(source)
  assert.equal(normalizeEvents(result.events, 1, { kind: 'product' }).stages.sessionIO.value, 50)
})

for (const change of [
  { outcome: 'failed' },
  { outcome: 'cancelled' },
  { provider: 'tool' },
  { stage: 'tool-fixed-delay' },
  { runId: 'different' },
  { round: 2 },
  { definedDelay: { value: 10, unit: 's' } },
  { actualEnd: reading(31) },
  { elapsedMs: { state: 'unmeasured', reason: 'clock-mismatch' } },
  { end: reading(30, { process: 'other' }) },
  { invocationId: '' },
])
  test(`模型负控${JSON.stringify(change)}`, () => {
    const source = input({ modelEvents: [model(change)] })
    const r = projectRound(source)
    assert.equal(r.events.filter(x => x.eventKind === 'external-wait').length, 0)
    assert.equal(completions(r).length, 0)
    assert.ok(r.diagnostics.length)
    assert.deepEqual(r.sources.modelEvents, source.modelEvents)
  })

test('等待不落在轮区间、重复调用标识不变成可消费完成轮', () => {
  for (const events of [
    [
      model({
        start: reading(60),
        end: reading(70),
        actualStart: reading(60),
        actualEnd: reading(70),
      }),
    ],
    [model(), model()],
  ]) {
    const r = projectRound(input({ modelEvents: events }))
    assert.equal(completions(r).length, 0)
    assert.ok(r.diagnostics.length)
  }
})

test('工具等待保留具名缺口和原样输入，不能改成model', () => {
  const source = input({ requiresToolWait: true, toolEvents: [{ opaque: 'batch E not adopted' }] })
  const r = projectRound(source)
  assert.ok(codes(r).includes('tool-wait-shape-unavailable'))
  assert.equal(completions(r).length, 0)
  assert.equal(
    r.events.some(x => x.provider === 'tool'),
    false,
  )
  assert.deepEqual(r.sources.toolEvents, source.toolEvents)
})

test('已聚合真实区间入口不推断round-complete或日志数', () => {
  const source = {
    runId: 'experiment',
    round: 1,
    segment: 'session',
    start: reading(2),
    end: reading(7),
    outcome: 'ok',
    source: { generation: 'g1', detail: { operation: 'readWork' } },
  }
  const r = projectSegmentInterval(source)
  assert.equal(r.events[0].stage, 'sessionIO')
  assert.equal(r.events[0].startMs, 2)
  assert.equal(completions(r).length, 0)
  assert.deepEqual(r.sources, source)
  assert.ok(projectSegmentInterval({ ...source, outcome: 'failure' }).diagnostics.length)
})
