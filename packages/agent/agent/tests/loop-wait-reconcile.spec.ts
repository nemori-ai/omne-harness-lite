import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import { fail } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import { acceptedInput, execution, failure, ok, operation } from './journal-support.ts'
import {
  alice,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  losingEntryNotifications,
} from './loop-support.ts'

describe('R0 preserves the original conditional operation', () => {
  it.each(['unknown', 'query-unavailable', 'load-unavailable'] as const)(
    'NA-R0-2: %s preserves the original expected revision and intent',
    async outcome => {
      let pending = false
      let writes = 0
      let loads = 0
      let offline = true
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            writes += 1
            if (!pending && input.operation.startsWith('M0/')) {
              pending = true
              assembly.controls.journal.failNext('commit', {
                kind: 'commit-unknown',
                outcome: 'pending',
              })
            }
            return d.journal.commit(input)
          },
          query: input => {
            if (pending && offline && outcome === 'query-unavailable')
              return Promise.resolve(
                fail({ kind: 'unavailable', owner: 'agentJournal', diagnostic: 'offline' }),
              )
            if (pending && outcome === 'load-unavailable')
              assembly.controls.journal.settle(execution(), input.operation, 'applied')
            return d.journal.query(input)
          },
          load: input => {
            if (pending && offline && outcome === 'load-unavailable' && ++loads >= 1)
              return Promise.resolve(
                fail({ kind: 'unavailable', owner: 'agentJournal', diagnostic: 'offline' }),
              )
            return d.journal.load(input)
          },
        },
      }))
      const c = createExecutionCoordinator({
        ports: assembly.dependencies,
        binding: options().binding,
        evaluator: agentEvaluator,
        access: alice,
        execution: execution(),
        operation: operation('invoke-exec-1'),
        initial: acceptedInput('input-exec-1', 'hello exec-1'),
        grant: null,
        idle() {},
      })
      ok(await c.accept())
      expect(failure(await c.runExecution()).failure.kind).toBe('commit-unknown')
      const before = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      const written = writes
      await c.runExecution()
      expect(writes, 'R0 must not invalidate the original conditional submission').toBe(written)
      const after = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      if (outcome !== 'load-unavailable') {
        expect(after.revision).toBe(before.revision)
        expect(after.checkpoint).toEqual(before.checkpoint)
      } else {
        expect(after.checkpoint.position).toBe('M6')
        expect(after.effects).toHaveLength(1)
      }
      if (outcome !== 'load-unavailable') expect(after.unresolved).toEqual(before.unresolved)
      offline = false
      for (const original of before.unresolved)
        assembly.controls.journal.settle(execution(), original, 'applied')
      assembly.release.open()
      ok(await c.runExecution())
      const finished = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      expect(finished.state.kind).toBe('ended')
      expect(finished.effects).toHaveLength(1)
    },
  )
})

describe('W0 rereads the original producer', () => {
  it('NA-W0-2: a lost notification wakes at the configured check time without another admission', async () => {
    let admissions = 0
    let observations = 0
    let closed = 0
    const assembly = await loopAssembly(
      [execution()],
      d =>
        losingEntryNotifications({
          ...d,
          models: {
            ...d.models,
            calls: {
              ...d.models.calls,
              admit: input => {
                admissions += 1
                return d.models.calls.admit(input)
              },
            },
            instances: {
              ...d.models.instances,
              connect: async input => {
                const route = await d.models.instances.connect(input)
                if ('failure' in route || route.ok.kind !== 'live') return route
                return {
                  ok: {
                    kind: 'live',
                    handle: {
                      ...route.ok.handle,
                      async *observe(input) {
                        observations += 1
                        try {
                          await new Promise<void>(resolve => {
                            if (input.signal.aborted) resolve()
                            else
                              input.signal.addEventListener('abort', () => resolve(), {
                                once: true,
                              })
                          })
                          yield { kind: 'ended', reason: 'observer-closed' } as const
                        } finally {
                          closed += 1
                        }
                      },
                    },
                  },
                }
              },
            },
          },
        }),
      { texts: ['reply after a lost notification'], pageSize: 10 },
      { reconciliationDelayMs: 1000 },
    )
    const handle = ok(await invoke(assembly))
    await eventually(async () => assembly.controls.clock.pending().length === 1)
    expect(assembly.controls.clock.pending()).toEqual(['1970-01-01T00:00:01.000Z'])
    const waiting = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(waiting.state.kind).toBe('waiting')
    expect(waiting.checkpoint.calls).toHaveLength(1)
    assembly.release.open()
    await eventually(async () => {
      const pending = waiting.checkpoint.calls[0]
      if (pending?.kind !== 'model') return false
      const state = await assembly.dependencies.models.calls.inspect({
        ...alice,
        reference: pending.reference,
      })
      return 'ok' in state && state.ok.kind === 'found' && state.ok.state.phase === 'settled'
    })
    await eventually(async () => {
      const saved = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      return saved.entries?.some(entry => entry.kind === 'received') === true
    })
    const received = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(received.checkpoint).toEqual(waiting.checkpoint)
    expect(received.executionAttachment).toEqual(waiting.executionAttachment)
    ok(assembly.controls.clock.advanceTo('1970-01-01T00:00:01.000Z'))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
    expect(admissions).toBe(1)
    expect(observations).toBe(0)
    expect(closed).toBe(observations)
    expect(assembly.controls.clock.pending()).toEqual([])
  })
})

describe('the public driver reconciles lost Journal receipts', () => {
  it.each([
    { criterion: 'NA-R0-1', outcome: 'applied' },
    { criterion: 'NA-R0-3', outcome: 'dropped' },
    { criterion: 'NA-R0-2', outcome: 'pending' },
  ] as const)(
    '$criterion: a lost $outcome M0 receipt keeps one logical producer and resumes automatically',
    async ({ outcome }) => {
      let lost = true
      let original = operation('placeholder')
      let admissions = 0
      const queried: string[] = []
      const commits: string[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            commits.push(input.operation)
            if (lost && input.operation.startsWith('M0/')) {
              lost = false
              original = input.operation
              assembly.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome })
            }
            return d.journal.commit(input)
          },
          query: input => {
            queried.push(input.operation)
            return d.journal.query(input)
          },
        },
        models: {
          ...d.models,
          calls: {
            ...d.models.calls,
            admit: input => {
              admissions += 1
              return d.models.calls.admit(input)
            },
          },
        },
      }))
      assembly.release.open()
      const handle = ok(await invoke(assembly))
      if (outcome === 'pending') {
        await eventually(async () => assembly.controls.clock.pending().length === 1)
        const unresolved = ok(
          await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
        )
        expect(unresolved.unresolved).toEqual([original])
        expect(unresolved.state.kind).toBe('advancing')
        expect(admissions).toBe(0)
        ok(assembly.controls.clock.advanceTo('1970-01-01T00:00:01.000Z'))
        await eventually(
          async () => assembly.controls.clock.pending()[0] === '1970-01-01T00:00:02.000Z',
        )
        expect(admissions).toBe(0)
        expect(commits.filter(value => value === original)).toHaveLength(1)
        expect(assembly.controls.journal.settle(execution(), original, 'applied')).toBe(true)
        ok(assembly.controls.clock.advanceTo('1970-01-01T00:00:02.000Z'))
      }
      const events = await eventsOf(handle)
      expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
      expect(admissions).toBe(1)
      expect(queried).toContain(original)
      expect(commits.filter(value => value === original)).toHaveLength(
        outcome === 'dropped' ? 2 : 1,
      )
      expect(assembly.controls.clock.pending()).toEqual([])
    },
  )
})

describe('W0 local ownership', () => {
  it('cancels and joins the waiting resources before the same coordinator can run again', async () => {
    const assembly = await loopAssembly([execution()])
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1'),
      grant: null,
      idle() {},
    })
    const authority = ok(await c.accept())
    ok(await c.runExecution())
    const before = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    const controller = new AbortController()
    const waiting = c.waitForWake({ reconciliationDelayMs: 1000, signal: controller.signal })
    await eventually(async () => assembly.controls.clock.pending().length === 1)
    expect(
      failure(await c.waitForWake({ reconciliationDelayMs: 1000, signal: controller.signal }))
        .failure.kind,
    ).toBe('busy')
    expect(failure(await c.runExecution()).failure.kind).toBe('busy')
    expect(failure(await c.continueExecution(authority)).failure.kind).toBe('busy')
    controller.abort()
    expect(ok(await waiting)).toBe('cancelled')
    expect(assembly.controls.clock.pending()).toEqual([])
    expect(
      ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })),
    ).toEqual(before)
    assembly.release.open()
    await eventually(
      async () =>
        ok(
          await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
        ).entries?.some(
          entry =>
            entry.kind === 'received' &&
            entry.delivery.producer === 'model' &&
            entry.delivery.key.kind === 'result',
        ) === true,
    )
    ok(await c.runExecution())
    expect(
      ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })),
    ).toMatchObject({ state: { kind: 'ended' } })
  })

  it('reports an unrepresentable configured check time without fabricating a deadline', async () => {
    const assembly = await loopAssembly([execution()])
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1'),
      grant: null,
      idle() {},
    })
    ok(await c.accept())
    ok(await c.runExecution())
    const before = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(
      failure(
        await c.waitForWake({ reconciliationDelayMs: 1e300, signal: new AbortController().signal }),
      ),
    ).toMatchObject({
      node: 'W0',
      failure: { kind: 'unavailable', owner: 'agentClock' },
    })
    expect(assembly.controls.clock.pending()).toEqual([])
    expect(
      ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })),
    ).toEqual(before)
  })
})

it('a zero interval yields to other tasks and does not fabricate a positive deadline', async () => {
  const assembly = await loopAssembly([execution()])
  const c = createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1'),
    grant: null,
    idle() {},
  })
  ok(await c.accept())
  ok(await c.runExecution())
  const before = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  let otherTask = false
  setImmediate(() => {
    otherTask = true
  })
  expect(
    ok(await c.waitForWake({ reconciliationDelayMs: 0, signal: new AbortController().signal })),
  ).toBe('ready')
  expect(otherTask).toBe(true)
  expect(assembly.controls.clock.pending()).toEqual([])
  ok(await c.runExecution())
  const after = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  expect(after.revision).toBe(before.revision)
  expect(after.checkpoint).toEqual(before.checkpoint)
})

it('an abort during a pending clock read cannot miss the local stop', async () => {
  let release = () => {}
  let started = () => {}
  const reading = new Promise<void>(resolve => {
    started = resolve
  })
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  let connections = 0
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    clock: {
      ...d.clock,
      now: async () => {
        started()
        await held
        return d.clock.now()
      },
    },
    models: {
      ...d.models,
      instances: {
        connect: input => {
          connections += 1
          return d.models.instances.connect(input)
        },
      },
    },
  }))
  const c = createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1'),
    grant: null,
    idle() {},
  })
  ok(await c.accept())
  ok(await c.runExecution())
  const controller = new AbortController()
  const waiting = c.waitForWake({ reconciliationDelayMs: 1000, signal: controller.signal })
  await reading
  controller.abort()
  release()
  expect(ok(await waiting)).toBe('cancelled')
  expect(connections).toBe(0)
  expect(assembly.controls.clock.pending()).toEqual([])
})

it.each(['observer', 'clock'] as const)(
  'preserves %s cleanup failure even when a notification arrived first',
  async fault => {
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      clock: {
        ...d.clock,
        waitUntil: async (instant, signal) => {
          const result = await d.clock.waitUntil(instant, signal)
          return fault === 'clock' && 'ok' in result && result.ok === 'cancelled'
            ? fail({ kind: 'unavailable', owner: 'agentClock', diagnostic: 'clock cleanup failed' })
            : result
        },
      },
      journal: {
        ...d.journal,
        output: {
          ...d.journal.output,
          async *events(input) {
            const finish = () => {
              if (fault === 'observer') throw new Error('observer cleanup failed')
            }
            try {
              yield* d.journal.output.events({ ...input, after: null })
            } finally {
              finish()
            }
          },
        },
      },
    }))
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1'),
      grant: null,
      idle() {},
    })
    ok(await c.accept())
    ok(await c.runExecution())
    const before = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    const result = await c.waitForWake({
      reconciliationDelayMs: 1000,
      signal: new AbortController().signal,
    })
    expect(failure(result)).toMatchObject({
      node: 'W0',
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('cleanup failed') },
    })
    expect(assembly.controls.clock.pending()).toEqual([])
    expect(
      ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })),
    ).toEqual(before)
  },
)

it('NA-W0-2: an input arriving as observation starts is reread before sleeping under the original attachment', async () => {
  let inserted = false
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    journal: {
      ...d.journal,
      output: {
        ...d.journal.output,
        async *events(input) {
          if (!inserted) {
            inserted = true
            ok(
              await d.journal.submit({
                ...alice,
                execution: execution(),
                operation: operation('observation-window-input'),
                value: acceptedInput('observation-window-input'),
              }),
            )
          }
          yield* d.journal.output.events(input)
        },
      },
    },
  }))
  const c = createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1'),
    grant: null,
    idle() {},
  })
  ok(await c.accept())
  ok(await c.runExecution())
  const before = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  expect(
    ok(await c.waitForWake({ reconciliationDelayMs: 1000, signal: new AbortController().signal })),
  ).toBe('ready')
  expect(assembly.controls.clock.pending()).toEqual([])
  assembly.release.open()
  await eventually(
    async () =>
      ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      ).entries?.some(
        entry =>
          entry.kind === 'received' &&
          entry.delivery.producer === 'model' &&
          entry.delivery.key.kind === 'result',
      ) === true,
  )
  ok(await c.runExecution())
  const after = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  expect(after.state.kind).toBe('ended')
  expect(after.checkpoint.step).toBe('step-2')
  expect(after.executionAttachment).toEqual(before.executionAttachment)
  expect(assembly.controls.requests.prepare.calls).toHaveLength(4)
})

it('NA-R0-2: an unknown W0 commit is queried without a second waiting submission', async () => {
  let original = operation('placeholder')
  let lost = false
  let waitingWrites = 0
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    journal: {
      ...d.journal,
      commit: input => {
        if (input.operation.startsWith('W0/')) {
          waitingWrites += 1
          if (!lost) {
            lost = true
            original = input.operation
            assembly.controls.journal.failNext('commit', {
              kind: 'commit-unknown',
              outcome: 'pending',
            })
          }
        }
        return d.journal.commit(input)
      },
    },
  }))
  const handle = ok(await invoke(assembly))
  await eventually(async () => assembly.controls.clock.pending().length === 1)
  const before = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  expect(before.unresolved).toEqual([original])
  expect(waitingWrites).toBe(1)
  ok(assembly.controls.clock.advanceTo('1970-01-01T00:00:01.000Z'))
  await eventually(async () => assembly.controls.clock.pending()[0] === '1970-01-01T00:00:02.000Z')
  expect(
    ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })),
  ).toEqual(before)
  expect(waitingWrites).toBe(1)
  expect(assembly.controls.journal.settle(execution(), original, 'applied')).toBe(true)
  assembly.release.open()
  ok(assembly.controls.clock.advanceTo('1970-01-01T00:00:02.000Z'))
  const events = await eventsOf(handle)
  expect(events.filter(event => event.body.kind === 'waiting')).toHaveLength(1)
  expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
  expect(waitingWrites).toBe(1)
})

it('NA-W0-1: an input racing the waiting commit is reread without abandoning the original call', async () => {
  let inserted = false
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    journal: {
      ...d.journal,
      commit: async input => {
        if (!inserted && input.operation.startsWith('W0/')) {
          inserted = true
          ok(
            await d.journal.submit({
              ...alice,
              execution: execution(),
              operation: operation('before-wait-commit'),
              value: acceptedInput('before-wait-commit'),
            }),
          )
        }
        return d.journal.commit(input)
      },
    },
  }))
  const c = createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1'),
    grant: null,
    idle() {},
  })
  ok(await c.accept())
  ok(await c.runExecution())
  const waiting = ok(
    await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
  )
  expect(waiting.state.kind).toBe('waiting')
  expect(waiting.checkpoint.calls).toHaveLength(1)
  assembly.release.open()
  await eventually(
    async () =>
      ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      ).entries?.some(
        entry =>
          entry.kind === 'received' &&
          entry.delivery.producer === 'model' &&
          entry.delivery.key.kind === 'result',
      ) === true,
  )
  ok(await c.runExecution())
  const finished = ok(
    await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
  )
  expect(finished.state.kind).toBe('ended')
  expect(finished.checkpoint.step).toBe('step-2')
})

describe('review regressions preserve the original wait responsibility', () => {
  it.each(['same', 'fresh'] as const)(
    'NA-R0-2: %s coordinator continuation queries unknown M3 before another fallible load',
    async mode => {
      let pending = false
      let continuing = false
      let loads = 0
      let original = operation('placeholder')
      const writes: string[] = []
      const queries: string[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            writes.push(input.operation)
            if (!pending && input.operation.startsWith('M3/')) {
              pending = true
              original = input.operation
              assembly.controls.journal.failNext('commit', {
                kind: 'commit-unknown',
                outcome: 'pending',
              })
            }
            return d.journal.commit(input)
          },
          query: input => {
            queries.push(input.operation)
            return d.journal.query(input)
          },
          load: input =>
            continuing && ++loads === 2
              ? Promise.resolve(
                  fail({
                    kind: 'unavailable',
                    owner: 'agentJournal',
                    diagnostic: 'continuation E1 offline',
                  }),
                )
              : d.journal.load(input),
        },
      }))
      const create = () =>
        createExecutionCoordinator({
          ports: assembly.dependencies,
          binding: options().binding,
          evaluator: agentEvaluator,
          access: alice,
          execution: execution(),
          operation: operation('invoke-exec-1'),
          initial: acceptedInput('input-exec-1'),
          grant: null,
          idle() {},
        })
      const first = create()
      const authority = ok(await first.accept())
      assembly.release.open()
      let ran = await first.runExecution()
      if ('ok' in ran) ran = await first.runExecution()
      expect(failure(ran).failure.kind).toBe('commit-unknown')
      const before = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      const oldWrites = writes.length
      const oldQueries = queries.length
      const next = mode === 'same' ? first : create()
      continuing = true
      await next.continueExecution(authority)
      continuing = false
      const after = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      expect(
        writes.slice(oldWrites),
        'continuation must not invalidate the original expected revision',
      ).toEqual([])
      expect(queries.slice(oldQueries)).toContain(original)
      expect(after).toEqual(before)
      expect(assembly.controls.journal.settle(execution(), original, 'applied')).toBe(true)
      expect(
        ok(
          await assembly.controls.journal.port.query({
            ...alice,
            execution: execution(),
            operation: original,
          }),
        ).kind,
      ).toBe('committed')
      ok(await next.runExecution())
      const ended = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      expect(ended.state.kind).toBe('ended')
      expect(ended.results).toEqual([])
      expect(ended.entries?.filter(entry => entry.kind === 'received')).toHaveLength(1)
      expect(ended.effects).toHaveLength(1)
    },
  )

  it('NA-W0-1: a dependency that recovers during W0 is reread before the check timer', async () => {
    let available = false
    let reads = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      conditions: {
        read: input => {
          reads += 1
          return available
            ? d.conditions.read(input)
            : Promise.resolve(
                fail({ kind: 'unavailable', owner: 'conditions', diagnostic: 'offline' }),
              )
        },
      },
      journal: {
        ...d.journal,
        commit: async input => {
          const result = await d.journal.commit(input)
          if (input.state.kind === 'waiting' && 'ok' in result) available = true
          return result
        },
      },
    }))
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1'),
      grant: null,
      idle() {},
    })
    ok(await c.accept())
    ok(await c.runExecution())
    const before = reads
    const controller = new AbortController()
    const waiting = c.waitForWake({ reconciliationDelayMs: 1000, signal: controller.signal })
    await eventually(async () => reads > before || assembly.controls.clock.pending().length > 0)
    const reread = reads > before
    const slept = assembly.controls.clock.pending().length > 0
    controller.abort()
    await waiting
    expect(
      reread,
      'the original failed conditions read must be retried after observation starts',
    ).toBe(true)
    expect(slept, 'a recovered dependency must return to E1 without sleeping').toBe(false)
    assembly.release.open()
    ok(await c.runExecution())
    expect(
      ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })).state
        .kind,
    ).toBe('ended')
  })

  it.each(['conditions', 'selection', 'context', 'prepare'] as const)(
    'rereads a recovered I1 %s dependency before sleeping and admits one producer',
    async target => {
      let reads = 0
      const failureAt = target === 'conditions' ? 2 : 1
      const unavailable = {
        kind: 'unavailable' as const,
        owner: target,
        diagnostic: 'one failed read',
      }
      const failedRead = () => ++reads === failureAt
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        conditions: {
          read: input =>
            target === 'conditions' && failedRead()
              ? Promise.resolve(fail(unavailable))
              : d.conditions.read(input),
        },
        selection: {
          select: input =>
            target === 'selection' && failedRead()
              ? Promise.resolve(fail(unavailable))
              : d.selection.select(input),
        },
        modelContext: {
          read: input =>
            target === 'context' && failedRead()
              ? Promise.resolve(fail(unavailable))
              : d.modelContext.read(input),
        },
        requests: {
          ...d.requests,
          prepare: input =>
            target === 'prepare' && failedRead()
              ? Promise.resolve(fail(unavailable))
              : d.requests.prepare(input),
        },
      }))
      assembly.release.open()
      const handle = ok(await invoke(assembly))
      await eventually(
        async () =>
          ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })).state
            .kind === 'ended',
      )
      const ended = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      expect(reads).toBeGreaterThan(failureAt)
      expect(ended.effects).toHaveLength(1)
      expect((await eventsOf(handle)).filter(event => event.body.kind === 'waiting')).toHaveLength(
        1,
      )
      expect(assembly.controls.clock.pending()).toEqual([])
    },
  )

  it.each(['unavailable', 'denied'] as const)(
    'keeps a %s dependency reread as its actual outcome',
    async outcome => {
      let waitingSaved = false
      let reads = 0
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        conditions: {
          read: async () => {
            reads += 1
            return waitingSaved && outcome === 'denied'
              ? fail({ kind: 'denied' as const, action: 'conditions.read' })
              : fail({ kind: 'unavailable' as const, owner: 'conditions', diagnostic: 'offline' })
          },
        },
        journal: {
          ...d.journal,
          commit: async input => {
            const result = await d.journal.commit(input)
            if (input.state.kind === 'waiting' && 'ok' in result) waitingSaved = true
            return result
          },
        },
      }))
      const c = createExecutionCoordinator({
        ports: assembly.dependencies,
        binding: options().binding,
        evaluator: agentEvaluator,
        access: alice,
        execution: execution(),
        operation: operation('invoke-exec-1'),
        initial: acceptedInput('input-exec-1'),
        grant: null,
        idle() {},
      })
      ok(await c.accept())
      ok(await c.runExecution())
      const before = ok(
        await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
      )
      const controller = new AbortController()
      const waiting = c.waitForWake({ reconciliationDelayMs: 1000, signal: controller.signal })
      if (outcome === 'unavailable') {
        await eventually(async () => assembly.controls.clock.pending().length === 1)
        expect(reads).toBe(2)
        // An unrelated healthy Journal read is not recovery of the failed conditions port.
        ok(assembly.controls.clock.advanceTo('1970-01-01T00:00:01.000Z'))
        expect(ok(await waiting)).toBe('ready')
        ok(await c.runExecution())
        const again = c.waitForWake({ reconciliationDelayMs: 1000, signal: controller.signal })
        await eventually(async () => assembly.controls.clock.pending().length === 1)
        expect(reads).toBe(4)
        controller.abort()
        expect(ok(await again)).toBe('cancelled')
      } else {
        expect(failure(await waiting)).toMatchObject({ node: 'W0', failure: { kind: 'denied' } })
      }
      expect(assembly.controls.clock.pending()).toEqual([])
      expect(
        ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })),
      ).toEqual(before)
    },
  )

  it.each(['during-reread', 'after-timer-start'] as const)(
    'joins a rejecting Clock %s without an unhandled rejection in strict Node',
    mode => {
      const waitUrl = new URL('../src/loop/wait.ts', import.meta.url).href
      const child = spawnSync(
        process.execPath,
        ['--conditions=source', '--unhandled-rejections=strict', '--input-type=module'],
        {
          input: `
        import assert from 'node:assert/strict'
        import { setTimeout as delay } from 'node:timers/promises'
        import { waitForExecutionChange } from ${JSON.stringify(waitUrl)}
        let loads = 0, closed = false
        const mode = ${JSON.stringify(mode)}
        const outer = new AbortController()
        const snapshot = { revision: '1', output: { emittedThrough: null } }
        const result = await waitForExecutionChange({
          ports: {
            journal: {
              async load() { if (++loads === 2 && mode === 'during-reread') outer.abort(); return { ok: snapshot } },
              output: { async *events({ signal }) {
                if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
                await delay(20)
                closed = true
              } },
            },
            clock: {
              async now() { return { ok: '1970-01-01T00:00:00.000Z' } },
              async waitUntil(_at, signal) {
                assert.equal(signal.aborted, mode === 'during-reread')
                if (!signal.aborted) {
                  queueMicrotask(() => outer.abort())
                  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
                }
                throw new Error('clock shutdown rejected')
              },
            },
          },
          access: {}, execution: 'exec-1', expected: '1', operations: [], waits: [],
          position: 'E2', reconciliationDelayMs: 1000, signal: outer.signal,
        })
        assert.equal(closed, true)
        assert.equal(result.failure.kind, 'unavailable')
        assert.match(result.failure.diagnostic, /clock shutdown rejected/)
        console.log('joined clock failure with no unhandled rejection')
      `,
          encoding: 'utf8',
          timeout: 10_000,
        },
      )
      expect(child.error).toBeUndefined()
      expect(child.status, child.stderr).toBe(0)
      expect(child.stdout).toContain('joined clock failure with no unhandled rejection')
      expect(child.stderr).not.toContain('PromiseRejectionHandledWarning')
    },
  )

  it.each(['observer', 'clock'] as const)(
    'joins %s rejection when the thrown value cannot become diagnostic text',
    mode => {
      const waitUrl = new URL('../src/loop/wait.ts', import.meta.url).href
      const child = spawnSync(process.execPath, ['--conditions=source', '--input-type=module'], {
        input: `
        import assert from 'node:assert/strict'
        import { setTimeout as delay } from 'node:timers/promises'
        import { waitForExecutionChange } from ${JSON.stringify(waitUrl)}
        const mode = ${JSON.stringify(mode)}
        const thrown = { [Symbol.toPrimitive]() { throw new Error('diagnostic conversion failed') } }
        let closed = false
        const snapshot = { revision: '1', output: { emittedThrough: null } }
        const untilAborted = signal => signal.aborted ? Promise.resolve() :
          new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
        const result = await waitForExecutionChange({
          ports: {
            journal: {
              async load() { return { ok: snapshot } },
              output: { async *events({ signal }) {
                try {
                  if (mode === 'observer') { await delay(5); throw thrown }
                  await untilAborted(signal)
                } finally { await delay(20); closed = true }
              } },
            },
            clock: {
              async now() { return { ok: '1970-01-01T00:00:00.000Z' } },
              async waitUntil(_at, signal) {
                if (mode === 'clock') throw thrown
                await untilAborted(signal)
                return { ok: 'cancelled' }
              },
            },
          },
          access: {}, execution: 'exec-1', expected: '1', operations: [], waits: [],
          position: 'E2', reconciliationDelayMs: 1000, signal: new AbortController().signal,
        })
        assert.equal(closed, true)
        assert.equal(result.failure.kind, 'unavailable')
        assert.equal(result.failure.owner, '@omne-harness/agent#defect')
        assert.equal(result.failure.diagnostic, 'the thrown value could not be converted to diagnostic text')
        console.log('joined hostile rejection with no unhandled rejection')
      `,
        encoding: 'utf8',
        timeout: 10_000,
      })
      expect(child.error).toBeUndefined()
      expect(child.status, child.stderr).toBe(0)
      expect(child.stdout).toContain('joined hostile rejection with no unhandled rejection')
      expect(child.stderr).not.toContain('PromiseRejectionHandledWarning')
    },
  )
})
