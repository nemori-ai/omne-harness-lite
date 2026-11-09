// Agent SPEC "依赖不可用时的等待": a Journal commit answered `unavailable` wrote nothing, so the
// run waits on the dependency and writes the same step again at the check time; a resource that
// is full now only makes the run later. A non-closing node waits in W0; a closing node waits in
// the process and saves no waiting; a W0 whose own save is unavailable keeps the wait in the
// process. A definite refusal (`invalid`, `unsupported`) ends the run with a failure and does not
// wait. The memory Journal and the scripted Model are the providers.
import { describe, expect, it } from 'vitest'
import type { AgentDependencies, AgentRunFailed } from '@omne-harness/agent'
import type { ExecutionState, Failure } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import { execution, loadWithEntries, ok, type Principal } from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly, type LoopAssembly } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

const FULL: Failure = {
  kind: 'unavailable',
  owner: 'session-log-journal',
  diagnostic: 'storage rejected the commit: queue_full',
}

/**
 * The Journal answers `answer` to the first `times` commits whose operation starts with one of
 * `nodes`. `states` records the state of every commit the Journal took, `queried` the operation
 * of every query.
 */
function refusing(nodes: readonly string[], answer: Failure, times = Number.POSITIVE_INFINITY) {
  const states: ExecutionState['kind'][] = []
  const queried: string[] = []
  let refused = 0
  const wrap = (d: Dependencies): Dependencies => ({
    ...d,
    journal: {
      ...d.journal,
      async commit(input) {
        if (refused < times && nodes.some(node => input.operation.startsWith(`${node}/`))) {
          refused += 1
          return fail(answer)
        }
        const committed = await d.journal.commit(input)
        if ('ok' in committed) states.push(input.state.kind)
        return committed
      },
      query(input) {
        queried.push(input.operation)
        return d.journal.query(input)
      },
    },
  })
  return { wrap, states, queried, refusedCount: () => refused }
}

async function read(assembly: LoopAssembly) {
  return await loadWithEntries(assembly.controls.journal.provider, {
    ...alice,
    execution: execution(),
  })
}

/** Moves the test clock to the next check time once the run has armed one. */
async function checkTime(assembly: LoopAssembly): Promise<void> {
  await eventually(async () => assembly.controls.clock.pending().length > 0)
  const due = assembly.controls.clock.pending()[0]
  if (due === undefined) throw new Error('the check time is required')
  ok(assembly.controls.clock.advanceTo(due))
}

async function ended(assembly: LoopAssembly) {
  await eventually(async () => (await read(assembly)).state.kind === 'ended')
  return (await read(assembly)).state
}

describe('a Journal commit answered unavailable is a dependency wait', () => {
  it('a non-closing node waits in W0 and writes the same step again at the check time; the run completes', async () => {
    const journal = refusing(['I0'], FULL, 1)
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly([execution()], journal.wrap, undefined, undefined, {
      failed: event => reports.push(event),
    })
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => (await read(assembly)).state.kind === 'waiting')
    expect((await read(assembly)).state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'session-log-journal', position: 'I0' }],
    })
    await checkTime(assembly)
    expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    // An unavailable write is not an unknown outcome: nothing asks the Journal about it.
    expect(journal.queried.filter(operation => operation.startsWith('I0/'))).toEqual([])
    expect(reports).toEqual([])
  })

  it('waits as many times as the Journal stays unavailable', async () => {
    const journal = refusing(['I0'], FULL, 3)
    const assembly = await loopAssembly([execution()], journal.wrap)
    assembly.release.open()
    ok(await invoke(assembly))
    for (let wake = 0; wake < 3; wake += 1) await checkTime(assembly)
    expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    expect(journal.refusedCount()).toBe(3)
  })

  it('a W0 whose own save is unavailable keeps the wait in the process and saves no waiting', async () => {
    const journal = refusing(['I0', 'W0'], FULL, 2)
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly([execution()], journal.wrap, undefined, undefined, {
      failed: event => reports.push(event),
    })
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => journal.refusedCount() === 2)
    expect((await read(assembly)).state.kind).not.toBe('waiting')
    await checkTime(assembly)
    expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    expect(journal.states).not.toContain('waiting')
    expect(reports).toEqual([])
  })

  it('a closing node waits in the process: no waiting is saved and the same step is written again', async () => {
    const journal = refusing(['F1'], FULL, 1)
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly([execution()], journal.wrap, undefined, undefined, {
      failed: event => reports.push(event),
    })
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => journal.refusedCount() === 1)
    await checkTime(assembly)
    expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    expect(journal.states).not.toContain('waiting')
    expect(reports).toEqual([])
  })
})

describe('a Journal commit answered with a definite failure ends the run', () => {
  it.each([
    { kind: 'invalid', field: 'storage', reason: 'command_limit' },
    { kind: 'unsupported' },
  ] as const)(
    '$kind: the run ends with the failure of the node and does not wait',
    async answer => {
      const journal = refusing(['I0'], answer)
      const reports: AgentRunFailed[] = []
      const assembly = await loopAssembly([execution()], journal.wrap, undefined, undefined, {
        failed: event => reports.push(event),
      })
      assembly.release.open()
      ok(await invoke(assembly))
      expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'fail' } })
      expect((await read(assembly)).settlement.candidate?.failure).toMatchObject({
        kind: 'node-failed',
        node: 'I0',
        failureKind: answer.kind,
      })
      expect(journal.states).not.toContain('waiting')
      expect(reports).toEqual([])
    },
  )
})
