import { describe, expect, it } from 'vitest'
import { agentEvaluator, advanceControl } from '@omne-harness/agent'
import type { Failure, FinishCandidateContent } from '@omne-harness/agent-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import { createExecutionCoordinator, type ExecutionEntry } from '../src/loop/coordinator.ts'
import { localFailure, nodeFailureCategory } from '../src/loop/node-failure.ts'
import {
  acceptedInput,
  afterTerminalPassage,
  checkpoint,
  evidence,
  execution,
  failure,
  loadWithEntries,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import { alice, eventually, loopAssembly, type LoopAssembly } from './loop-support.ts'
import { controlAssembly } from './fixtures/control-assembly.ts'
import {
  deliverToolSuggestion,
  pushToolResult,
  toolAssembly,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

function coordinator(
  assembly: Pick<LoopAssembly, 'dependencies'>,
  change: Partial<ExecutionEntry<Principal>> = {},
) {
  return createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-node-failure'),
    initial: acceptedInput('input-node-failure', 'original input'),
    grant: null,
    idle() {},
    ...change,
  })
}

const unavailable: Failure = { kind: 'unavailable', owner: 'agentJournal', diagnostic: 'temporary' }

describe('an accepted node failure', () => {
  it('keeps separate local classifications without marking a reused provider failure', () => {
    const shared = Object.freeze({ kind: 'denied', action: 'access' } satisfies Failure)
    const first = localFailure('rejected', shared)
    const second = localFailure('exception', shared)
    expect(first).not.toBe(shared)
    expect(second).not.toBe(first)
    expect(first).toEqual(shared)
    expect(second).toEqual(shared)
    expect(nodeFailureCategory(shared)).toBeNull()
    expect(nodeFailureCategory(first)).toBe('rejected')
    expect(nodeFailureCategory(second)).toBe('exception')
  })

  it.each([false, true])(
    'does not promote Journal denial using another execution failure, shared = %s',
    async shared => {
      const denied = Object.freeze({ kind: 'denied', action: 'access' } satisfies Failure)
      const firstExecution = execution('provenance-source')
      const secondExecution = execution('provenance-target')
      const first = await loopAssembly([firstExecution], dependencies => ({
        ...dependencies,
        selection: {
          ...dependencies.selection,
          select: async () => fail(shared ? denied : { ...denied }),
        },
      }))
      const a = coordinator(first, { execution: firstExecution })
      ok(await a.accept())
      ok(await a.runExecution())
      expect(
        ok(await first.controls.journal.port.load({ ...alice, execution: firstExecution })).state
          .kind,
      ).toBe('ended')

      let refuse = true
      const second = await loopAssembly([secondExecution], dependencies => ({
        ...dependencies,
        journal: {
          ...dependencies.journal,
          load(input) {
            if (refuse) {
              refuse = false
              return Promise.resolve(fail(denied))
            }
            return dependencies.journal.load(input)
          },
        },
      }))
      const b = coordinator(second, { execution: secondExecution })
      ok(await b.accept())
      expect(await b.runExecution()).toMatchObject({
        failure: { node: 'E1', failure: denied },
      })
      const kept = ok(
        await second.controls.journal.port.load({ ...alice, execution: secondExecution }),
      )
      expect(kept.settlement.candidate).toBeNull()
      expect(kept.state.kind).not.toBe('ended')
    },
  )

  it('retains an unapplied author passage as a named responsibility', async () => {
    const assembly = await loopAssembly([execution()])
    const passage = {
      ...afterTerminalPassage('pending'),
      position: 'before_model_call' as const,
      declaration: {
        ...afterTerminalPassage('pending').declaration,
        position: 'before_model_call' as const,
      },
    }
    const c = coordinator(assembly, {
      evaluator: { ...agentEvaluator, initial: () => succeed(checkpoint('E3', [passage])) },
    })
    ok(await c.accept())
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'R0',
      failure: { kind: 'unavailable' },
    })
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.state.kind).not.toBe('ended')
    expect(read.checkpoint.passages).toEqual([passage])
  })

  it('keeps the failure occupied when Journal becomes permanently unreadable', async () => {
    let faulted = false
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        load: input => (faulted ? Promise.resolve(fail(unavailable)) : d.journal.load(input)),
      },
    }))
    let evaluations = 0
    const c = coordinator(assembly, {
      evaluator: {
        ...agentEvaluator,
        next() {
          evaluations += 1
          faulted = true
          throw new Error('first')
        },
      },
    })
    ok(await c.accept())
    for (let attempt = 0; attempt < 3; attempt += 1) ok(await c.runExecution())
    const read = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
    expect(read.state.kind).not.toBe('ended')
    expect(read.settlement.candidate).toBeNull()
    expect(evaluations).toBe(1)
  })

  it.each(['F1', 'F2', 'prepareFinish', 'tryFinish'] as const)(
    'recognizes the original %s write after a lost receipt during failure cleanup',
    async boundary => {
      let thrown = false
      const queries: string[] = []
      let original: string | null = null
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          async commit(input) {
            const saved = await d.journal.commit(input)
            if (!thrown && input.operation.startsWith(`${boundary}/`) && 'ok' in saved) {
              thrown = true
              original = input.operation
              throw new Error('receipt lost')
            }
            return saved
          },
          async prepareFinish(input) {
            const saved = await d.journal.prepareFinish(input)
            if (!thrown && boundary === 'prepareFinish' && 'ok' in saved) {
              thrown = true
              original = input.operation
              throw new Error('receipt lost')
            }
            return saved
          },
          async tryFinish(input) {
            const saved = await d.journal.tryFinish(input)
            if (!thrown && boundary === 'tryFinish' && 'ok' in saved) {
              thrown = true
              original = input.operation
              throw new Error('receipt lost')
            }
            return saved
          },
          query(input) {
            queries.push(input.operation)
            return d.journal.query(input)
          },
        },
      }))
      let evaluations = 0
      const c = coordinator(assembly, {
        evaluator: {
          ...agentEvaluator,
          next() {
            evaluations += 1
            throw new Error('original node fault')
          },
        },
      })
      ok(await c.accept())
      const first = await c.runExecution()
      if ('failure' in first) expect(first.failure.failure.kind).toBe('commit-unknown')
      ok(await c.runExecution())
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      expect(read.state.kind).toBe('ended')
      expect(queries).toContain(original)
      expect(read.settlement.candidate?.failure).toMatchObject({
        kind: 'node-failed',
        node: 'E4',
        category: 'exception',
      })
      expect(evaluations).toBe(1)
    },
  )

  it('continues a saved node failure with a fresh coordinator without business evaluation', async () => {
    let blocked = true
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        prepareFinish: input =>
          blocked ? Promise.resolve(fail(unavailable)) : d.journal.prepareFinish(input),
      },
    }))
    const c = coordinator(assembly, {
      evaluator: {
        ...agentEvaluator,
        next() {
          throw new Error('first fault')
        },
      },
    })
    const authority = ok(await c.accept())
    ok(await c.runExecution())
    const before = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(before.state.kind).toBe('settling')
    blocked = false
    const next = coordinator(assembly, {
      evaluator: {
        ...agentEvaluator,
        next() {
          throw new Error('must not evaluate business')
        },
      },
    })
    ok(await next.continueExecution(authority))
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.state.kind).toBe('ended')
    expect(read.settlement.candidate).toEqual(before.settlement.candidate)
    expect(assembly.controls.requests.prepare.calls).toHaveLength(0)
  })

  it('preserves Agent access refusal without creating a candidate', async () => {
    const denied: Failure = { kind: 'denied', action: 'load' }
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: { ...d.journal, load: () => Promise.resolve(fail(denied)) },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution())).toEqual({ node: 'E1', failure: denied })
    const read = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
    expect(read.state.kind).not.toBe('ended')
    expect(read.settlement.candidate).toBeNull()
  })

  it('finishes a definite capability denial under the current Agent authority', async () => {
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      selection: {
        ...d.selection,
        select: () => Promise.resolve(fail({ kind: 'denied', action: 'select' })),
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.state.kind).toBe('ended')
    expect(read.settlement.candidate?.failure).toMatchObject({
      kind: 'node-failed',
      node: 'I1',
      category: 'rejected',
      failureKind: 'denied',
    })
  })

  it.each(['conditions', 'clock'] as const)(
    'lets effective cancellation bypass an unavailable F1 %s',
    async dependency => {
      let faulted = false
      const assembly = await controlAssembly({}, d => ({
        ...d,
        conditions: {
          ...d.conditions,
          read: input =>
            faulted && dependency === 'conditions'
              ? Promise.resolve(fail(unavailable))
              : d.conditions.read(input),
        },
        clock: {
          ...d.clock,
          now: () =>
            faulted && dependency === 'clock' ? Promise.resolve(fail(unavailable)) : d.clock.now(),
        },
      }))
      const c = coordinator(assembly, {
        evaluator: {
          ...agentEvaluator,
          next() {
            faulted = true
            throw new Error('first fault')
          },
        },
      })
      ok(await c.accept())
      ok(await c.runExecution())
      const cancel = operation('cancel-during-failure')
      ok(
        await assembly.dependencies.journal.control({
          ...alice,
          execution: execution(),
          operation: cancel,
          command: { kind: 'cancel', reason: evidence('cancel') },
        }),
      )
      ok(await advanceControl(assembly.dependencies, alice, execution(), cancel))
      ok(await c.runExecution())
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
      expect(assembly.controls.requests.prepare.calls).toHaveLength(0)
    },
  )

  it.each(['accepted', 'association-unknown'] as const)(
    'keeps an original Tool %s until real receipt',
    async outcome => {
      const assembly = await toolAssembly()
      const call = ok(decodeToolCallId('tcall_original'))
      const admission = ok(decodeToolOperationId('top_original'))
      const reference = ok(encodeToolInvocationRef({ tenant: alice.tenant, call, admission }))
      assembly.controls.tools.invoke.always(async () =>
        outcome === 'association-unknown'
          ? { kind: outcome }
          : {
              kind: 'accepted',
              reference,
              recovered: false,
              state: {
                call,
                revision: ok(decodeToolRevision('1')),
                source: evidence('accepted-tool'),
                phase: 'accepted',
                relation: 'foreground',
                wait: { kind: 'none' },
                foreground: null,
                effect: { kind: 'not-started' },
                execution: { kind: 'not-started' },
                timing: { kind: 'paused', accumulatedMs: '0' },
                queue: { kind: 'none' },
                controls: [],
                delivery: null,
                supplements: [],
              },
            },
      )
      let throwNext = false
      const c = coordinator(assembly, {
        toolConcurrency: 1,
        ports: {
          ...assembly.dependencies,
          journal: {
            ...assembly.dependencies.journal,
            load(input) {
              if (throwNext) {
                throwNext = false
                throw new Error('node failed after Tool acceptance')
              }
              return assembly.dependencies.journal.load(input)
            },
          },
        },
      })
      ok(await c.accept())
      ok(await c.runExecution())
      await deliverToolSuggestion(assembly)
      ok(await c.runExecution())
      const before = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      const pending = before.checkpoint.calls.find(call => call.kind === 'tool')
      if (pending?.kind !== 'tool') throw new Error('original Tool intent required')
      throwNext = true
      ok(await c.runExecution())
      const waiting = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      expect(waiting.state.kind).toBe('settling')
      expect(waiting.checkpoint.calls).toEqual(before.checkpoint.calls)
      if (pending.association === 'intent') {
        ok(await c.runExecution())
        expect(
          ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).state
            .kind,
        ).toBe('settling')
        expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
        return
      }
      const receiver = toolReceiver(assembly)
      const delivery = toolDelivery(pending, { name: 'original' })
      expect(await pushToolResult(receiver, delivery)).toHaveProperty('ok')
      ok(await c.runExecution())
      const read = await loadWithEntries(assembly.dependencies, {
        ...alice,
        execution: execution(),
      })
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      const received = read.entries.find(
        entry => entry.kind === 'received' && entry.delivery.producer === 'tool',
      )
      expect(received).toMatchObject({
        consumption: pending.consumption,
        consumer: pending.position,
      })
      expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    },
  )

  it('obtains a real history and conditions after the first E1 read throws', async () => {
    let first = true
    let history: FinishCandidateContent['origin'] | null = null
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        async load(input) {
          if (first) {
            first = false
            throw new Error('first E1 read')
          }
          const read = await d.journal.load(input)
          if ('ok' in read && history === null) history = read.ok.history
          return read
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.state.kind).toBe('ended')
    expect(read.settlement.candidate?.origin).toEqual(history)
    expect(read.settlement.candidate?.failure).toMatchObject({
      kind: 'node-failed',
      node: 'E1',
      category: 'exception',
      step: 'step-0',
    })
    expect(assembly.controls.requests.prepare.calls).toHaveLength(0)
  })

  it.each(['F1-load', 'F1-commit', 'F3-load', 'F3-prepare'] as const)(
    'recovers %s without repeating the failed business node',
    async boundary => {
      let faulted = false
      let beforeTerminal = false
      let rejected = false
      const candidates: FinishCandidateContent[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          load(input) {
            if (
              !rejected &&
              ((boundary === 'F1-load' && faulted) || (boundary === 'F3-load' && beforeTerminal))
            ) {
              rejected = true
              return Promise.resolve(fail(unavailable))
            }
            return d.journal.load(input)
          },
          async commit(input) {
            if (input.finish !== null) candidates.push(input.finish)
            if (boundary === 'F1-commit' && input.finish !== null && !rejected) {
              rejected = true
              return fail(unavailable)
            }
            const saved = await d.journal.commit(input)
            if (input.operation.startsWith('F2/')) beforeTerminal = true
            return saved
          },
          prepareFinish(input) {
            if (boundary === 'F3-prepare' && !rejected) {
              rejected = true
              return Promise.resolve(fail(unavailable))
            }
            return d.journal.prepareFinish(input)
          },
        },
      }))
      let evaluations = 0
      const c = coordinator(assembly, {
        evaluator: {
          ...agentEvaluator,
          next() {
            evaluations += 1
            faulted = true
            throw new Error('first and only fault')
          },
        },
      })
      ok(await c.accept())
      ok(await c.runExecution())
      expect(rejected).toBe(true)
      ok(await c.runExecution())
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      expect(read.state.kind).toBe('ended')
      expect(evaluations).toBe(1)
      expect(candidates.length).toBeGreaterThan(0)
      for (const candidate of candidates) expect(candidate).toEqual(candidates[0])
    },
  )

  it('waits for the original Model receiver and keeps its call and material', async () => {
    let faultNextRead = false
    let admits = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        load(input) {
          if (faultNextRead) {
            faultNextRead = false
            throw new Error('node failed with a Model call')
          }
          return d.journal.load(input)
        },
      },
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit(input) {
            admits += 1
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const before = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    const pending = before.checkpoint.calls[0]
    if (pending?.kind !== 'model') throw new Error('original Model call required')
    faultNextRead = true
    ok(await c.runExecution())
    const waiting = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(waiting.state.kind).toBe('settling')
    expect(waiting.checkpoint.calls).toEqual(before.checkpoint.calls)
    assembly.release.open()
    const ref = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
    await eventually(
      async () =>
        (await assembly.controls.pusher?.settled({ tenant: alice.tenant, call: ref.call }))
          ?.status === 'saved',
    )
    ok(await c.runExecution())
    const ended = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(ended.checkpoint.calls).toEqual(before.checkpoint.calls)
    expect(admits).toBe(1)
    expect(ended.settlement.candidate?.failure).toMatchObject({ kind: 'node-failed', node: 'E1' })
  })
  it.each(['exception', 'rejected'] as const)(
    'ends once after %s without taking the input',
    async category => {
      const assembly = await loopAssembly([execution()])
      let evaluations = 0
      const c = coordinator(assembly, {
        evaluator: {
          ...agentEvaluator,
          next() {
            evaluations += 1
            if (category === 'exception') throw new Error('private credential must not persist')
            return fail({ kind: 'invalid', field: 'node', reason: 'private request' })
          },
        },
      })
      ok(await c.accept())
      ok(await c.runExecution())
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      expect(read.settlement.candidate?.failure).toMatchObject({
        kind: 'node-failed',
        node: 'E4',
        category,
      })
      expect(JSON.stringify(read.settlement.candidate)).not.toMatch(/private|credential/)
      const inputs = ok(
        await assembly.dependencies.journal.inputs({
          ...alice,
          execution: execution(),
          watermark: read.inputWatermark,
        }),
      )
      expect(inputs.messages).toHaveLength(1)
      expect(evaluations).toBe(1)
      ok(await c.runExecution())
      expect(evaluations).toBe(1)
    },
  )

  it('keeps the first fault through a temporary F1 condition failure', async () => {
    let failed = false
    let unavailableOnce = true
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      conditions: {
        ...d.conditions,
        read: input => {
          if (failed && unavailableOnce) {
            unavailableOnce = false
            return Promise.resolve(fail(unavailable))
          }
          return d.conditions.read(input)
        },
      },
    }))
    let evaluations = 0
    const c = coordinator(assembly, {
      evaluator: {
        ...agentEvaluator,
        next() {
          evaluations += 1
          failed = true
          throw new Error('first fault')
        },
      },
    })
    ok(await c.accept())
    ok(await c.runExecution())
    expect(
      ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).state.kind,
    ).not.toBe('ended')
    ok(await c.runExecution())
    const read = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(read.state.kind).toBe('ended')
    expect(read.settlement.candidate?.failure).toMatchObject({
      kind: 'node-failed',
      node: 'E4',
      category: 'exception',
    })
    expect(evaluations).toBe(1)
  })
})
