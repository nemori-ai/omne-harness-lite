import { describe, expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import {
  expectedRevision,
  judgeRunStart,
  type InputId,
  type RunId,
  type SessionLogConsequence,
} from '@omne-harness/session-contract'
import { evidence, operationId, refused, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { open, scene } from './scene.ts'

type Scene = ReturnType<typeof scene>
const VISIBLE = { toHuman: true, toModel: true }
const id = (name: string) => name as InputId

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

async function reply(s: Scene, name: string) {
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
          written: '2',
          handover: evidence(`agent/message/${name}`),
        },
        value: {
          message: {
            id: `msg_assistant000000000000${name}`,
            role: 'assistant',
            blocks: [{ kind: 'text', id: `${name}/text`, visibility: VISIBLE, text: 'an answer' }],
          } as unknown as Message,
          source: evidence(`agent/source/${name}`),
          admission: evidence(`agent/admission/${name}`),
          consumption: null,
        },
      },
    }),
    'assistant message',
  )
}

async function fail(s: Scene): Promise<RunId> {
  const snapshot = await s.read()
  if (snapshot.run.kind !== 'active') throw new Error('no active Run')
  const run = snapshot.run.run
  succeeded(
    await s.commit({
      kind: 'finishRun',
      input: {
        ...s.base,
        operation: operationId(`finish-${run}`),
        run,
        expected: expectedRevision(snapshot, 'finishRun'),
        bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
      },
    }),
    'finishRun',
  )
  return run
}

const retry = (s: Scene, name: string, run: RunId | string) =>
  s.commit({
    kind: 'retryRun',
    input: { ...s.base, operation: operationId(name), run: run as RunId },
  })

const entryCount = (s: Scene) => s.port.controls.entriesOf(s.access.tenant, s.access.session).length

/** The first Run took `first` and failed with no answer: `first` is pending again, a person is awaited. */
async function failed() {
  const s = await open()
  await handIn(s, 'first')
  await take(s, '1', ['first'])
  const run = await fail(s)
  return { s, run }
}

async function refusedWithoutEntries(s: Scene, name: string, run: RunId | string) {
  const before = entryCount(s)
  const failure = refused(await retry(s, name, run), name)
  expect(entryCount(s)).toBe(before)
  return failure
}

describe('retryRun over the totalized table', () => {
  it('1. a run that is not a nonempty string is invalid and writes nothing', async () => {
    const { s } = await failed()
    expect(await refusedWithoutEntries(s, 'empty', '')).toMatchObject({
      kind: 'invalid',
      field: 'run',
    })
    expect(await refusedWithoutEntries(s, 'number', 7 as unknown as string)).toMatchObject({
      kind: 'invalid',
      field: 'run',
    })
  })

  it('2. the same operation again recalls the first answer and writes nothing', async () => {
    const { s, run } = await failed()
    const first = succeeded(await retry(s, 'retry', run), 'retry')
    const before = entryCount(s)
    const again = succeeded(await retry(s, 'retry', run), 'replay')
    expect(again).toEqual({ ...first, recovered: true })
    expect(entryCount(s)).toBe(before)
  })

  it('3. an archived session answers archived', async () => {
    const { s, run } = await failed()
    await s.control('archive')
    expect(await refusedWithoutEntries(s, 'retry', run)).toEqual({ kind: 'archived' })
  })

  it('4. a frozen session answers frozen', async () => {
    const { s, run } = await failed()
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
    expect(await refusedWithoutEntries(s, 'retry', run)).toMatchObject({ kind: 'frozen' })
  })

  it('5. not the Run that ended last answers not-found: an active Run, no Run, a later terminal', async () => {
    const active = await open()
    const { run } = await active.active()
    expect(await refusedWithoutEntries(active, 'retry', run.run)).toEqual({ kind: 'not-found' })
    const none = scene()
    await none.create()
    await none.accept('first')
    expect(await refusedWithoutEntries(none, 'retry', 'run-never')).toEqual({ kind: 'not-found' })
    const { s } = await failed()
    expect(await refusedWithoutEntries(s, 'retry', 'another-run')).toEqual({ kind: 'not-found' })
  })

  it('6. the Run that ended last but did not fail answers not-found', async () => {
    const s = await open()
    const { run } = await s.active()
    succeeded(
      await s.commit({
        kind: 'cancelRun',
        input: { ...s.base, operation: operationId('cancel'), run: run.run, urgency: 'graceful' },
      }),
      'cancelRun',
    )
    expect(await refusedWithoutEntries(s, 'retry', run.run)).toEqual({ kind: 'not-found' })
  })

  it('7. a failed Run whose wait a new input lifted answers not-found', async () => {
    const { s, run } = await failed()
    await s.accept('second')
    expect(await refusedWithoutEntries(s, 'retry', run)).toEqual({ kind: 'not-found' })
  })

  it('8. a wait with nothing pending answers nothing-pending', async () => {
    const s = await open()
    await handIn(s, 'first')
    await take(s, '1', ['first'])
    await reply(s, 'answer')
    const run = await fail(s)
    const waiting = await s.read()
    expect(waiting.awaitingPerson).toBe(true)
    expect(waiting.pending).toEqual([])
    expect(await refusedWithoutEntries(s, 'retry', run)).toEqual({ kind: 'nothing-pending' })
  })

  it('9. a wait with pending inputs is lifted by one control of two reconciled entries', async () => {
    const { s, run } = await failed()
    const before = entryCount(s)
    const receipt = succeeded(await retry(s, 'retry', run), 'retry')
    expect(receipt.recovered).toBe(false)
    const written = s.port.controls
      .entriesOf(s.access.tenant, s.access.session)
      .slice(before)
      .map(entry => decodeEntry(entry))
    const intent = { kind: 'control', value: { kind: 'retry-run', run } }
    const progress = {
      operation: operationId('retry'),
      target: { kind: 'run', run },
      intent,
      state: 'reconciled',
      pending: [],
      pendingUnassociatedWaiting: [],
    }
    expect(written).toEqual([
      { ok: { kind: 'control.requested', progress } },
      { ok: { kind: 'control.progress', progress, fact: null } },
    ])
    const after = await s.read()
    expect(after.awaitingPerson).toBeUndefined()
    expect(after.pending).toEqual(['first'])
  })
})

describe('after a retry', () => {
  it('the next Run may start and takes the pending head first', async () => {
    const { s, run } = await failed()
    succeeded(await retry(s, 'retry', run), 'retry')
    expect(judgeRunStart(await s.read(), 'interactive')).toEqual({
      kind: 'eligible',
      first: 'first',
    })
  })

  it('a second retry under another operation answers not-found and writes nothing', async () => {
    const { s, run } = await failed()
    succeeded(await retry(s, 'retry', run), 'retry')
    expect(await refusedWithoutEntries(s, 'retry-again', run)).toEqual({ kind: 'not-found' })
  })

  it('a Run after the retry that fails again: the old Run is not-found, the new one is retried', async () => {
    const { s, run } = await failed()
    succeeded(await retry(s, 'retry', run), 'retry')
    await s.start('start-2')
    await handIn(s, 'first')
    await take(s, '1', ['first'])
    const second = await fail(s)
    expect((await s.read()).awaitingPerson).toBe(true)
    expect(await refusedWithoutEntries(s, 'retry-old', run)).toEqual({ kind: 'not-found' })
    succeeded(await retry(s, 'retry-new', second), 'retry of the new failure')
    expect((await s.read()).awaitingPerson).toBeUndefined()
  })
})
