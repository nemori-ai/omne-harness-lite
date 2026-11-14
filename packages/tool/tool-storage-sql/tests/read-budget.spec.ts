import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LEDGER_READ_HANDLER, PROTOCOL } from '../src/worker/schema.ts'
import { openStorage } from './windows-composition/storage.ts'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'

const TENANT = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'7'.repeat(26)}`)

const TWO_READS = 8_388_608

const opened: { close(): Promise<unknown> }[] = []
const roots: string[] = []

afterEach(async () => {
  for (const item of opened.splice(0)) await item.close().catch(() => undefined)
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function budgeted(globalReadResultBytes: number) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-read-budget-')))
  roots.push(root)
  const storage = await openStorage(root, [TENANT], { globalReadResultBytes })
  opened.push({ close: storage.close })
  const encoded = tenantCodec.encode(TENANT)
  if (!encoded.ok) throw new Error('not a minted tenant')
  const domain = await storage.domains.lookup({ tenant: encoded.value })
  if (domain.kind !== 'ready') throw new Error('the tenant is not registered')
  let sequence = 0
  const read = (kind: 'host' | 'call' | 'queue' = 'host') =>
    storage.storage.read({
      domain: domain.domain,
      handler: LEDGER_READ_HANDLER,
      protocol: PROTOCOL,
      requestKey: `read-budget-${String(++sequence)}`,
      input: { tenant: encoded.value, kind, name: 'budget' },
    })
  return { read }
}

describe('the global read budget (sql-contract 准入等待, replacing R2-D115)', () => {
  it('a read that finds the reserved bytes full waits for room and reads', async () => {
    const { read } = await budgeted(TWO_READS)
    const settled = await Promise.all([read(), read(), read()])
    expect(settled.map(item => item.kind)).toEqual(['read', 'read', 'read'])
  })

  it('with room for one read, a burst of four reads one after another', async () => {
    const { read } = await budgeted(4_194_304)
    const settled = await Promise.all([read(), read(), read(), read()])
    expect(settled.map(item => item.kind)).toEqual(['read', 'read', 'read', 'read'])
  })
})
