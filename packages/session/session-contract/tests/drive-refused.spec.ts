import { describe, expect, it } from 'vitest'
import { expectedRevision, type BoundedClose, type InputId } from '@omne-harness/session-contract'
import { operationId, refused, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry, type SessionEntry } from '../src/entries.ts'
import { open } from './scene.ts'

type Scene = Awaited<ReturnType<typeof open>>

const refusal = (inputs: readonly InputId[]): BoundedClose => ({
  kind: 'drive-refused',
  failure: 'invalid',
  field: 'storage',
  reason: 'command_limit',
  inputs,
})

async function close(s: Scene, bounded: BoundedClose, name = 'drive-refused') {
  const { run } = await s.active()
  return s.commit({
    kind: 'finishRun',
    input: {
      ...s.base,
      operation: operationId(name),
      run: run.run,
      expected: expectedRevision(await s.read(), 'finishRun'),
      bounded,
    },
  })
}

function written(s: Scene, kind: SessionEntry['kind']): SessionEntry[] {
  return s.port.controls
    .entriesOf(s.base.tenant, s.base.session)
    .filter(row => row.kind === kind)
    .map(row => {
      const decoded = decodeEntry(row)
      if (!('ok' in decoded)) throw new Error(`undecodable ${kind}`)
      return decoded.ok
    })
}

describe('a drive refusal closes the Run as failed', () => {
  it('on invoke, the inputs the invoke carried are rejected with drive-refused and are no longer pending', async () => {
    const s = await open()
    await s.accept('second')
    const { run } = await s.active()
    succeeded(await close(s, refusal(run.initial)), 'finishRun')

    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(after.pending).toEqual(['second'])
    expect(written(s, 'intake.handed-over')).toEqual([
      expect.objectContaining({
        input: run.initial[0],
        result: expect.objectContaining({ kind: 'rejected', reason: 'drive-refused' }),
      }),
    ])
    const [terminal] = written(s, 'run.terminal')
    if (terminal?.kind !== 'run.terminal') throw new Error('no run.terminal')
    expect(terminal.bounded).toEqual(refusal(run.initial))
    expect(terminal.cause?.record).toContain('invalid')
    expect(terminal.cause?.record).toContain('storage')
    expect(terminal.cause?.record).toContain('command_limit')
  })

  it('an unsupported refusal names its kind in the cause, without a field or reason', async () => {
    const s = await open()
    const { run } = await s.active()
    succeeded(
      await close(s, {
        kind: 'drive-refused',
        failure: 'unsupported',
        field: null,
        reason: null,
        inputs: run.initial,
      }),
      'finishRun',
    )
    const [terminal] = written(s, 'run.terminal')
    if (terminal?.kind !== 'run.terminal') throw new Error('no run.terminal')
    expect(terminal.cause?.record).toContain('unsupported')
  })

  it('on resume, no input is named: no intake.handed-over entry is written and the pending inputs stay', async () => {
    const s = await open()
    await s.accept('second')
    const before = await s.read()
    succeeded(await close(s, refusal([])), 'finishRun')

    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(after.pending).toEqual(before.pending)
    expect(written(s, 'intake.handed-over')).toEqual([])
    const [terminal] = written(s, 'run.terminal')
    if (terminal?.kind !== 'run.terminal') throw new Error('no run.terminal')
    expect(terminal.cause?.record).toContain('command_limit')
  })
})

describe('a drive refusal that does not hold leaves the Run active', () => {
  it('an input that is not an initial input of the Run is invalid', async () => {
    const s = await open()
    await s.accept('second')
    expect(refused(await close(s, refusal(['second' as InputId])), 'finishRun')).toMatchObject({
      kind: 'invalid',
      field: 'bounded.input',
    })
    expect((await s.read()).run.kind).toBe('active')
  })
})
