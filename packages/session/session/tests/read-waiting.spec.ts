import { afterEach, describe, expect, it } from 'vitest'
import {
  operationId,
  ordinaryInput,
  shapeOf,
  succeeded,
} from '@omne-harness/session-contract/testing'
import type { SessionFailure } from '@omne-harness/session-contract'
import { turn } from './fixtures/control-fixture.ts'
import { failedAfterTaking, read } from './fixtures/failed-run.ts'
import type { Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

function failureOf(answer: unknown): SessionFailure {
  if (typeof answer !== 'object' || answer === null || !('failure' in answer))
    throw new Error(`expected a failure, got ${JSON.stringify(answer)}`)
  return (answer as { failure: SessionFailure }).failure
}

async function waitingAfterFailure() {
  const failed = await failedAfterTaking(open)
  for (let step = 0; step < 5; step++) await turn()
  return failed
}

describe('readWaiting', () => {
  it('answers the failed Run, the count of pending inputs and the execution of the Run', async () => {
    const { h, starts } = await waitingAfterFailure()
    const snapshot = await read(h)
    if (snapshot.run.kind !== 'terminal') throw new Error('no terminal')
    expect(snapshot.awaitingPerson).toBe(true)
    const waiting = succeeded(await h.faces('intake').work.readWaiting(h.access()), 'readWaiting')
    expect(waiting).toEqual({
      run: snapshot.run.terminal.run,
      pending: snapshot.pending.length,
      execution: starts[0],
    })
    expect(waiting?.pending).toBe(1)
  })

  it('answers null once a new input ends the waiting', async () => {
    const { h } = await waitingAfterFailure()
    succeeded(
      await h.faces('intake').work.accept({
        ...h.access(),
        operation: operationId('accept-after'),
        value: ordinaryInput('input-2'),
      }),
      'accept',
    )
    const after = await read(h)
    expect(after.awaitingPerson).toBeUndefined()
    expect(
      succeeded(await h.faces('intake').work.readWaiting(h.access()), 'readWaiting'),
    ).toBeNull()
  })

  it('is served to intake only: a reader and a coordinator are denied', async () => {
    const { h } = await waitingAfterFailure()
    for (const caller of ['reader', 'coordinator', 'maintainer'] as const)
      expect(failureOf(await h.faces(caller).work.readWaiting(h.access()))).toEqual({
        kind: 'denied',
        action: 'readWaiting',
      })
  })

  it('denies another tenant the same as a session that never was', async () => {
    const { h } = await waitingAfterFailure()
    const stranger = await h.faces('intake').work.readWaiting({
      ...h.other(),
      principal: 'b:stranger',
    })
    const never = await h.faces('intake').work.readWaiting(h.access('never-created'))
    expect(failureOf(stranger)).toEqual({ kind: 'denied', action: 'readWaiting' })
    expect(shapeOf(stranger)).toBe(shapeOf(never))
  })
})
