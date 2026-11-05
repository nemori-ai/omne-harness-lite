// E9 适配器的轮驱动：用替身世界跑 `runOneRound`，核对读不到终态时报错、读到的终态与日志数怎样交给采集者。
// 真实的 line-through 世界只在 `tools/e9/cli.mjs run` 里跑（不进准入，R2-D141）。
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRoundCollector } from '../e9/collector.mjs'
import {
  countLogEntries,
  integerSetting,
  requireSourceHooks,
  runOneRound,
  watchTerminals,
} from './e9-adapter.mjs'

const SESSION = 'cp3-session'
const access = { principal: 'p', tenant: 't', session: SESSION }

/** 一页历史：`ids` 是条目标识，`next` 是下一页游标。 */
const page = (ids, next = null) => ({
  ok: { entries: ids.map(id => ({ id })), annotations: [], next },
})

function history(pages) {
  const calls = []
  return {
    calls,
    begin: async input => {
      calls.push(['begin', input])
      return pages[0]
    },
    next: async input => {
      calls.push(['next', input])
      return pages[Number(input.cursor)]
    },
  }
}

const terminal = (run, outcome = 'completed') => ({
  ok: { run: { kind: 'terminal', terminal: { run, outcome, evidence: { record: run } } } },
})

/**
 * 替身世界：`runRound` 按 `script` 依次答 readWork（经 watch 包过的读口），像 w2-world 的 runRound 那样
 * 轮询到新终态为止；`script` 用完仍没有新终态时抛错，就像世界的 `until` 超时。
 */
function fakeWorld({ answers, entries = ['e1', 'e2'], fail }) {
  let index = 0
  const raw = async () => answers[Math.min(index++, answers.length - 1)]
  const world = {
    session: SESSION,
    access,
    history: history([page(entries)]),
    runRound: async () => {
      if (fail) throw new Error(fail)
      for (let polls = 0; polls < answers.length; polls += 1) await world.readWork(access)
    },
  }
  return { world, raw }
}

function harness(options) {
  const collector = createRoundCollector({ runId: 'e9-test', drainMs: 10 })
  const { world, raw } = fakeWorld(options)
  const watch = watchTerminals(raw, run =>
    collector.observeTerminal({ session: SESSION, run, source: 'fake readWork' }),
  )
  world.readWork = watch.readWork
  return { collector, world, watch }
}

test('a round whose Run never reaches a terminal is an error, not a completed round', async () => {
  const { collector, world, watch } = harness({ answers: [{ ok: { run: { kind: 'active' } } }] })
  await assert.rejects(
    runOneRound({ collector, world, watch, round: 1, roundMs: 10 }),
    /round 1: no Session terminal observed \(no new run\.terminal was read\)/,
  )
})

test('a round whose wait times out is an error that names the cause', async () => {
  const { collector, world, watch } = harness({ answers: [], fail: 'the condition never held' })
  await assert.rejects(
    runOneRound({ collector, world, watch, round: 1, roundMs: 10 }),
    /no Session terminal observed \(Error: the condition never held\)/,
  )
})

test('the terminal of the previous round does not end the next one', async () => {
  const { collector, world, watch } = harness({ answers: [terminal('run-1')] })
  await runOneRound({ collector, world, watch, round: 1, roundMs: 10 })
  await assert.rejects(
    runOneRound({ collector, world, watch, round: 2, roundMs: 10 }),
    /round 2: no Session terminal observed/,
  )
})

test('a failed terminal is not reported as a completed round', async () => {
  const { collector, world, watch } = harness({ answers: [terminal('run-1', 'failed')] })
  await assert.rejects(runOneRound({ collector, world, watch, round: 1, roundMs: 10 }), error =>
    error.diagnostics.some(issue => issue.code === 'round-outcome-not-completed'),
  )
})

test('a completed round carries the observed terminal and the counted log entries', async () => {
  const { collector, world, watch } = harness({
    answers: [{ ok: { run: { kind: 'idle' } } }, terminal('run-1')],
    entries: ['e1', 'e2', 'e3'],
  })
  const before = collector.clock.read().atMs
  const events = await runOneRound({ collector, world, watch, round: 1, roundMs: 10 })
  const done = events.filter(event => event.eventKind === 'round-complete')
  assert.equal(done.length, 1)
  assert.equal(done[0].logCount, 3)
  assert.ok(done[0].startMs >= before && done[0].endMs >= done[0].startMs)
})

test('the log count reads every page and counts each entry once', async () => {
  const source = history([page(['a', 'b'], '1'), page(['b', 'c'], '2'), page(['d'])])
  const count = await countLogEntries(source, access)
  assert.deepEqual(
    { state: count.state, value: count.value, unit: count.unit },
    { state: 'measured', value: 4, unit: 'count' },
  )
  assert.deepEqual(source.calls[0][1].kinds, [])
  assert.equal(source.calls.length, 3)
})

test('a failed or throwing history read is unmeasured, never a number', async () => {
  const failed = await countLogEntries(history([{ failure: { kind: 'unavailable' } }]), access)
  assert.equal(failed.state, 'unmeasured')
  assert.equal(failed.value, undefined)
  const thrown = await countLogEntries(
    {
      begin: async () => {
        throw new Error('closed')
      },
    },
    access,
  )
  assert.equal(thrown.state, 'unmeasured')
})

test('settings outside their range are refused, not replaced by the default', () => {
  assert.equal(integerSetting({}, 'OMNE_E9_ROUNDS', 200, 1, 200), 200)
  assert.equal(integerSetting({ OMNE_E9_ROUNDS: '20' }, 'OMNE_E9_ROUNDS', 200, 1, 200), 20)
  for (const raw of ['0', '201', '2.5', 'x'])
    assert.throws(() => integerSetting({ OMNE_E9_ROUNDS: raw }, 'OMNE_E9_ROUNDS', 200, 1, 200))
})

test('without the preloaded source hooks the adapter refuses to open and names the setting', () => {
  const url = new URL('./e9-source-hooks.mjs', import.meta.url).href
  assert.throws(() => requireSourceHooks({}, true), /NODE_OPTIONS=--import=/)
  assert.throws(() => requireSourceHooks({ NODE_OPTIONS: `--import=${url}` }, false))
  assert.doesNotThrow(() => requireSourceHooks({ NODE_OPTIONS: `--import=${url}` }, true))
})
