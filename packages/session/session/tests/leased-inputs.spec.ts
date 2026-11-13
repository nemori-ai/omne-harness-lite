// S1 after a failed Run: the inputs the Run took and did not answer are pending again, and no new
// Run starts until a person sends an input. The next Run then hands the returned input in first.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  expectedRevision,
  type AgentDrivePort,
  type InputId,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactionPair,
  evidence,
  operationId,
  succeeded,
  type MemorySessionHistorySource,
} from '@omne-harness/session-contract/testing'
import { turn } from './fixtures/control-fixture.ts'
import { fixtureInitializationGuard, type BackendFactory } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

type Pair = ReturnType<typeof createMemorySessionTransactionPair<string>>

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

/** The memory pair of the other tests, with its history source and its projection kept for the test. */
function memoryWithHistory() {
  const history = createMemorySessionHistorySource()
  let pair: Pair | null = null
  const factory: BackendFactory = {
    name: 'memory pair with history',
    open: accessCheck => {
      const initialization = createMemoryInitializationSource()
      pair = createMemorySessionTransactionPair<string>({ initialization, history, accessCheck })
      const { transactions, delegated } = pair
      return Promise.resolve({
        name: 'memory pair with history',
        transactions,
        delegated,
        initializationGuards: async command => {
          initialization.controls.register(command, fixtureInitializationGuard(command))
          return succeeded(await initialization.prepare(command), 'initialization source')
        },
        dispose: () => Promise.resolve(),
      })
    },
  }
  return {
    factory,
    history,
    pair: (): Pair => {
      if (pair === null) throw new Error('backend not opened')
      return pair
    },
  }
}

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

/** Records the original admission of every accepted hand-over, as the Agent journal would hold it. */
function admitHandOvers(h: Harness, history: MemorySessionHistorySource, pair: () => Pair) {
  h.view.onCommit(async (input, next) => {
    const command: SessionCommand = input.command
    if (
      command.kind !== 'receive' ||
      command.input.fact.kind !== 'input-handover' ||
      command.input.fact.result.kind !== 'accepted'
    )
      return next()
    const fact = command.input.fact
    const receipt = command.input.fact.result.receipt
    const snapshot = await read(h)
    const run = snapshot.run
    if (run.kind !== 'active' || run.advance === null) return next()
    const base = { tenant: snapshot.tenant, session: snapshot.session }
    const entries = () => pair().transactions.controls.entriesOf(base.tenant, base.session)
    const scope = { kind: 'selected' as const, inputs: [fact.input] }
    if (
      !history
        .read(snapshot, entries(), scope)
        .index.executions.some(item => item.execution === fact.execution)
    )
      history.observe({
        ...base,
        run: run.run,
        execution: fact.execution,
        sequence: null,
        revision: '1',
        source: receipt,
        executionEvidence: receipt,
        consequences: [],
      })
    const index = history.read(snapshot, entries(), scope).index
    const attempt = index.attempts.find(item => item.attempt === run.advance?.attempt)
    const execution = index.executions.find(item => item.execution === fact.execution)
    if (attempt === undefined || execution === undefined) throw new Error('no original SE13/SE15')
    history.admit(base, fact.input, {
      ordinal: index.inputs.find(item => item.input === fact.input)?.count ?? '0',
      run: run.run,
      execution: fact.execution,
      operation: command.input.operation,
      accepted: receipt,
      attempt: attempt.attempt,
      runStarted: execution.started,
      attemptStarted: attempt.started,
      attachment: 'fixture-original-attachment',
      grant: evidence('fixture-original-grant'),
    })
    return next()
  })
}

async function takeAndFail(h: Harness, pair: () => Pair, history: MemorySessionHistorySource) {
  await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['input-1']))
  const snapshot = await read(h)
  if (snapshot.run.kind !== 'active') throw new Error('no active Run')
  const run = snapshot.run
  const observation = {
    tenant: snapshot.tenant,
    session: snapshot.session,
    run: run.run,
    execution: run.execution.execution,
    sequence: '1',
    revision: '2',
    source: evidence('taken'),
    executionEvidence: evidence('taken-head'),
    consequences: [
      {
        kind: 'input-taken' as const,
        batch: {
          id: 'batch-1' as never,
          ordered: ['input-1' as InputId],
          watermark: evidence('watermark'),
        },
      },
    ],
  }
  history.observe(observation)
  succeeded(await pair().transactions.controls.project(observation, operationId('take')), 'take')
  const taken = await read(h)
  const finished = succeeded(
    await h.backend.transactions.commit({
      access: h.access(),
      command: {
        kind: 'finishRun',
        input: {
          ...h.access(),
          operation: operationId('finish'),
          run: run.run,
          expected: expectedRevision(taken, 'finishRun'),
          bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
        },
      },
      guards: [],
    }),
    'finishRun',
  )
  h.instance.committed({
    tenant: snapshot.tenant,
    session: h.access().session,
    revision: finished.revision,
    source: finished.source,
    kinds: ['run.terminal'],
  })
}

async function failedAfterTaking() {
  const backend = memoryWithHistory()
  const h = await harness({ backend: backend.factory, advance: true })
  open.push(h)
  await h.create()
  admitHandOvers(h, backend.history, backend.pair)
  const starts: string[] = []
  const handed: InputId[] = []
  const invoke = h.drive.invoke.bind(h.drive)
  const submit = h.drive.submit.bind(h.drive)
  h.drive.invoke = (async input => {
    starts.push(input.execution)
    handed.push(input.first)
    return invoke(input)
  }) satisfies AgentDrivePort['invoke']
  h.drive.submit = (async input => {
    handed.push(input.input)
    return submit(input)
  }) satisfies AgentDrivePort['submit']
  await h.accept('input-1')
  await takeAndFail(h, backend.pair, backend.history)
  return { h, starts, handed }
}

describe('S1 after a failed Run', () => {
  it('9. starts no new Run while the session waits for a person', async () => {
    const { h, starts } = await failedAfterTaking()
    for (let step = 0; step < 5; step++) await turn()
    const after = await read(h)
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(after.pending).toEqual(['input-1'])
    expect(after.awaitingPerson).toBe(true)
    expect(starts).toHaveLength(1)
  })

  it('10. a new input starts the next Run with the returned input first, then the new one', async () => {
    const { h, starts, handed } = await failedAfterTaking()
    for (let step = 0; step < 5; step++) await turn()
    handed.length = 0
    await h.accept('input-2')
    await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['input-1', 'input-2']))
    const after = await read(h)
    expect(after.run).toMatchObject({ kind: 'active', first: 'input-1' })
    expect(starts).toHaveLength(2)
    expect(handed).toEqual(['input-1', 'input-2'])
  })
})
