import { describe, expect, it } from 'vitest'
import { advanceControl, agentEvaluator } from '@omne-harness/agent'
import { fail, succeed } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import type { AgentJournal } from '@omne-harness/agent-contract'
import {
  acceptedInput,
  evidence,
  execution,
  failure,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly, shown } from './loop-support.ts'
import { controlAssembly } from './fixtures/control-assembly.ts'

describe('original Journal writes after a lost response', () => {
  it('does not replay an unknown open without its committed receipt', async () => {
    let opens = 0
    const assembly = await controlAssembly({}, d => ({
      ...d,
      journal: {
        ...d.journal,
        open: async input => {
          opens += 1
          const result = await d.journal.open(input)
          if (opens === 1 && 'ok' in result) throw new Error('lost open receipt')
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
      operation: operation('proof-open'),
      initial: acceptedInput('proof-input'),
      grant: null,
      idle() {},
    })
    const first = c.accept()
    expect(failure(await c.accept()).failure.kind).toBe('busy')
    expect(failure(await first).failure.kind).toBe('commit-unknown')
    expect(failure(await c.accept()).failure.kind).toBe('commit-unknown')
    expect(opens).toBe(1)
    const found = ok(
      await assembly.dependencies.journal.query({
        ...alice,
        execution: execution(),
        operation: operation('proof-open'),
      }),
    )
    if (found.kind !== 'committed') throw new Error('expected committed original open')
    for (const receipt of [
      { ...found.receipt, operation: operation('different-open') },
      { ...found.receipt, execution: execution('different-execution') },
    ]) {
      expect(failure(await c.accept(receipt)).failure.kind).toBe('conflict')
      expect(opens).toBe(1)
    }
    ok(await c.accept(found.receipt))
    expect(opens).toBe(2)
  })

  it('preserves non-enumerable Journal methods and their receiver during public control', async () => {
    let reads = 0
    const assembly = await controlAssembly({}, d => {
      const journal = d.journal
      const load = journal.load.bind(journal)
      Object.defineProperty(journal, 'load', {
        enumerable: false,
        value(this: AgentJournal<Principal>, input: Parameters<typeof load>[0]) {
          expect(this).toBe(journal)
          reads += 1
          return load(input)
        },
      })
      return d
    })
    const handle = ok(await invoke(assembly))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('non-enumerable-cancel'),
      command: { kind: 'cancel' as const, reason: evidence('non-enumerable-cancel') },
    }
    ok(await handle.control.control(input))
    await eventually(
      async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
    )
    expect(reads).toBeGreaterThan(0)
  })

  it('retains the original open and admission through public invoke retries', async () => {
    const opens: Parameters<AgentJournal<Principal>['open']>[0][] = []
    const queried: string[] = []
    let resolutions = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      adoptions: {
        ...d.adoptions,
        resolve: input => {
          resolutions += 1
          return d.adoptions.resolve(input)
        },
      },
      journal: {
        ...d.journal,
        open: async input => {
          opens.push(input)
          const result = await d.journal.open(input)
          if (opens.length === 1 && 'ok' in result) throw new Error('lost open response')
          return result
        },
        query: input => {
          queried.push(input.operation)
          return d.journal.query(input)
        },
      },
    }))
    const resolvedBefore = resolutions
    expect(await invoke(assembly)).toMatchObject({
      failure: { kind: 'commit-unknown', operation: operation('invoke-exec-1') },
    })
    expect((await shown(assembly)).kind).toBe('reserved')
    expect(
      failure(await invoke(assembly, 'exec-1', { input: acceptedInput('different') })),
    ).toMatchObject({ kind: 'conflict' })
    const handle = ok(await invoke(assembly))
    expect(opens).toHaveLength(2)
    expect(opens[1]).toBe(opens[0])
    expect(queried).toEqual([operation('invoke-exec-1')])
    expect(resolutions - resolvedBefore).toBe(1)
    expect(assembly.controls.handoff.prepare.calls).toHaveLength(1)
    assembly.release.open()
    expect((await eventsOf(handle)).filter(event => event.body.kind === 'ended')).toHaveLength(1)
  })

  it.each(['I0', 'M0', 'prepareFinish', 'tryFinish'] as const)(
    'reconciles the original %s write and completes once',
    async method => {
      let lost: string | null = null
      const queried: string[] = []
      const writes: string[] = []
      let admits = 0
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        models: {
          ...d.models,
          calls: {
            ...d.models.calls,
            admit: input => {
              admits += 1
              return d.models.calls.admit(input)
            },
          },
        },
        journal: {
          ...d.journal,
          commit: async input => {
            const result = await d.journal.commit(input)
            if (input.operation.startsWith(`${method}/commit@`)) {
              writes.push(input.operation)
              if (lost === null && 'ok' in result) {
                lost = input.operation
                throw new Error('lost commit response')
              }
            }
            return result
          },
          prepareFinish: async input => {
            const result = await d.journal.prepareFinish(input)
            if (method === 'prepareFinish') {
              writes.push(input.operation)
              if (lost === null && 'ok' in result) {
                lost = input.operation
                throw new Error('lost prepare response')
              }
            }
            return result
          },
          tryFinish: async input => {
            const result = await d.journal.tryFinish(input)
            if (method === 'tryFinish') {
              writes.push(input.operation)
              if (lost === null && 'ok' in result && result.ok.kind === 'ended') {
                lost = input.operation
                throw new Error('lost finish response')
              }
            }
            return result
          },
          query: input => {
            queried.push(input.operation)
            return d.journal.query(input)
          },
        },
      }))
      assembly.release.open()
      const handle = ok(await invoke(assembly))
      await eventually(
        async () =>
          ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).state
            .kind === 'ended',
      )
      const events = await eventsOf(handle)
      expect(queried).toContain(lost)
      expect(writes.filter(value => value === lost)).toHaveLength(1)
      expect(admits).toBe(1)
      expect(events.filter(event => event.body.kind === 'input-taken')).toHaveLength(1)
      expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
      expect(events.at(-1)?.body).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    },
  )

  it.each(['control', 'recordControl', 'establish-cancellation', 'judge-cancellation'] as const)(
    'recognizes the original cancellation %s before continuing',
    async method => {
      let lost: string | null = null
      const queried: string[] = []
      const assembly = await controlAssembly({}, d => ({
        ...d,
        journal: {
          ...d.journal,
          control: async input => {
            const result = await d.journal.control(input)
            if (method === 'control' && lost === null && 'ok' in result) {
              lost = input.operation
              throw new Error('lost control response')
            }
            return result
          },
          recordControl: async input => {
            const result = await d.journal.recordControl(input)
            if (method === 'recordControl' && lost === null && 'ok' in result) {
              lost = input.operation
              throw new Error('lost stage response')
            }
            return result
          },
          commitSettlement: async input => {
            const result = await d.journal.commitSettlement(input)
            if (method === input.kind && lost === null && 'ok' in result) {
              lost = input.operation
              throw new Error('lost settlement response')
            }
            return result
          },
          query: input => {
            queried.push(input.operation)
            return d.journal.query(input)
          },
        },
      }))
      const handle = ok(await invoke(assembly))
      const input = {
        ...alice,
        execution: handle.execution,
        operation: operation('cancel-original'),
        command: { kind: 'cancel' as const, reason: evidence('cancel-original') },
      }
      const cancelled = await handle.control.control(input)
      if ('failure' in cancelled) {
        expect(cancelled.failure.kind).toBe('commit-unknown')
        ok(await handle.control.control(input))
      }
      await eventually(
        async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
      )
      expect(queried).toContain(lost)
      expect(ok(await assembly.dependencies.journal.load(input)).state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: 'cancelled' },
      })
    },
  )
})

describe('independent control write recovery', () => {
  it('queries both original controls after concurrent committed responses are lost', async () => {
    const lost: string[] = []
    const queries: string[] = []
    const assembly = await controlAssembly({}, d => ({
      ...d,
      journal: {
        ...d.journal,
        control: async input => {
          const result = await d.journal.control(input)
          if ('ok' in result && !lost.includes(input.operation)) {
            lost.push(input.operation)
            throw new Error('lost concurrent control')
          }
          return result
        },
        query: input => {
          queries.push(input.operation)
          return d.journal.query(input)
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    const requests = ['first', 'second'].map(name => ({
      ...alice,
      execution: handle.execution,
      operation: operation(`cancel-${name}`),
      command: { kind: 'cancel' as const, reason: evidence(name) },
    }))
    const initial = await Promise.all(requests.map(request => handle.control.control(request)))
    expect(initial.map(answer => failure(answer).kind)).toEqual([
      'commit-unknown',
      'commit-unknown',
    ])
    const retried = await Promise.all(requests.map(request => handle.control.control(request)))
    expect(retried.every(answer => 'ok' in answer)).toBe(true)
    expect(queries).toEqual(expect.arrayContaining(lost))
    expect(new Set(lost).size).toBe(2)
    await eventually(
      async () => ok(await assembly.dependencies.journal.load(requests[0]!)).state.kind === 'ended',
    )
  })

  it.each(['standalone', 'coordinator'] as const)(
    'retains the original stage request for the %s control driver',
    async owner => {
      let lost: string | null = null
      let known = false
      const queries: string[] = []
      const assembly = await controlAssembly({}, d => ({
        ...d,
        journal: {
          ...d.journal,
          recordControl: async input => {
            const result = await d.journal.recordControl(input)
            if (input.stage === 'qualification-revoked' && lost === null && 'ok' in result) {
              lost = input.operation
              throw new Error('lost qualification response')
            }
            return result
          },
          query: input => {
            queries.push(input.operation)
            return input.operation === lost && !known
              ? Promise.resolve(succeed({ kind: 'unknown' as const }))
              : d.journal.query(input)
          },
        },
      }))
      const c = createExecutionCoordinator({
        ports: assembly.dependencies,
        binding: options().binding,
        evaluator: agentEvaluator,
        access: alice,
        execution: execution(),
        operation: operation('original-open'),
        initial: acceptedInput('input-exec-1'),
        grant: null,
        idle() {},
      })
      ok(await c.accept())
      const input = {
        ...alice,
        execution: execution(),
        operation: operation('cancel-stage'),
        command: { kind: 'cancel' as const, reason: evidence('stage') },
      }
      ok(await assembly.dependencies.journal.control(input))
      if (owner === 'coordinator') {
        const loaded = ok(await assembly.dependencies.journal.load(input))
        const record = loaded.controls[0]!
        ok(
          await assembly.dependencies.journal.recordControl({
            ...input,
            operation: operation('intent-before-drive'),
            target: record.operation,
            stage: 'intent-established',
            state: 'reached',
            source: record.stages.accepted.source,
          }),
        )
        expect(failure(await c.runExecution()).failure.kind).toBe('commit-unknown')
        expect(failure(await c.runExecution()).failure.kind).toBe('commit-unknown')
        known = true
        ok(await c.runExecution())
        expect(ok(await assembly.dependencies.journal.load(input)).state.kind).toBe('ended')
      } else {
        expect(
          failure(
            await advanceControl(assembly.dependencies, alice, input.execution, input.operation),
          ).kind,
        ).toBe('commit-unknown')
        expect(
          failure(
            await advanceControl(assembly.dependencies, alice, input.execution, input.operation),
          ).kind,
        ).toBe('commit-unknown')
        known = true
        ok(await advanceControl(assembly.dependencies, alice, input.execution, input.operation))
      }
      expect(queries.filter(value => value === lost)).toHaveLength(2)
    },
  )

  it('does not treat denied load as proof that an excluded open has no execution', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')], d => ({
      ...d,
      journal: {
        ...d.journal,
        open: input =>
          input.operation === operation('invoke-exec-1')
            ? Promise.resolve(fail({ kind: 'commit-unknown', operation: input.operation }))
            : d.journal.open(input),
        query: input =>
          input.operation === operation('invoke-exec-1')
            ? Promise.resolve(
                succeed({ kind: 'excluded', evidence: evidence('excluded-original-open') }),
              )
            : d.journal.query(input),
        load: async () => fail({ kind: 'denied', action: 'load' }),
      },
    }))
    const existing = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('another-open'),
      initial: acceptedInput('another-input'),
      grant: null,
      idle() {},
    })
    ok(await existing.accept())
    const actual = ok(
      await assembly.controls.journal.provider.journal.load({ ...alice, execution: execution() }),
    )
    expect(actual.state.kind).toBe('advancing')
    expect(failure(await invoke(assembly)).kind).toBe('commit-unknown')
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'conflict',
      operation: operation('invoke-exec-1'),
    })
    expect((await shown(assembly)).kind).toBe('reserved')
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    expect(
      ok(
        await assembly.controls.journal.provider.journal.load({ ...alice, execution: execution() }),
      ),
    ).toEqual(actual)
  })

  it('keeps a thrown open reserved while its original query stays unknown', async () => {
    let opens = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        open: async () => {
          opens += 1
          throw new Error('open transport unavailable')
        },
        query: async () => succeed({ kind: 'unknown' }),
      },
    }))
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(failure(await invoke(assembly)).kind).toBe('commit-unknown')
      expect((await shown(assembly)).kind).toBe('reserved')
    }
    expect(opens).toBe(1)
    expect(assembly.controls.handoff.prepare.calls).toHaveLength(1)
  })
})
