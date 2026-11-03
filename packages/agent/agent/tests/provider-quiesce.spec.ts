// AgentRuntimeControl.quiesce of the factory runtime (SPEC "四种控制" 停用, "交接与停用" and the
// failure table row of quiesce; public API "quiesce 与执行槽的同步义务"). What is delivered: the runtime
// drains before the first await, a new invoke and resume answer unavailable, a free slot withdraws
// the registration through the handle and answers drained, and an execution in the slot is reported
// as remaining (`unresolved`), never drained. Its detach and handover are #502 stage 5 and not here.
import { describe, expect, it } from 'vitest'
import type {
  AgentAccessDecision,
  AgentObservation,
  AgentRegistrationHandle,
  Failure,
  Registration,
  Reply,
} from '@omne-harness/agent-contract'
import { decodeAgentRegistrationId } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  evidence,
  execution,
  failure,
  instance,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import {
  alice,
  eventually,
  invoke,
  loopAssembly,
  shown,
  type LoopAssembly,
} from './loop-support.ts'

type WithdrawInput = Parameters<AgentRegistrationHandle<Principal>['withdraw']>[0]

const registered = (state: Registration['state']): Registration => {
  const id = decodeAgentRegistrationId('registration-1')
  if ('failure' in id) throw new Error('registration id')
  return { registration: id.ok, state }
}

/** A registration handle that logs each withdrawal and answers the queued reply, else withdrawn. */
function withdrawals() {
  const calls: WithdrawInput[] = []
  const queued: (() => Reply<Registration | null>)[] = []
  const handle: AgentRegistrationHandle<Principal> = {
    instance: instance(),
    report: () => {},
    withdraw(input) {
      calls.push(input)
      return queued.shift()?.() ?? Promise.resolve(succeed(registered('withdrawn')))
    },
  }
  return { handle, calls, queued }
}

async function assembled() {
  const host = withdrawals()
  const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => ({
    ...dependencies,
    registration: host.handle,
  }))
  return { assembly, host }
}

const quiesceOf = (assembly: LoopAssembly, name = 'quiesce-1', reason = evidence('stop')) =>
  assembly.provider.control.quiesce({ ...alice, operation: operation(name), reason })

const resumeOf = (assembly: LoopAssembly) =>
  assembly.provider.runtime.resume({
    ...alice,
    execution: execution('exec-2'),
    operation: operation('resume-1'),
    recovery: evidence('recovery'),
    grant: null,
  })

const drainingDiagnostic = (operationName: 'invoke' | 'resume') =>
  `the runtime is draining after quiesce; a new ${operationName} is not accepted`

/** A promise and the function that settles it. */
function deferred<T>() {
  let settle: (value: T) => void = () => {}
  const promise = new Promise<T>(resolve => (settle = resolve))
  return { promise, settle }
}

describe('quiesce of an idle runtime', () => {
  it('answers drained, withdraws the registration once through the handle and ends observation retired', async () => {
    const { assembly, host } = await assembled()
    const controller = new AbortController()
    const watching = assembly.provider.observation
      .observe({ ...alice, signal: controller.signal })
      [Symbol.asyncIterator]()
    expect((await watching.next()).value).toMatchObject({ kind: 'state' })
    const next = watching.next()

    const drained = ok(await quiesceOf(assembly))
    expect(drained).toMatchObject({ kind: 'drained', remaining: [] })
    expect(drained.evidence.owner).toBe('@omne-harness/agent')
    expect(host.calls).toEqual([
      { ...alice, operation: operation('quiesce-1'), reason: evidence('stop') },
    ])
    expect((await next).value).toEqual({ kind: 'ended', reason: 'retired' })
    const later: AgentObservation[] = []
    for await (const seen of assembly.provider.observation.observe({
      ...alice,
      signal: new AbortController().signal,
    }))
      later.push(seen)
    expect(later).toEqual([{ kind: 'ended', reason: 'retired' }])
    controller.abort()
  })

  it('without a registration handle drains without a withdrawal', async () => {
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      registration: null,
    }))
    expect(ok(await quiesceOf(assembly)).kind).toBe('drained')
  })

  it.each([
    [
      'answers unavailable',
      () =>
        Promise.resolve(fail({ kind: 'unavailable', owner: 'host', diagnostic: 'down' } as const)),
    ],
    [
      'leaves the registration withdrawing',
      () => Promise.resolve(succeed(registered('withdrawing'))),
    ],
    ['throws', () => Promise.reject(new Error('host broke'))],
  ] as const)(
    'does not answer drained when the withdrawal %s; the retry withdraws and drains',
    async (_, answer) => {
      const { assembly, host } = await assembled()
      host.queued.push(answer)
      expect(failure(await quiesceOf(assembly))).toMatchObject({ kind: 'unavailable' })
      // Still draining after the failed step: no new invoke is accepted.
      expect(failure(await invoke(assembly))).toEqual({
        kind: 'unavailable',
        owner: '@omne-harness/agent',
        diagnostic: drainingDiagnostic('invoke'),
      })
      expect(ok(await quiesceOf(assembly)).kind).toBe('drained')
      expect(host.calls.map(call => call.operation)).toEqual([
        operation('quiesce-1'),
        operation('quiesce-1'),
      ])
    },
  )
})

describe('a draining runtime refuses new invoke and resume', () => {
  it('answers a new invoke and a resume unavailable after quiesce, and opens nothing', async () => {
    const { assembly } = await assembled()
    ok(await quiesceOf(assembly))
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: drainingDiagnostic('invoke'),
    })
    expect(failure(await resumeOf(assembly))).toEqual({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: drainingDiagnostic('resume'),
    })
    expect(
      await assembly.controls.journal.port.query({
        ...alice,
        execution: execution(),
        operation: operation('invoke-exec-1'),
      }),
    ).not.toMatchObject({ ok: { kind: 'committed' } })
  })

  it('before quiesce, resume still answers the stage-temporary unavailable, not draining', async () => {
    const { assembly } = await assembled()
    const answer = failure(await resumeOf(assembly))
    expect(answer.kind === 'unavailable' && answer.diagnostic).toBe(
      'resume is not implemented until #502 stage 5',
    )
  })

  it('drains before its first await: an invoke that arrives while the quiesce check runs is refused', async () => {
    const { assembly } = await assembled()
    const check = deferred<AgentAccessDecision>()
    assembly.controls.access.check.once(() => check.promise)
    const quiescing = quiesceOf(assembly)
    expect(failure(await invoke(assembly))).toMatchObject({
      diagnostic: drainingDiagnostic('invoke'),
    })
    check.settle({ kind: 'allowed', evidence: evidence('allowed') })
    expect(ok(await quiescing).kind).toBe('drained')
  })

  it('a quiesce that the check denies lifts the draining it held: a later invoke is accepted', async () => {
    const { assembly, host } = await assembled()
    assembly.controls.access.check.once(() => ({ kind: 'denied' }))
    expect(failure(await quiesceOf(assembly))).toEqual({ kind: 'denied', action: 'quiesce' })
    expect(host.calls).toEqual([])
    ok(await invoke(assembly))
    assembly.release.open()
  })

  it('a retry of the invoke accepted before quiesce still gets its original handle', async () => {
    const { assembly } = await assembled()
    const original = ok(await invoke(assembly))
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    ok(await quiesceOf(assembly))
    expect(ok(await invoke(assembly)).execution).toBe(original.execution)
    expect(failure(await invoke(assembly, 'exec-2'))).toMatchObject({
      diagnostic: drainingDiagnostic('invoke'),
    })
  })
})

describe('quiesce with an execution in flight', () => {
  it('answers unresolved with the remaining execution, keeps the registration and does not stop the run', async () => {
    const { assembly, host } = await assembled()
    const handle = ok(await invoke(assembly))
    const answer = ok(await quiesceOf(assembly))
    expect(answer).toMatchObject({ kind: 'unresolved', remaining: [handle.execution] })
    expect(host.calls).toEqual([])
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: handle.execution })

    // The run goes on: quiesce cancels no Model call and ends no execution.
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    const ended = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: handle.execution }),
    )
    expect(ended.state).toMatchObject({ kind: 'ended' })
    expect(ended.state.kind === 'ended' && ended.state.conclusion.kind).not.toBe('cancelled')
    expect(ended.controls).toEqual([])

    // The retry of the same operation goes on and answers the current remainder: none.
    expect(ok(await quiesceOf(assembly))).toMatchObject({ kind: 'drained', remaining: [] })
    expect(host.calls).toHaveLength(1)
  })
})

describe('operation identity of quiesce', () => {
  it('a retry of the same operation and reason answers the original result and withdraws once', async () => {
    const { assembly, host } = await assembled()
    const first = ok(await quiesceOf(assembly))
    expect(ok(await quiesceOf(assembly))).toEqual(first)
    expect(host.calls).toHaveLength(1)
  })

  it('the same operation with another reason conflicts', async () => {
    const { assembly } = await assembled()
    ok(await quiesceOf(assembly))
    expect(failure(await quiesceOf(assembly, 'quiesce-1', evidence('other')))).toEqual({
      kind: 'conflict',
      operation: operation('quiesce-1'),
    } satisfies Failure)
  })

  it('a new quiesce while one is in progress joins it and starts no second one', async () => {
    const { assembly, host } = await assembled()
    const withdrawal = deferred<void>()
    host.queued.push(async () => {
      await withdrawal.promise
      return succeed(registered('withdrawn'))
    })
    const first = quiesceOf(assembly, 'quiesce-1')
    await eventually(async () => host.calls.length === 1)
    const second = quiesceOf(assembly, 'quiesce-2', evidence('another stop'))
    withdrawal.settle()
    const [a, b] = [ok(await first), ok(await second)]
    expect(b).toEqual(a)
    expect(host.calls.map(call => call.operation)).toEqual([operation('quiesce-1')])
    // After the drain, a new operation also answers the one quiesce that happened.
    expect(ok(await quiesceOf(assembly, 'quiesce-3'))).toEqual(a)
    expect(host.calls).toHaveLength(1)
  })

  it('a new quiesce after an unresolved one goes on with the same handover', async () => {
    const { assembly, host } = await assembled()
    ok(await invoke(assembly))
    const unresolved = ok(await quiesceOf(assembly, 'quiesce-1'))
    expect(unresolved.kind).toBe('unresolved')
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(ok(await quiesceOf(assembly, 'quiesce-2')).kind).toBe('drained')
    expect(host.calls.map(call => call.operation)).toEqual([operation('quiesce-1')])
  })
})
