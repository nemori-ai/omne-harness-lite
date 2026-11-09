// @module-tag slow
// TS-06 on the real SQLite provider: body chunks and the manifest are not ledger records and live
// in no ledger domain, so writing and sealing a body moves no ledger domain revision. A ledger
// commit that expects the revisions read before the body writes still lands.
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { LedgerDomain, ToolLedgerStore } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  decodeToolInstanceId,
  decodeToolInstant,
  decodeToolRevision,
  signBodyPermit,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolBodyStore } from '@omne-harness/tool-storage-sql'
import { TENANT_A } from './fixtures/app.ts'
import { ok } from './fixtures/settled-offloaded.ts'
import { openStorage } from './windows-composition/storage.ts'

function domainRevisions(root: string): unknown[] {
  const file = join(root, 'domains', `${Buffer.from('windows-tool-0').toString('hex')}.sqlite`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare('SELECT kind, name, revision FROM tl_domain ORDER BY kind, name').all()
  } finally {
    db.close()
  }
}

async function revisionOf(store: ToolLedgerStore, domain: LedgerDomain) {
  const read = await store.read(domain)
  if (read.kind !== 'complete') throw new Error(JSON.stringify(read))
  return read.revision
}

async function putHost(store: ToolLedgerStore, domain: LedgerDomain, key: string) {
  const expected = await revisionOf(store, domain)
  const revision = ok(decodeToolRevision(String(BigInt(expected) + 1n)))
  return store.commit({
    domain,
    expected,
    revision,
    writes: [{ kind: 'put', record: { kind: 'host', host: { key, value: key } } }],
  })
}

it('writing and sealing a body moves no ledger domain revision (TS-06)', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-body-revision-')))
  try {
    const opened = await openStorage(root, [TENANT_A])
    try {
      const call = ok(decodeToolCallId('ts06-call'))
      const callDomain: LedgerDomain = { kind: 'call', tenant: TENANT_A, call }
      const hostDomain: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'delivery@ts06-call' }
      expect(await putHost(opened.store, callDomain, 'before')).toMatchObject({ kind: 'committed' })
      expect(await putHost(opened.store, hostDomain, 'before')).toMatchObject({ kind: 'committed' })
      const before = domainRevisions(root)
      const revisions = [
        await revisionOf(opened.store, callDomain),
        await revisionOf(opened.store, hostDomain),
      ]
      expect(before).toHaveLength(2)

      const now = ok(decodeToolInstant('2026-11-10T00:00:00.000Z'))
      const permitKey = { secret: randomBytes(32) }
      const bodies = createSqlToolBodyStore({
        storage: opened.storage,
        domains: opened.domains,
        combination: opened.combination,
        permitKey,
        clock: { now: () => now },
      })
      const permit = signBodyPermit(permitKey, {
        tenant: TENANT_A,
        call,
        body: ok(decodeToolBodyId('ts06-body')),
        instance: ok(decodeToolInstanceId('ts06-instance')),
        generation: '1',
        deadline: ok(decodeToolInstant('2026-11-10T00:01:00.000Z')),
      })
      const chunks = [randomBytes(4096), randomBytes(4096), randomBytes(17)]
      for (const [seq, bytes] of chunks.entries())
        expect(await bodies.put(permit, seq, bytes)).toEqual({ kind: 'kept' })
      const whole = Buffer.concat(chunks)
      expect(
        await bodies.seal(permit, {
          chunks: chunks.length,
          bytes: whole.byteLength,
          digest: createHash('sha256').update(whole).digest('hex'),
        }),
      ).toEqual({ kind: 'sealed' })
      expect(await bodies.read(permit.claims, { first: 0, count: 3 })).toMatchObject({
        kind: 'found',
        manifest: { chunks: 3, bytes: whole.byteLength },
      })

      expect(domainRevisions(root)).toEqual(before)
      expect([
        await revisionOf(opened.store, callDomain),
        await revisionOf(opened.store, hostDomain),
      ]).toEqual(revisions)
      expect(await putHost(opened.store, callDomain, 'after')).toMatchObject({ kind: 'committed' })
    } finally {
      await opened.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
