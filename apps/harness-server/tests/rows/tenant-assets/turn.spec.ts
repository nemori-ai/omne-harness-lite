import { describe, expect, it } from 'vitest'
import { madeFrom, turnKeyOf } from '../../../src/rows/tenant-assets/turn.ts'

type Snapshot = Parameters<typeof turnKeyOf>[0]
type Relation = Parameters<typeof madeFrom>[0]

const at = (workspace: string | null, run: object, changes: object[] = []): Snapshot =>
  ({ creation: { workspace }, changes, run }) as unknown as Snapshot
const active = { kind: 'active', run: 'run_now' }
const ended = { kind: 'terminal', terminal: { run: 'run_last' } }

describe('the key of the turn a session reads its workspace by', () => {
  it('is the run it is in, once it has stood at a workspace', () => {
    expect(turnKeyOf(at('wsp_a', active))).toBe('run_now')
    expect(turnKeyOf(at(null, active, [{ kind: 'workspace', value: 'wsp_a' }]))).toBe('run_now')
  })

  it('is none for a session that never stood at a workspace, or that runs nothing', () => {
    expect(turnKeyOf(at(null, active))).toBeNull()
    expect(turnKeyOf(at(null, active, [{ kind: 'workspace', value: null }]))).toBeNull()
    expect(turnKeyOf(at('wsp_a', { kind: 'none' }))).toBeNull()
    expect(turnKeyOf(at('wsp_a', ended))).toBeNull()
  })

  it('is the last run it had when what is asked is done on behalf of that turn', () => {
    expect(turnKeyOf(at('wsp_a', ended), true)).toBe('run_last')
    expect(turnKeyOf(at('wsp_a', active), true)).toBe('run_now')
    expect(turnKeyOf(at('wsp_a', { kind: 'none' }), true)).toBeNull()
    expect(turnKeyOf(at(null, ended), true)).toBeNull()
  })
})

describe('the session a session was made from', () => {
  it('is its parent or the one that handed over to it; a session a person made has none', () => {
    expect(madeFrom({ kind: 'child', parent: 'ses_p' } as unknown as Relation)).toBe('ses_p')
    expect(madeFrom({ kind: 'handoff', origin: 'ses_o' } as unknown as Relation)).toBe('ses_o')
    expect(madeFrom({ kind: 'main' } as unknown as Relation)).toBeNull()
    expect(madeFrom(undefined)).toBeNull()
  })
})
