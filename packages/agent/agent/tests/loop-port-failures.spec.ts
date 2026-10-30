// The normal-path-only limit of #502 1.2: a port that fails at any node of the path stops the run at
// that node. The Journal keeps the `position` of the last commit before it, the execution does not
// end before F3, and the runtime never shows idle. The stop keeps the port's owner apart from
// `@omne-harness/agent#defect` inside the coordinator only; the waits of #502 1.9 make that
// readable. The failure branches of these nodes are the work of #502 1.3 to 1.9; this test only
// pins that no failure becomes a success or a silent stop.
import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { Failure } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelFailure } from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import { execution, failure, ok, type Principal } from './journal-support.ts'
import { invoke, loopAssembly, stoppedAt } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

const PORT_FAILURE: Failure = { kind: 'unavailable', owner: 'test-port', diagnostic: 'injected' }
const MODEL_FAILURE: ModelFailure = {
  kind: 'unavailable',
  dependency: 'test-port',
  diagnostic: 'injected',
}

/**
 * A method that fails on the call that `when` picks and otherwise calls the original. `when` gets
 * the input and the ordinal of the call, from 1.
 */
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

// W0 retries a failed read before sleeping. A stable-stop assertion needs a dependency
// that remains unavailable; recovered one-shot failures are covered by the W0 regression.
const fromNth =
  (n: number) =>
  (_: unknown, call: number): boolean =>
    call >= n

const nth =
  (n: number) =>
  (_: unknown, call: number): boolean =>
    call === n
/** A Journal write of `node`: the coordinator names its operations `<node>/<what>@<revision>`. */
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

/** Inject at a persisted boundary, independently of the extra qualification reads at M6. */
function failLoadAt(d: Dependencies, position: string): Dependencies['journal']['load'] {
  return async input => {
    const loaded = await d.journal.load(input)
    return 'ok' in loaded && loaded.ok.checkpoint.position === position
      ? fail(PORT_FAILURE)
      : loaded
  }
}

/** Inject at the first read after the ended commit: F4's read of the terminal ledger. */
function failLoadWhenEnded(d: Dependencies): Dependencies['journal']['load'] {
  return async input => {
    const loaded = await d.journal.load(input)
    return 'ok' in loaded && loaded.ok.state.kind === 'ended' ? fail(PORT_FAILURE) : loaded
  }
}

/** Every port call of the normal path after `open`, in path order. E9 calls no port. */
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
    'P1',
    'selection.select',
    'P1',
    d => ({ ...d, selection: { select: failing(d.selection.select, fail(PORT_FAILURE), nth(2)) } }),
  ],
  [
    'P1',
    'requests.prepare',
    'P1',
    d => ({
      ...d,
      requests: { ...d.requests, prepare: failing(d.requests.prepare, fail(PORT_FAILURE), nth(2)) },
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
            loaded.ok.entries?.length
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
    d => journal(d, { tryFinish: failing(d.journal.tryFinish, fail(PORT_FAILURE), nth(1)) }),
  ],
  ['F4', 'journal.load', 'F3', d => journal(d, { load: failLoadWhenEnded(d) })],
]

describe('a port failure on the normal path stops the run at its node (#502 1.2 limit)', () => {
  it.each(CASES)('%s: %s fails', async (node, _, position, inject) => {
    const assembly = await loopAssembly([execution(), execution('exec-2')], inject)
    assembly.release.open()
    ok(await invoke(assembly))
    // Before F3 the execution never ends. A failure at F4 or O0 comes after the ended commit, so
    // the execution is ended, but the runtime still holds the slot and does not show idle.
    const state = await stoppedAt(assembly, position)
    if (node === 'F4' || node === 'O0') expect(state.kind).toBe('ended')
    else expect(state.kind).not.toBe('ended')
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
