import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type { AgentDependencies } from '@omne-harness/agent'
import { decodeActionId } from '@omne-harness/agent-contract'
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
import { voidedModelIntents } from '../src/loop/model-result.ts'
import {
  acceptedInput,
  evidence,
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
const original = mainInvocation(alice.tenant, execution(), STEP, 0)
const retried = mainInvocation(alice.tenant, execution(), STEP, 1)

function callOf(reference: ModelInvocationRef) {
  return ok(resolveModelInvocationRef(reference, alice.tenant)).call
}

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
        async contact(input) {
          const call = callOf(input.reference)
          observed.inspects.push(call)
          if (faults.inspect(call) === 'unavailable')
            return fail({ kind: 'unavailable', dependency: 'admission', diagnostic: 'offline' })
          return d.models.calls.contact(input)
        },
      },
    },
  }))
  return { assembly, observed }
}

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
    expect(cut.checkpoint.requestPreparation).toBeNull()
    const prepared = assembly.controls.requests.prepare.calls.length
    expect(observed.admits).toEqual([])

    stop = false
    assembly.release.open()
    ok(await coordinator(assembly).continueExecution(authority))
    const after = await load(assembly)
    expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(observed.admits).toEqual([callOf(retried)])
    expect(observed.inspects[0]).toBe(callOf(original))
    expect(after.checkpoint.voided).toEqual([
      expect.objectContaining({
        kind: 'model',
        step: STEP,
        reference: original,
        cause: 'not-accepted',
      }),
    ])
    expect(
      after.effects.map(effect => effect.pending.kind === 'model' && effect.pending.reference),
    ).toEqual([original, retried])
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
    expect(failure(await first.runExecution())).toMatchObject({ node: 'M6' })
    stop = false
    const prepared = assembly.controls.requests.prepare.calls.length
    const next = coordinator(assembly)
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

describe('the attempt of the main call of a step', () => {
  it('counts the voided Model intents of the step and no voided Tool intent', () => {
    const basis = evidence('answer')
    const reference = mainInvocation(alice.tenant, execution(), STEP, 0)
    const action = ok(decodeActionId(`${STEP}/tool/0`))
    const lost = { kind: 'model' as const, step: STEP, action, reference, cause: 'lost' as const }
    const refused = { kind: 'tool' as const, step: STEP, action, cause: 'not-accepted' as const }
    const voided = [
      { ...lost, basis },
      { ...refused, basis },
      { ...lost, step: stepOf(2), basis },
    ]
    expect(voidedModelIntents(voided, STEP)).toBe(1)
    expect(voidedModelIntents(voided, stepOf(2))).toBe(1)
    expect(voidedModelIntents([{ ...refused, basis }], STEP)).toBe(0)
  })
})
