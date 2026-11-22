// @module-tag slow
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openRealApp, TENANT_A, type RealApp } from './fixtures/real-provider.ts'

const opened: RealApp[] = []
afterEach(async () => {
  for (const app of opened.splice(0)) await app.dispose()
})

describe('a basis past the response bound of the provider', () => {
  it('the commit still commits, and no receipt is kept for it', async () => {
    const a = await openRealApp()
    opened.push(a)
    expect(a.storageRoot).toBeTruthy()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    for (let n = 0; n < 40; n += 1) {
      const name = `input-${String(n)}`
      const accepted = await a.accept(TENANT_A, 'session-1', name, `${name}-${'x'.repeat(2000)}`)
      expect(accepted, JSON.stringify(accepted)).toHaveProperty('ok')
    }
    expect(await a.port.readWork(a.access(TENANT_A))).toHaveProperty('ok')
    expect(await a.accept(TENANT_A, 'session-1', 'input-last')).toHaveProperty('ok')
    const db = new DatabaseSync(a.domainFile(a.domainOf(TENANT_A)), { readOnly: true })
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM _sql_receipt').get()).toEqual({ n: 0 })
    } finally {
      db.close()
    }
  })
})
