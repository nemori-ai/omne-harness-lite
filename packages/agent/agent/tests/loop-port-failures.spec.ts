// The normal-path-only limit of #502 1.2: a port that fails at any node of the path stops the run at
// that node. The stop keeps the port's owner (never `@omne-harness/agent#defect`), the execution
// does not end before F3, and the runtime never shows idle. The failure branches of these nodes are the work of
// #502 1.3 to 1.9; this test only pins that no failure becomes a success or a silent stop.
import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { Failure } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelFailure } from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import {
  acceptedInput,
  execution,
  failure,
  instance,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

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
  owner: string,
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

/** Every port call of the normal path after `open`, in path order. E9 calls no port. */
const CASES: readonly Case[] = [
  [
    'E1',
    'journal.load',
    'test-port',
    d => journal(d, { load: failing(d.journal.load, fail(PORT_FAILURE), nth(1)) }),
  ],
  [
    'E2',
    'journal.inputs',
    'test-port',
    d => journal(d, { inputs: failing(d.journal.inputs, fail(PORT_FAILURE), nth(1)) }),
  ],
  [
    'E2',
    'conditions.read',
    'test-port',
    d => ({ ...d, conditions: { read: failing(d.conditions.read, fail(PORT_FAILURE), nth(1)) } }),
  ],
  [
    'E3',
    'journal.commit',
    'test-port',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('E3')) }),
  ],
  [
    'I0',
    'journal.commit',
    'test-port',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('I0')) }),
  ],
  [
    'I1',
    'conditions.read',
    'test-port',
    d => ({ ...d, conditions: { read: failing(d.conditions.read, fail(PORT_FAILURE), nth(2)) } }),
  ],
  [
    'I1',
    'selection.select',
    'test-port',
    d => ({ ...d, selection: { select: failing(d.selection.select, fail(PORT_FAILURE), nth(1)) } }),
  ],
  [
    'I1',
    'modelContext.read',
    'test-port',
    d => ({
      ...d,
      modelContext: { read: failing(d.modelContext.read, fail(PORT_FAILURE), nth(1)) },
    }),
  ],
  [
    'I1',
    'requests.prepare',
    'test-port',
    d => ({
      ...d,
      requests: { ...d.requests, prepare: failing(d.requests.prepare, fail(PORT_FAILURE), nth(1)) },
    }),
  ],
  [
    'P1',
    'selection.select',
    'test-port',
    d => ({ ...d, selection: { select: failing(d.selection.select, fail(PORT_FAILURE), nth(2)) } }),
  ],
  [
    'P1',
    'requests.prepare',
    'test-port',
    d => ({
      ...d,
      requests: { ...d.requests, prepare: failing(d.requests.prepare, fail(PORT_FAILURE), nth(2)) },
    }),
  ],
  [
    'M0',
    'journal.commit',
    'test-port',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('M0')) }),
  ],
  [
    'M6',
    'models.calls.admit',
    'modelRuntime',
    d =>
      models(d, { calls: { admit: failing(d.models.calls.admit, fail(MODEL_FAILURE), nth(1)) } }),
  ],
  [
    'M1',
    'models.instances.connect',
    'modelRuntime',
    d =>
      models(d, {
        instances: { connect: failing(d.models.instances.connect, fail(MODEL_FAILURE), nth(1)) },
      }),
  ],
  [
    'M3',
    'models.consumption.beginRead',
    'modelRuntime',
    d =>
      models(d, {
        consumption: {
          beginRead: failing(d.models.consumption.beginRead, fail(MODEL_FAILURE), nth(1)),
        },
      }),
  ],
  [
    'M3',
    'journal.recordResult',
    'test-port',
    d =>
      journal(d, { recordResult: failing(d.journal.recordResult, fail(PORT_FAILURE), of('M3')) }),
  ],
  [
    'M3',
    'models.consumption.acknowledge',
    'modelRuntime',
    d =>
      models(d, {
        consumption: {
          acknowledge: failing(d.models.consumption.acknowledge, fail(MODEL_FAILURE), nth(1)),
        },
      }),
  ],
  [
    'Q2',
    'handoff.accept',
    'test-port',
    d => ({ ...d, handoff: { accept: failing(d.handoff.accept, fail(PORT_FAILURE), nth(2)) } }),
  ],
  [
    'I8',
    'journal.load',
    'test-port',
    d => journal(d, { load: failing(d.journal.load, fail(PORT_FAILURE), nth(2)) }),
  ],
  [
    'F1',
    'journal.load',
    'test-port',
    d => journal(d, { load: failing(d.journal.load, fail(PORT_FAILURE), nth(3)) }),
  ],
  [
    'F1',
    'journal.commit',
    'test-port',
    d => journal(d, { commit: failing(d.journal.commit, fail(PORT_FAILURE), of('F1')) }),
  ],
  [
    'F3',
    'journal.tryFinish',
    'test-port',
    d => journal(d, { tryFinish: failing(d.journal.tryFinish, fail(PORT_FAILURE), nth(1)) }),
  ],
  [
    'F4',
    'journal.load',
    'test-port',
    d => journal(d, { load: failing(d.journal.load, fail(PORT_FAILURE), nth(4)) }),
  ],
  [
    'O0',
    'journal.recordResult',
    'test-port',
    d =>
      journal(d, { recordResult: failing(d.journal.recordResult, fail(PORT_FAILURE), of('O0')) }),
  ],
]

function invoke(assembly: LoopAssembly, id = 'exec-1') {
  return assembly.provider.runtime.invoke({
    ...alice,
    execution: execution(id),
    operation: operation(`invoke-${id}`),
    initial: acceptedInput(`input-${id}`, `hello ${id}`),
    grant: null,
  })
}

/** The diagnostic of the halt of exec-1, read from the refusal of a later invoke. */
async function haltOf(assembly: LoopAssembly): Promise<string> {
  for (let turn = 0; turn < 200; turn += 1) {
    const refused = failure(await invoke(assembly, 'exec-2'))
    if (refused.kind === 'unavailable' && refused.diagnostic.includes('halted'))
      return refused.diagnostic
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('the run never halted')
}

describe('a port failure on the normal path halts at its node with the port owner (#502 1.2 limit)', () => {
  it.each(CASES)('%s: %s fails', async (node, _, owner, inject) => {
    const assembly = await loopAssembly([execution(), execution('exec-2')], inject)
    assembly.release.open()
    ok(await invoke(assembly))
    const halt = await haltOf(assembly)
    expect(halt).toContain(`halted at ${node}:`)
    expect(halt).toContain(`"owner":"${owner}"`)
    expect(halt).not.toContain('#defect')
    // Before F3 the execution never ends. A failure at F4 or O0 comes after the ended commit, so
    // the execution is ended, but the runtime still holds the slot and does not show idle.
    const loaded = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    if (node === 'F4' || node === 'O0') expect(loaded.state.kind).toBe('ended')
    else expect(loaded.state.kind).not.toBe('ended')
    const controller = new AbortController()
    for await (const seen of assembly.provider.observation.observe({
      ...alice,
      signal: controller.signal,
    })) {
      controller.abort()
      expect(seen).toMatchObject({
        kind: 'state',
        value: { kind: 'occupied', instance: instance() },
      })
      break
    }
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
      'handoff.accept at Q2',
      d => ({ ...d, handoff: { accept: failing(d.handoff.accept, fail(PORT_FAILURE), nth(1)) } }),
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
