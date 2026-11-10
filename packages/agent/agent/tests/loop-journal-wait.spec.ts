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

/** Advances the test clock to each check time the run arms, until the run has ended. */
async function endedThroughChecks(assembly: LoopAssembly) {
  await eventually(async () => {
    if ((await read(assembly)).state.kind === 'ended') return true
    const due = assembly.controls.clock.pending()[0]
    if (due !== undefined) ok(assembly.controls.clock.advanceTo(due))
    return false
  })
  return (await read(assembly)).state
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

describe('a read answered unavailable inside a node is a dependency wait too', () => {
  // SPEC 依赖不可用时的等待: reads and writes alike. The live run in #1174 stopped at Q1 when the
  // message admission could not read the Session snapshot, and at I3 when the Journal could not
  // read the common root of the session (queue_full).
  it('the message admission answering unavailable at Q1 waits and the run completes', async () => {
    let prepares = 0
    let refused = 0
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        handoff: {
          ...d.handoff,
          prepare(input) {
            prepares += 1
            // The first prepare admits the invoke's own input; the second is Q1's reply.
            if (prepares === 2 && refused === 0) {
              refused += 1
              return Promise.resolve(
                fail({
                  kind: 'unavailable',
                  owner: 'session-adapters/message-handoff',
                  diagnostic: 'the Session snapshot is not readable',
                }),
              )
            }
            return d.handoff.prepare(input)
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => refused === 1)
    await checkTime(assembly)
    expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    expect(reports).toEqual([])
  })

  // #1174 qa D1: the wait comes back at Q2 with no outcome in hand. The prepare that answered
  // unavailable took no effect, so Q2 prepares the same request again; it does not take the
  // lookup of a receipt lost with a process, which the local authorization denies.
  it('after an unavailable prepare at Q1 the same request is prepared again, not looked up', async () => {
    let prepares = 0
    let lookups = 0
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        handoff: {
          ...d.handoff,
          prepare(input) {
            prepares += 1
            if (prepares === 2)
              return Promise.resolve(
                fail({
                  kind: 'unavailable',
                  owner: 'session-adapters/message-handoff',
                  diagnostic: 'read session.work: queue_full',
                }),
              )
            return d.handoff.prepare(input)
          },
          lookup() {
            lookups += 1
            return Promise.resolve(fail({ kind: 'denied', action: 'read-message-handoff' }))
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    ok(await invoke(assembly))
    expect(await endedThroughChecks(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    expect(prepares).toBe(3)
    expect(lookups).toBe(0)
    expect(reports).toEqual([])
  })

  it('a Journal load answering unavailable inside a node waits and the run completes', async () => {
    let loads = 0
    let refused = 0
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        journal: {
          ...d.journal,
          load(input) {
            loads += 1
            // Past the first reads of E1 and E2, one later read of a node is unavailable.
            if (loads === 4 && refused === 0) {
              refused += 1
              return Promise.resolve(fail(FULL))
            }
            return d.journal.load(input)
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => refused === 1)
    await checkTime(assembly)
    expect(await ended(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
    expect(reports).toEqual([])
  })
})

describe('a received-records read answered unavailable is a Journal wait', () => {
  // The live run in #1174 stopped at I3: the received entries, which the session log Journal
  // serves, could not be read (the common root of the session, queue_full).
  it('the received entries answering unavailable at I3 wait and the run completes', async () => {
    let refused = 0
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        entries: {
          ...d.entries,
          async receivedOf(input) {
            // M1 and M3 read at M6 (M1 waits by itself); the read after them is I3's.
            const at = await d.journal.load({ ...alice, execution: execution() })
            if (refused === 0 && 'ok' in at && at.ok.checkpoint.position !== 'M6') {
              refused += 1
              return fail(FULL)
            }
            return d.entries.receivedOf(input)
          },
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => refused === 1)
    expect(await endedThroughChecks(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
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
