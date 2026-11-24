// The eight properties of verification/position-pass/PositionPass.tla, one test each. Each test
// names the check whose removal turns it red; the red runs are kept by run-red.sh.
import { describe, expect, it } from 'vitest'
import type { ExecutionSnapshot, ExtensionInvocationResult } from '@omne-harness/agent-contract'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { controlAssembly } from './fixtures/control-assembly.ts'
import { acceptedInput, evidence, execution, ok, operation } from './journal-support.ts'
import {
  alice,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  type LoopAssembly,
} from './loop-support.ts'
import { rebuilt, resumeEntry } from './loop-takeover-support.ts'
import {
  declare,
  implementations,
  observed,
  output,
  recordingPasses,
  tenantView,
} from './extension-support.ts'

type Assembly = LoopAssembly | Awaited<ReturnType<typeof controlAssembly>>

const loaded = async (assembly: Assembly): Promise<ExecutionSnapshot> =>
  ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))

/** A call in flight: the test decides when, and with what, the implementation returns. */
function held() {
  let release: (result: ExtensionInvocationResult) => void = () => {}
  const result = new Promise<ExtensionInvocationResult>(resolve => {
    release = resolve
  })
  return { result, release }
}

function parts() {
  const view = tenantView()
  const extensions = implementations()
  const saved: { current: ReturnType<typeof recordingPasses> | null } = { current: null }
  const wrap = <D extends Parameters<typeof recordingPasses>[0]>(dependencies: D): D => {
    saved.current = recordingPasses({
      ...dependencies,
      extensions: extensions.port,
      enabledExtensions: view.port,
    })
    return saved.current.dependencies as D
  }
  const commits = () => saved.current?.commits ?? []
  return { view, extensions, wrap, commits }
}

/** A coordinator driven by hand, so that a test can lose it in the middle of a pass and take over. */
async function driven(p: ReturnType<typeof parts>) {
  const assembly = await loopAssembly([execution()], p.wrap)
  assembly.release.open()
  const entry = resumeEntry(assembly.dependencies)
  const first = createExecutionCoordinator({
    ...entry,
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
  })
  ok(await first.accept())
  const running = first.runExecution()
  const takeover = async () => {
    const next = await rebuilt(assembly.dependencies, entry, 'takeover')
    return next.runExecution()
  }
  return { assembly, running, takeover }
}

const chainOf = async (assembly: Assembly) =>
  (await loaded(assembly)).checkpoint.chain?.members.map(member => member.declaration.name)

describe('PositionPass', () => {
  it('SnapStable: a view that changes while the pass is open does not change the chain, and a takeover continues the saved chain', async () => {
    const p = parts()
    p.view.enable(declare('a', 'execution_started'))
    const flight = held()
    p.extensions.define('a', (_input, mode) => (mode.kind === 'fresh' ? flight.result : observed))
    p.extensions.define('b', () => observed)
    const s = await driven(p)
    await eventually(async () => p.extensions.invocations.length === 1)
    p.view.disable('a')
    p.view.enable(declare('b', 'execution_started'))
    expect(await chainOf(s.assembly)).toEqual(['a'])
    const reads = p.view.state.positions.filter(position => position === 'execution_started')
    const taken = s.takeover()
    flight.release(observed)
    ok(await taken)
    expect(p.extensions.invocations.map(item => item.extension)).toEqual(['a', 'a'])
    expect(
      p
        .commits()
        .flatMap(commit => commit.chain?.members.map(member => member.declaration.name) ?? []),
    ).not.toContain('b')
    expect(p.view.state.positions.filter(position => position === 'execution_started')).toEqual(
      reads,
    )
  })

  it('OnlySnapRuns: a member enabled in the middle of the pass does not run in this pass', async () => {
    const p = parts()
    p.view.enable(declare('a', 'execution_started'))
    p.view.enable(declare('c', 'execution_started'))
    p.extensions.define('a', () => {
      p.view.enable(declare('b', 'execution_started'))
      return observed
    })
    p.extensions.define('b', () => observed)
    p.extensions.define('c', () => observed)
    const assembly = await loopAssembly([execution()], p.wrap)
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    expect(p.extensions.invocations.map(item => item.extension)).toEqual(['a', 'c'])
  })

  it('NoRecall: a member whose conclusion is saved is not invoked again after a takeover', async () => {
    const p = parts()
    p.view.enable(declare('a', 'execution_started'))
    p.view.enable(declare('b', 'execution_started'))
    const flight = held()
    p.extensions.define('a', () => observed)
    p.extensions.define('b', (_input, mode) => (mode.kind === 'fresh' ? flight.result : observed))
    const s = await driven(p)
    await eventually(async () => p.extensions.invocations.length === 2)
    const taken = s.takeover()
    flight.release(observed)
    ok(await taken)
    expect(p.extensions.invocations.map(item => item.extension)).toEqual(['a', 'b', 'b'])
    expect((await loaded(s.assembly)).state).toMatchObject({ conclusion: { kind: 'complete' } })
  })

  it('FreshOnce: a call that was in flight when the coordinator was lost is invoked in replay, never fresh again', async () => {
    const p = parts()
    p.view.enable(declare('a', 'execution_started'))
    const flight = held()
    p.extensions.define('a', (_input, mode) => (mode.kind === 'fresh' ? flight.result : observed))
    const s = await driven(p)
    await eventually(async () => p.extensions.invocations.length === 1)
    const taken = s.takeover()
    flight.release(observed)
    ok(await taken)
    expect(p.extensions.invocations.map(item => item.mode)).toEqual(['fresh', 'replay'])
  })

  it('UnavailableNeverRan: a result that was lost forms no conclusion; the call waits and is concluded by its replay', async () => {
    const p = parts()
    p.view.enable(declare('a', 'execution_started'))
    const lost: ExtensionInvocationResult = {
      kind: 'invocationUnresolved',
      start: { kind: 'unknown' },
      recovery: evidence('host-record'),
    }
    p.extensions.define('a', (_input, mode) => (mode.kind === 'fresh' ? lost : observed))
    const assembly = await loopAssembly([execution()], p.wrap)
    assembly.release.open()
    const handle = ok(await invoke(assembly))
    await eventually(async () => (await loaded(assembly)).state.kind === 'waiting')
    const waiting = await loaded(assembly)
    expect(waiting.state).toMatchObject({
      waits: [{ kind: 'dependency', owner: 'agentExtensions' }],
    })
    expect(waiting.checkpoint.passages.map(call => call.progress.kind)).toEqual(['requested'])
    await eventually(async () => assembly.controls.clock.pending().length === 1)
    ok(assembly.controls.clock.advanceTo(assembly.controls.clock.pending()[0] as string))
    await eventsOf(handle)
    expect(p.extensions.invocations.map(item => item.mode)).toEqual(['fresh', 'replay'])
    const outputs = p.commits().flatMap(commit => commit.calls.map(call => call.output))
    expect(outputs).toContain('observed')
    expect(outputs).not.toContain('unavailable')
  })

  it('NoStartAfterCancel: after the cancellation takes effect no call begins, and the return of the call in flight is not adopted', async () => {
    const p = parts()
    p.view.enable(declare('a', 'execution_started'))
    p.view.enable(declare('b', 'execution_started'))
    const flight = held()
    p.extensions.define('a', () => flight.result)
    p.extensions.define('b', () => observed)
    const assembly = await controlAssembly({}, p.wrap)
    const handle = ok(await invoke(assembly))
    await eventually(async () => p.extensions.invocations.length === 1)
    ok(
      await handle.control.control({
        ...alice,
        execution: execution(),
        operation: operation('cancel-1'),
        command: { kind: 'cancel', reason: evidence('the person cancelled') },
      }),
    )
    flight.release(observed)
    await eventually(async () => (await loaded(assembly)).state.kind === 'ended')
    expect((await loaded(assembly)).state).toMatchObject({ conclusion: { kind: 'cancelled' } })
    expect(p.extensions.invocations.map(item => item.extension)).toEqual(['a'])
    expect(p.commits().flatMap(commit => commit.calls.map(call => call.state))).not.toContain(
      'resolved',
    )
  })

  it('NeverLeftUnread: when the enabled extensions are not readable, a position before a change waits and the change does not happen', async () => {
    const p = parts()
    p.view.enable(declare('a', 'before_model_call'))
    p.extensions.define('a', () => observed)
    p.view.state.unreadableAt = ['before_model_call']
    const assembly = await loopAssembly([execution()], p.wrap)
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => (await loaded(assembly)).state.kind === 'waiting')
    const waiting = await loaded(assembly)
    expect(waiting.state).toMatchObject({
      waits: [{ kind: 'dependency', owner: 'runtimeContext', position: 'P0' }],
    })
    expect(waiting.checkpoint.calls).toEqual([])
    expect(waiting.checkpoint.chain).toBeNull()
    expect(p.extensions.invocations).toEqual([])
  })

  it('InOrder: the members run in chain order, and after a veto no later member is requested', async () => {
    const p = parts()
    for (const name of ['a', 'b', 'c']) p.view.enable(declare(name, 'before_model_call'))
    p.extensions.define('a', () => observed)
    p.extensions.define('b', () => output({ kind: 'veto', reason: 'not this request' }))
    p.extensions.define('c', () => observed)
    const assembly = await loopAssembly([execution()], p.wrap)
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => (await loaded(assembly)).state.kind === 'waiting')
    expect(p.extensions.invocations.map(item => item.extension)).toEqual(['a', 'b'])
    const calls = p
      .commits()
      .at(-1)
      ?.calls.map(call => [call.id.split('/').at(-1), call.state])
    expect(calls).toEqual([
      ['0', 'resolved'],
      ['1', 'resolved'],
    ])
  })
})
