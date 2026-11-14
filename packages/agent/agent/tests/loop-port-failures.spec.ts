import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { Failure } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelFailure } from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import {
  execution,
  failure,
  ok,
  type Principal,
  loadWithEntries,
  entriesOf,
} from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly, stoppedAt } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

const PORT_FAILURE: Failure = { kind: 'unavailable', owner: 'test-port', diagnostic: 'injected' }
const MODEL_FAILURE: ModelFailure = {
  kind: 'unavailable',
  dependency: 'test-port',
  diagnostic: 'injected',
}

function failing<I, O>(
  original: (input: I) => Promise<O>,
  failed: O,
  when: (input: I, call: number) => boolean,
): (input: I) => Promise<O> {
  let calls = 0
  return input => {
    calls += 1
    return when(input, calls) ? Promise.resolve(failed) : original(input)
  }
}

const fromNth =
  (n: number) =>
  (_: unknown, call: number): boolean =>
    call >= n

const nth =
  (n: number) =>
  (_: unknown, call: number): boolean =>
    call === n
const of =
  (node: string) =>
  (input: Readonly<{ operation: string }>): boolean =>
    input.operation.startsWith(`${node}/`)

type Case = readonly [
  node: string,
  port: string,
  position: string,
  inject: (dependencies: Dependencies) => Dependencies,
]

function journal(
  dependencies: Dependencies,
  change: Partial<Dependencies['journal']>,
): Dependencies {
  return { ...dependencies, journal: { ...dependencies.journal, ...change } }
}

function models(
  dependencies: Dependencies,
  change: Readonly<{
    calls?: Partial<Dependencies['models']['calls']>
    consumption?: Partial<Dependencies['models']['consumption']>
    instances?: Partial<Dependencies['models']['instances']>
  }>,
): Dependencies {
  const { calls, consumption, instances } = dependencies.models
  return {
    ...dependencies,
    models: {
      calls: { ...calls, ...change.calls },
      consumption: { ...consumption, ...change.consumption },
      instances: { ...instances, ...change.instances },
    },
  }
}

function failLoadAt(d: Dependencies, position: string): Dependencies['journal']['load'] {
  return async input => {
    const loaded = await d.journal.load(input)
    return 'ok' in loaded && loaded.ok.checkpoint.position === position
      ? fail(PORT_FAILURE)
      : loaded
  }
}

function failLoadWhenEnded(d: Dependencies): Dependencies['journal']['load'] {
  return async input => {
    const loaded = await d.journal.load(input)
    return 'ok' in loaded && loaded.ok.state.kind === 'ended' ? fail(PORT_FAILURE) : loaded
  }
}

const CASES: readonly Case[] = [
  [
    'E1',
    'journal.load',
    'E3',
    d => journal(d, { load: failing(d.journal.load, fail(PORT_FAILURE), fromNth(1)) }),
  ],
  [
    'E2',
    'journal.inputs',
    'E3',
    d => journal(d, { inputs: failing(d.journal.inputs, fail(PORT_FAILURE), fromNth(1)) }),
  ],
  [
    'E2',
    'conditions.read',
    'E3',
    d => ({
      ...d,
      conditions: { read: failing(d.conditions.read, fail(PORT_FAILURE), fromNth(1)) },
    }),
  ],
  [
    'E3',
    'journal.commit',
    'E3',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('E3')) }),
  ],
  [
    'I0',
    'journal.commit',
    'E4',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('I0')) }),
  ],
  [
    'I1',
    'conditions.read',
    'I1',
    d => ({
      ...d,
      conditions: { read: failing(d.conditions.read, fail(PORT_FAILURE), fromNth(2)) },
    }),
  ],
  [
    'I1',
    'selection.select',
    'I1',
    d => ({
      ...d,
      selection: { select: failing(d.selection.select, fail(PORT_FAILURE), fromNth(1)) },
    }),
  ],
  [
    'I1',
    'modelContext.read',
    'I1',
    d => ({
      ...d,
      modelContext: { read: failing(d.modelContext.read, fail(PORT_FAILURE), fromNth(1)) },
    }),
  ],
  [
    'I1',
    'requests.prepare',
    'I1',
    d => ({
      ...d,
      requests: {
        ...d.requests,
        prepare: failing(d.requests.prepare, fail(PORT_FAILURE), fromNth(1)),
      },
    }),
  ],
  [
    'M0',
    'journal.commit',
    'I2',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('M0')) }),
  ],
  [
    'M6',
    'models.calls.admit',
    'M6',
    d =>
      models(d, { calls: { admit: failing(d.models.calls.admit, fail(MODEL_FAILURE), nth(1)) } }),
  ],
  [
    'M1',
    'journal.load',
    'M6',
    d =>
      journal(d, {
        async load(input) {
          const loaded = await d.journal.load(input)
          return 'ok' in loaded &&
            loaded.ok.checkpoint.position === 'M6' &&
            (await entriesOf(d.entries, input)).length > 0
            ? fail(PORT_FAILURE)
            : loaded
        },
      }),
  ],
  [
    'M3',
    'materials.read',
    'M6',
    d => ({
      ...d,
      materials: {
        ...d.materials,
        read: failing(d.materials.read, fail(PORT_FAILURE), fromNth(1)),
      },
    }),
  ],
  [
    'M3',
    'journal.commit',
    'M6',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('M3')) }),
  ],
  [
    'Q1',
    'handoff.prepare',
    'Q2',
    d => ({
      ...d,
      handoff: { ...d.handoff, prepare: failing(d.handoff.prepare, fail(PORT_FAILURE), nth(2)) },
    }),
  ],
  ['I8', 'journal.load', 'I8', d => journal(d, { load: failLoadAt(d, 'I8') })],
  ['F1', 'journal.load', 'F1', d => journal(d, { load: failLoadAt(d, 'F1') })],
  [
    'F1',
    'journal.commit',
    'F1',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('F1')) }),
  ],
  ['F3', 'journal.load', 'F3', d => journal(d, { load: failLoadAt(d, 'F3') })],
  [
    'F3',
    'journal.prepareFinish',
    'F3',
    d =>
      journal(d, { prepareFinish: failing(d.journal.prepareFinish, fail(PORT_FAILURE), nth(1)) }),
  ],
  [
    'F3',
    'journal.tryFinish',
    'F3',
    d => journal(d, { tryFinish: failing(d.journal.tryFinish, fail(PORT_FAILURE), fromNth(1)) }),
  ],
  ['F4', 'journal.load', 'F3', d => journal(d, { load: failLoadWhenEnded(d) })],
]

describe('a port failure on the normal path holds the run at its node', () => {
  it.each(CASES)('%s: %s fails', async (node, port, position, inject) => {
    const assembly = await loopAssembly([execution(), execution('exec-2')], inject)
    assembly.release.open()
    ok(await invoke(assembly))
    const state = await stoppedAt(assembly, position)
    if (node === 'F4' || node === 'O0') expect(state.kind).toBe('ended')
    else if (port === 'models.calls.admit')
      expect(state).toEqual({
        kind: 'waiting',
        waits: [{ kind: 'dependency', owner: 'modelRuntime', position: 'M6' }],
      })
    else expect(state.kind).not.toBe('ended')
    if (port !== 'journal.tryFinish') return
    const read = async () =>
      await loadWithEntries(assembly.controls.journal.provider, {
        ...alice,
        execution: execution(),
      })
    const stopped = await read()
    for (let check = 0; check < 3; check += 1) {
      await eventually(async () => assembly.controls.clock.pending().length > 0)
      const due = assembly.controls.clock.pending()[0]
      if (due === undefined) throw new Error('the check time is required')
      ok(assembly.controls.clock.advanceTo(due))
    }
    await eventually(async () => assembly.controls.clock.pending().length > 0)
    const after = await read()
    expect(after.revision).toBe(stopped.revision)
    expect(after.state.kind).toBe('settling')
  })
})

describe('an unavailable port at P1 is a dependency wait at P1', () => {
  const P1_CASES: readonly (readonly [string, (d: Dependencies) => Dependencies])[] = [
    [
      'selection.select',
      d => ({
        ...d,
        selection: { select: failing(d.selection.select, fail(PORT_FAILURE), fromNth(2)) },
      }),
    ],
    [
      'requests.prepare',
      d => ({
        ...d,
        requests: {
          ...d.requests,
          prepare: failing(d.requests.prepare, fail(PORT_FAILURE), fromNth(2)),
        },
      }),
    ],
  ]
  it.each(P1_CASES)('%s fails', async (_, inject) => {
    const assembly = await loopAssembly([execution(), execution('exec-2')], inject)
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => assembly.controls.clock.pending().length === 1)
    const saved = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(saved.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'test-port', position: 'P1' }],
    })
  })

  const INVALID: Failure = { kind: 'invalid', field: 'injected', reason: 'injected' }
  const P1_DEFINITE: readonly (readonly [string, (d: Dependencies) => Dependencies])[] = [
    [
      'selection.select',
      d => ({ ...d, selection: { select: failing(d.selection.select, fail(INVALID), nth(2)) } }),
    ],
    [
      'requests.prepare',
      d => ({
        ...d,
        requests: { ...d.requests, prepare: failing(d.requests.prepare, fail(INVALID), nth(2)) },
      }),
    ],
  ]
  it.each(P1_DEFINITE)('%s answers a definite failure: the execution fails', async (_, inject) => {
    const assembly = await loopAssembly([execution()], inject)
    assembly.release.open()
    const events = await eventsOf(ok(await invoke(assembly)))
    expect(events.filter(event => event.body.kind === 'waiting')).toHaveLength(0)
    const ended = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(ended.state.kind === 'ended' && ended.state.conclusion.kind).toBe('fail')
  })

  it('wakes at the check time, prepares again from I1 and ends', async () => {
    const dependency = { available: false, calls: 0 }
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      requests: {
        ...d.requests,
        prepare: input => {
          dependency.calls += 1
          return dependency.calls === 1 || dependency.available
            ? d.requests.prepare(input)
            : Promise.resolve(fail(PORT_FAILURE))
        },
      },
    }))
    assembly.release.open()
    const handle = ok(await invoke(assembly))
    await eventually(async () => assembly.controls.clock.pending().length === 1)
    expect(dependency.calls).toBe(3)
    dependency.available = true
    const due = assembly.controls.clock.pending()[0]
    if (due === undefined) throw new Error('the check time is required')
    ok(assembly.controls.clock.advanceTo(due))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'waiting')).toHaveLength(1)
    expect(events.at(-1)?.body.kind).toBe('ended')
    expect(dependency.calls).toBe(5)
  })
})

describe('a port failure before open is the answer of invoke, and the slot is given back', () => {
  const before: readonly (readonly [string, (d: Dependencies) => Dependencies])[] = [
    [
      'adoptions.resolve',
      d => ({
        ...d,
        adoptions: {
          ...d.adoptions,
          resolve: failing(d.adoptions.resolve, fail(PORT_FAILURE), nth(1)),
        },
      }),
    ],
    [
      'handoff.prepare at Q1',
      d => ({
        ...d,
        handoff: { ...d.handoff, prepare: failing(d.handoff.prepare, fail(PORT_FAILURE), nth(1)) },
      }),
    ],
    [
      'journal.open at E0',
      d => journal(d, { open: failing(d.journal.open, fail(PORT_FAILURE), nth(1)) }),
    ],
  ]
  it.each(before)('%s fails', async (_, inject) => {
    const assembly = await loopAssembly([execution(), execution('exec-2')], inject)
    expect(failure(await invoke(assembly))).toEqual(PORT_FAILURE)
    ok(await invoke(assembly, 'exec-2'))
    assembly.release.open()
  })
})
