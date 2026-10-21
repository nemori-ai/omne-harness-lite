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
  HandoffResult,
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
  invoke,
  loopAssembly,
  shown,
  type LoopAssembly,
} from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
type AcceptInput = Parameters<MessageHandoff<Principal>['accept']>[0]

/** The port calls of one assembly in order, and what `accept` was given and answered. */
type Record = {
  log: string[]
  accepts: { input: AcceptInput; result: Outcome<HandoffResult, unknown> }[]
  commits: JournalCommit<Principal>[]
}

function recording(record: Record) {
  return (dependencies: Dependencies): Dependencies => {
    const { journal, handoff } = dependencies
    return {
      ...dependencies,
      handoff: {
        async accept(input) {
          record.log.push(`accept ${input.source.kind}`)
          const result = await handoff.accept(input)
          record.accepts.push({ input, result })
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
          record.log.push(`commit ${input.operation.split('/')[0] ?? ''}`)
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
  const record: Record = { log: [], accepts: [], commits: [] }
  const assembly = await loopAssembly(executions.map(execution), recording(record))
  return { ...assembly, record }
}

const opens = (record: Record) => record.log.filter(entry => entry === 'open').length
const sequences = async (handle: AgentExecutionHandle<Principal>) =>
  (await eventsOf(handle)).map(event => [event.sequence, event.body.kind])
const ENDED_EVENTS = [
  ['1', 'input-taken'],
  ['2', 'producer'],
  ['3', 'ended'],
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

  it('NA-Q1-1: Q1 passes a lawful candidate straight to Q2, with no call and no commit between', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const { log, commits } = assembly.record
    // The external input: accept, then open. The Model reply: the M5 commit, then accept.
    expect(log.slice(0, 2)).toEqual(['accept external-input', 'open'])
    const reply = log.indexOf('accept model-reply')
    expect(log[reply - 1]).toBe('commit M5')
    expect(commits.map(commit => commit.operation.split('/')[0])).not.toContain('Q1')
  })

  it('NA-Q2-1: an accepted Model reply commits its admission with the checkpoint, and the node goes to Q4', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const reply = assembly.record.accepts.find(item => item.input.source.kind === 'model-reply')
    const admitted = ok(reply?.result ?? fail('no reply was admitted'))
    if (admitted.kind !== 'accepted') throw new Error('the reply was not accepted')
    const q2 = assembly.record.commits.find(commit => commit.operation.startsWith('Q2/'))
    expect(q2?.checkpoint.position).toBe('Q4')
    expect(q2?.replyAdmission).toMatchObject({ decision: 'admitted', source: admitted.admission })
  })

  it('NA-Q2-1: an accepted external input saves no receipt of its own (S-13 of #558); it goes to open unchanged', async () => {
    const assembly = await recorded()
    ok(await invoke(assembly))
    const [external] = assembly.record.accepts
    expect(external?.input.source).toEqual({
      kind: 'external-input',
      input: acceptedInput('input-exec-1').id,
    })
    expect(external?.result).toMatchObject({ ok: { kind: 'accepted' } })
    expect(assembly.record.log.slice(0, 2)).toEqual(['accept external-input', 'open'])
    assembly.release.open()
  })

  it('NA-Q4-1: Q4 returns each admission to its call position once: the input to U0 and E0, the reply to I3', async () => {
    const assembly = await recorded()
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    const { log, commits } = assembly.record
    expect(log.filter(entry => entry.startsWith('accept'))).toEqual([
      'accept external-input',
      'accept model-reply',
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
    const record: Record = { log: [], accepts: [], commits: [] }
    const seen: unknown[] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => {
      const wrapped = recording(record)(dependencies)
      return {
        ...wrapped,
        journal: {
          ...wrapped.journal,
          async open(input) {
            seen.push({ initial: input.initial, position: input.checkpoint.position })
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

  it('the same operation with another input: busy while the slot is held, the conflict of the Journal once it is free', async () => {
    const assembly = await recorded()
    const other = { input: acceptedInput('input-other', 'other') }
    ok(await invoke(assembly))
    expect(failure(await invoke(assembly, 'exec-1', other))).toEqual({ kind: 'busy' })
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(failure(await invoke(assembly, 'exec-1', other))).toMatchObject({ kind: 'conflict' })
    expect(await shown(assembly)).toEqual(idle)
  })
})

describe('NA-E0-3: a slot held by another operation answers busy, never a queue', () => {
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
    expect(assembly.record.log.filter(entry => entry.startsWith('accept'))).toHaveLength(1)
  })
})

describe('NA-Q2-2 (C2): a lost receipt of accept is found by calling it again', () => {
  it('NA-Q2-2: invoke answers commit-unknown and frees the slot; the same operation again gets the original result and runs on', async () => {
    const assembly = await recorded()
    assembly.controls.handoff.accept.once(input =>
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'commit-unknown',
      operation: operation('invoke-exec-1'),
    })
    expect(await shown(assembly)).toEqual(idle)
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
    const [lost, found] = assembly.record.accepts
    expect(found?.input.operation).toBe(lost?.input.operation)
    expect(found?.input.candidate).toEqual(lost?.input.candidate)
    expect(found?.result).toMatchObject({ ok: { kind: 'accepted' } })
  })
})

describe('NA-E0-4: an open whose outcome is unknown keeps the reservation as an R0 item', () => {
  const unresolved = { kind: 'commit-unknown', operation: operation('invoke-exec-1') }

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
    expect(queries).toEqual(['query invoke-exec-1', 'query invoke-exec-1'])
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
    assembly.controls.handoff.accept.once(() => fail(refused))
    expect(failure(await invoke(assembly))).toEqual(refused)
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
    assembly.release.open()
    expect(await sequences(ok(await invoke(assembly)))).toEqual(ENDED_EVENTS)
  })
})
