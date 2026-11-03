import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectRound, projectSegmentInterval } from './projection.mjs'
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
  assert.equal(result.roundEnd, 'session-round-complete')
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

for (const [member, field, value, stage] of [
  ['session', 'operation', 'readWork', 'sessionIO'],
  ['context', 'operation', 'derive', 'projectionInterpretation'],
  ['agent', 'pass', 'accept', 'agentProgression'],
])
  test(`${member}起止${field}不同，不投段或轮完成`, () => {
    const source = input()
    const end = source.memberEvents.find(x => x.event.segment === member && x.event.phase === 'end')
    end.event[field] = value
    const result = projectRound(source)
    assert.ok(codes(result).includes('segment-identity-mismatch'))
    assert.equal(result.events.filter(x => x.stage === stage).length, 0)
    assert.equal(completions(result).length, 0)
    assert.deepEqual(result.sources, source)
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

const tool = (extra = {}) => ({
  ...model({
    stage: 'tool-fixed-delay',
    provider: 'measured-fixed-delay-tool',
    invocationId: 't1',
    start: reading(32),
    end: reading(38),
    actualStart: reading(32),
    actualEnd: reading(38),
    elapsedMs: { state: 'measured', value: 6 },
  }),
  ...extra,
})

test('批次E工具固定延迟等待投成provider:tool，并与模型等待一起扣除', () => {
  const result = projectRound(input({ requiresToolWait: true, toolEvents: [tool()] }))
  assert.deepEqual(result.diagnostics, [])
  const waits = result.events.filter(event => event.eventKind === 'external-wait')
  assert.deepEqual(
    waits.map(wait => [wait.provider, wait.startMs, wait.endMs]),
    [
      ['model', 20, 30],
      ['tool', 32, 38],
    ],
  )
  const row = normalizeEvents(result.events, 1, { kind: 'product' })
  assert.equal(row.ownOverhead.value, 34)
})

test('声明了工具调用却没有工具等待，不能由模型等待顶替', () => {
  const result = projectRound(input({ requiresToolWait: true }))
  assert.ok(codes(result).includes('tool-wait-missing'))
  assert.equal(completions(result).length, 0)
})

for (const change of [
  { outcome: 'failed' },
  { outcome: 'cancelled' },
  { provider: 'measured-fixed-delay-model' },
  { stage: 'model-fixed-delay' },
  { eventKind: 'stage-interval', stage: 'model-request-preparation' },
  { invocationId: 'm1' },
  { round: 2 },
  { actualEnd: reading(39) },
  { definedDelay: { value: 6, unit: 's' } },
])
  test(`工具负控${JSON.stringify(change)}`, () => {
    const source = input({ requiresToolWait: true, toolEvents: [tool(change)] })
    const r = projectRound(source)
    assert.equal(r.events.filter(x => x.provider === 'tool').length, 0)
    assert.equal(completions(r).length, 0)
    assert.ok(r.diagnostics.some(issue => issue.code.startsWith('tool-')))
    assert.deepEqual(r.sources.toolEvents, source.toolEvents)
  })

const observed = (extra = {}, terminalExtra = {}) => ({
  session: 's1',
  source: 'session.readWork run.terminal (lastTerminal, R2-D62 D7)',
  reading: reading(55),
  run: {
    kind: 'terminal',
    terminal: { run: 'r1', outcome: 'completed', evidence: { opaque: 1 }, ...terminalExtra },
  },
  ...extra,
})
const withoutMemberCompletion = extra =>
  input({
    memberEvents: input().memberEvents.filter(x => x.event.kind !== 'round-complete'),
    ...extra,
  })

test('D7：没有Session round-complete时，以读到的终态时刻作轮终点并标明依据', () => {
  const result = projectRound(withoutMemberCompletion({ terminalObservation: observed() }))
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.roundEnd, 'observed-terminal')
  assert.equal(completions(result)[0].endMs, 55)
  assert.equal(normalizeEvents(result.events, 1, { kind: 'product' }).endToEnd.value, 55)
})

for (const [name, observation, code] of [
  ['失败终态', observed({}, { outcome: 'failed' }), 'round-outcome-not-completed'],
  ['取消终态', observed({}, { outcome: 'cancelled' }), 'round-outcome-not-completed'],
  ['别的Run', observed({}, { run: 'r0' }), 'round-identity-mismatch'],
  ['别的会话', observed({ session: 's2' }), 'round-identity-mismatch'],
  ['缺终态证据', observed({}, { evidence: null }), 'round-terminal-provenance-missing'],
  [
    '仍在运行',
    observed({ run: { kind: 'active', run: 'r1' } }),
    'round-terminal-observation-invalid',
  ],
  ['缺读取来源', observed({ source: '' }), 'round-terminal-observation-invalid'],
  [
    '别的时钟代次',
    observed({ reading: reading(55, { generation: 'g2' }) }),
    'round-clock-or-time-invalid',
  ],
  ['早于轮起点', observed({ reading: reading(0) }), 'model-wait-outside-round-clock-or-range'],
])
  test(`D7观察终点负控：${name}`, () => {
    const result = projectRound(withoutMemberCompletion({ terminalObservation: observation }))
    assert.ok(codes(result).includes(code), JSON.stringify(codes(result)))
    assert.equal(completions(result).length, 0)
    assert.equal(result.roundEnd, null)
  })

test('成员round-complete与读到的终态指向不同Run时不产完成', () => {
  const result = projectRound(input({ terminalObservation: observed({}, { run: 'r0' }) }))
  assert.ok(codes(result).includes('round-end-sources-disagree'))
  assert.equal(completions(result).length, 0)
})
