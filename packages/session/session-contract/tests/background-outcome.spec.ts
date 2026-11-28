import { describe, expect, it } from 'vitest'
import {
  backgroundCalls,
  controlRoutes,
  openWork,
  pendingIntakeCount,
} from '@omne-harness/session-contract'
import type {
  ConsumptionId,
  ControlProgress,
  EntryId,
  InputId,
  ProducerRef,
  SessionRevision,
  SessionEntriesInterpretation,
  SessionEntriesStart,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  succeeded,
  userMessage,
  TESTING_SOURCES,
} from '@omne-harness/session-contract/testing'
import {
  BACKGROUND_OUTCOME_EVIDENCE_OWNER,
  backgroundInputId,
  judgeBackgroundOutcome,
} from '../src/background-outcome.ts'
import { decodeEntry, encodeEntry, type SessionEntry } from '../src/entries.ts'
import { settledControls } from '../src/call-control.ts'
import { projectSessionEntries } from '../src/entries-interpretation.ts'
import { reduce } from '../src/reduce.ts'
import {
  CALL,
  CALL_FIELDS,
  backgrounded,
  bound,
  commitEntries,
  entryCount,
  execution,
  newEntries,
  observation,
  outcome,
  producer,
  acceptedReminder,
  reminder,
  type Scene,
} from './background-scene.ts'

describe('a backgrounded call: the placeholder', () => {
  it('records call.backgrounded and lists the consumption among the placeholders', async () => {
    const c = await bound()
    const before = entryCount(c)
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    expect((await newEntries(c, before)).map(entry => entry.kind)).toEqual([
      'call.backgrounded',
      'entries.interpreted',
    ])
    expect((await c.s.read()).backgroundPlaceholders).toEqual([c.consumption])
  })

  it('counts as open work until the outcome settles it (holds off auto-archive)', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    expect(openWork(await c.s.read()).backgroundPlaceholders).toEqual([c.consumption])
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    expect(openWork(await c.s.read()).backgroundPlaceholders).toEqual([])
  })

  it('refuses a second placeholder of the same call (at most once)', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    const again = await commitEntries(c, observation(c, 'q', 1, [[backgrounded]]))
    expect(again).toMatchObject({ failure: { kind: 'invalid' } })
  })

  it('refuses a placeholder of a producer the session never bound', async () => {
    const c = await bound()
    const stray: SessionEntriesInterpretation = {
      ...backgrounded,
      producer: { kind: 'tool', call: 'call-unbound' },
    } as SessionEntriesInterpretation
    expect(await commitEntries(c, observation(c, 'p', 0, [[stray]]))).toMatchObject({
      failure: { kind: 'invalid' },
    })
  })
})

describe('the short number of a backgrounded call (I-12, C17)', () => {
  const OTHER = 'call-bg-second'
  const other = { kind: 'tool', call: OTHER } as const
  async function bindOther(c: Scene) {
    succeeded(
      await c.s.commit({
        kind: 'bindExternalCall',
        input: {
          ...c.s.base,
          operation: operationId('bind-second'),
          expected: (await c.s.read()).revision,
          qualification: evidence('qualified'),
          binding: {
            producer: other,
            action: 'action-2',
            consumer: { owner: 'session', work: 'work', position: 'at-second', purpose: 'action' },
            request: evidence('request-second'),
            initiatingAttempt: null,
          },
        },
      }),
      'bind other',
    )
  }

  it('records the short number, the label and the source with the call, in the order calls moved', async () => {
    const c = await bound()
    await bindOther(c)
    const second = {
      ...backgrounded,
      producer: other,
      label: { intent: null, tool: 'Shell', command: 'execute', preview: 'sleep 9' },
      how: 'threshold',
    } as SessionEntriesInterpretation
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded], [second]])), 'moved')
    const snapshot = await c.s.read()
    expect(snapshot.backgroundCalls).toEqual([
      expect.objectContaining({
        ordinal: 1,
        producer,
        label: CALL_FIELDS.label,
        source: 'launched',
      }),
      expect.objectContaining({ ordinal: 2, producer: other, source: 'threshold' }),
    ])
    expect(snapshot.backgroundOrdinal).toBe(2)
  })

  it('never gives a short number again after its call settles', async () => {
    const c = await bound()
    await bindOther(c)
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'first moved')
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'settled')
    expect((await c.s.read()).backgroundCalls).toEqual([
      expect.objectContaining({ ordinal: 1, producer, settled: 'input' }),
    ])
    const second = { ...backgrounded, producer: other } as SessionEntriesInterpretation
    succeeded(await commitEntries(c, observation(c, 's', 2, [[second]])), 'second moved')
    expect((await c.s.read()).backgroundCalls).toEqual([
      expect.objectContaining({ ordinal: 1, producer, settled: 'input' }),
      expect.objectContaining({ ordinal: 2, producer: other }),
    ])
    expect((await c.s.read()).backgroundCalls?.[1]).not.toHaveProperty('settled')
  })

  it('keeps the same short numbers when the entries are replayed', async () => {
    const c = await bound()
    const before = await c.s.read()
    const stored = entryCount(c)
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'moved')
    const after = await c.s.read()
    const entries = c.s.port.controls.entriesOf(c.s.base.tenant, c.s.base.session).slice(stored)
    const replayed = reduce(before, { revision: after.revision, entries })
    if (replayed.kind !== 'reduced') throw new Error(replayed.kind)
    expect(replayed.snapshot.backgroundCalls).toEqual(after.backgroundCalls)
  })
})

describe('a backgrounded call: the outcome becomes one input', () => {
  it('refuses an outcome of a call that was not backgrounded', async () => {
    const c = await bound()
    expect(await commitEntries(c, observation(c, 'r', 0, [[execution, outcome()]]))).toMatchObject({
      failure: { kind: 'invalid' },
    })
  })

  it('settles and accepts a system reminder in the same commit, routed to the active Run', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    const before = entryCount(c)
    const revision = (await c.s.read()).revision
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const added = await newEntries(c, before)
    expect(added.map(entry => entry.kind)).toEqual([
      'call.execution-fact',
      'call.background-settled',
      'message.system_reminder',
      'intake.routed',
      'entries.interpreted',
    ])
    const rows = c.s.port.controls.entriesOf(c.s.base.tenant, c.s.base.session).slice(before)
    expect(new Set(rows.map(row => row.revision))).toEqual(new Set([String(BigInt(revision) + 1n)]))
    const input = backgroundInputId(producer, 'rv-1')
    expect(added[1]).toEqual({
      kind: 'call.background-settled',
      consumption: c.consumption,
      result: 'rv-1',
      disposition: { kind: 'input', input },
    })
    expect(added[3]).toMatchObject({
      kind: 'intake.routed',
      input,
      destination: 'current-run',
      run: c.run,
      origin: { owner: BACKGROUND_OUTCOME_EVIDENCE_OWNER },
    })
    const after = await c.s.read()
    expect(after.backgroundPlaceholders).toEqual([])
    expect(after.pending).toContain(input)
    expect(after.uncountedInputs).toEqual([input])
    const stored = succeeded(await c.s.port.readInput({ ...c.s.access, input }), 'readInput')
    expect(stored.message).toEqual(acceptedReminder())
  })

  it('takes the placeholder and the outcome from one batch', async () => {
    const c = await bound()
    succeeded(
      await commitEntries(c, observation(c, 'pr', 0, [[backgrounded], [execution, outcome()]])),
      'batch',
    )
    const after = await c.s.read()
    expect(after.backgroundPlaceholders).toEqual([])
    expect(after.pending).toContain(backgroundInputId(producer, 'rv-1'))
  })

  it('recalls a replay of the same observation without a second input', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    const value = observation(c, 'r', 1, [[execution, outcome()]])
    const snapshot = await c.s.read()
    const start: SessionEntriesStart = {
      kind: 'saved',
      progress: snapshot.entriesProgress!.find(item => item.execution === c.execution)!,
    }
    const first = succeeded(await c.s.port.commitEntries({ observation: value, start }), 'first')
    const count = entryCount(c)
    const again = succeeded(await c.s.port.commitEntries({ observation: value, start }), 'again')
    expect(again).toEqual(first)
    expect(entryCount(c)).toBe(count)
    const input = backgroundInputId(producer, 'rv-1')
    expect((await c.s.read()).pending.filter(item => item === input)).toHaveLength(1)
  })

  it('derives the input identity from the call and the result version only', () => {
    expect(backgroundInputId(producer, 'rv-1')).toBe(backgroundInputId(producer, 'rv-1'))
    expect(backgroundInputId(producer, 'rv-1')).not.toBe(backgroundInputId(producer, 'rv-2'))
    expect(backgroundInputId(producer, 'rv-1')).not.toBe(
      backgroundInputId({ kind: 'tool', call: 'call-other' }, 'rv-1'),
    )
    expect(backgroundInputId(producer, 'rv-1')).toMatch(/^[\x21-\x7e]{1,256}$/u)
  })
})

describe('a backgrounded call: the outcome with no Run', () => {
  // The Run takes the user's input and is cancelled, so nothing is pending when the outcome
  // arrives; cancelling the Run does not revoke the eligibility.
  async function cancelled() {
    const c = await bound()
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
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    succeeded(
      await c.s.commit({
        kind: 'cancelRun',
        input: { ...c.s.base, operation: operationId('cancel'), run: c.run, urgency: 'graceful' },
      }),
      'cancel',
    )
    expect((await c.s.read()).pending).toEqual([])
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    return c
  }

  it('the call is no longer open work once its outcome came, though the Agent never processed the placeholder', async () => {
    const c = await cancelled()
    const snapshot = await c.s.read()
    expect(snapshot.run.kind).toBe('terminal')
    expect(snapshot.consumptions.map(item => item.id)).not.toContain(c.consumption)
    expect((snapshot.callRegistrations ?? []).map(item => item.consumption)).not.toContain(
      c.consumption,
    )
  })

  it('routes the reminder to the next Run', async () => {
    const c = await cancelled()
    const snapshot = await c.s.read()
    expect(snapshot.run.kind).toBe('terminal')
    expect(snapshot.pending).toEqual([backgroundInputId(producer, 'rv-1')])
    const row = c.s.port.controls
      .entriesOf(c.s.base.tenant, c.s.base.session)
      .filter(entry => entry.kind === 'intake.routed')
      .at(-1)!
    expect(decodeEntry(row)).toMatchObject({ ok: { destination: 'next-run', run: null } })
  })

  it('starts the next Run from the reminder without a login', async () => {
    const c = await cancelled()
    const before = entryCount(c)
    const started = await c.s.port.commit({
      access: c.s.access,
      command: {
        kind: 'startRun',
        input: {
          ...c.s.base,
          operation: operationId('start-bg'),
          entry: 'interactive',
          candidate: (await c.s.read()).definition.adopted,
          instance: { owner: 'agent', id: 'start-bg' },
        },
      },
      guards: [],
    })
    succeeded(started, 'start from reminder')
    const run = (await newEntries(c, before)).find(entry => entry.kind === 'run.started')
    expect(run).toMatchObject({ initial: [backgroundInputId(producer, 'rv-1')] })
  })
})

describe('the background outcome totalization', () => {
  async function placed() {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    return { c, snapshot: await c.s.read() }
  }

  it('an outcome of a consumption that is not a placeholder is refused', async () => {
    const c = await bound()
    expect(judgeBackgroundOutcome(await c.s.read(), c.consumption)).toEqual({
      kind: 'refused',
    })
  })

  it('an archived session keeps the result and accepts no input', async () => {
    const { c, snapshot } = await placed()
    expect(judgeBackgroundOutcome({ ...snapshot, lifecycle: 'archived' }, c.consumption)).toEqual({
      kind: 'kept',
      reason: 'archived',
    })
  })

  it('a stopped call still becomes an input, carrying its stop; a stop of another call does not', async () => {
    const { c, snapshot } = await placed()
    const stop = { initiator: 'user', reason: 'too slow', operation: operationId('stop') } as const
    const stopped = {
      ...snapshot,
      backgroundCalls: snapshot.backgroundCalls!.map(item => ({ ...item, stop })),
    }
    expect(judgeBackgroundOutcome(stopped, c.consumption)).toEqual({
      kind: 'input',
      destination: 'current-run',
      stop,
    })
    expect(judgeBackgroundOutcome({ ...stopped, run: { kind: 'none' } }, c.consumption)).toEqual({
      kind: 'input',
      destination: 'next-run',
      stop,
    })
    const control: WorkSnapshot['controls'][number] = {
      operation: operationId('stop-other'),
      target: { kind: 'producer', producer: { kind: 'tool', call: 'call-other' } },
      intent: {
        kind: 'control',
        value: { kind: 'stop-call', producer: { kind: 'tool', call: 'call-other' } },
      },
      state: 'propagating',
      pending: [],
    }
    expect(judgeBackgroundOutcome({ ...snapshot, controls: [control] }, c.consumption)).toEqual({
      kind: 'input',
      destination: 'current-run',
      stop: null,
    })
  })

  it('a frozen session with no Run keeps the result; with an active Run the input goes to it', async () => {
    const { c, snapshot } = await placed()
    const frozen = { ...snapshot, frozen: evidence('frozen') } as unknown as WorkSnapshot
    expect(judgeBackgroundOutcome(frozen, c.consumption)).toEqual({
      kind: 'input',
      destination: 'current-run',
      stop: null,
    })
    const idle = { ...frozen, run: { kind: 'none' } } as WorkSnapshot
    expect(judgeBackgroundOutcome(idle, c.consumption)).toEqual({
      kind: 'kept',
      reason: 'frozen',
    })
  })

  it('cancelling the Run does not revoke the eligibility', async () => {
    const { c, snapshot } = await placed()
    const cancelled = {
      ...snapshot,
      run: { kind: 'none' },
      controls: [
        {
          operation: operationId('cancel'),
          target: { kind: 'run', run: c.run },
          intent: { kind: 'control', value: { kind: 'cancel-run', run: c.run, urgency: 'force' } },
          state: 'reconciled',
          pending: [],
        },
      ],
    } as WorkSnapshot
    expect(judgeBackgroundOutcome(cancelled, c.consumption)).toEqual({
      kind: 'input',
      destination: 'next-run',
      stop: null,
    })
  })
})

describe('system inputs and the pending budget', () => {
  it('a background input does not count against the pending inputs', () => {
    const user = 'in-user' as InputId
    const system = 'in-system' as InputId
    expect(
      pendingIntakeCount({ pending: [user, system], handed: [], uncountedInputs: [system] }),
    ).toBe(1)
    expect(pendingIntakeCount({ pending: [user, system], handed: [] })).toBe(2)
  })

  it('a user input is accepted while a background input fills the only pending slot', async () => {
    const c = await bound({ intakeLimits: { maxPendingInputs: 2, maxInputBytes: 1048576 } })
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const snapshot = await c.s.read()
    expect(pendingIntakeCount(snapshot)).toBe(1)
    expect(pendingIntakeCount({ ...snapshot, uncountedInputs: [] })).toBe(2)
    await c.s.accept('after-reminder')
  })
})

describe('a control of a backgrounded call goes to Tool, and its outcome reconciles it', () => {
  async function placed() {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    return c
  }
  const stopOf = (c: Scene, name: string, call = CALL) =>
    c.s.commit({
      kind: 'stopCall',
      input: { ...c.s.base, operation: operationId(name), producer: { kind: 'tool', call } },
    })
  const lastControl = async (c: Scene) => (await c.s.read()).controls.at(-1)!

  it('a stop of a foreground call keeps its route through Agent', async () => {
    const c = await bound()
    succeeded(await stopOf(c, 'stop'), 'stop')
    expect(controlRoutes(await c.s.read(), await lastControl(c))).toEqual({
      agent: true,
      direct: [],
    })
  })

  it('a stop of a backgrounded call goes to Tool alone; its outcome comes back and reconciles the stop', async () => {
    const c = await placed()
    succeeded(await stopOf(c, 'stop'), 'stop')
    expect(controlRoutes(await c.s.read(), await lastControl(c))).toEqual({
      agent: false,
      direct: [{ producer, intent: 'stop' }],
    })
    const before = entryCount(c)
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const added = await newEntries(c, before)
    expect(added.find(entry => entry.kind === 'call.background-settled')).toMatchObject({
      disposition: { kind: 'input', input: backgroundInputId(producer, 'rv-1') },
    })
    expect(added.some(entry => entry.kind === 'message.system_reminder')).toBe(true)
    const after = await c.s.read()
    expect(after.controls.at(-1)).toMatchObject({ state: 'reconciled', pending: [] })
    expect(controlRoutes(after, after.controls.at(-1)!)).toEqual({ agent: false, direct: [] })
  })

  it('an archive withdraws only the backgrounded calls its pending names', async () => {
    const c = await placed()
    succeeded(
      await c.s.commit({
        kind: 'control',
        input: { ...c.s.base, operation: operationId('archive'), intent: { kind: 'archive' } },
      }),
      'archive',
    )
    const archive = await lastControl(c)
    expect(controlRoutes(await c.s.read(), { ...archive, pending: [] })).toEqual({
      agent: true,
      direct: [],
    })
  })

  it('an archive withdraws the backgrounded call by its reference and keeps the Agent route', async () => {
    const c = await placed()
    succeeded(
      await c.s.commit({
        kind: 'control',
        input: { ...c.s.base, operation: operationId('archive'), intent: { kind: 'archive' } },
      }),
      'archive',
    )
    const archive = await lastControl(c)
    expect(controlRoutes(await c.s.read(), archive)).toEqual({
      agent: true,
      direct: [{ producer, intent: 'withdraw' }],
    })
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const after = await c.s.read()
    const settled = after.controls.find(control => control.operation === archive.operation)!
    expect(settled.pending).not.toContainEqual(producer)
    expect(settled.state).toBe(archive.state)
    expect(controlRoutes(after, settled).direct).toEqual([])
  })
})

describe('the background interpretations: what a refusal names', () => {
  it('names the refused interpretation and its field', async () => {
    const c = await bound()
    const at = (index: number, field: string) => ({
      failure: { kind: 'invalid', field: `items[0].interpretation[${index}].${field}` },
    })
    expect(await commitEntries(c, observation(c, 'r', 0, [[execution, outcome()]]))).toMatchObject(
      at(1, 'producer'),
    )
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    expect(await commitEntries(c, observation(c, 'q', 1, [[backgrounded]]))).toMatchObject(
      at(0, 'producer'),
    )
    const refusedOutcome = (name: string, part: Partial<SessionEntriesInterpretation>) =>
      commitEntries(c, observation(c, name, 1, [[execution, { ...outcome(), ...part } as never]]))
    expect(await refusedOutcome('e', { result: '' })).toMatchObject(at(1, 'result'))
    expect(
      await refusedOutcome('u', { reminder: userMessage('x', 'msg_bguser00000000000000000') }),
    ).toMatchObject(at(1, 'reminder'))
    expect(
      await refusedOutcome('b', { reminder: { ...reminder(), blocks: [] } as never }),
    ).toMatchObject(at(1, 'reminder'))
  })

  it('accepts an account beside the execution and refuses an unknown kind beside a known one', async () => {
    const c = await bound()
    const account: SessionEntriesInterpretation = {
      kind: 'account',
      producer,
      source: evidence('tool/result/rv-1'),
    }
    const before = entryCount(c)
    succeeded(await commitEntries(c, observation(c, 'a', 0, [[execution, account]])), 'account')
    expect((await newEntries(c, before)).map(entry => entry.kind)).toContain('account.linked')
    const unknown = {
      kind: 'unknown-kind',
      producer,
      source: evidence('tool/unknown'),
    } as unknown as SessionEntriesInterpretation
    expect(await commitEntries(c, observation(c, 'x', 1, [[execution, unknown]]))).toMatchObject({
      failure: { kind: 'invalid', field: 'items[0].interpretation' },
    })
  })
})

describe('the background outcome: what the accepted input is and what a kept outcome leaves', () => {
  async function placed() {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    return c
  }

  it('the accepted input is an ordinary input whose origin names the call and the result version', async () => {
    const c = await placed()
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const input = backgroundInputId(producer, 'rv-1')
    expect(succeeded(await c.s.port.readInput({ ...c.s.access, input }), 'readInput')).toEqual({
      kind: 'ordinary',
      input,
      message: acceptedReminder(),
      source: TESTING_SOURCES.outcome,
      origin: {
        owner: 'background-tool-execution',
        record: CALL,
        revision: 'rv-1',
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    })
  })

  it('a kept outcome admits no input', async () => {
    const c = await placed()
    succeeded(
      await c.s.commit({
        kind: 'control',
        input: { ...c.s.base, operation: operationId('archive'), intent: { kind: 'archive' } },
      }),
      'archive',
    )
    const snapshot = await c.s.read()
    const decision = projectSessionEntries(snapshot, {
      observation: observation(c, 'r', 1, [[execution, outcome()]]),
      start: { kind: 'saved', progress: snapshot.entriesProgress![0]! },
      saved: snapshot.entriesProgress ?? [],
      record: null,
    })
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    expect(decision.admitted).toBeUndefined()
    expect(decision.entries.map(entry => entry.kind)).not.toContain('intake.routed')
  })

  it('controls other than a stop of this call leave the outcome waking', async () => {
    const c = await placed()
    const snapshot = await c.s.read()
    const control = (operation: string, intent: unknown): WorkSnapshot['controls'][number] =>
      ({
        operation: operationId(operation),
        target: { kind: 'run', run: c.run },
        intent,
        state: 'propagating',
        pending: [producer],
      }) as WorkSnapshot['controls'][number]
    const controls = [
      control('interrupt', {
        kind: 'interrupt',
        run: c.run,
        urgent: { kind: 'ordinary', input: 'urgent', message: reminder(), origin: evidence('u') },
        decision: evidence('d'),
      }),
      control('background', { kind: 'control', value: { kind: 'background-tool', producer } }),
    ]
    expect(judgeBackgroundOutcome({ ...snapshot, controls }, c.consumption)).toEqual({
      kind: 'input',
      destination: 'current-run',
      stop: null,
    })
  })
})

describe('two backgrounded calls under an archive', () => {
  const OTHER = 'call-bg2'
  const other = { kind: 'tool', call: OTHER } as const
  const backgroundedOther = { ...backgrounded, producer: other } as SessionEntriesInterpretation
  const executionOther = { ...execution, producer: other } as SessionEntriesInterpretation
  const outcomeOther: SessionEntriesInterpretation = {
    ...outcome('rv-2'),
    producer: other,
  } as SessionEntriesInterpretation

  async function archivedTwo() {
    const c = await bound()
    succeeded(
      await c.s.commit({
        kind: 'bindExternalCall',
        input: {
          ...c.s.base,
          operation: operationId('bind-bg2'),
          expected: (await c.s.read()).revision,
          qualification: evidence('qualified'),
          binding: {
            producer: other,
            action: 'action-2',
            consumer: { owner: 'session', work: 'work', position: 'at-bg2', purpose: 'action' },
            request: evidence('request-bg2'),
            initiatingAttempt: null,
          },
        },
      }),
      'bind other',
    )
    succeeded(
      await commitEntries(c, observation(c, 'p', 0, [[backgrounded], [backgroundedOther]])),
      'placeholders',
    )
    const second = (await c.s.read()).consumptions.find(
      item => item.binding.producer.call === OTHER,
    )!
    succeeded(
      await c.s.commit({
        kind: 'control',
        input: { ...c.s.base, operation: operationId('archive'), intent: { kind: 'archive' } },
      }),
      'archive',
    )
    const archive = (await c.s.read()).controls.at(-1)!
    return { c, second: second.id, archive }
  }

  it('the archive withdraws both calls by their references', async () => {
    const { c, archive } = await archivedTwo()
    expect(controlRoutes(await c.s.read(), archive)).toEqual({
      agent: true,
      direct: [
        { producer, intent: 'withdraw' },
        { producer: other, intent: 'withdraw' },
      ],
    })
  })

  it('settling one leaves the other placeholder and the other pending', async () => {
    const { c, second, archive } = await archivedTwo()
    succeeded(await commitEntries(c, observation(c, 'r', 2, [[execution, outcome()]])), 'outcome')
    const after = await c.s.read()
    expect(after.backgroundPlaceholders).toEqual([second])
    const progress = after.controls.find(item => item.operation === archive.operation)!
    expect(progress.pending).toContainEqual(other)
    expect(progress.pending).not.toContainEqual(producer)
    expect(progress.state).toBe(archive.state)
  })

  it('both settled in one batch: each settlement starts from the one before', async () => {
    const { c, archive } = await archivedTwo()
    const before = entryCount(c)
    succeeded(
      await commitEntries(
        c,
        observation(c, 'r', 2, [
          [execution, outcome()],
          [executionOther, outcomeOther],
        ]),
      ),
      'outcomes',
    )
    const added = await newEntries(c, before)
    expect(added.filter(entry => entry.kind === 'control.progress')).toHaveLength(2)
    const after = await c.s.read()
    expect(after.backgroundPlaceholders).toEqual([])
    const progress = after.controls.find(item => item.operation === archive.operation)!
    expect(progress.pending).not.toContainEqual(producer)
    expect(progress.pending).not.toContainEqual(other)
  })
})

describe('routes and settlements over every kind of control', () => {
  const OTHER = { kind: 'tool', call: 'call-other' } as const
  const control = (
    operation: string,
    intent: unknown,
    pending: readonly ProducerRef[],
    state: ControlProgress['state'] = 'propagating',
  ): ControlProgress =>
    ({
      operation: operationId(operation),
      target: { kind: 'session' },
      intent,
      state,
      pending,
    }) as ControlProgress
  const urgent = { kind: 'ordinary', input: 'u', message: reminder(), origin: evidence('u') }

  it('a cancel of the Run and an interrupt withdraw no backgrounded call; an auto-archive does', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    const snapshot = await c.s.read()
    const cancel = { kind: 'control', value: { kind: 'cancel-run', run: c.run, urgency: 'force' } }
    expect(controlRoutes(snapshot, control('cancel', cancel, [producer]))).toEqual({
      agent: true,
      direct: [],
    })
    const interrupt = { kind: 'interrupt', run: c.run, urgent, decision: evidence('d') }
    expect(controlRoutes(snapshot, control('interrupt', interrupt, [producer]))).toEqual({
      agent: true,
      direct: [],
    })
    const idle = { kind: 'auto-archive', idleEvidence: evidence('idle') }
    expect(controlRoutes(snapshot, control('idle', idle, [producer]))).toEqual({
      agent: true,
      direct: [{ producer, intent: 'withdraw' }],
    })
    expect(controlRoutes(snapshot, control('done', cancel, [], 'reconciled'))).toEqual({
      agent: false,
      direct: [],
    })
  })

  it('a settlement leaves the pending of each control and reconciles only a stop of that call', () => {
    const stop = control('stop', { kind: 'control', value: { kind: 'stop-call', producer } }, [
      producer,
    ])
    const archive = control('archive', { kind: 'control', value: { kind: 'archive' } }, [
      producer,
      OTHER,
    ])
    const interrupt = control(
      'interrupt',
      { kind: 'interrupt', run: 'run', urgent, decision: evidence('d') },
      [producer],
    )
    const background = control(
      'background',
      { kind: 'control', value: { kind: 'background-tool', producer } },
      [producer],
    )
    const unrelated = control(
      'unrelated',
      { kind: 'control', value: { kind: 'stop-call', producer: OTHER } },
      [OTHER],
    )
    expect(settledControls([stop, archive, interrupt, background, unrelated], producer)).toEqual([
      { ...stop, pending: [], state: 'reconciled' },
      { ...archive, pending: [OTHER] },
      { ...interrupt, pending: [] },
      { ...background, pending: [] },
    ])
  })
})

describe('the reducer refuses a forged background entry', () => {
  const origin = { owner: 'session', via: 'direct', source: evidence('forged') }
  function forged(snapshot: WorkSnapshot, entry: SessionEntry) {
    const revision = String(BigInt(snapshot.revision) + 1n) as SessionRevision
    return reduce(snapshot, {
      revision,
      entries: [{ ...encodeEntry(entry, origin), id: 'forged-1' as EntryId, revision }],
    }).kind
  }

  it('a placeholder of an unbound or mismatched call, a second placeholder and a settlement of a foreground call', async () => {
    const c = await bound()
    const fresh = await c.s.read()
    const settled: SessionEntry = {
      kind: 'call.background-settled',
      consumption: c.consumption,
      result: 'rv-1',
      disposition: { kind: 'kept', reason: 'archived' },
    }
    expect(forged(fresh, settled)).toBe('quarantined')
    expect(
      forged(fresh, {
        kind: 'call.backgrounded',
        consumption: 'unbound' as ConsumptionId,
        producer,
        ...CALL_FIELDS,
      }),
    ).toBe('quarantined')
    expect(
      forged(fresh, {
        kind: 'call.backgrounded',
        consumption: c.consumption,
        producer: { kind: 'tool', call: 'call-other' },
        ...CALL_FIELDS,
      }),
    ).toBe('quarantined')
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    expect(
      forged(await c.s.read(), {
        kind: 'call.backgrounded',
        consumption: c.consumption,
        producer,
        ...CALL_FIELDS,
      }),
    ).toBe('quarantined')
  })
})

describe('background inputs leave the list once they leave the pending inputs', () => {
  it('a reminder taken by a Run that is cancelled leaves neither list', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const input = backgroundInputId(producer, 'rv-1')
    expect((await c.s.read()).uncountedInputs).toEqual([input])
    for (const id of ['first' as InputId, input])
      succeeded(
        await c.s.commit({
          kind: 'receive',
          input: {
            ...c.s.base,
            operation: operationId(`hand-${id}`),
            fact: {
              kind: 'input-handover',
              execution: c.execution,
              input: id,
              result: { kind: 'accepted', receipt: evidence(`accepted/${id}`) },
            },
          },
        }),
        `hand over ${id}`,
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
                id: 'batch-both' as never,
                ordered: ['first' as InputId, input],
                watermark: evidence('watermark/1'),
              },
            },
          ],
        },
        operationId('take-both'),
      ),
      'take',
    )
    succeeded(
      await c.s.commit({
        kind: 'cancelRun',
        input: { ...c.s.base, operation: operationId('cancel'), run: c.run, urgency: 'graceful' },
      }),
      'cancel',
    )
    const after = await c.s.read()
    expect(after.pending).toEqual([])
    expect(after.uncountedInputs).toEqual([])
  })
})

describe('the backgrounded calls of a session and a background control', () => {
  const backgroundOf = (c: Scene, name: string) =>
    c.s.commit({
      kind: 'control',
      input: {
        ...c.s.base,
        operation: operationId(name),
        intent: { kind: 'background-tool', producer },
      },
    })

  it('lists the backgrounded calls by their references until they settle', async () => {
    const c = await bound()
    expect(backgroundCalls(await c.s.read())).toEqual([])
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    expect(backgroundCalls(await c.s.read())).toEqual([producer])
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    expect(backgroundCalls(await c.s.read())).toEqual([])
  })

  it('backgrounding a foreground call propagates through Agent', async () => {
    const c = await bound()
    const answer = succeeded(await backgroundOf(c, 'bg'), 'background')
    expect(answer.progress).toMatchObject({ state: 'propagating', pending: [producer] })
    expect(controlRoutes(await c.s.read(), answer.progress)).toEqual({ agent: true, direct: [] })
  })

  it('backgrounding a call already in the background is reconciled at once and sends nothing', async () => {
    const c = await bound()
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    const answer = succeeded(await backgroundOf(c, 'bg'), 'background')
    expect(answer.progress).toMatchObject({ state: 'reconciled', pending: [] })
    expect(controlRoutes(await c.s.read(), answer.progress)).toEqual({ agent: false, direct: [] })
    expect(succeeded(await backgroundOf(c, 'bg'), 'recall').progress).toEqual(answer.progress)
  })
})
