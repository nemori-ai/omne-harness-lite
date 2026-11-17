import { describe, expect, it } from 'vitest'
import { judgeRunStart, reduce } from '@omne-harness/session-contract'
import { judgeRetryRun } from '../src/judgments.ts'
import type {
  InputId,
  ProducerRef,
  StopInitiator,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  ordinaryInput,
  pendingReasonsOf,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { backgroundInputId } from '../src/background-outcome.ts'
import { encodeEntry, type SessionEntry } from '../src/entries.ts'
import {
  CALL,
  backgrounded,
  backgroundedOf,
  bindCall,
  bound,
  commitEntries,
  entryCount,
  execution,
  executionOf,
  newEntries,
  observation,
  outcome,
  outcomeOf,
  producer,
  type Scene,
} from './background-scene.ts'

const OTHER = { kind: 'tool', call: 'call-other' } as const

function stopOf(
  c: Scene,
  name: string,
  more: Readonly<{ initiator?: StopInitiator; reason?: string | null; of?: ProducerRef }> = {},
) {
  const { of = producer, ...rest } = more
  return c.s.commit({
    kind: 'stopCall',
    input: { ...c.s.base, operation: operationId(name), producer: of, ...rest },
  })
}

async function placed() {
  const c = await bound()
  succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
  return c
}

// The Run takes the first input, the call moves to the background, then the Run is cancelled:
// the call is in the background and no Run is there to take what it leaves.
async function idle(withOther = false) {
  const c = await bound()
  if (withOther) await bindCall(c.s, OTHER)
  succeeded(
    await c.s.commit({
      kind: 'receive',
      input: {
        ...c.s.base,
        operation: operationId('hand-first'),
        fact: {
          kind: 'input-handover',
          execution: c.execution,
          input: 'first' as InputId,
          result: { kind: 'accepted', receipt: evidence('accepted/first') },
        },
      },
    }),
    'hand over',
  )
  succeeded(
    await c.s.project(
      {
        ...c.s.base,
        run: c.run,
        execution: c.execution,
        sequence: '1',
        revision: '2',
        source: evidence('event/1'),
        consequences: [
          {
            kind: 'input-taken',
            batch: {
              id: 'batch-first' as never,
              ordered: ['first' as InputId],
              watermark: evidence('watermark/1'),
            },
          },
        ],
      },
      operationId('take-first'),
    ),
    'take',
  )
  const parts = withOther ? [[backgrounded], [backgroundedOf(OTHER)]] : [[backgrounded]]
  succeeded(await commitEntries(c, observation(c, 'p', 0, parts)), 'placeholder')
  succeeded(
    await c.s.commit({
      kind: 'cancelRun',
      input: { ...c.s.base, operation: operationId('cancel'), run: c.run, urgency: 'graceful' },
    }),
    'cancel',
  )
  return { c, after: parts.length }
}

const routed = (entries: readonly SessionEntry[]) =>
  entries.filter(entry => entry.kind === 'intake.routed')
const reminders = (entries: readonly SessionEntry[]) =>
  entries.filter(entry => entry.kind === 'message.system_reminder')
const textOf = (entry: SessionEntry | undefined): string =>
  entry !== undefined && 'message' in entry
    ? entry.message.blocks.map((block: { text?: string }) => block.text ?? '').join(' ')
    : ''

describe('a stop of a call in the background (C19)', () => {
  it("records a person's stop with its reason and accepts one stop reminder in the same commit (AtMostOneStopReminder)", async () => {
    const c = await placed()
    const before = entryCount(c)
    const first = succeeded(await stopOf(c, 'stop', { reason: 'too slow' }), 'stop')
    const added = await newEntries(c, before)
    expect(added.map(entry => entry.kind)).toEqual([
      'control.requested',
      'control.progress',
      'message.system_reminder',
      'intake.routed',
    ])
    expect(textOf(reminders(added)[0])).toContain('b1')
    expect(textOf(reminders(added)[0])).toContain('too slow')
    expect(routed(added)[0]).toMatchObject({ destination: 'current-run', run: c.run })
    expect(routed(added)[0]).not.toHaveProperty('wakes')
    const snapshot = await c.s.read()
    expect(snapshot.backgroundCalls?.[0]?.stop).toEqual({
      initiator: 'user',
      reason: 'too slow',
      operation: operationId('stop'),
    })
    const again = succeeded(await stopOf(c, 'stop-again', { reason: 'still slow' }), 'again')
    expect(again.answer).toMatchObject({
      kind: 'requested',
      progress: { operation: operationId('stop') },
    })
    expect(first.answer.kind).toBe('requested')
    expect(entryCount(c)).toBe(before + added.length)
  })

  it("an agent's or the system's stop accepts no reminder (AgentStopSilent)", async () => {
    for (const initiator of ['agent', 'system'] as const) {
      const c = await placed()
      const before = entryCount(c)
      succeeded(await stopOf(c, 'stop', { initiator }), 'stop')
      const added = await newEntries(c, before)
      expect(reminders(added)).toEqual([])
      expect(routed(added)).toEqual([])
      expect((await c.s.read()).backgroundCalls?.[0]?.stop).toMatchObject({ initiator })
    }
  })

  it('a stop of a call in the foreground accepts no reminder', async () => {
    const c = await bound()
    const before = entryCount(c)
    succeeded(await stopOf(c, 'stop'), 'stop')
    expect(reminders(await newEntries(c, before))).toEqual([])
  })

  it('a stop after the archive is refused (NoReminderAfterArchive)', async () => {
    const c = await placed()
    await c.s.control('archive')
    const before = entryCount(c)
    const refused = await stopOf(c, 'stop')
    expect(refused).toMatchObject({ failure: { kind: 'invalid' } })
    expect(entryCount(c)).toBe(before)
  })

  it('a reason is text of at most 500 characters', async () => {
    const c = await placed()
    expect(await stopOf(c, 'empty', { reason: ' ' })).toMatchObject({
      failure: { kind: 'invalid', field: 'reason' },
    })
    expect(await stopOf(c, 'long', { reason: 'x'.repeat(501) })).toMatchObject({
      failure: { kind: 'invalid', field: 'reason' },
    })
    succeeded(await stopOf(c, 'fine', { reason: 'x'.repeat(500) }), 'five hundred')
  })

  it('with no Run the stop reminder is quiet: it cannot start a Run (NoPassiveStart)', async () => {
    const { c } = await idle()
    const before = entryCount(c)
    succeeded(await stopOf(c, 'stop'), 'stop')
    const [entry] = routed(await newEntries(c, before))
    expect(entry).toMatchObject({ destination: 'next-run', run: null, wakes: false })
    const snapshot = await c.s.read()
    expect(snapshot.quietInputs).toEqual([entry && 'input' in entry ? entry.input : null])
    expect(judgeRunStart(snapshot, 'interactive')).toEqual({ kind: 'no-input' })
    expect(pendingReasonsOf(snapshot)).not.toContain('inputs')
  })
})

describe('the outcome of a stopped call (C20)', () => {
  it('becomes a quiet input that names who stopped it (SettledHasDestination, NoPassiveStart)', async () => {
    const { c, after } = await idle()
    succeeded(await stopOf(c, 'stop', { reason: 'not needed' }), 'stop')
    const before = entryCount(c)
    succeeded(
      await commitEntries(c, observation(c, 'r', after, [[execution, outcome()]])),
      'outcome',
    )
    const added = await newEntries(c, before)
    expect(added.find(entry => entry.kind === 'call.background-settled')).toMatchObject({
      disposition: { kind: 'input', input: backgroundInputId(producer, 'rv-1') },
    })
    expect(textOf(reminders(added)[0])).toContain('stopped by the user. Reason: not needed')
    expect(routed(added)[0]).toMatchObject({ destination: 'next-run', wakes: false })
    expect(judgeRunStart(await c.s.read(), 'interactive')).toEqual({ kind: 'no-input' })
  })

  it('goes to the Run that is there', async () => {
    const c = await placed()
    succeeded(await stopOf(c, 'stop', { initiator: 'agent' }), 'stop')
    const before = entryCount(c)
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const added = await newEntries(c, before)
    expect(textOf(reminders(added)[0])).toContain('stopped by you')
    expect(routed(added)[0]).toMatchObject({ destination: 'current-run', run: c.run })
    expect(routed(added)[0]).not.toHaveProperty('wakes')
  })

  it('a stop of one call leaves the outcome of another waking (UnstoppedOutcomeWakes)', async () => {
    const { c, after } = await idle(true)
    succeeded(await stopOf(c, 'stop-other', { of: OTHER }), 'stop other')
    const records = (await c.s.read()).backgroundCalls ?? []
    expect(records.find(item => item.producer.call === CALL)).not.toHaveProperty('stop')
    expect(records.find(item => item.producer.call === OTHER.call)).toHaveProperty('stop')
    succeeded(
      await commitEntries(c, observation(c, 'r', after, [[execution, outcome()]])),
      'outcome',
    )
    const snapshot = await c.s.read()
    expect(judgeRunStart(snapshot, 'interactive')).toMatchObject({
      kind: 'eligible',
      first: backgroundInputId(producer, 'rv-1'),
    })
  })

  it('a second delivery of the same result leaves no second reminder (AtMostOneOutcomeReminder)', async () => {
    const c = await placed()
    const before = entryCount(c)
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const again = await commitEntries(c, observation(c, 's', 2, [[execution, outcome()]]))
    expect('failure' in again).toBe(true)
    expect(reminders(await newEntries(c, before))).toHaveLength(1)
  })

  it('is kept after the archive and leaves nothing pending (NoReminderAfterArchive, ArchivedHasNoPending)', async () => {
    const { c, after } = await idle()
    succeeded(await stopOf(c, 'stop'), 'stop')
    expect((await c.s.read()).quietInputs).toHaveLength(1)
    await c.s.control('archive')
    const archived = await c.s.read()
    expect(archived.pending).toEqual([])
    expect(archived.quietInputs).toEqual([])
    const before = entryCount(c)
    succeeded(
      await commitEntries(c, observation(c, 'r', after, [[execution, outcome()]])),
      'outcome',
    )
    const added = await newEntries(c, before)
    expect(added.find(entry => entry.kind === 'call.background-settled')).toMatchObject({
      disposition: { kind: 'kept', reason: 'archived' },
    })
    expect(reminders(added)).toEqual([])
  })
})

describe('only a waking input opens a Run (C20)', () => {
  it('a person input opens the Run and the quiet reminder stays pending for it (NoLostReminder)', async () => {
    const { c } = await idle()
    succeeded(await stopOf(c, 'stop'), 'stop')
    const quiet = (await c.s.read()).quietInputs![0]!
    succeeded(
      await c.s.commit({
        kind: 'accept',
        input: { ...c.s.base, operation: operationId('accept-next'), value: ordinaryInput('next') },
      }),
      'accept',
    )
    expect(judgeRunStart(await c.s.read(), 'interactive')).toMatchObject({
      kind: 'eligible',
      first: ordinaryInput('next').input,
    })
    expect(pendingReasonsOf(await c.s.read())).toContain('inputs')
    await c.s.start('start-next')
    const started = await c.s.read()
    expect(started.run.kind).toBe('active')
    expect(started.pending).toContain(quiet)
  })

  it('a quiet input leaves the wait for a person, and a retry finds nothing to retry', async () => {
    const { c } = await idle()
    const waiting = { ...(await c.s.read()), awaitingPerson: true } as WorkSnapshot
    const run = waiting.run.kind === 'terminal' ? waiting.run.terminal.run : c.run
    const input = 'bs_quiet' as InputId
    const entry = {
      ...encodeEntry(
        {
          kind: 'intake.routed',
          input,
          destination: 'next-run',
          run: null,
          origin: evidence('stop'),
          wakes: false,
        },
        { owner: 'session', via: 'direct', source: evidence('stop') },
      ),
      id: 'e-quiet',
      revision: String(BigInt(waiting.revision) + 1n),
    }
    const reduced = reduce(waiting, {
      revision: entry.revision,
      entries: [entry],
    } as never)
    if (reduced.kind !== 'reduced') throw new Error(JSON.stringify(reduced))
    expect(reduced.snapshot.awaitingPerson).toBe(true)
    expect(reduced.snapshot.pending).toContain(input)
    expect(judgeRetryRun(reduced.snapshot, run)).toBe('nothing-pending')
  })

  it('a placeholder and an outcome of a second call in one batch still count apart', async () => {
    const c = await bound()
    await bindCall(c.s, OTHER)
    succeeded(
      await commitEntries(
        c,
        observation(c, 'p', 0, [
          [backgrounded],
          [backgroundedOf(OTHER)],
          [executionOf(OTHER), outcomeOf(OTHER, 'rv-9')],
        ]),
      ),
      'batch',
    )
    const snapshot = await c.s.read()
    expect(snapshot.backgroundCalls?.map(item => [item.ordinal, item.settled ?? null])).toEqual([
      [1, null],
      [2, 'input'],
    ])
    expect(snapshot.backgroundOrdinal).toBe(2)
  })
})
