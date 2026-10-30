// The admission of #511 (#502 1.3): U0, Q1, Q2, Q4 and E0 as the node table states them. The same
// operation again gets the original handle (C1), a lost receipt of `accept` is found again by the
// same call (C2), a held slot answers busy, and an `open` whose outcome is unknown keeps the
// reservation as an R0 item that a retry of the same operation queries. Each test name starts with
// its row of the node acceptance table (agent-contract verification/node-acceptance.md).
import { describe, expect, it } from 'vitest'
import { createAgentRuntime, type AgentDependencies } from '@omne-harness/agent'
import type {
  AgentExecutionHandle,
  AgentState,
  HandoffOutcome,
  JournalCommit,
  MessageHandoff,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  acceptedInput,
  execution,
  failure,
  instance,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import {
  alice,
  eventually,
  eventsOf,
  gate,
  handoffOperationOf,
  invoke,
  loopAssembly,
  shown,
  stoppedAt,
  type LoopAssembly,
  commitNodeOf,
} from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
type PrepareInput = Parameters<MessageHandoff<Principal>['prepare']>[0]

/** The port calls of one assembly in order, and what `prepare` was given and answered. */
type Record = {
  log: string[]
  prepares: { input: PrepareInput; result: Outcome<HandoffOutcome, unknown> }[]
  commits: JournalCommit<Principal>[]
}

function recording(record: Record) {
  return (dependencies: Dependencies): Dependencies => {
    const { journal, handoff } = dependencies
    return {
      ...dependencies,
      handoff: {
        ...handoff,
        async prepare(input) {
          record.log.push(`prepare ${input.request.source.kind}`)
          const result = await handoff.prepare(input)
          record.prepares.push({ input, result })
          return result
        },
      },
      journal: {
        ...journal,
        open(input) {
          record.log.push('open')
          return journal.open(input)
        },
        query(input) {
          record.log.push(`query ${input.operation}`)
          return journal.query(input)
        },
        load(input) {
          record.log.push('load')
          return journal.load(input)
        },
        commit(input) {
          record.log.push(`commit ${commitNodeOf(input.operation)}`)
          record.commits.push(input)
          return journal.commit(input)
        },
      },
    }
  }
}

async function recorded(
  executions: readonly string[] = ['exec-1', 'exec-2'],
): Promise<LoopAssembly & { record: Record }> {
  const record: Record = { log: [], prepares: [], commits: [] }
  const assembly = await loopAssembly(executions.map(execution), recording(record))
  return { ...assembly, record }
}

const opens = (record: Record) => record.log.filter(entry => entry === 'open').length
const sequences = async (handle: AgentExecutionHandle<Principal>) =>
  (await eventsOf(handle)).map(event => [event.sequence, event.body.kind])
const ENDED_EVENTS = [
  ['1', 'input-taken'],
  ['2', 'entry'],
  ['3', 'producer'],
  ['4', 'message'],
  ['5', 'ended'],
]
const idle: AgentState = { kind: 'idle', instance: instance() }

describe('NA-U0-1, NA-Q1-1, NA-Q2-1, NA-Q4-1: the input of invoke through U0, Q1, Q2 and Q4', () => {
  it('NA-U0-1: Journal.inputs returns the content that invoke handed over', async () => {
    const assembly = await recorded()
    ok(await invoke(assembly))
    const snapshot = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    const inputs = ok(
      await assembly.dependencies.journal.inputs({
        ...alice,
        execution: execution(),
        watermark: snapshot.inputWatermark,
      }),
    )
    expect(inputs.messages).toEqual([acceptedInput('input-exec-1', 'hello exec-1').content])
    assembly.release.open()
  })

  it('NA-Q1-1: the external input has no P; the Model reply has exactly its P between the producer commit and prepare', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const { log, commits } = assembly.record
    // The external input: prepare, then open; no P. The Model reply: the M3 producer commit, the
    // P of Q1 (SPEC "消息准入": P fixes H before prepare), then prepare.
    expect(log.slice(0, 2)).toEqual(['prepare external-input', 'open'])
    const reply = log.indexOf('prepare model-reply')
    expect(
      log
        .slice(0, reply)
        .filter(item => item.startsWith('commit '))
        .slice(-2),
    ).toEqual(['commit M3', 'commit Q1'])
    const p = commits.filter(commit => commitNodeOf(commit.operation) === 'Q1')
    expect(p).toHaveLength(1)
    expect(p[0]?.handoff?.kind).toBe('prepare')
    expect(p[0]?.checkpoint.currentHandoff).toEqual(
      p[0]?.handoff?.kind === 'prepare' ? p[0].handoff.request.reference : null,
    )
    expect(p[0]?.events).toEqual([])
  })

  it('NA-Q2-1: an accepted Model reply commits its admission with the checkpoint, and the node goes to Q4', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const reply = assembly.record.prepares.find(
      item => item.input.request.source.kind === 'model-reply',
    )
    const fixed = ok(reply?.result ?? fail('no reply was admitted'))
    if (fixed.decision.kind !== 'prepared') throw new Error('the reply was not prepared')
    const handoff = fixed.request.reference.kind === 'execution' ? fixed.request.reference : null
    const ja = assembly.record.commits.find(
      commit => commit.operation === `${handoff?.operation}/resolve`,
    )
    expect(ja?.checkpoint.position).toBe('Q4')
    expect(ja?.checkpoint.currentHandoff).toBeNull()
    expect(ja?.replyAdmission).toMatchObject({
      decision: 'admitted',
      source: fixed.decision.admission,
    })
    expect(ja?.handoff).toEqual({ kind: 'resolve', outcome: fixed })
    expect(ja?.events).toEqual([
      { kind: 'message', message: fixed.decision.message, source: fixed.decision.admission },
    ])
  })

  it('NA-Q2-1: an accepted external input saves no receipt of its own (S-13 of #558); it goes to open unchanged', async () => {
    const assembly = await recorded()
    ok(await invoke(assembly))
    const [external] = assembly.record.prepares
    expect(external?.input.kind).toBe('invoke')
    expect(external?.input.request.source).toEqual({
      kind: 'external-input',
      input: acceptedInput('input-exec-1').id,
    })
    expect(external?.result).toMatchObject({ ok: { decision: { kind: 'prepared' } } })
    expect(assembly.record.log.slice(0, 2)).toEqual(['prepare external-input', 'open'])
    expect(assembly.record.commits.map(commit => commit.handoff)).not.toContainEqual(
      expect.objectContaining({
        kind: 'prepare',
        request: expect.objectContaining({ kind: 'input' }),
      }),
    )
    assembly.release.open()
  })

  it('NA-Q4-1: Q4 returns each admission to its call position once: the input to U0 and E0, the reply to I3', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const { log, commits } = assembly.record
    expect(log.filter(entry => entry.startsWith('prepare'))).toEqual([
      'prepare external-input',
      'prepare model-reply',
    ])
    const positions = commits.map(commit => [
      commit.operation.split('/')[0],
      commit.checkpoint.position,
    ])
    const q4 = positions.findIndex(([node]) => node === 'Q4')
    expect(positions.slice(q4, q4 + 2)).toEqual([
      ['Q4', 'I3'],
      ['I3', 'I4'],
    ])
  })
})

describe('NA-E0-1: invoke reserves the slot, then open saves the input and the initial checkpoint', () => {
  it('NA-E0-1: the slot is reserved while open runs; after the Authority the node goes to E1', async () => {
    const opening = gate()
    const record: Record = { log: [], prepares: [], commits: [] }
    const seen: unknown[] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => {
      const wrapped = recording(record)(dependencies)
      return {
        ...wrapped,
        journal: {
          ...wrapped.journal,
          async open(input) {
            const entry = input.original.entry
            if (entry.kind !== 'invoke') throw new Error('an invoke entry was expected')
            seen.push({ initial: entry.initial, position: entry.checkpoint.position })
            await opening.opened
            return wrapped.journal.open(input)
          },
        },
      }
    })
    const first = invoke(assembly)
    await eventually(async () => seen.length === 1)
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    opening.open()
    ok(await first)
    expect(seen).toEqual([
      { initial: acceptedInput('input-exec-1', 'hello exec-1'), position: 'E3' },
    ])
    await eventually(async () => record.log.includes('load'))
    expect(record.log.slice(record.log.indexOf('open'), record.log.indexOf('open') + 2)).toEqual([
      'open',
      'load',
    ])
    assembly.release.open()
  })
})

describe('NA-E0-2 (C1): the same operation again gets the original handle and runs no second loop', () => {
  it('NA-E0-2: while the run goes on', async () => {
    const assembly = await recorded()
    const first = ok(await invoke(assembly))
    const again = ok(await invoke(assembly))
    expect(again.execution).toBe(first.execution)
    assembly.release.open()
    expect(await sequences(again)).toEqual(ENDED_EVENTS)
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(opens(assembly.record)).toBe(1)
  })

  it('NA-E0-2: after the execution ended', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    const commits = assembly.record.commits.length
    const again = ok(await invoke(assembly))
    expect(again.execution).toBe(execution())
    expect(await sequences(again)).toEqual(ENDED_EVENTS)
    expect(opens(assembly.record)).toBe(1)
    expect(assembly.record.commits).toHaveLength(commits)
    expect(await shown(assembly)).toEqual(idle)
  })

  it('NA-E0-2: an earlier ended operation is found while another execution holds the slot', async () => {
    const holding = gate()
    const record: Record = { log: [], prepares: [], commits: [] }
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => {
      const wrapped = recording(record)(dependencies)
      return {
        ...wrapped,
        conditions: {
          async read(input) {
            if (input.advance.execution === execution('exec-2')) await holding.opened
            return wrapped.conditions.read(input)
          },
        },
      }
    })
    assembly.release.open()
    const first = ok(await invoke(assembly))
    await eventsOf(first)
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    ok(await invoke(assembly, 'exec-2'))
    const before = await shown(assembly)
    const commits = record.commits.length
    const prepares = record.prepares.length
    const again = ok(await invoke(assembly))
    expect(again.execution).toBe(first.execution)
    expect(await sequences(again)).toEqual(ENDED_EVENTS)
    expect(record.log.slice(-3)).toEqual(['query invoke-exec-1', 'prepare external-input', 'open'])
    expect(record.commits).toHaveLength(commits)
    expect(record.prepares).toHaveLength(prepares + 1)
    expect(record.prepares.at(-1)?.input).toEqual(record.prepares[0]?.input)
    expect(await shown(assembly)).toEqual(before)
    expect(before).toMatchObject({ kind: 'occupied', execution: execution('exec-2') })
    expect(
      failure(await invoke(assembly, 'exec-1', { input: acceptedInput('other', 'other') })),
    ).toMatchObject({ kind: 'conflict' })
    expect(await shown(assembly)).toEqual(before)
    holding.open()
  })

  it('NA-E0-2: after the run stopped, the same operation neither opens nor drives it again', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('commit', { kind: 'unavailable' })
    const first = ok(await invoke(assembly))
    expect((await stoppedAt(assembly, 'E3')).kind).not.toBe('ended')
    const commits = assembly.record.commits.length
    expect(ok(await invoke(assembly)).execution).toBe(first.execution)
    expect((await stoppedAt(assembly, 'E3')).kind).not.toBe('ended')
    expect(opens(assembly.record)).toBe(1)
    expect(assembly.record.commits).toHaveLength(commits)
  })

  it('NA-E0-2: a new runtime drives an opened execution whose revision did not advance', async () => {
    const loading = gate()
    const record: Record = { log: [], prepares: [], commits: [] }
    let loads = 0
    const assembly = await loopAssembly([execution()], dependencies => {
      const wrapped = recording(record)(dependencies)
      return {
        ...wrapped,
        journal: {
          ...wrapped.journal,
          async load(input) {
            loads += 1
            if (loads === 1) await loading.opened
            return wrapped.journal.load(input)
          },
        },
      }
    })
    ok(await invoke(assembly))
    await eventually(async () => loads === 1)
    const restarted = ok(await createAgentRuntime(assembly.dependencies, options()))
    assembly.release.open()
    expect(await sequences(ok(await invoke({ provider: restarted })))).toEqual(ENDED_EVENTS)
    await eventually(async () => (await shown({ provider: restarted })).kind === 'idle')
    const commits = record.commits.length
    loading.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(opens(record)).toBe(2)
    expect(record.commits).toHaveLength(commits)
  })

  it('NA-E0-2: in a new runtime over the same Journal, open gives the original back and the execution is not driven', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const commits = assembly.record.commits.length
    const restarted = ok(await createAgentRuntime(assembly.dependencies, options()))
    const again = ok(await invoke({ provider: restarted }))
    expect(again.execution).toBe(execution())
    expect(opens(assembly.record)).toBe(2)
    await eventually(async () => (await shown({ provider: restarted })).kind === 'idle')
    expect(assembly.record.commits).toHaveLength(commits)
    expect(await sequences(again)).toEqual(ENDED_EVENTS)
    // The new runtime holds the original handle too: the same operation does not open again.
    ok(await invoke({ provider: restarted }))
    expect(opens(assembly.record)).toBe(2)
  })

  it('NA-E0-2: the remembered operation with another input conflicts without a query or a slot change', async () => {
    const assembly = await recorded()
    const other = { input: acceptedInput('input-other', 'other') }
    ok(await invoke(assembly))
    const before = await shown(assembly)
    expect(failure(await invoke(assembly, 'exec-1', other))).toEqual({
      kind: 'conflict',
      operation: operation('invoke-exec-1'),
    })
    expect(assembly.record.log.filter(entry => entry.startsWith('query'))).toEqual([])
    expect(
      failure(
        await assembly.provider.runtime.invoke({
          ...alice,
          execution: execution('exec-2'),
          operation: operation('invoke-exec-1'),
          initial: acceptedInput('input-exec-1', 'hello exec-1'),
          grant: null,
        }),
      ),
    ).toEqual({ kind: 'busy' })
    expect(assembly.record.log.filter(entry => entry.startsWith('query'))).toEqual([
      'query invoke-exec-1',
    ])
    expect(opens(assembly.record)).toBe(1)
    expect(assembly.record.prepares).toHaveLength(1)
    expect(await shown(assembly)).toEqual(before)
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(failure(await invoke(assembly, 'exec-1', other))).toMatchObject({ kind: 'conflict' })
    expect(opens(assembly.record)).toBe(2)
    expect(await shown(assembly)).toEqual(idle)
  })

  it('NA-E0-2: a remembered operation with another input queries the Journal while another execution reserves the slot', async () => {
    const opening = gate()
    let reserved = false
    const record: Record = { log: [], prepares: [], commits: [] }
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => {
      const wrapped = recording(record)(dependencies)
      return {
        ...wrapped,
        journal: {
          ...wrapped.journal,
          async open(input) {
            if (input.execution === execution('exec-2')) {
              reserved = true
              await opening.opened
            }
            return wrapped.journal.open(input)
          },
        },
      }
    })
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    const second = invoke(assembly, 'exec-2')
    await eventually(async () => reserved)
    const before = await shown(assembly)
    try {
      expect(
        failure(await invoke(assembly, 'exec-1', { input: acceptedInput('other', 'other') })),
      ).toEqual({ kind: 'conflict', operation: operation('invoke-exec-1') })
      expect(record.log.slice(-3)).toEqual([
        'query invoke-exec-1',
        'prepare external-input',
        'open',
      ])
      expect(await shown(assembly)).toEqual(before)
      expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    } finally {
      opening.open()
    }
    await eventsOf(ok(await second))
  })

  it('NA-E0-2: a failed adoption lookup for an earlier operation returns its failure without changing the held slot', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    assembly.controls.journal.failNext('commit', { kind: 'unavailable' })
    ok(await invoke(assembly, 'exec-2'))
    await eventually(async () => assembly.record.log.includes('commit E3'))
    const before = await shown(assembly)
    const refused = {
      kind: 'unavailable',
      owner: 'test-adoptions',
      diagnostic: 'lookup failed',
    } as const
    assembly.controls.adoptions.resolve.once(() => fail(refused))
    const opened = opens(assembly.record)
    const prepares = assembly.record.prepares.length
    expect(failure(await invoke(assembly))).toBe(refused)
    expect(opens(assembly.record)).toBe(opened)
    expect(assembly.record.prepares).toHaveLength(prepares)
    expect(await shown(assembly)).toEqual(before)
  })

  it('NA-E0-2: a lost acceptance receipt while finding an earlier operation names the invoke operation and preserves the slot', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    assembly.controls.journal.failNext('commit', { kind: 'unavailable' })
    ok(await invoke(assembly, 'exec-2'))
    const before = await shown(assembly)
    const opened = opens(assembly.record)
    const lostOperations: string[] = []
    assembly.controls.handoff.prepare.once(input => {
      lostOperations.push(handoffOperationOf(input))
      return fail({ kind: 'commit-unknown', operation: handoffOperationOf(input) })
    })
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'commit-unknown',
      operation: operation('invoke-exec-1'),
    })
    expect(lostOperations).toEqual([operation('invoke-exec-1')])
    expect(opens(assembly.record)).toBe(opened)
    expect(await shown(assembly)).toEqual(before)
  })
})

describe('NA-E0-3: a slot held by another operation answers busy, never a queue', () => {
  it('NA-E0-3: a failed query for another execution returns the original failure and keeps the slot', async () => {
    const refused = fail({
      kind: 'unavailable',
      owner: 'test-journal',
      diagnostic: 'query failed',
    } as const)
    let queries = 0
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        async query() {
          queries += 1
          return refused
        },
      },
    }))
    ok(await invoke(assembly))
    const before = await shown(assembly)
    expect(await invoke(assembly, 'exec-2')).toBe(refused)
    expect(queries).toBe(1)
    expect(await shown(assembly)).toEqual(before)
    expect(before).toMatchObject({ kind: 'occupied', execution: execution() })
    assembly.release.open()
  })

  it('NA-E0-3: an unknown query for another execution returns commit-unknown with that invoke operation', async () => {
    const assembly = await recorded()
    ok(await invoke(assembly))
    const before = await shown(assembly)
    const other = ok(await createAgentRuntime(assembly.dependencies, options()))
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke({ provider: other }, 'exec-2')).kind).toBe('commit-unknown')
    const opensBeforeQuery = opens(assembly.record)
    const prepares = assembly.record.prepares.length
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({
      kind: 'commit-unknown',
      operation: operation('invoke-exec-2'),
    })
    expect(assembly.record.log.filter(entry => entry.startsWith('query'))).toEqual([
      'query invoke-exec-2',
    ])
    expect(opens(assembly.record)).toBe(opensBeforeQuery)
    expect(assembly.record.prepares).toHaveLength(prepares)
    expect(await shown(assembly)).toEqual(before)
    assembly.release.open()
  })

  it('NA-E0-3: an excluded query for another execution answers busy without admitting it', async () => {
    const assembly = await recorded()
    ok(await invoke(assembly))
    const other = ok(await createAgentRuntime(assembly.dependencies, options()))
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'dropped' })
    expect(failure(await invoke({ provider: other }, 'exec-2')).kind).toBe('commit-unknown')
    expect(
      ok(
        await assembly.controls.journal.port.query({
          ...alice,
          execution: execution('exec-2'),
          operation: operation('invoke-exec-2'),
        }),
      ).kind,
    ).toBe('excluded')
    const before = await shown(assembly)
    const opensBeforeQuery = opens(assembly.record)
    const prepares = assembly.record.prepares.length
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    expect(assembly.record.log.filter(entry => entry.startsWith('query'))).toEqual([
      'query invoke-exec-2',
    ])
    expect(opens(assembly.record)).toBe(opensBeforeQuery)
    expect(assembly.record.prepares).toHaveLength(prepares)
    expect(await shown(assembly)).toEqual(before)
    assembly.release.open()
  })

  it('NA-E0-3: while the first invoke is reserved, in the same turn', async () => {
    const assembly = await recorded()
    const [first, second] = await Promise.all([invoke(assembly), invoke(assembly, 'exec-2')])
    ok(first)
    expect(failure(second)).toEqual({ kind: 'busy' })
    assembly.release.open()
  })

  it('NA-E0-3: while the first run is running', async () => {
    const assembly = await recorded()
    ok(await invoke(assembly))
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    assembly.release.open()
  })

  it('NA-E0-3: while the first run is stopped', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('commit', { kind: 'unavailable' })
    ok(await invoke(assembly))
    await eventually(async () => assembly.record.log.includes('commit E3'))
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: execution() })
  })

  it('NA-E0-3: while the open of the first invoke is unresolved', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toMatchObject({ kind: 'commit-unknown' })
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    expect(assembly.record.log.filter(entry => entry.startsWith('prepare'))).toHaveLength(1)
  })
})

describe('NA-Q2-2 (C2): a lost receipt of prepare is found by calling it again with the same request', () => {
  it('NA-Q2-2: invoke answers commit-unknown and frees the slot; the same operation again gets the original result and runs on', async () => {
    const assembly = await recorded()
    assembly.controls.handoff.prepare.once(input =>
      fail({ kind: 'commit-unknown', operation: handoffOperationOf(input) }),
    )
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'commit-unknown',
      operation: operation('invoke-exec-1'),
    })
    expect(await shown(assembly)).toEqual(idle)
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
    const [lost, found] = assembly.record.prepares
    expect(found?.input.request).toEqual(lost?.input.request)
    expect(found?.result).toMatchObject({ ok: { decision: { kind: 'prepared' } } })
  })
})

describe('NA-E0-4: an open whose outcome is unknown keeps the reservation as an R0 item', () => {
  const unresolved = { kind: 'commit-unknown', operation: operation('invoke-exec-1') }

  it('NA-E0-4: a reservation without an unresolved open answers busy without querying or retrying', async () => {
    const opening = gate()
    const record: Record = { log: [], prepares: [], commits: [] }
    const assembly = await loopAssembly([execution()], dependencies => {
      const wrapped = recording(record)(dependencies)
      return {
        ...wrapped,
        journal: {
          ...wrapped.journal,
          async open(input) {
            await opening.opened
            return wrapped.journal.open(input)
          },
        },
      }
    })
    const first = invoke(assembly)
    await eventually(async () => record.prepares.length === 1)
    try {
      expect(failure(await invoke(assembly))).toEqual({ kind: 'busy' })
      expect(record.log.filter(entry => entry.startsWith('query'))).toEqual([])
      expect(record.prepares).toHaveLength(1)
    } finally {
      opening.open()
      assembly.release.open()
    }
    await eventsOf(ok(await first))
  })

  it('NA-E0-4: a different operation for the reserved execution does not retry the unresolved open', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(
      failure(
        await assembly.provider.runtime.invoke({
          ...alice,
          execution: execution(),
          operation: operation('other-invoke'),
          initial: acceptedInput('other-input'),
          grant: null,
        }),
      ),
    ).toEqual({ kind: 'busy' })
    expect(assembly.record.log.filter(entry => entry.startsWith('query'))).toEqual([])
    expect(opens(assembly.record)).toBe(1)
    expect(failure(await invoke(assembly))).toEqual(unresolved)
  })

  it('NA-E0-4: the same operation with another execution queries that execution without retrying the R0 item', async () => {
    const queries: { execution: string; operation: string }[] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        query(input) {
          queries.push({ execution: input.execution, operation: input.operation })
          return dependencies.journal.query(input)
        },
      },
    }))
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(
      failure(
        await assembly.provider.runtime.invoke({
          ...alice,
          execution: execution('exec-2'),
          operation: operation('invoke-exec-1'),
          initial: acceptedInput('input-exec-1', 'hello exec-1'),
          grant: null,
        }),
      ),
    ).toEqual({ kind: 'busy' })
    expect(queries).toEqual([
      { execution: execution('exec-2'), operation: operation('invoke-exec-1') },
    ])
    expect(failure(await invoke(assembly))).toEqual(unresolved)
  })

  it('NA-E0-4: a failed retry query returns the original failure and preserves the R0 item', async () => {
    const refused = fail({
      kind: 'unavailable',
      owner: 'test-journal',
      diagnostic: 'query failed',
    } as const)
    let queries = 0
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        async query(input) {
          queries += 1
          return queries === 1 ? refused : dependencies.journal.query(input)
        },
      },
    }))
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(await invoke(assembly)).toBe(refused)
    expect(await shown(assembly)).toEqual(idle)
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(queries).toBe(2)
  })

  it('NA-E0-4: another invoke stays busy while the retry query is in progress', async () => {
    const querying = gate()
    let queries = 0
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        async query(input) {
          queries += 1
          if (queries === 1) await querying.opened
          return dependencies.journal.query(input)
        },
      },
    }))
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    const retry = invoke(assembly)
    await eventually(async () => queries === 1)
    try {
      expect(failure(await invoke(assembly))).toEqual({ kind: 'busy' })
      expect(queries).toBe(1)
      expect(await shown(assembly)).toEqual(idle)
    } finally {
      querying.open()
    }
    expect(failure(await retry)).toEqual(unresolved)
  })

  it('NA-E0-4: pending, then applied: the retry queries the original operation, then runs on', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(await shown(assembly)).toEqual(idle)
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    expect(
      assembly.controls.journal.settle(execution(), operation('invoke-exec-1'), 'applied'),
    ).toBe(true)
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
    const queries = assembly.record.log.filter(entry => entry.startsWith('query'))
    expect(queries).toEqual(['query invoke-exec-1', 'query invoke-exec-2', 'query invoke-exec-1'])
    expect(opens(assembly.record)).toBe(2)
  })

  it('NA-E0-4: applied: the query finds it committed, and the same open gives the original receipt back', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'applied' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
    expect(assembly.record.log.filter(entry => entry.startsWith('query'))).toEqual([
      'query invoke-exec-1',
    ])
    expect(opens(assembly.record)).toBe(2)
  })

  it('NA-E0-4: dropped: the query finds it excluded, and the same operation opens anew', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'dropped' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    expect(
      failure(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).kind,
    ).toBe('denied')
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
    expect(opens(assembly.record)).toBe(2)
  })
  it('NA-E0-4: a failure of the retry before open keeps the R0 item, because the open may have committed', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'applied' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    const refused = { kind: 'unavailable', owner: 'test-handoff', diagnostic: 'injected' } as const
    assembly.controls.handoff.prepare.once(() => fail(refused))
    expect(failure(await invoke(assembly))).toEqual(refused)
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
  })

  it('NA-E0-4: an excluded open followed by a failure before open frees the slot', async () => {
    const assembly = await recorded()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'dropped' })
    expect(failure(await invoke(assembly))).toEqual(unresolved)
    const refused = { kind: 'unavailable', owner: 'test-handoff', diagnostic: 'injected' } as const
    assembly.controls.handoff.prepare.once(() => fail(refused))
    expect(failure(await invoke(assembly))).toEqual(refused)
    expect(opens(assembly.record)).toBe(1)
    ok(await invoke(assembly, 'exec-2'))
    expect(await shown(assembly)).toMatchObject({
      kind: 'occupied',
      execution: execution('exec-2'),
    })
    assembly.release.open()
  })
})

// SPEC "查询的四种结论与持久拒绝": consumers branch on all four conclusions. `rejected` only comes
// from recordControl, so for the operation of an invoke it is a violation of the Journal provider:
// it is neither a free slot, nor busy, nor a settled admission.
describe('the admission branches on a rejected query explicitly', () => {
  type Conclusion = Awaited<ReturnType<Dependencies['journal']['query']>>
  const rejected = (refused: ReturnType<typeof operation>): Conclusion => ({
    ok: {
      kind: 'rejected',
      failure: { kind: 'conflict', operation: refused },
      audit: { owner: 'test', record: 'audit', revision: '1', digest: 'test:audit' },
      revision: '1' as never,
    },
  })

  async function withQuery() {
    let override:
      | ((input: { operation: ReturnType<typeof operation> }) => Conclusion | null)
      | null = null
    const record: Record = { log: [], prepares: [], commits: [] }
    const assembly = await loopAssembly([execution(), execution('exec-2')], d => {
      const recordedDependencies = recording(record)(d)
      return {
        ...recordedDependencies,
        journal: {
          ...recordedDependencies.journal,
          async query(input) {
            const forced = override?.(input)
            return forced ?? recordedDependencies.journal.query(input)
          },
        },
      }
    })
    return { ...assembly, record, force: (f: typeof override) => void (override = f) }
  }

  it('the R0 retry of a reserved open answers unavailable and keeps the reservation', async () => {
    const assembly = await withQuery()
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'commit-unknown',
      operation: operation('invoke-exec-1'),
    })
    const before = await shown(assembly)
    const opensBefore = opens(assembly.record)
    assembly.force(input =>
      input.operation === operation('invoke-exec-1') ? rejected(input.operation) : null,
    )
    expect(failure(await invoke(assembly))).toMatchObject({
      kind: 'unavailable',
      owner: 'agentJournal',
    })
    expect(await shown(assembly)).toEqual(before)
    expect(opens(assembly.record)).toBe(opensBefore)
    assembly.release.open()
  })

  it('a held slot meeting a rejected query answers unavailable, not busy', async () => {
    const assembly = await withQuery()
    ok(await invoke(assembly))
    const before = await shown(assembly)
    assembly.force(input =>
      input.operation === operation('invoke-exec-2') ? rejected(input.operation) : null,
    )
    expect(failure(await invoke(assembly, 'exec-2'))).toMatchObject({
      kind: 'unavailable',
      owner: 'agentJournal',
    })
    expect(await shown(assembly)).toEqual(before)
    assembly.release.open()
  })
})
