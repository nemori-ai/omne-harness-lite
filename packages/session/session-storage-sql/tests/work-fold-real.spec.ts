// The bound of the work reply on the real sqlite-provider (SPEC RT-04, C-TOPOLOGY §2.9 F-6, F-7).
// The provider records every participant response in its receipt and fails a response over
// `maxResponseBytes` (65536 here, the initial value of its SPEC), which rolls the commit back. The
// participant leaves the input range and focus of its decision out of its reply over 16 KiB, so a
// session whose pending inputs pass 64 KiB still commits, and its receipt stays small.
// @module-tag slow
// Why slow: real Workers and real files.
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { WORK_BASIS_BYTES } from '../src/worker/participant.ts'
import { openRealApp, TENANT_A, type RealApp } from './fixtures/real-provider.ts'

const opened: RealApp[] = []
afterEach(async () => {
  for (const app of opened.splice(0)) await app.dispose()
})

describe('T-F6: a basis past the response bound of the provider', () => {
  it('the commit still commits, and its receipt holds no basis', async () => {
    const a = await openRealApp()
    opened.push(a)
    expect(a.storageRoot).toBeTruthy()
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    // Forty pending inputs with long names: the input range of the decision passes 64 KiB.
    for (let n = 0; n < 40; n += 1) {
      const name = `input-${String(n)}`
      const accepted = await a.accept(TENANT_A, 'session-1', name, `${name}-${'x'.repeat(2000)}`)
      expect(accepted, JSON.stringify(accepted)).toHaveProperty('ok')
    }
    expect(await a.port.readWork(a.access(TENANT_A))).toHaveProperty('ok')
    expect(await a.accept(TENANT_A, 'session-1', 'input-last')).toHaveProperty('ok')
    const db = new DatabaseSync(a.domainFile(a.domainOf(TENANT_A)), { readOnly: true })
    try {
      const row = db.prepare('SELECT MAX(LENGTH(receipt)) AS n FROM _sql_receipt').get() as {
        n: number
      }
      expect(row.n).toBeLessThan(WORK_BASIS_BYTES + 16 * 1024)
    } finally {
      db.close()
    }
  })
})
