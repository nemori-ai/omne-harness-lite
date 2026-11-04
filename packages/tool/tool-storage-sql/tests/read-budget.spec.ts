// R2-D115 at the storage layer (R2-D122 §3, R2-D123 §2): when the bytes already reserved by
// in-flight reads leave no room for one more, the caller receives a visible `unavailable` with
// reason `queue_full`, and nothing starts.
//
// The budget here is set so that ONE more read cannot fit after a known number of reads, rather
// than raced with many concurrent calls: `ReaderPool.read` reserves at its entry
// (sqlite-provider/src/reader-pool.ts:166) before any queueing, so three reads issued without
// awaiting already hold their reservations when the third asks. Every read reserves the handler's
// full `maxOutputBytes` (4 MiB here), so a 8 MiB budget fits exactly two.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LEDGER_READ_HANDLER, PROTOCOL } from '../src/worker/schema.ts'
import { openStorage } from './windows-composition/storage.ts'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'

const TENANT = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'7'.repeat(26)}`)

/** Two reads fit: 4 MiB each into an 8 MiB budget. */
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

describe('the global read budget (R2-D115)', () => {
  it('answers unavailable/queue_full when the reserved bytes leave no room, and starts nothing', async () => {
    const { read } = await budgeted(TWO_READS)
    // Three reads issued before any settles: the first two hold 4 MiB each, the third has no room.
    const first = read()
    const second = read()
    const third = await read()
    expect(third).toMatchObject({ kind: 'unavailable', reason: 'queue_full' })
    expect(third).toHaveProperty('requestKey')
    // The two that did fit still answer normally, so the refusal is the budget and not a broken read.
    for (const settled of [await first, await second]) expect(settled.kind).toBe('read')
  })

  it('admits a read again once the in-flight reservations end', async () => {
    const { read } = await budgeted(TWO_READS)
    const first = read()
    const second = read()
    expect((await read()).kind).toBe('unavailable')
    const settled = await Promise.all([first, second])
    for (const item of settled) expect(item.kind).toBe('read')
    // The reservations were released with the earlier reads: the same call now succeeds.
    expect((await read()).kind).toBe('read')
  })

  it('with room for one read, the second call is refused rather than queued indefinitely', async () => {
    const { read } = await budgeted(4_194_304)
    const first = read()
    const second = await read()
    expect(second).toMatchObject({ kind: 'unavailable', reason: 'queue_full' })
    expect((await first).kind).toBe('read')
  })
})
