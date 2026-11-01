// The session service over the real SQL pair (R3.1): the transaction suite of session-contract face
// by face, one decision per face operation, and the refusal of another tenant. Every case runs.
// Two cases are pinned to a defect of the store, not of this member: on the real sqlite-provider
// the `session.history` read handler of session-storage-sql runs `SELECT COALESCE(MAX(position), 0)`
// without a LIMIT (src/worker/read-history.ts), and the read port refuses it with
// `read_port_violation`. The same two cases fail the same way when the suite drives the SQL port
// directly. A pinned case turns red when the defect is fixed, so this pin is removed then.
// @module-tag slow
// Why slow: real sqlite-provider Workers and real files in a temporary directory.
import { afterEach, describe, expect, it } from 'vitest'
import {
  operationId,
  ordinaryInput,
  sessionTransactionsConformance,
  shapeOf,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { facadeFixture } from './fixtures/facade.ts'
import { harness, type Harness } from './fixtures/harness.ts'
import { sqlBackend } from './fixtures/sql.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(): Promise<Harness> {
  const h = await harness({ backend: sqlBackend })
  open.push(h)
  return h
}

/** The cases that read history, refused by the read port of the real provider (see the header). */
const HISTORY_DEFECT = new Set(['J40', 'SL10'])

describe('session-contract transaction conformance through the faces, on the real SQL pair', () => {
  for (const test of sessionTransactionsConformance<string>())
    it(`${test.clause}: ${test.name}`, async () => {
      const run = test.run(facadeFixture(await service()))
      if (!HISTORY_DEFECT.has(test.clause)) return run
      await expect(run).rejects.toThrow('read session.history: read_failed')
    })
})

describe('the decision and the tenant on the real SQL pair', () => {
  it('each face operation takes one decision, and a session that does not exist answers denied after one lookup', async () => {
    const h = await service()
    const before = h.checks.count()
    await h.create()
    await h.accept('one')
    succeeded(await h.faces('coordinator').work.readWork(h.access()), 'readWork')
    expect(h.checks.count() - before).toBe(3)
    h.view.reset()
    const absent = await h.faces('intake').work.accept({
      ...h.access('never-created'),
      operation: operationId('accept-x'),
      value: ordinaryInput('x'),
    })
    expect(absent).toEqual({ failure: { kind: 'denied', action: 'accept' } })
    expect(h.view.calls().map(call => call.method)).toEqual(['queryOperation'])
  })

  it('a principal of tenant B is denied on session-1 of tenant A, the same as a session that never was', async () => {
    const h = await service()
    await h.create()
    const read = await h.faces('coordinator').work.readWork(h.other())
    const never = await h.faces('coordinator').work.readWork(h.access('never-created'))
    expect(read).toEqual({ failure: { kind: 'denied', action: 'readWork' } })
    expect(shapeOf(read)).toBe(shapeOf(never))
    const named = await h
      .faces('coordinator')
      .work.readWork({ ...h.access(), principal: 'b:stranger' })
    expect(named).toEqual({ failure: { kind: 'denied', action: 'readWork' } })
  })
})
