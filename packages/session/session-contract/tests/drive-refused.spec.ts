// The bounded close on a drive refusal (SPEC PM-02, PM-05, VC-A10, VC-R03): the Agent answered
// `invoke` or `resume` with a definite failure, so the Run ends as failed on the basis that the
// close itself records. On `invoke` the first input is rejected with `drive-refused` and leaves the
// pending set; on `resume` no input is named and every pending input keeps its eligibility. Each
// case fails when the close keeps the first input pending, writes no SE35, loses the refusal's
// kind, field or reason from the terminal cause, or accepts an input that is not the first one.
import { describe, expect, it } from 'vitest'
import { expectedRevision, type BoundedClose, type InputId } from '@omne-harness/session-contract'
import { operationId, refused, succeeded } from '@omne-harness/session-contract/testing'
import { decodeEntry, type SessionEntry } from '../src/entries.ts'
import { open } from './scene.ts'

type Scene = Awaited<ReturnType<typeof open>>

const refusal = (input: InputId | null): BoundedClose => ({
  kind: 'drive-refused',
  failure: 'invalid',
  field: 'storage',
  reason: 'command_limit',
  input,
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

describe('a drive refusal closes the Run as failed (VC-A10)', () => {
  it('on invoke, the first input is rejected with drive-refused and is no longer pending', async () => {
    const s = await open()
    await s.accept('second')
    const { run } = await s.active()
    succeeded(await close(s, refusal(run.first)), 'finishRun')

    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(after.pending).toEqual(['second'])
    expect(written(s, 'intake.handed-over')).toEqual([
      expect.objectContaining({
        input: run.first,
        result: expect.objectContaining({ kind: 'rejected', reason: 'drive-refused' }),
      }),
    ])
    const [terminal] = written(s, 'run.terminal')
    if (terminal?.kind !== 'run.terminal') throw new Error('no run.terminal')
    expect(terminal.bounded).toEqual(refusal(run.first))
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
        input: run.first,
      }),
      'finishRun',
    )
    const [terminal] = written(s, 'run.terminal')
    if (terminal?.kind !== 'run.terminal') throw new Error('no run.terminal')
    expect(terminal.cause?.record).toContain('unsupported')
  })

  it('on resume, no input is named: no SE35 is written and the pending inputs stay', async () => {
    const s = await open()
    await s.accept('second')
    const before = await s.read()
    succeeded(await close(s, refusal(null)), 'finishRun')

    const after = await s.read()
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(after.pending).toEqual(before.pending)
    expect(written(s, 'intake.handed-over')).toEqual([])
    const [terminal] = written(s, 'run.terminal')
    if (terminal?.kind !== 'run.terminal') throw new Error('no run.terminal')
    expect(terminal.cause?.record).toContain('command_limit')
  })
})

describe('a drive refusal that does not hold leaves the Run active (VC-R03)', () => {
  it('an input that is not the first input of the Run is invalid', async () => {
    const s = await open()
    await s.accept('second')
    expect(refused(await close(s, refusal('second' as InputId)), 'finishRun')).toMatchObject({
      kind: 'invalid',
      field: 'bounded.input',
    })
    expect((await s.read()).run.kind).toBe('active')
  })
})
