// The session list face (contract「会话列表」): it admits the reader class only, asks the access check
// once at the public port, and answers unavailable when the port offers no directory.
import { afterEach, describe, expect, it } from 'vitest'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'
import { sqlBackend } from './fixtures/sql.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const listOf = (h: Harness, caller: Parameters<Harness['faces']>[0]) =>
  h.faces(caller).directory.list({
    principal: 'a:tester',
    tenant: h.access().tenant,
    after: null,
    limit: 10,
    includeArchived: false,
  })

describe('directory.list', () => {
  it('lists the sessions of the tenant through the public port, one access decision, no view', async () => {
    const h = await harness({ backend: sqlBackend })
    open.push(h)
    await h.create()
    h.view.reset()
    const before = h.checks.count()
    const page = await listOf(h, 'reader')
    expect(page).toMatchObject({
      ok: { items: [{ session: 'session-1', lifecycle: 'dormant' }], next: null },
    })
    expect(h.checks.count() - before).toBe(1)
    expect(h.view.calls()).toEqual([])
  })

  it('refuses a caller class other than the reader before any decision', async () => {
    const h = await harness({ backend: sqlBackend })
    open.push(h)
    const before = h.checks.count()
    for (const caller of ['intake', 'coordinator', 'maintainer'] as const)
      expect(await listOf(h, caller)).toEqual({
        failure: { kind: 'denied', action: 'directory.list' },
      })
    expect(h.checks.count()).toBe(before)
  })

  it('answers unavailable when the transaction port offers no directory', async () => {
    const h = await harness({ backend: memoryBackend })
    open.push(h)
    expect(await listOf(h, 'reader')).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'sessionTransactions',
        diagnostic: 'the transaction port offers no directory',
      },
    })
  })
})
