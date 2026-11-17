import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { evidence, execution, ok, operation } from './journal-support.ts'
import { alice } from './loop-support.ts'
import { compactionAdoption } from './fixtures/compaction-input.ts'
import { rebuilt } from './loop-takeover-support.ts'
import { compactionLoop as fixture } from './fixtures/compaction-loop.ts'

it('adopts the complete service message atomically and resumes the original main request', async () => {
  const f = await fixture()
  ok(await f.current.runExecution())
  const read = ok(await f.dependencies.journal.load({ ...alice, execution: execution() }))
  expect(f.requests).toHaveLength(1)
  expect(f.requests[0]?.input).toEqual(f.frozen)
  expect(f.controls.requests.assessCompaction.calls).toHaveLength(1)
  expect(f.controls.requests.resume.calls).toHaveLength(1)
  expect(f.controls.journal.joint()).toHaveLength(1)
  expect(f.controls.journal.joint()[0]?.caller).toMatchObject({
    kind: 'context-transition',
    value: { message: f.message },
  })
  expect(read.checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
  expect(read.checkpoint.compaction).toBeNull()
  expect(read.results.filter(item => item.result.producer.kind === 'compaction')).toEqual([])
})

it.each([
  [
    'cannot-fit',
    {
      kind: 'cannot-fit',
      reason: 'protected-floor',
      diagnostic: 'the protected history is over the budget',
    },
  ],
  [
    'cannot-fit',
    {
      kind: 'cannot-fit',
      reason: 'after-compaction',
      diagnostic: 'the summary still does not fit',
    },
  ],
  [
    'compaction-failed',
    {
      kind: 'failed',
      reason: 'execution-limit',
      diagnostic: 'the summary request is over its limit',
    },
  ],
] as const)(
  'ends the Run as a named %s from the one task and sends no further main request',
  async (kind, ended) => {
    const f = await fixture(undefined, ended)
    ok(await f.current.runExecution())
    const read = ok(await f.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(f.requests).toHaveLength(1)
    expect(f.controls.requests.prepare.calls).toHaveLength(1)
    expect(f.controls.requests.assessCompaction.calls).toHaveLength(0)
    expect(f.controls.requests.resume.calls).toHaveLength(0)
    expect(f.controls.journal.joint().map(item => item.caller?.kind)).not.toContain(
      'context-transition',
    )
    expect(read.checkpoint.calls).toEqual([])
    expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(f.finishes).toHaveLength(1)
    expect(f.finishes[0]?.failure).toMatchObject({ kind, reason: ended.reason })
  },
)

it('rebuilds an uncommitted compaction handoff after a concurrent output acknowledgement', async () => {
  const f = await fixture()
  const journal = f.dependencies.journal
  let injected = false
  f.dependencies.journal = {
    ...journal,
    async commit(input) {
      if (!injected && input.handoff?.kind === 'prepare') {
        injected = true
        const before = ok(await journal.load({ ...alice, execution: execution() }))
        if (before.output.emittedThrough === null) throw new Error('an input event is required')
        ok(
          await journal.acknowledge({
            ...alice,
            execution: execution(),
            operation: operation('concurrent-ack'),
            through: before.output.emittedThrough,
            receipt: evidence('consumer'),
          }),
        )
      }
      return journal.commit(input)
    },
  }
  ok(await f.current.runExecution())
  expect(injected).toBe(true)
  expect(f.requests).toHaveLength(1)
  expect(f.controls.journal.joint()).toHaveLength(1)
  expect(f.controls.requests.resume.calls).toHaveLength(1)
})

it('refuses a handoff that rewrites the complete compaction message', async () => {
  const f = await fixture()
  f.controls.handoff.prepare.always(input => {
    if (input.request.kind !== 'execution' || input.request.source.kind !== 'context-transition')
      throw new Error('this test expects only the compaction handoff')
    return succeed({
      request: input.request,
      origin: null,
      provider: compactionAdoption,
      qualification: evidence('qualification'),
      record: evidence('record'),
      decision: {
        kind: 'prepared',
        admission: evidence('admission'),
        message: { ...f.message, derivation: evidence('rewritten') },
      },
    })
  })
  ok(await f.current.runExecution())
  const read = ok(await f.dependencies.journal.load({ ...alice, execution: execution() }))
  expect(f.controls.requests.resume.calls).toHaveLength(0)
  expect(f.controls.journal.joint()).toEqual([])
  expect(read.checkpoint.calls).toEqual([])
})

it.each(['applied', 'dropped'] as const)(
  'recognizes the original adoption after a %s unknown commit',
  async outcome => {
    const f = await fixture()
    const journal = f.dependencies.journal
    let injected = false
    f.dependencies.journal = {
      ...journal,
      commit(input) {
        if (!injected && input.caller.kind === 'context-transition') {
          injected = true
          f.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome })
        }
        return journal.commit(input)
      },
    }
    expect(await f.current.runExecution()).toHaveProperty('failure.failure.kind', 'commit-unknown')
    ok(await f.current.runExecution())
    const read = ok(await journal.load({ ...alice, execution: execution() }))
    expect(injected).toBe(true)
    expect(f.requests).toHaveLength(1)
    expect(f.controls.journal.joint()).toHaveLength(1)
    expect(f.controls.requests.resume.calls).toHaveLength(1)
    expect(read.results.filter(item => item.result.producer.kind === 'compaction')).toEqual([])
    expect(read.checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
  },
)

it.each(['admit', 'acknowledge', 'admit-unapplied', 'acknowledge-unapplied'] as const)(
  'resumes across serialized delayed RPC and a broken %s link under the original task',
  async lost => {
    const f = await fixture(lost)
    const first = await f.current.runExecution()
    expect(first).toHaveProperty('failure.failure.kind', 'unavailable')
    expect(f.transport?.lost()).toBe(true)
    const restarted = await rebuilt(f.dependencies, f.entry, `compaction-${lost}`)
    ok(await restarted.runExecution())
    const read = ok(await f.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0]?.input).toEqual(f.frozen)
    expect(f.requests[0]?.input).not.toBe(f.frozen)
    expect(f.transport?.calls.filter(call => call.method === 'admit')).toHaveLength(1)
    expect(f.transport?.calls.every(call => call.bytes > 0)).toBe(true)
    expect(f.controls.journal.joint()).toHaveLength(1)
    expect(f.controls.requests.resume.calls).toHaveLength(1)
    expect(read.checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
    expect(read.checkpoint.compaction).toBeNull()
  },
)
