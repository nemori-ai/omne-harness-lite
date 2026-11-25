import { describe, expect, it } from 'vitest'
import {
  decide,
  expectedRevision,
  type FreezeVerdict,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { open, scene } from './scene.ts'

const reads = { compaction: null }
const verdict: FreezeVerdict = {
  cause: 'tool-shape-lost',
  capability: 'probe',
  evidence: evidence('tool/lost'),
}

type Base = Readonly<{ tenant: WorkSnapshot['tenant']; session: WorkSnapshot['session'] }>

/** A reload that names no run, at the revision the snapshot stands at. */
const idle = (
  base: Base,
  snapshot: WorkSnapshot,
  candidate = { ...snapshot.definition.adopted, digest: 'sha256:newer' },
): SessionCommand => ({
  kind: 'reload',
  input: {
    ...base,
    operation: operationId('reload-idle'),
    run: null,
    expected: expectedRevision(snapshot, 'reload'),
    candidate,
  },
})

const kinds = (decision: ReturnType<typeof decide>) =>
  decision.kind === 'entries' ? decision.entries.map(entry => entry.kind) : decision

describe('a reload that names no run', () => {
  it('records the new adoption and starts nothing, while no run goes on', async () => {
    const s = scene()
    await s.create()
    const snapshot = await s.read()
    expect(kinds(decide(snapshot, idle(s.base, snapshot), [], null, reads))).toEqual([
      'session.adoption',
    ])
  })

  it('writes nothing when the candidate is the one the session stands at', async () => {
    const s = scene()
    await s.create()
    const snapshot = await s.read()
    const same = idle(s.base, snapshot, snapshot.definition.adopted)
    expect(kinds(decide(snapshot, same, [], null, reads))).toEqual([])
  })

  it('is refused while a run goes on: the caller names that run, or waits for the next', async () => {
    const s = await open()
    const { snapshot } = await s.active()
    expect(decide(snapshot, idle(s.base, snapshot), [], null, reads)).toEqual({
      kind: 'rejected',
      failure: { kind: 'run-active' },
    })
  })

  it('is refused on an archived session, and on a frozen one with the verdict', async () => {
    const s = scene()
    await s.create()
    const snapshot = await s.read()
    const archived = { ...snapshot, lifecycle: 'archived' } as WorkSnapshot
    expect(decide(archived, idle(s.base, archived), [], null, reads)).toEqual({
      kind: 'rejected',
      failure: { kind: 'archived' },
    })
    const frozen = { ...snapshot, frozen: { ...verdict, commit: evidence('c') } } as WorkSnapshot
    expect(decide(frozen, idle(s.base, frozen), [], null, reads)).toEqual({
      kind: 'rejected',
      failure: { kind: 'frozen', verdict: frozen.frozen },
    })
  })

  it('is refused at a moved revision, and for a candidate of another definition', async () => {
    const s = scene()
    await s.create()
    const snapshot = await s.read()
    const moved = { ...(idle(s.base, snapshot).input as object), expected: '999' }
    expect(
      decide(snapshot, { kind: 'reload', input: moved } as SessionCommand, [], null, reads),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'changed' } })
    const other = idle(s.base, snapshot, { ...snapshot.definition.adopted, name: 'another' })
    expect(decide(snapshot, other, [], null, reads)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'candidate' },
    })
  })

  it('is refused with the verdict when the resident material of the candidate carries one', async () => {
    const s = scene()
    await s.create()
    const snapshot = await s.read()
    const command = idle(s.base, snapshot) as Extract<SessionCommand, { kind: 'reload' }>
    const freezing = {
      ...command,
      input: { ...command.input, residentAdoption: { residents: [], keys: [], verdict } },
    }
    expect(decide(snapshot, freezing, [], null, reads)).toEqual({
      kind: 'rejected',
      failure: { kind: 'frozen', verdict },
    })
  })
})
