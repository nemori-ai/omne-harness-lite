// Taking an input leases it to the Run. The lease closes when a complete assistant message is
// written after the taking. A Run that fails returns the inputs whose lease is still open to the
// head of the pending inputs, and no new Run starts until a person sends an input.
import { describe, expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import {
  decide,
  expectedRevision,
  judgeRunStart,
  reduce,
  type HistoryEntry,
  type InputId,
  type SessionLogConsequence,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { open, scene } from './scene.ts'

type Scene = ReturnType<typeof scene>
const VISIBLE = { toHuman: true, toModel: true }
const id = (name: string) => name as InputId

const assistant = (name: string): Message =>
  ({
    id: `msg_assistant000000000000${name}`,
    role: 'assistant',
    blocks: [{ kind: 'text', id: `${name}/text`, visibility: VISIBLE, text: 'an answer' }],
  }) as unknown as Message

async function handIn(s: Scene, input: string) {
  const { run } = await s.active()
  succeeded(
    await s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId(`hand-${input}-${run.run}`),
        fact: {
          kind: 'input-handover',
          execution: run.execution.execution,
          input: id(input),
          result: { kind: 'accepted', receipt: evidence(`accepted/${input}/${run.run}`) },
        },
      },
    }),
    `hand over ${input}`,
  )
}

async function interpret(s: Scene, sequence: string, consequences: SessionLogConsequence[]) {
  const { run } = await s.active()
  succeeded(
    await s.project(
      {
        ...s.base,
        run: run.run,
        execution: run.execution.execution,
        sequence,
        revision: String(Number(sequence) + 1),
        source: evidence(`event/${run.run}/${sequence}`),
        consequences,
      },
      operationId(`interpret-${run.run}-${sequence}`),
    ),
    `interpret ${sequence}`,
  )
}

const take = (s: Scene, sequence: string, inputs: readonly string[]) =>
  interpret(s, sequence, [
    {
      kind: 'input-taken',
      batch: {
        id: `batch-${sequence}-${inputs.join('-')}` as never,
        ordered: inputs.map(id),
        watermark: evidence(`watermark/${sequence}`),
      },
    },
  ])

async function reply(s: Scene, name: string, written: string) {
  const { run } = await s.active()
  succeeded(
    await s.commit({
      kind: 'recordMessage',
      input: {
        ...s.base,
        operation: operationId(`message-${name}`),
        participation: {
          execution: run.execution.execution,
          operation: `agent-message-${name}`,
          joint: 'message',
          written,
          handover: evidence(`agent/message/${name}`),
        },
        value: {
          message: assistant(name),
          source: evidence(`agent/source/${name}`),
          admission: evidence(`agent/admission/${name}`),
          consumption: null,
        },
      },
    }),
    'assistant message',
  )
}

const finishCommand = (s: Scene, snapshot: WorkSnapshot) => {
  if (snapshot.run.kind !== 'active') throw new Error('no active Run')
  return {
    kind: 'finishRun' as const,
    input: {
      ...s.base,
      operation: operationId(`finish-${snapshot.run.run}`),
      run: snapshot.run.run,
      expected: expectedRevision(snapshot, 'finishRun'),
      bounded: { kind: 'uninterpretable' as const, evidence: evidence('agent/uninterpretable') },
    },
  }
}

async function fail(s: Scene) {
  succeeded(await s.commit(finishCommand(s, await s.read())), 'finishRun')
  return s.read()
}

/** The first Run took `first` and failed with no answer; `first` is pending again. */
async function failedWithFirstTaken() {
  const s = await open()
  await handIn(s, 'first')
  await take(s, '1', ['first'])
  return { s, failed: await fail(s) }
}

describe('a failed Run returns the inputs it took and did not answer', () => {
  it('1. the taken input is pending again and the session waits for a person', async () => {
    const { failed } = await failedWithFirstTaken()
    expect(failed.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(failed.pending).toEqual(['first'])
    expect(failed.unanswered).toBeUndefined()
    expect(failed.awaitingPerson).toBe(true)
    expect(judgeRunStart(failed, 'interactive')).toEqual({ kind: 'awaiting-person' })
  })

  it('2. a new ordinary input ends the wait and the returned input comes first', async () => {
    const { s } = await failedWithFirstTaken()
    await s.accept('second')
    const after = await s.read()
    expect(after.pending).toEqual(['first', 'second'])
    expect(after.awaitingPerson).toBeUndefined()
    expect(judgeRunStart(after, 'interactive')).toEqual({ kind: 'eligible', first: 'first' })
  })

  it('3. an answer closes the lease of the inputs taken before it; later ones return ahead of the pending', async () => {
    const s = await open()
    await s.accept('third')
    await s.accept('later')
    await handIn(s, 'first')
    await take(s, '1', ['first'])
    await reply(s, 'answer-first', '2')
    await handIn(s, 'third')
    await take(s, '2', ['third'])
    const failed = await fail(s)
    expect(failed.pending).toEqual(['third', 'later'])
    expect(failed.awaitingPerson).toBe(true)
  })

  it('4. a cancelled Run settles what it took: nothing returns and no one is awaited', async () => {
    const s = await open()
    await handIn(s, 'first')
    await take(s, '1', ['first'])
    const { run } = await s.active()
    succeeded(
      await s.commit({
        kind: 'cancelRun',
        input: { ...s.base, operation: operationId('cancel'), run: run.run, urgency: 'graceful' },
      }),
      'cancelRun',
    )
    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'cancelled' } })
    expect(after.pending).toEqual([])
    expect(after.unanswered).toBeUndefined()
    expect(after.awaitingPerson).toBeUndefined()
  })

  it('5. a completed Run leaves no open lease and the next Run may start', async () => {
    const s = await open()
    await s.accept('second')
    await handIn(s, 'first')
    await take(s, '1', ['first'])
    expect((await s.read()).unanswered).toEqual(['first'])
    await reply(s, 'answer', '2')
    await interpret(s, '2', [
      { kind: 'ended', outcome: 'completed', cause: null, disposition: evidence('complete') },
    ])
    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'completed' } })
    expect(after.unanswered ?? []).toEqual([])
    expect(after.awaitingPerson).toBeUndefined()
    expect(judgeRunStart(after, 'interactive')).toEqual({ kind: 'eligible', first: 'second' })
  })

  it('6. a failed Run that took nothing keeps the pending inputs and waits for a person', async () => {
    const s = await open()
    await s.accept('second')
    const failed = await fail(s)
    expect(failed.pending).toEqual(['first', 'second'])
    expect(failed.awaitingPerson).toBe(true)
  })

  it('7. a frozen session releases the returned inputs with the failed terminal', async () => {
    const s = await open()
    await s.accept('second')
    await handIn(s, 'first')
    await take(s, '1', ['first'])
    succeeded(
      await s.commit({
        kind: 'freeze',
        input: {
          ...s.base,
          operation: operationId('freeze'),
          verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
        },
      }),
      'freeze',
    )
    const snapshot = await s.read()
    expect(snapshot.pending).toEqual(['second'])
    const material = s.history.read(
      snapshot,
      s.port.controls.entriesOf(s.access.tenant, s.access.session),
      { kind: 'pending', inputs: snapshot.pending },
    )
    const decision = decide(snapshot, finishCommand(s, snapshot), [], null, {
      compaction: null,
      history: material.reads,
    })
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
    const batch = {
      revision,
      entries: decision.entries.map((entry, index): HistoryEntry => ({
        ...entry,
        revision,
        id: `leased-${revision}-${index}` as HistoryEntry['id'],
      })),
    }
    const release = batch.entries.find(entry => entry.kind === 'intake.released')
    if (release === undefined) throw new Error('missing intake.released')
    expect(decodeEntry(release)).toMatchObject({ ok: { inputs: ['first', 'second'] } })
    expect(reduce(snapshot, batch, material.reads)).toMatchObject({
      kind: 'reduced',
      snapshot: { pending: [], run: { terminal: { outcome: 'failed' } } },
    })
    const short = decide({ ...snapshot, unanswered: [] }, finishCommand(s, snapshot), [], null, {
      compaction: null,
      history: material.reads,
    })
    if (short.kind !== 'entries') throw new Error(JSON.stringify(short))
    const shortBatch = {
      revision,
      entries: short.entries.map((entry, index): HistoryEntry => ({
        ...entry,
        revision,
        id: `leased-short-${revision}-${index}` as HistoryEntry['id'],
      })),
    }
    expect(reduce(snapshot, shortBatch, material.reads)).toMatchObject({ kind: 'quarantined' })
  })

  it('archiving a session that waits for a person ends the wait with the pending inputs', async () => {
    const { s } = await failedWithFirstTaken()
    await s.control('archive')
    const after = await s.read()
    expect(after.pending).toEqual([])
    expect(after.awaitingPerson).toBeUndefined()
  })

  it('8. the next Run starts with the returned input and takes it again', async () => {
    const { s } = await failedWithFirstTaken()
    await s.accept('second')
    await s.start('start-2')
    const started = await s.active()
    expect(started.run.first).toBe('first')
    await handIn(s, 'first')
    await handIn(s, 'second')
    await take(s, '1', ['first', 'second'])
    const after = await s.read()
    expect(after.pending).toEqual([])
    expect(after.unanswered).toEqual(['first', 'second'])
  })
})
