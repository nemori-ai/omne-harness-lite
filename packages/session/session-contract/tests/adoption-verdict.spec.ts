// The freeze verdict of the adoption point (R2-D13 Q1): `startRun` and `reload` that carry a verdict
// in their resident adoption are decided `frozen{verdict}` and produce no entry. The same command
// without the verdict is decided, so the verdict is the only cause.
import { describe, expect, it } from 'vitest'
import type {
  FreezeVerdict,
  ResidentAdoption,
  StartAdoption,
  SessionCommand,
} from '@omne-harness/session-contract'
import { decide } from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  ordinaryInput,
  refused,
} from '@omne-harness/session-contract/testing'
import { open, scene } from './scene.ts'

const verdict: FreezeVerdict = { cause: 'tool-shape-lost', evidence: evidence('tool/lost') }
const empty: ResidentAdoption = { residents: [], keys: [] }
const reads = { compaction: null }

async function pendingSession() {
  const s = scene()
  await s.create()
  await s.accept('first')
  return s
}

describe('the freeze verdict of the adoption material', () => {
  it('decides startRun frozen with the verdict and writes no entry', async () => {
    const s = await pendingSession()
    const snapshot = await s.read()
    const command = (residentAdoption: StartAdoption): SessionCommand => ({
      kind: 'startRun',
      input: {
        ...s.base,
        operation: operationId('start-verdict'),
        entry: 'interactive',
        candidate: snapshot.definition.adopted,
        instance: { owner: 'agent', id: 'instance-verdict' },
        residentAdoption,
      },
    })
    // The first input came through the login entry: the stored fact the provider reads.
    const first = snapshot.pending[0]!
    const login = { ...reads, firstInput: { input: first, origin: ordinaryInput('first').origin } }
    expect(decide(snapshot, command({ ...empty, verdict }), [], null, login)).toEqual({
      kind: 'rejected',
      failure: { kind: 'frozen', verdict },
    })
    // The same material without the verdict starts the Run: the verdict is the only cause.
    expect(decide(snapshot, command(empty), [], null, login).kind).toBe('entries')
  })

  it('refuses startRun through the port without a commit when the verdict is present', async () => {
    const s = await pendingSession()
    const before = await s.read()
    const entries = s.port.controls.entriesOf(s.base.tenant, s.base.session).length
    const failure = refused(
      await s.commit({
        kind: 'startRun',
        input: {
          ...s.base,
          operation: operationId('start-verdict'),
          entry: 'interactive',
          candidate: before.definition.adopted,
          instance: { owner: 'agent', id: 'instance-verdict' },
          residentAdoption: { ...empty, verdict },
        },
      }),
      'startRun with a verdict',
    )
    expect(failure).toEqual({ kind: 'frozen', verdict })
    expect(await s.read()).toEqual(before)
    expect(s.port.controls.entriesOf(s.base.tenant, s.base.session)).toHaveLength(entries)
  })

  it('decides reload frozen with the verdict and writes no entry', async () => {
    const s = await open()
    const { snapshot, run } = await s.active()
    const reload = (residentAdoption: StartAdoption): SessionCommand => ({
      kind: 'reload',
      input: {
        ...s.base,
        operation: operationId('reload-verdict'),
        run: run.run,
        expected: snapshot.revision,
        instance: { owner: 'agent', id: 'reload-verdict' },
        candidate: run.adoption,
        handover: evidence('handover'),
        residentAdoption,
      },
    })
    expect(decide(snapshot, reload({ ...empty, verdict }), [], null, reads)).toEqual({
      kind: 'rejected',
      failure: { kind: 'frozen', verdict },
    })
    // The same reload without the verdict is decided: the verdict is the only cause.
    expect(decide(snapshot, reload(empty), [], null, reads).kind).toBe('entries')
  })
})
