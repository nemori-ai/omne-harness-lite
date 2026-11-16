import { describe, expect, it } from 'vitest'
import { decide, type RunId, type SessionCommand } from '@omne-harness/session-contract'
import {
  evidence,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  refused,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { open, scene } from './scene.ts'

type Address = Readonly<{ tenant: SessionCommand['input']['tenant']; session: string }>

const accept = (address: Address): SessionCommand =>
  ({
    kind: 'accept',
    input: { ...address, operation: operationId('misaddressed'), value: ordinaryInput('x') },
  }) as SessionCommand
const DENIED = { kind: 'rejected', failure: { kind: 'denied', action: 'accept' } }
const NO_READS = { compaction: null }

describe('a command that names another session or another tenant', () => {
  it('is denied for another session of the same tenant', async () => {
    const s = scene()
    await s.create()
    const elsewhere = memoryOtherAccess('stranger', 'session-2')
    expect(
      decide(
        await s.read(),
        accept({ tenant: s.base.tenant, session: elsewhere.session }),
        [],
        null,
        NO_READS,
      ),
    ).toEqual(DENIED)
  })

  it('is denied for the same session id under another tenant', async () => {
    const s = scene()
    await s.create()
    const elsewhere = memoryOtherAccess('stranger')
    expect(elsewhere.session).toBe(s.base.session)
    expect(
      decide(
        await s.read(),
        accept({ tenant: elsewhere.tenant, session: s.base.session }),
        [],
        null,
        NO_READS,
      ),
    ).toEqual(DENIED)
  })

  it('is denied when the session does not exist and the command does not create it', () => {
    expect(decide(null, accept(scene().base), [], null, NO_READS)).toEqual(DENIED)
  })
})

describe('freeze on a session that is already frozen', () => {
  const freeze = (address: Address, name: string) =>
    ({
      kind: 'freeze',
      input: {
        ...address,
        operation: operationId(name),
        verdict: { cause: 'tool-shape-lost', evidence: evidence('lost') },
      },
    }) as Extract<SessionCommand, { kind: 'freeze' }>

  async function frozen() {
    const s = scene()
    await s.create()
    const receipt = succeeded(await s.commit(freeze(s.base, 'freeze')), 'freeze')
    return { s, receipt, snapshot: await s.read() }
  }

  it('answers the original receipt when the reads carry it', async () => {
    const { s, receipt, snapshot } = await frozen()
    expect(
      decide(snapshot, freeze(s.base, 'freeze-again'), [], null, {
        ...NO_READS,
        frozenReceipt: receipt,
      }),
    ).toEqual({ kind: 'recovered', receipt })
  })

  it('answers unavailable when the original receipt was not read', async () => {
    const { s, snapshot } = await frozen()
    expect(decide(snapshot, freeze(s.base, 'freeze-again'), [], null, NO_READS)).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'the original freeze receipt is required for state recall',
      },
    })
  })
})

describe('interrupt', () => {
  type Scene = Awaited<ReturnType<typeof open>>
  const interrupt = (
    s: Scene,
    run: RunId,
    urgent: ReturnType<typeof ordinaryInput>,
    name: string,
  ) =>
    s.commit({
      kind: 'interrupt',
      input: {
        ...s.base,
        operation: operationId(name),
        run,
        urgent,
        decision: evidence('human'),
      },
    })

  it('refuses an urgent input with no content', async () => {
    const s = await open()
    const { run } = await s.active()
    const urgent = ordinaryInput('urgent')
    const empty = {
      ...urgent,
      message: { ...urgent.message, blocks: [] },
    } as unknown as ReturnType<typeof ordinaryInput>
    expect(refused(await interrupt(s, run.run, empty, 'interrupt-empty'), 'empty')).toEqual({
      kind: 'invalid',
      field: 'urgent',
      reason: 'empty or duplicate input',
    })
  })

  it('refuses an urgent input that is already pending', async () => {
    const s = await open()
    const { run } = await s.active()
    expect((await s.read()).pending).toEqual(['first'])
    expect(
      refused(await interrupt(s, run.run, ordinaryInput('first'), 'interrupt-dup'), 'duplicate'),
    ).toEqual({ kind: 'invalid', field: 'urgent', reason: 'empty or duplicate input' })
  })

  it('refuses an urgent input past the pending limit and leaves the session as it was', async () => {
    const s = await open({ intakeLimits: { maxPendingInputs: 1, maxInputBytes: 1_048_576 } })
    const { run } = await s.active()
    expect(
      refused(await interrupt(s, run.run, ordinaryInput('urgent'), 'interrupt-limit'), 'limit'),
    ).toEqual({ kind: 'limited', resource: 'pending-inputs', limit: 1 })
    expect(await s.read()).toMatchObject({ pending: ['first'], controls: [] })
  })

  it('refuses a Run that is not the current one without accepting the urgent input', async () => {
    const s = await open()
    expect(
      refused(
        await interrupt(s, 'run-elsewhere' as RunId, ordinaryInput('urgent'), 'interrupt-other'),
        'other run',
      ).kind,
    ).toBe('invalid')
    expect((await s.read()).pending).toEqual(['first'])
  })

  it('routes the urgent input to the Run it interrupts', async () => {
    const s = await open()
    const { run } = await s.active()
    succeeded(await interrupt(s, run.run, ordinaryInput('urgent'), 'interrupt'), 'interrupt')
    const routed = s.port.controls
      .entriesOf(s.base.tenant, s.base.session)
      .map(row => decodeEntry(row))
      .flatMap(entry =>
        'ok' in entry && entry.ok.kind === 'intake.routed' && 'input' in entry.ok ? [entry.ok] : [],
      )
      .find(entry => entry.input === 'urgent')
    expect(routed).toMatchObject({ input: 'urgent', destination: 'current-run', run: run.run })
  })
})
