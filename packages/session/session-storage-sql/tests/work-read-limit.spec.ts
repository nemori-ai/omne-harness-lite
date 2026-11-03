// The read bound of the Session snapshot (session SPEC 已知限制 SN-1): `session.work` hands the whole
// stored snapshot out, and its handler has the fixed output limit of 1 MiB (`materials.ts`). A
// snapshot past it is not read: the real provider answers `read_limit`, and `readWork` answers a
// prompt `unavailable` that names it, never a hang and never a part of the snapshot. In the C-JOINT
// world the snapshot of one session passes 1 MiB at about round 169 of the plain shape; here the
// stored row is made that large directly: the longest text member of the stored snapshot is
// lengthened, so the snapshot keeps its shape. The row is written into the closed domain file, as
// the system reads do; this verifies the read path only.
// @module-tag slow
// Why slow: real Workers and real files; every case opens the provider twice.
import { realpath, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openRealApp, TENANT_A, textOf, type RealApp } from './fixtures/real-provider.ts'

const LIMIT = 1 << 20
const roots: string[] = []
const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** The path of the longest text of `value` that is not a member of a codec mark (`$…`). */
function longestText(value: Json, path: (string | number)[] = []): (string | number)[] | null {
  let best: { path: (string | number)[]; length: number } | null = null
  const visit = (node: Json, at: (string | number)[]) => {
    if (typeof node === 'string') {
      if (best === null || node.length > best.length) best = { path: at, length: node.length }
      return
    }
    if (Array.isArray(node)) node.forEach((item, index) => visit(item, [...at, index]))
    else if (node !== null && typeof node === 'object')
      for (const [key, item] of Object.entries(node))
        if (!key.startsWith('$')) visit(item, [...at, key])
  }
  visit(value, path)
  return (best as { path: (string | number)[] } | null)?.path ?? null
}

/** A session whose stored snapshot is about `bytes` long, read through a reopened provider. */
async function sessionOfSize(bytes: number) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'session-work-limit-')))
  roots.push(root)
  const first = await openRealApp({ root })
  expect(await first.create(TENANT_A)).toHaveProperty('ok')
  await first.close()
  const db = new DatabaseSync(first.domainFile(first.domainOf(TENANT_A)))
  let padded = 0
  try {
    const where = 'WHERE tenant = ? AND session = ?'
    const row = db
      .prepare(`SELECT snapshot FROM sl_state ${where}`)
      .get(textOf(TENANT_A), 'session-1') as {
      snapshot: string
    }
    const snapshot = JSON.parse(row.snapshot) as Json
    const path = longestText(snapshot)
    if (path === null) throw new Error('the snapshot has no text')
    let parent = snapshot as Record<string | number, Json>
    for (const step of path.slice(0, -1)) parent = parent[step] as Record<string | number, Json>
    const key = path.at(-1)!
    padded = Math.max(0, bytes - row.snapshot.length)
    parent[key] = `${parent[key] as string}${'p'.repeat(padded)}`
    db.prepare(`UPDATE sl_state SET snapshot = ? ${where}`).run(
      JSON.stringify(snapshot),
      textOf(TENANT_A),
      'session-1',
    )
  } finally {
    db.close()
  }
  const app = await openRealApp({ root })
  apps.push(app)
  const read = () =>
    app.storage.read({
      domain: {
        scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
        transactionDomain: app.domainOf(TENANT_A),
      },
      handler: 'session.work',
      protocol: '1',
      requestKey: `work-${bytes}`,
      input: { tenant: textOf(TENANT_A), session: 'session-1' },
    })
  return { app, read, padded }
}

describe('the read bound of the Session snapshot', () => {
  it('a snapshot past 1 MiB answers read_limit, and readWork answers unavailable naming it, promptly', async () => {
    const { app, read } = await sessionOfSize(LIMIT + 64 * 1024)
    const started = Date.now()
    expect(await read()).toMatchObject({ kind: 'unavailable', reason: 'read_limit' })
    const answer = await app.port.readWork(app.access(TENANT_A))
    expect(answer).toEqual({
      failure: expect.objectContaining({
        kind: 'unavailable',
        diagnostic: expect.stringContaining('read_limit'),
      }),
    })
    // An explicit answer, not a wait: both reads came back well inside the slow tier's time.
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('control: the same session with a snapshot below the bound reads whole', async () => {
    const { app, read, padded } = await sessionOfSize(LIMIT - 128 * 1024)
    expect(padded).toBeGreaterThan(0)
    expect(await read()).toMatchObject({ kind: 'read' })
    const answer = await app.port.readWork(app.access(TENANT_A))
    expect(answer).toHaveProperty('ok')
    expect(JSON.stringify(answer).length).toBeGreaterThan(LIMIT - 256 * 1024)
  })
})
