// R2-D292 (the Model admission window): an intent whose admission is unknown is recognized under
// its original identity; only the Model's authoritative not-accepted voids it, and the step then
// prepares again under attempt + 1. The checkpoint keeps no request, and a request prepared again
// need not equal the recorded one, so the original identity is never admitted with a prepared
// request after a restart. Each case injects one fault: a stop between M0 and admit, inspect
// answering not-accepted or unavailable, and an admit answering conflict.
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type { AgentDependencies } from '@omne-harness/agent'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeRevision,
  resolveModelInvocationRef,
  type FixedModelRequest,
  type ModelInvocationRef,
} from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { mainCall, mainInvocation, stepOf } from '../src/loop/identities.ts'
import { canonical } from '../src/canonical.ts'
import {
  acceptedInput,
  execution,
  failure,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

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

async function load(assembly: LoopAssembly) {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
}

const STEP = stepOf(1)
const REVISION = ok(decodeRevision('1'))
/** The identities of attempt 0 and 1 of the main call of the first step. */
const original = mainInvocation(alice.tenant, execution(), STEP, 0)
const retried = mainInvocation(alice.tenant, execution(), STEP, 1)

function callOf(reference: ModelInvocationRef) {
  return ok(resolveModelInvocationRef(reference, alice.tenant)).call
}

/**
 * The faults of one case and what the Model was asked. `admit` and `inspect` choose the fault of
 * each call by its identity; `sent` holds every request that reached the Model, by call.
 */
type Faults = {
  admit: (
    call: string,
  ) => 'crash-before' | 'crash-after' | 'commit-unknown' | 'conflict' | 'conflict-unheld' | 'pass'
  inspect: (call: string) => 'unavailable' | 'pass'
}
type Observed = { admits: string[]; inspects: string[]; sent: Map<string, Set<string>> }

async function faulted(faults: Faults): Promise<{ assembly: LoopAssembly; observed: Observed }> {
  const observed: Observed = { admits: [], inspects: [], sent: new Map() }
  let prepares = 0
  const assembly = await loopAssembly([execution()], (d: Dependencies) => ({
    ...d,
    requests: {
      ...d.requests,
      // Every preparation differs from the one before it, as a real one may after a restart
      // (window usage, clock, live groups): the content of a request is never replayable here.
      async prepare(input) {
        prepares += 1
        const prepared = await d.requests.prepare(input)
        if ('failure' in prepared || prepared.ok.kind !== 'ready') return prepared
        const [supplier, ...rest] = prepared.ok.request.suppliers
        if (supplier === undefined) return prepared
        const request: FixedModelRequest = {
          ...prepared.ok.request,
          suppliers: [{ ...supplier, model: `test-model-${prepares}` }, ...rest],
        }
        return { ok: { ...prepared.ok, request } }
      },
    },
    models: {
      ...d.models,
      calls: {
        ...d.models.calls,
        async admit(input) {
          const fault = faults.admit(input.call)
          if (fault === 'crash-before') throw new Error('the process stops before admit')
          observed.admits.push(input.call)
          const bodies = observed.sent.get(input.call) ?? new Set<string>()
          bodies.add(canonical(input.request))
          observed.sent.set(input.call, bodies)
          if (fault === 'commit-unknown')
            return fail({ kind: 'commit-unknown', operation: input.operation })
          if (fault === 'conflict-unheld')
            return fail({ kind: 'conflict', operation: input.operation, revision: REVISION })
          const admitted = await d.models.calls.admit(input)
          if (fault === 'crash-after') throw new Error('the process stops after admit')
          if (fault === 'conflict' && 'ok' in admitted)
            return fail({ kind: 'conflict', operation: input.operation, revision: REVISION })
          return admitted
        },
        async inspect(input) {
          const call = callOf(input.reference)
          observed.inspects.push(call)
          if (faults.inspect(call) === 'unavailable')
            return fail({ kind: 'unavailable', dependency: 'admission', diagnostic: 'offline' })
          return d.models.calls.inspect(input)
        },
      },
    },
  }))
  return { assembly, observed }
}

/** One call identity never carries two requests (FR-2: the sent request is the recorded one). */
function oneRequestPerIdentity(observed: Observed) {
  for (const [call, bodies] of observed.sent) expect(bodies.size, call).toBe(1)
}

describe('R2-D292: the Model admission window after a restart', () => {
  it('a stop between M0 and admit, then not-accepted: voids the intent and admits attempt 1 only', async () => {
    let stop = true
    const { assembly, observed } = await faulted({
      admit: () => (stop ? 'crash-before' : 'pass'),
      inspect: () => 'pass',
    })
    const first = coordinator(assembly)
    const authority = ok(await first.accept())
    expect(failure(await first.runExecution())).toMatchObject({ node: 'M6' })
    const cut = await load(assembly)
    expect(cut.checkpoint.position).toBe('M6')
    expect(cut.checkpoint.calls.map(call => call.kind === 'model' && call.reference)).toEqual([
      original,
    ])
    // The checkpoint holds no request: the restart has nothing to send under the original identity.
    expect(cut.checkpoint.requestPreparation).toBeNull()
    const prepared = assembly.controls.requests.prepare.calls.length
    expect(observed.admits).toEqual([])

    stop = false
    assembly.release.open()
    ok(await coordinator(assembly).continueExecution(authority))
    const after = await load(assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    // bad-naive-readmit: the original identity is never admitted with the request prepared again.
    expect(observed.admits).toEqual([callOf(retried)])
    expect(observed.inspects[0]).toBe(callOf(original))
    expect(after.checkpoint.voided).toEqual([
      expect.objectContaining({ step: STEP, reference: original }),
    ])
    expect(
      after.effects.map(effect => effect.pending.kind === 'model' && effect.pending.reference),
    ).toEqual([original, retried])
    // The step prepared again: I1 and P1 of attempt 1.
    expect(assembly.controls.requests.prepare.calls.length).toBe(prepared + 2)
    expect(assembly.controls.requests.prepare.calls.at(-1)?.action).toBe(`${STEP}/main-a1`)
    oneRequestPerIdentity(observed)
  })

  it('inspect answers not-accepted after a lost admission answer: voids on the wake, never sends the identity again', async () => {
    const { assembly, observed } = await faulted({
      admit: call => (call === callOf(original) ? 'commit-unknown' : 'pass'),
      inspect: () => 'pass',
    })
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    // The unknown write is not repeated in this turn: a producer wait at M6.
    ok(await c.runExecution())
    expect((await load(assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }],
    })
    expect(observed.admits).toEqual([callOf(original)])
    ok(await c.runExecution())
    const after = await load(assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(observed.admits).toEqual([callOf(original), callOf(retried)])
    expect(after.checkpoint.voided.map(item => item.reference)).toEqual([original])
    oneRequestPerIdentity(observed)
  })

  it('inspect answers unavailable: keeps the original identity, sends nothing and prepares nothing until the Model answers', async () => {
    let stop = true,
      offline = true
    const { assembly, observed } = await faulted({
      admit: () => (stop ? 'crash-after' : 'pass'),
      inspect: () => (offline ? 'unavailable' : 'pass'),
    })
    const first = coordinator(assembly)
    const authority = ok(await first.accept())
    // The Model accepted the call; the process stopped before it learned so.
    expect(failure(await first.runExecution())).toMatchObject({ node: 'M6' })
    stop = false
    const prepared = assembly.controls.requests.prepare.calls.length
    const next = coordinator(assembly)
    // bad-naive-unknown: the unknown admission waits at M6; it is not sent again.
    ok(await next.continueExecution(authority))
    const waiting = await load(assembly)
    expect(waiting.state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'modelRuntime', position: 'M6' }],
    })
    expect(waiting.checkpoint.voided).toEqual([])
    expect(observed.admits).toEqual([callOf(original)])
    expect(assembly.controls.requests.prepare.calls.length).toBe(prepared)

    offline = false
    assembly.release.open()
    ok(await next.runExecution())
    const after = await load(assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    // The Model found the original call: it goes on under its identity, nothing is voided.
    expect(observed.admits).toEqual([callOf(original)])
    expect(after.checkpoint.voided).toEqual([])
    expect(assembly.controls.requests.prepare.calls.length).toBe(prepared)
  })

  it.each([
    ['found', true],
    ['not-accepted', false],
  ] as const)(
    'an admit that answers conflict goes on (inspect %s): never stands at M6 and never sends the identity again',
    async (_answer, accepted) => {
      // `conflict-unheld` stands for a Model that answers conflict and holds no admission of it.
      const { assembly, observed } = await faulted({
        admit: call =>
          call === callOf(original) ? (accepted ? 'conflict' : 'conflict-unheld') : 'pass',
        inspect: () => 'pass',
      })
      assembly.release.open()
      const c = coordinator(assembly)
      ok(await c.accept())
      ok(await c.runExecution())
      const after = await load(assembly)
      // bad-naive-progress: the conflict does not leave the execution standing at M6.
      expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      expect(observed.admits.filter(call => call === callOf(original))).toHaveLength(1)
      expect(after.checkpoint.voided.map(item => item.reference)).toEqual(
        accepted ? [] : [original],
      )
      oneRequestPerIdentity(observed)
    },
  )

  it('derives attempt identities from the step and the voided count, never from a clock or random value', () => {
    expect(callOf(original)).toBe(mainCall(execution(), STEP))
    expect(callOf(retried)).toBe(mainCall(execution(), STEP, 1))
    expect(callOf(retried)).not.toBe(callOf(original))
    expect(mainInvocation(alice.tenant, execution(), STEP, 1)).toBe(retried)
  })
})
