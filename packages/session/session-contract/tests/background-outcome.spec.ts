import { describe, expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import { controlRoutes, openWork, pendingIntakeCount } from '@omne-harness/session-contract'
import type {
  ConsumptionId,
  InputId,
  SessionEntriesInterpretation,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesStart,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  succeeded,
  userMessage,
} from '@omne-harness/session-contract/testing'
import {
  BACKGROUND_INPUT_OWNER,
  backgroundInputId,
  judgeBackgroundOutcome,
} from '../src/background-outcome.ts'
import { decodeEntry } from '../src/entries.ts'
import { open } from './scene.ts'

const CALL = 'call-bg'
const producer = { kind: 'tool', call: CALL } as const
const reminder = (text = 'background done'): Message =>
  ({ ...userMessage(text, 'msg_bgreminder0000000000000'), role: 'system_reminder' }) as Message
const backgrounded: SessionEntriesInterpretation = {
  kind: 'backgrounded',
  producer,
  source: evidence('tool/placeholder'),
}
const outcome = (result = 'rv-1'): SessionEntriesInterpretation => ({
  kind: 'background-outcome',
  producer,
  result,
  reminder: reminder(),
  source: evidence(`tool/result/${result}`),
})
const execution: SessionEntriesInterpretation = {
  kind: 'execution',
  producer,
  source: evidence('tool/result/rv-1'),
}

type Scene = Awaited<ReturnType<typeof bound>>

async function bound(extra: Parameters<typeof open>[0] = {}) {
  const s = await open(extra)
  succeeded(
    await s.commit({
      kind: 'bindExternalCall',
      input: {
        ...s.base,
        operation: operationId('bind-bg'),
        expected: (await s.read()).revision,
        qualification: evidence('qualified'),
        binding: {
          producer,
          action: 'action',
          consumer: { owner: 'session', work: 'work', position: 'at-bg', purpose: 'action' },
          request: evidence('request-bg'),
          initiatingAttempt: null,
        },
      },
    }),
    'bind',
  )
  const first = await s.active()
  const consumption = (await s.read()).consumptions.find(
    item => item.binding.producer.call === CALL,
  )?.id as ConsumptionId
  return { s, run: first.run.run, execution: first.run.execution.execution, consumption }
}

function observation(
  c: Scene,
  name: string,
  after: number,
  parts: readonly (readonly SessionEntriesInterpretation[])[],
): SessionEntriesObservation {
  const items: SessionEntriesItem[] = parts.map((interpretation, at) => ({
    ordinal: String(after + at + 1),
    key: `${name}-${at}`,
    fact: evidence(`agent/entry/${name}/${at}`),
    interpretation,
  }))
  const through = String(after + parts.length)
  return {
    tenant: c.s.base.tenant,
    session: c.s.base.session,
    run: c.run,
    execution: c.execution,
    channel: 'tool-received',
    operation: operationId(`entries-${name}`),
    after: String(after),
    through,
    boundary: {
      execution: c.execution,
      channel: 'tool-received',
      revision: through,
      executionEvidence: evidence(`agent/head/${through}`),
      count: through,
    },
    items,
  }
}

async function commitEntries(c: Scene, value: SessionEntriesObservation) {
  const snapshot = await c.s.read()
  const saved = snapshot.entriesProgress?.find(item => item.execution === c.execution)
  const start: SessionEntriesStart =
    saved === undefined ? { kind: 'initial' } : { kind: 'saved', progress: saved }
  return c.s.port.commitEntries({ observation: value, start })
}

async function newEntries(c: Scene, before: number) {
  const rows = c.s.port.controls.entriesOf(c.s.base.tenant, c.s.base.session).slice(before)
  return rows.map(row => {
    const decoded = decodeEntry(row)
    if (!('ok' in decoded)) throw new Error(JSON.stringify(decoded))
    return decoded.ok
  })
}

const entryCount = (c: Scene) =>
  c.s.port.controls.entriesOf(c.s.base.tenant, c.s.base.session).length

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
      origin: { owner: BACKGROUND_INPUT_OWNER },
    })
    const after = await c.s.read()
    expect(after.backgroundPlaceholders).toEqual([])
    expect(after.pending).toContain(input)
    expect(after.backgroundInputs).toEqual([input])
    const stored = succeeded(await c.s.port.readInput({ ...c.s.access, input }), 'readInput')
    expect(stored.message).toEqual(reminder())
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

  it('routes the reminder to the next Run', async () => {
    const c = await cancelled()
    const snapshot = await c.s.read()
    expect(snapshot.run.kind).toBe('terminal')
    expect(snapshot.pending).toEqual([backgroundInputId(producer, 'rv-1')])
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
    expect(run).toMatchObject({ first: backgroundInputId(producer, 'rv-1') })
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
    expect(judgeBackgroundOutcome(await c.s.read(), c.consumption, producer)).toEqual({
      kind: 'refused',
    })
  })

  it('an archived session keeps the result and accepts no input', async () => {
    const { c, snapshot } = await placed()
    expect(
      judgeBackgroundOutcome({ ...snapshot, lifecycle: 'archived' }, c.consumption, producer),
    ).toEqual({ kind: 'kept', reason: 'archived' })
  })

  it('a stop of this call keeps the result and accepts no input; a stop of another does not', async () => {
    const { c, snapshot } = await placed()
    const stop = (call: string): WorkSnapshot['controls'][number] => ({
      operation: operationId(`stop-${call}`),
      target: { kind: 'producer', producer: { kind: 'tool', call } },
      intent: { kind: 'control', value: { kind: 'stop-call', producer: { kind: 'tool', call } } },
      state: 'propagating',
      pending: [],
    })
    expect(
      judgeBackgroundOutcome({ ...snapshot, controls: [stop(CALL)] }, c.consumption, producer),
    ).toEqual({ kind: 'kept', reason: 'stopped' })
    expect(
      judgeBackgroundOutcome(
        { ...snapshot, controls: [stop('call-other')] },
        c.consumption,
        producer,
      ),
    ).toEqual({ kind: 'input', destination: 'current-run' })
  })

  it('a frozen session with no Run keeps the result; with an active Run the input goes to it', async () => {
    const { c, snapshot } = await placed()
    const frozen = { ...snapshot, frozen: evidence('frozen') } as unknown as WorkSnapshot
    expect(judgeBackgroundOutcome(frozen, c.consumption, producer)).toEqual({
      kind: 'input',
      destination: 'current-run',
    })
    const idle = { ...frozen, run: { kind: 'none' } } as WorkSnapshot
    expect(judgeBackgroundOutcome(idle, c.consumption, producer)).toEqual({
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
    expect(judgeBackgroundOutcome(cancelled, c.consumption, producer)).toEqual({
      kind: 'input',
      destination: 'next-run',
    })
  })
})

describe('system inputs and the pending budget', () => {
  it('a background input does not count against the pending inputs', () => {
    const user = 'in-user' as InputId
    const system = 'in-system' as InputId
    expect(
      pendingIntakeCount({ pending: [user, system], handed: [], backgroundInputs: [system] }),
    ).toBe(1)
    expect(pendingIntakeCount({ pending: [user, system], handed: [] })).toBe(2)
  })

  it('a user input is accepted while a background input fills the only pending slot', async () => {
    const c = await bound({ intakeLimits: { maxPendingInputs: 2, maxInputBytes: 1048576 } })
    succeeded(await commitEntries(c, observation(c, 'p', 0, [[backgrounded]])), 'placeholder')
    succeeded(await commitEntries(c, observation(c, 'r', 1, [[execution, outcome()]])), 'outcome')
    const snapshot = await c.s.read()
    expect(pendingIntakeCount(snapshot)).toBe(1)
    expect(pendingIntakeCount({ ...snapshot, backgroundInputs: [] })).toBe(2)
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

  it('a stop of a backgrounded call goes to Tool alone; its outcome settles kept and reconciles the stop', async () => {
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
      disposition: { kind: 'kept', reason: 'stopped' },
    })
    expect(added.some(entry => entry.kind === 'message.system_reminder')).toBe(false)
    const after = await c.s.read()
    expect(after.controls.at(-1)).toMatchObject({ state: 'reconciled', pending: [] })
    expect(controlRoutes(after, after.controls.at(-1)!)).toEqual({ agent: false, direct: [] })
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
