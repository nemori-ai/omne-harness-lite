import { describe, expect, it } from 'vitest'
import { expectedRevision, judgeWaiting, type RunId } from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { open, scene } from './scene.ts'

type Scene = ReturnType<typeof scene>

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

describe('judgeWaiting', () => {
  it('answers null for a session with no Run and for a session with an active Run', async () => {
    const none = scene()
    await none.create()
    await none.accept('first')
    expect(judgeWaiting(await none.read())).toBeNull()
    const active = await open()
    expect(judgeWaiting(await active.read())).toBeNull()
  })

  it('answers the failed Run, its execution and the count of pending inputs', async () => {
    const s = await open()
    await s.accept('second')
    const execution = (await s.active()).run.execution.execution
    const run = await fail(s)
    const snapshot = await s.read()
    expect(snapshot.awaitingPerson).toBe(true)
    expect(judgeWaiting(snapshot)).toEqual({
      run,
      pending: snapshot.pending.length,
      execution,
    })
    expect(snapshot.pending.length).toBe(2)
  })

  it('answers zero pending when the failed Run left nothing pending', async () => {
    const s = await open()
    const run = await fail(s)
    const snapshot = await s.read()
    expect(judgeWaiting({ ...snapshot, pending: [] })).toMatchObject({ run, pending: 0 })
  })

  it('answers a null execution when the snapshot keeps no execution of the Run', async () => {
    const s = await open()
    const run = await fail(s)
    const snapshot = await s.read()
    expect(judgeWaiting({ ...snapshot, executions: [] })).toMatchObject({ run, execution: null })
    const { executions: _dropped, ...without } = snapshot
    expect(judgeWaiting(without)).toMatchObject({ run, execution: null })
  })

  it('answers null again once a new input ends the waiting', async () => {
    const s = await open()
    await fail(s)
    await s.accept('after')
    expect(judgeWaiting(await s.read())).toBeNull()
  })
})
