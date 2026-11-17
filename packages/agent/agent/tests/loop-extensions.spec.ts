import { describe, expect, it } from 'vitest'
import type { AgentEvent, ExecutionSnapshot } from '@omne-harness/agent-contract'
import { agentEvaluator } from '@omne-harness/agent'
import { adoption, evidence, execution, ok } from './journal-support.ts'
import { controlAssembly } from './fixtures/control-assembly.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'
import {
  basisOf,
  declare,
  implementations,
  observed,
  output,
  recordingPasses,
  reminder,
  tenantView,
  type Behavior,
} from './extension-support.ts'

const INTERVAL_MS = 1000
const at = (checks: number) => new Date(checks * INTERVAL_MS).toISOString()

async function scene(setup: (view: ReturnType<typeof tenantView>) => void = () => {}) {
  const view = tenantView()
  const extensions = implementations()
  setup(view)
  let recorded: ReturnType<typeof recordingPasses> | null = null
  const assembly = await loopAssembly(
    [execution()],
    dependencies => {
      recorded = recordingPasses({
        ...dependencies,
        extensions: extensions.port,
        enabledExtensions: view.port,
      })
      return recorded.dependencies
    },
    undefined,
    { reconciliationDelaysMs: [INTERVAL_MS] },
  )
  assembly.release.open()
  if (recorded === null) throw new Error('the assembly did not wrap its dependencies')
  const saved: ReturnType<typeof recordingPasses> = recorded
  const load = async (): Promise<ExecutionSnapshot> =>
    ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  return { assembly, view, extensions, saved, load }
}

const kinds = (events: readonly AgentEvent[]) => events.map(event => event.body.kind)

async function run(behavior: Behavior) {
  const s = await scene(view => view.enable(declare('probe', 'execution_started')))
  s.extensions.define('probe', behavior)
  const events = await eventsOf(ok(await invoke(s.assembly)))
  return { ...s, events }
}

describe('a tenant extension at execution_started', () => {
  it('observed: the chain and the requested call are saved in one commit before the call, the conclusion after it, and the node adopts the pass in its own commit', async () => {
    const { saved, extensions, events, load } = await run(() => observed)
    expect(extensions.invocations.map(item => [item.extension, item.version, item.mode])).toEqual([
      ['probe', 'probe@1', 'fresh'],
    ])
    expect(extensions.invocations[0]?.input).toMatchObject({
      position: 'execution_started',
      earlier: [],
      execution: execution(),
      passage: 'step-0/execution_started/call/0',
    })
    expect(
      saved.commits.map(commit => [commit.position, commit.chain?.pass ?? null, commit.calls]),
    ).toEqual([
      [
        'E3',
        'step-0/execution_started',
        [{ id: 'step-0/execution_started/call/0', state: 'requested', output: null }],
      ],
      [
        'E3',
        'step-0/execution_started',
        [{ id: 'step-0/execution_started/call/0', state: 'resolved', output: 'observed' }],
      ],
      ['E4', null, []],
    ])
    expect(saved.commits[0]?.chain).toMatchObject({
      position: 'execution_started',
      dimension: null,
      purpose: null,
      basis: basisOf(1),
      members: [
        { source: 'tenant', declaration: { name: 'probe' }, implementation: { name: 'probe@1' } },
      ],
    })
    expect(kinds(events).at(-1)).toBe('ended')
    expect((await load()).state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
  })

  it('inject: the reminder enters the history once through message admission, and the run goes on', async () => {
    const { events, assembly, load } = await run(() => output(reminder('mind the budget')))
    const reminders = events.filter(
      event => event.body.kind === 'message' && event.body.message.role === 'system_reminder',
    )
    expect(reminders).toHaveLength(1)
    expect(
      assembly.controls.handoff.prepare.calls
        .filter(
          call => call.request.kind === 'execution' && call.request.source.kind === 'reminder',
        )
        .map(call => call.request.kind === 'execution' && call.request.source),
    ).toEqual([{ kind: 'reminder', passage: 'step-0/execution_started/call/0' }])
    expect((await load()).state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
  })

  it('stop failed: the execution ends failed with the extension as its cause, and no model call is made', async () => {
    const { load, saved } = await run(() =>
      output({ kind: 'stop', terminal: 'failed', reason: 'budget exhausted' }),
    )
    const ended = await load()
    expect(ended.state, saved.total.trace.join(' ')).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'fail' },
    })
    expect(ended.settlement.candidate?.failure).toMatchObject({
      kind: 'extension-stop',
      passage: 'step-0/execution_started/call/0',
      reason: 'budget exhausted',
    })
    expect(ended.checkpoint.chain).toBeNull()
    expect(saved.total.trace.some(commit => commit.startsWith('M0'))).toBe(false)
  })
})

describe('no member at the position', () => {
  it('opens no pass: the commits are those of an assembly without a tenant source, and nothing of a chain is saved', async () => {
    const bare = await loopAssembly([execution()], dependencies => {
      const recorded = recordingPasses(dependencies)
      counted.bare = recorded.total
      return recorded.dependencies
    })
    bare.release.open()
    await eventsOf(ok(await invoke(bare)))
    const empty = await scene()
    await eventsOf(ok(await invoke(empty.assembly)))
    expect(empty.view.state.reads).toBeGreaterThan(0)
    expect(empty.saved.commits).toEqual([])
    expect(empty.saved.total.commits).toBe(counted.bare.commits)
  })
  const counted = { bare: { commits: -1, trace: [] as string[] } }

  it('an extension of another position does not run here', async () => {
    const s = await scene(view => view.enable(declare('later', 'before_terminal')))
    s.extensions.define('later', () => observed)
    await eventsOf(ok(await invoke(s.assembly)))
    expect(s.view.state.reads).toBeGreaterThan(0)
    expect(s.saved.commits).toEqual([])
    expect(s.extensions.invocations).toEqual([])
  })
})

describe('the enabled extensions are not readable', () => {
  it('waits on the dependency at the position and continues from it when the view answers again', async () => {
    const s = await scene(view => {
      view.enable(declare('probe', 'execution_started'))
      view.state.readable = false
    })
    s.extensions.define('probe', () => observed)
    const handle = ok(await invoke(s.assembly))
    await eventually(async () => (await s.load()).state.kind === 'waiting')
    const waiting = await s.load()
    expect(waiting.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'runtimeContext', position: 'E3' }],
    })
    expect(waiting.checkpoint.position).toBe('E3')
    expect(waiting.checkpoint.chain).toBeNull()
    expect(s.extensions.invocations).toEqual([])

    s.view.state.readable = true
    ok(s.assembly.controls.clock.advanceTo(at(1)))
    const events = await eventsOf(handle)
    expect(kinds(events).at(-1)).toBe('ended')
    expect(s.extensions.invocations.map(item => item.mode)).toEqual(['fresh'])
    expect(s.saved.commits.at(-1)).toMatchObject({ position: 'E4', chain: null })
  })
})

describe('a chain of several members', () => {
  it('runs the members of the definition first and the tenant members after them, each reading the conclusions before it; a conclusion and the next requested call are one commit', async () => {
    const s = await scene(view => {
      view.enable(declare('b', 'execution_started'))
      view.enable(declare('a', 'execution_started'))
    })
    s.assembly.controls.adoptions.define(adoption('definition'), {
      definition: { category: 'AgentDefinition', name: 'test', references: [], attributes: [] },
      evaluator: agentEvaluator,
      extensions: [declare('z', 'execution_started')],
    })
    for (const name of ['a', 'b', 'z']) s.extensions.define(name, () => observed)
    await eventsOf(ok(await invoke(s.assembly)))
    expect(s.extensions.invocations.map(item => item.extension)).toEqual(['z', 'a', 'b'])
    expect(s.extensions.invocations.map(item => item.input.earlier.map(c => c.extension))).toEqual([
      [],
      ['z'],
      ['z', 'a'],
    ])
    expect(
      s.saved.commits[0]?.chain?.members.map(member => [member.source, member.declaration.name]),
    ).toEqual([
      ['definition', 'z'],
      ['tenant', 'a'],
      ['tenant', 'b'],
    ])
    expect(s.saved.commits.map(commit => commit.calls.map(call => call.state))).toEqual([
      ['requested'],
      ['resolved', 'requested'],
      ['resolved', 'resolved', 'requested'],
      ['resolved', 'resolved', 'resolved'],
      [],
    ])
    expect(s.view.state.reads).toBe(readsOf(s.saved.total.trace))
  })

  it('a member removed after the chain was saved concludes unavailable when its turn comes, and a member enabled meanwhile does not join the chain', async () => {
    const s = await scene(view => {
      view.enable(declare('a', 'execution_started'))
      view.enable(declare('b', 'execution_started'))
    })
    s.extensions.define('a', () => {
      s.view.disable('b')
      s.extensions.remove('b')
      s.view.enable(declare('c', 'execution_started'))
      return observed
    })
    s.extensions.define('c', () => observed)
    await eventsOf(ok(await invoke(s.assembly)))
    expect(s.extensions.invocations.map(item => item.extension)).toEqual(['a'])
    expect(
      s.saved.commits.at(-2)?.calls.map(call => [call.id.split('/').at(-1), call.output]),
    ).toEqual([
      ['0', 'observed'],
      ['1', 'unavailable'],
    ])
  })
})

describe('stop cancelled', () => {
  it('asks the control entry to cancel on behalf of the extension, and the execution ends cancelled', async () => {
    const view = tenantView()
    const extensions = implementations()
    view.enable(declare('probe', 'execution_started'))
    extensions.define('probe', () =>
      output({ kind: 'stop', terminal: 'cancelled', reason: 'the tenant asked to stop' }),
    )
    const assembly = await controlAssembly({}, dependencies => ({
      ...dependencies,
      extensions: extensions.port,
      enabledExtensions: view.port,
    }))
    await eventsOf(ok(await invoke(assembly)))
    const ended = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
    expect(ended.controls.map(control => control.command.kind)).toEqual(['cancel'])
    expect(extensions.invocations).toHaveLength(1)
  })

  it('a refused cancel request does not stop the run', async () => {
    const s = await scene()
    s.view.enable(declare('probe', 'execution_started'))
    s.extensions.define('probe', () =>
      output({ kind: 'stop', terminal: 'cancelled', reason: 'the tenant asked to stop' }),
    )
    s.assembly.controls.access.check.always(input =>
      input.operation === 'control'
        ? { kind: 'denied' }
        : { kind: 'allowed', evidence: evidence(`access/${input.operation}`) },
    )
    await eventsOf(ok(await invoke(s.assembly)))
    expect((await s.load()).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
  })
})

/** The number of passes the run made over a position that reads the tenant view. */
function readsOf(trace: readonly string[]): number {
  return trace.filter(commit => commit === 'E3>E4:advancing').length
}
