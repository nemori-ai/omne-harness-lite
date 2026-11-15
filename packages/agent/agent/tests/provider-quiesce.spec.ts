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

  it('before quiesce, resume reaches the Journal, which answers for the execution; it is not the draining refusal', async () => {
    const { assembly } = await assembled()
    expect(failure(await resumeOf(assembly))).toMatchObject({ kind: 'denied' })
    expect(await shown(assembly)).toMatchObject({ kind: 'idle' })
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
  it('waits for the pass of the drive to end, hands the execution over on its wait for the Model call, and cancels nothing', async () => {
    const { assembly, host } = await assembled()
    const handle = ok(await invoke(assembly))
    const answer = ok(await quiesceOf(assembly))
    expect(answer).toMatchObject({ kind: 'drained', remaining: [] })
    expect(host.calls).toHaveLength(1)

    const handed = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: handle.execution }),
    )
    expect(handed.state.kind).toBe('suspended')
    expect(handed.controls).toEqual([])
    expect(handed.checkpoint.calls.some(call => call.kind === 'model')).toBe(true)
  })
})

describe('quiesce with an execution whose wait is not saved', () => {
  it('does not hand the execution over while its wait is only in the process; the drive goes on and ends it', async () => {
    let offline = true
    let refused = 0
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        commit: input => {
          if (!offline || !input.operation.startsWith('W0/'))
            return dependencies.journal.commit(input)
          refused += 1
          return Promise.resolve(
            fail({ kind: 'unavailable', owner: 'agentJournal', diagnostic: 'offline' }),
          )
        },
      },
    }))
    const access = { ...alice, execution: execution() }
    const loaded = async () => ok(await assembly.dependencies.journal.load(access))
    ok(await invoke(assembly))
    await eventually(async () => refused > 0)

    expect(ok(await quiesceOf(assembly, 'quiesce-1'))).toMatchObject({
      kind: 'unresolved',
      remaining: [execution()],
    })
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied' })
    const kept = await loaded()
    expect(kept.state.kind).not.toBe('suspended')
    expect(kept.executionAttachment).not.toBeNull()

    offline = false
    assembly.release.open()
    await eventually(async () => (await loaded()).state.kind === 'ended')
    expect(ok(await quiesceOf(assembly, 'quiesce-2')).kind).toBe('drained')
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
    expect(ok(await quiesceOf(assembly, 'quiesce-3'))).toEqual(a)
    expect(host.calls).toHaveLength(1)
  })

  it('a new quiesce after an unresolved one goes on with the same handover', async () => {
    const { assembly, host } = await assembled()
    ok(await invoke(assembly))
    assembly.controls.journal.failNext('detach', { kind: 'unavailable' })
    const unresolved = ok(await quiesceOf(assembly, 'quiesce-1'))
    expect(unresolved.kind).toBe('unresolved')
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied' })
    expect(ok(await quiesceOf(assembly, 'quiesce-2')).kind).toBe('drained')
    expect(host.calls.map(call => call.operation)).toEqual([operation('quiesce-1')])
  })
})
