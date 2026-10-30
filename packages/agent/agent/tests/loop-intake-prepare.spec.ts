import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type {
  AgentCheckpoint,
  FinishIntent,
  JournalCommit,
  Preparation,
} from '@omne-harness/agent-contract'
import { readyPreparation } from '@omne-harness/agent/testing'
import { fail } from '@omne-harness/operation-result'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import {
  acceptedInput,
  evidence,
  execution,
  failure,
  ok,
  operation,
  type Principal,
  withLineage,
} from './journal-support.ts'
import { alice, eventsOf, invoke, loopAssembly, type LoopAssembly } from './loop-support.ts'

function coordinator(assembly: LoopAssembly) {
  return createExecutionCoordinator({
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
}

async function run(assembly: LoopAssembly) {
  const current = coordinator(assembly)
  ok(await current.accept())
  return current.runExecution()
}

async function snapshot(assembly: LoopAssembly) {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
}

describe('I0 fixes one batch at a legal input boundary', () => {
  it('NA-I0-1: fixes all accepted inputs, the new step and one input-taken in one commit', async () => {
    const commits: JournalCommit<Principal>[] = []
    let loads = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        async load(input) {
          loads += 1
          // Accept two inputs before E2's atomic snapshot, after E1 checked the open receipt.
          if (loads === 2) {
            for (const id of ['second', 'third'])
              ok(
                await d.journal.submit(
                  withLineage({
                    ...alice,
                    execution: execution(),
                    operation: operation(id),
                    value: acceptedInput(id),
                  }),
                ),
              )
          }
          return d.journal.load(input)
        },
        commit(input) {
          if (input.operation.startsWith('I0/')) commits.push(structuredClone(input))
          return d.journal.commit(input)
        },
      },
    }))
    assembly.release.open()
    ok(await run(assembly))
    expect(commits).toHaveLength(1)
    const commit = commits[0]
    expect(commit?.checkpoint).toMatchObject({ step: 'step-1', position: 'I1' })
    expect(commit?.events).toEqual([
      {
        kind: 'input-taken',
        batch: expect.objectContaining({
          id: commit?.checkpoint.inputBatch,
          ordered: ['input-exec-1', 'second', 'third'],
        }),
      },
    ])
    const prepare = assembly.controls.requests.prepare.calls[0]
    expect(prepare?.inputs).toEqual(
      commit?.events[0]?.kind === 'input-taken' ? commit.events[0].batch : null,
    )
  })

  it('NA-I0-2: an input accepted after intent and before Model admission waits for the next step', async () => {
    const taken: JournalCommit<Principal>[] = []
    let before: AgentCheckpoint | null = null
    let after: AgentCheckpoint | null = null
    let calls = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit(input) {
          if (input.operation.startsWith('I0/')) taken.push(structuredClone(input))
          return d.journal.commit(input)
        },
      },
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            calls += 1
            if (calls === 1) {
              before = ok(await d.journal.load({ ...alice, execution: execution() })).checkpoint
              ok(
                await d.journal.submit(
                  withLineage({
                    ...alice,
                    execution: execution(),
                    operation: operation('late'),
                    value: acceptedInput('late'),
                  }),
                ),
              )
              after = ok(await d.journal.load({ ...alice, execution: execution() })).checkpoint
            }
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    assembly.release.open()
    ok(await run(assembly))
    expect(before).toEqual(after)
    expect(taken.map(commit => commit.events)).toEqual([
      [{ kind: 'input-taken', batch: expect.objectContaining({ ordered: ['input-exec-1'] }) }],
      [{ kind: 'input-taken', batch: expect.objectContaining({ ordered: ['late'] }) }],
    ])
    expect(taken.map(commit => commit.checkpoint.step)).toEqual(['step-1', 'step-2'])
    expect(taken[1]?.checkpoint.requestPreparation).toBeNull()
    expect(taken[1]?.checkpoint.compaction).toBeNull()
    expect(calls).toBe(2)
  })

  it('NA-I0-2: two invokes on the runtime take disjoint input batches', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    assembly.release.open()
    const first = await eventsOf(ok(await invoke(assembly)))
    // The ended event precedes E9. Wait for the actual slot release before another invoke.
    const controller = new AbortController()
    for await (const seen of assembly.provider.observation.observe({
      ...alice,
      signal: controller.signal,
    })) {
      if (seen.kind === 'state' && seen.value.kind === 'idle') break
    }
    controller.abort()
    const second = await eventsOf(ok(await invoke(assembly, 'exec-2')))
    const batches = [...first, ...second].flatMap(event =>
      event.body.kind === 'input-taken' ? [event.body.batch.ordered] : [],
    )
    expect(batches).toEqual([['input-exec-1'], ['input-exec-2']])
  })

  it('an input accepted during the live call preserves the fixed request through M3 adoption', async () => {
    let before: AgentCheckpoint | null = null
    let after: AgentCheckpoint | null = null
    let stopAtI8 = false
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      conditions: {
        read: async input => {
          const at = ok(await d.journal.load({ ...alice, execution: execution() }))
          return stopAtI8 && at.checkpoint.position === 'I8'
            ? fail({ kind: 'unavailable', owner: 'test-boundary', diagnostic: 'stop at I8' })
            : d.conditions.read(input)
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    before = (await snapshot(assembly)).checkpoint
    ok(
      await assembly.dependencies.journal.submit(
        withLineage({
          ...alice,
          execution: execution(),
          operation: operation('live-input'),
          value: acceptedInput('live-input'),
        }),
      ),
    )
    after = (await snapshot(assembly)).checkpoint
    stopAtI8 = true
    const pending = before.calls[0]
    if (pending?.kind !== 'model') throw new Error('original call required')
    assembly.release.open()
    await assembly.controls.pusher?.settled({
      tenant: alice.tenant,
      call: ok(resolveModelInvocationRef(pending.reference, alice.tenant)).call,
    })
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'I8',
      failure: { kind: 'unavailable' },
    })
    expect(after).toEqual(before)
    const at = (await snapshot(assembly)).checkpoint
    expect(at.requestPreparation?.kind).toBe('ready')
    expect(at.position).toBe('I8')
    expect(assembly.controls.requests.prepare.calls).toHaveLength(2)
  })
})

describe('I1 prepares at the fixed input boundary', () => {
  it('NA-I1-1: reads conditions, selects, reads context and commits assembled before P1 produces ready', async () => {
    const log: string[] = []
    const saved: AgentCheckpoint[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      conditions: {
        read(input) {
          log.push('conditions')
          return d.conditions.read(input)
        },
      },
      selection: {
        select(input) {
          log.push('select')
          return d.selection.select(input)
        },
      },
      modelContext: {
        read(input) {
          log.push('context')
          return d.modelContext.read(input)
        },
      },
      requests: {
        ...d.requests,
        prepare(input) {
          log.push(input.previous === null ? 'prepare-first' : 'prepare-review')
          return d.requests.prepare(input)
        },
      },
      journal: {
        ...d.journal,
        commit(input) {
          if (input.operation.startsWith('I1/') || input.operation.startsWith('P1/'))
            saved.push(structuredClone(input.checkpoint))
          return d.journal.commit(input)
        },
      },
    }))
    assembly.release.open()
    ok(await run(assembly))
    expect(log.slice(0, 8)).toEqual([
      'conditions',
      'conditions',
      'select',
      'context',
      'prepare-first',
      'select',
      'prepare-review',
      'conditions',
    ])
    expect(saved.map(at => [at.position, at.requestPreparation?.kind])).toEqual([
      ['P0', 'assembled'],
      ['I2', 'ready'],
    ])
    const [initial, reviewed] = assembly.controls.requests.prepare.calls
    expect(initial).toMatchObject({
      previous: null,
      beforeModelCall: null,
      alterations: [],
      purpose: 'main',
    })
    expect(reviewed?.previous).toEqual(saved[0]?.requestPreparation)
    expect(reviewed?.beforeModelCall).toEqual([])
    expect(saved[0]?.priorConditions).toEqual(initial?.conditions.source)
  })

  it('NA-I1-2: new execution reads with no adopted coverage, then M0 adopts the returned coverage', async () => {
    let recorded: AgentCheckpoint | null = null
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit(input) {
          if (input.operation.startsWith('M0/')) recorded = structuredClone(input.checkpoint)
          return d.journal.commit(input)
        },
      },
    }))
    assembly.release.open()
    ok(await run(assembly))
    const [read] = assembly.controls.modelContext.read.calls
    expect(read?.adopted).toBeNull()
    expect(read?.transition).toBeNull()
    const final = (await snapshot(assembly)).checkpoint
    expect(final.adoptedContext).toEqual(
      final.requestPreparation?.kind === 'ready' ? final.requestPreparation.coverage : null,
    )
    expect(recorded).toMatchObject({ adoptedContext: final.adoptedContext })
    expect(final.adoptedContext).not.toBeNull()
  })

  it('passes the previous prepared condition source to the next iteration', async () => {
    let reads = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            reads += 1
            if (reads === 1)
              ok(
                await d.journal.submit(
                  withLineage({
                    ...alice,
                    execution: execution(),
                    operation: operation('late'),
                    value: acceptedInput('late'),
                  }),
                ),
              )
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    assembly.release.open()
    ok(await run(assembly))
    const conditions = assembly.controls.conditions.read.calls
    const firstPrepared = assembly.controls.requests.prepare.calls[0]?.conditions.source
    expect(conditions[0]?.previous).toBeNull()
    expect(conditions.slice(2).map(read => read.previous)).toEqual([
      firstPrepared,
      firstPrepared,
      firstPrepared,
    ])
  })

  it.each(['conditions', 'selection', 'modelContext', 'requests'] as const)(
    'NA-I1-3: unavailable %s saves one I1 wait without preparing or calling Model',
    async port => {
      let modelCalls = 0
      const unavailable = {
        kind: 'unavailable',
        owner: `test-${port}`,
        diagnostic: 'offline',
      } as const
      const assembly = await loopAssembly([execution()], d => {
        let conditions = 0
        return {
          ...d,
          conditions: {
            read(input) {
              conditions += 1
              return port === 'conditions' && conditions === 2
                ? Promise.resolve(fail(unavailable))
                : d.conditions.read(input)
            },
          },
          selection: {
            select: input =>
              port === 'selection' ? Promise.resolve(fail(unavailable)) : d.selection.select(input),
          },
          modelContext: {
            read: input =>
              port === 'modelContext'
                ? Promise.resolve(fail(unavailable))
                : d.modelContext.read(input),
          },
          requests: {
            ...d.requests,
            prepare: input =>
              port === 'requests' ? Promise.resolve(fail(unavailable)) : d.requests.prepare(input),
          },
          models: {
            ...d.models,
            calls: {
              ...d.models.calls,
              admit(input) {
                modelCalls += 1
                return d.models.calls.admit(input)
              },
            },
          },
        }
      })
      expect(await run(assembly)).toEqual({ ok: undefined })
      const read = await snapshot(assembly)
      expect(read.checkpoint.position).toBe('I1')
      expect(read.checkpoint.requestPreparation).toBeNull()
      expect(read.state).toEqual({
        kind: 'waiting',
        waits: [{ kind: 'dependency', owner: unavailable.owner, position: 'I1' }],
      })
      expect(modelCalls).toBe(0)
      const events = ok(
        await assembly.controls.journal.port.output.read({
          ...alice,
          execution: execution(),
          after: null,
          limit: 10,
        }),
      )
      expect(
        events.kind === 'page' ? events.events.map(event => event.body.kind) : events.kind,
      ).toEqual(['input-taken', 'waiting'])
    },
  )

  it('a first prepare returning ready is a provider violation and cannot start a call', async () => {
    let calls = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit(input) {
            calls += 1
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    assembly.controls.requests.prepare.always(input => ({ ok: readyPreparation(input) }))
    assembly.release.open()
    expect(failure(await run(assembly))).toMatchObject({
      node: 'I1',
      failure: { kind: 'unavailable', owner: 'requestPreparation' },
    })
    expect(calls).toBe(0)
    expect((await snapshot(assembly)).checkpoint.requestPreparation).toBeNull()
  })
})

type PrepareInput = Parameters<typeof readyPreparation<Principal>>[0]

function preparationBase(input: PrepareInput) {
  const { id, purpose, position, source, state, schema } = readyPreparation(input)
  return { id, purpose, position, source, state, schema }
}

function cannotFit(input: PrepareInput, reason: 'fixed' | 'after-compaction'): Preparation {
  return {
    ...preparationBase(input),
    kind: 'cannot-fit',
    reason,
    diagnostic: 'Context reported this limit',
  }
}

describe('I1 preparation outcomes', () => {
  it.each(['fixed', 'after-compaction'] as const)(
    'a real cannot-fit preserves reason %s in the F1 failure candidate',
    async reason => {
      let prepared: Preparation | null = null
      const finishes: FinishIntent[] = []
      let clockReads = 0
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        clock: {
          ...d.clock,
          async now() {
            clockReads += 1
            return { ok: '2026-10-21T07:00:00.000Z' }
          },
        },
        journal: {
          ...d.journal,
          tryFinish(input) {
            finishes.push(structuredClone(input.intent))
            return d.journal.tryFinish(input)
          },
        },
      }))
      assembly.controls.requests.prepare.always(input => {
        prepared = cannotFit(input, reason)
        return { ok: prepared }
      })
      ok(await run(assembly))
      const read = await snapshot(assembly)
      expect(read.checkpoint.requestPreparation).toEqual(prepared)
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      expect(finishes[0]?.failure).toMatchObject({
        kind: 'cannot-fit',
        reason,
        context: read.checkpoint.requestPreparation?.source,
        step: 'step-1',
      })
      expect(finishes[0]?.failure?.at).toBe('2026-10-21T07:00:00.000Z')
      expect(clockReads).toBe(1)
      const cause =
        read.state.kind === 'ended' && read.state.conclusion.kind === 'fail'
          ? read.state.conclusion.cause
          : null
      expect(cause?.digest).toBe(
        `sha256:${createHash('sha256')
          .update(JSON.stringify([cause?.record, finishes[0]?.failure]))
          .digest('hex')}`,
      )
      expect(finishes[0]?.failure?.source).toEqual(read.checkpoint.requestPreparation?.source)
      expect(assembly.controls.requests.prepare.calls).toHaveLength(1)
      expect(assembly.controls.requests.derive.calls).toHaveLength(0)
    },
  )

  it.each(['applied', 'dropped'] as const)(
    'a cannot-fit I1 commit with an unknown %s result reaches F1 once after reconciliation',
    async outcome => {
      let uncertain = false
      const finishes: FinishIntent[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit(input) {
            if (!uncertain && input.operation.startsWith('I1/')) {
              uncertain = true
              assembly.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome })
            }
            return d.journal.commit(input)
          },
          tryFinish(input) {
            finishes.push(structuredClone(input.intent))
            return d.journal.tryFinish(input)
          },
        },
      }))
      assembly.controls.requests.prepare.always(input => ({ ok: cannotFit(input, 'fixed') }))
      const current = coordinator(assembly)
      ok(await current.accept())
      expect(failure(await current.runExecution())).toMatchObject({
        node: 'I1',
        failure: { kind: 'commit-unknown' },
      })
      ok(await current.runExecution())
      const read = await snapshot(assembly)
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      expect(finishes[0]?.failure).toMatchObject({
        kind: 'cannot-fit',
        reason: 'fixed',
        step: 'step-1',
      })
      expect(finishes).toHaveLength(1)
      expect(assembly.controls.requests.prepare.calls).toHaveLength(outcome === 'applied' ? 1 : 2)
      const events = ok(
        await assembly.controls.journal.port.output.read({
          ...alice,
          execution: execution(),
          after: null,
          limit: 10,
        }),
      )
      expect(events.kind === 'page' ? events.events.map(event => event.body.kind) : null).toEqual([
        'input-taken',
        'ended',
      ])
    },
  )

  it.each(['applied', 'dropped'] as const)(
    'a cannot-fit F1 commit with an unknown %s result retains the exact candidate',
    async outcome => {
      const proposals: FinishIntent[] = []
      const finishes: FinishIntent[] = []
      let clockReads = 0
      let currentTime = '2026-10-21T07:00:00.000Z'
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        clock: {
          ...d.clock,
          async now() {
            clockReads += 1
            return { ok: currentTime }
          },
        },
        journal: {
          ...d.journal,
          commit(input) {
            if (input.operation.startsWith('F1/') && input.state.kind === 'settling') {
              proposals.push(structuredClone(input.state.intent))
              if (proposals.length === 1)
                assembly.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome })
            }
            return d.journal.commit(input)
          },
          tryFinish(input) {
            finishes.push(structuredClone(input.intent))
            return d.journal.tryFinish(input)
          },
        },
      }))
      assembly.controls.requests.prepare.always(input => ({ ok: cannotFit(input, 'fixed') }))
      const current = coordinator(assembly)
      ok(await current.accept())
      expect(failure(await current.runExecution())).toMatchObject({
        node: 'F1',
        failure: { kind: 'commit-unknown' },
      })
      currentTime = '2026-10-21T07:01:00.000Z'
      ok(await current.runExecution())
      expect(proposals).toHaveLength(outcome === 'applied' ? 1 : 2)
      for (const proposal of proposals) expect(proposal).toEqual(proposals[0])
      expect(finishes).toHaveLength(1)
      expect(finishes[0]?.failure).toEqual(proposals[0]?.failure)
      expect(finishes[0]?.conclusion).toEqual(proposals[0]?.conclusion)
      expect(finishes[0]?.failure?.at).toBe('2026-10-21T07:00:00.000Z')
      expect(clockReads).toBe(1)
      expect(assembly.controls.requests.prepare.calls).toHaveLength(1)
    },
  )

  it('a failed clock read retains the preparation and F1 continuation without a candidate write', async () => {
    let clockReads = 0
    const writes: FinishIntent[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      clock: {
        ...d.clock,
        async now() {
          clockReads += 1
          return clockReads === 1
            ? fail({
                kind: 'unavailable' as const,
                owner: 'agentClock',
                diagnostic: 'source offline',
              })
            : { ok: '2026-10-21T07:02:00.000Z' }
        },
      },
      journal: {
        ...d.journal,
        commit(input) {
          if (input.operation.startsWith('F1/') && input.state.kind === 'settling')
            writes.push(structuredClone(input.state.intent))
          return d.journal.commit(input)
        },
      },
    }))
    assembly.controls.requests.prepare.always(input => ({ ok: cannotFit(input, 'fixed') }))
    const current = coordinator(assembly)
    ok(await current.accept())
    expect(failure(await current.runExecution())).toEqual({
      node: 'F1',
      failure: { kind: 'unavailable', owner: 'agentClock', diagnostic: 'source offline' },
    })
    const stopped = await snapshot(assembly)
    expect(stopped.checkpoint.position).toBe('F1')
    expect(stopped.checkpoint.requestPreparation).toMatchObject({
      kind: 'cannot-fit',
      reason: 'fixed',
    })
    expect(stopped.state.kind).toBe('advancing')
    expect(writes).toHaveLength(0)
    ok(await current.runExecution())
    expect(writes).toHaveLength(1)
    expect(writes[0]?.failure?.at).toBe('2026-10-21T07:02:00.000Z')
    expect(clockReads).toBe(2)
    expect(assembly.controls.requests.prepare.calls).toHaveLength(1)
    expect((await snapshot(assembly)).state.kind).toBe('ended')
  })

  it('revision 2: needs-compaction saves the real preparation and returns unsupported without F1', async () => {
    let prepared: Preparation | null = null
    let finalizations = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        tryFinish(input) {
          finalizations += 1
          return d.journal.tryFinish(input)
        },
      },
    }))
    assembly.controls.requests.prepare.always(input => {
      prepared = {
        ...preparationBase(input),
        kind: 'needs-compaction',
        original: { input: evidence('original-input'), alterations: [], beforeModelCall: null },
        progress: { plan: evidence('plan'), bound: '2', completed: '0' },
      }
      return { ok: prepared }
    })
    expect(failure(await run(assembly))).toEqual({ node: 'I1', failure: { kind: 'unsupported' } })
    const read = await snapshot(assembly)
    expect(read.checkpoint.requestPreparation).toEqual(prepared)
    expect(read.checkpoint.position).toBe('I1')
    expect(finalizations).toBe(0)
    expect(read.state.kind).not.toBe('ended')
    expect(assembly.controls.requests.derive.calls).toHaveLength(0)
    expect(assembly.controls.requests.resume.calls).toHaveLength(0)
  })
})
