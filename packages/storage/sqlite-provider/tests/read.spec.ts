// read, snapshot ordering and the read port (SQL contract SPEC 9.2 to 9.4). Scenario C09 and the
// read side of C15. Every case runs a real handler module on a real read connection.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildReadMaterials,
  closeProviders,
  commitOf,
  delay,
  readRequest,
  readyProvider,
  summary,
} from './read-support.ts'
import { DOMAIN, makeWorkspace, type Built, type Workspace } from './support.ts'

let workspace: Workspace
let built: Built

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace, {
    rows: { maxRowsRead: 3 },
    bigout: { maxOutputBytes: 100 },
    swallow: { maxRowsRead: 2 },
  })
})

afterEach(async () => {
  await closeProviders()
  await workspace.remove()
})

describe('snapshot read (C09)', () => {
  it('returns the output of the handler', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 2)
    const request = readRequest('page')
    const result = await storage.read(request)
    expect(result).toEqual({
      kind: 'read',
      requestKey: request.requestKey,
      output: { a: '2', b: '2' },
    })
  })

  it('shows a commit that returned committed to the next read', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    expect((await storage.commit(commitOf(built, 'later'))).kind).toBe('committed')
    const result = await storage.read(readRequest('page'))
    expect(result).toMatchObject({ kind: 'read', output: { a: '2', b: '2' } })
  })

  it('gives both SELECT statements of one read the same state while a commit lands between them', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const reading = storage.read(readRequest('page', { sleepMs: 600 }))
    await delay(250)
    expect((await storage.commit(commitOf(built, 'between'))).kind).toBe('committed')
    expect(await reading).toMatchObject({ kind: 'read', output: { a: '1', b: '1' } })
    expect(await storage.read(readRequest('page'))).toMatchObject({ output: { a: '2', b: '2' } })
  })

  it('does not create a database file for an absent domain', async () => {
    const { storage } = await readyProvider(workspace, built)
    const other = {
      scope: { kind: 'tenant' as const, tenant: 'tenant-a' },
      transactionDomain: 'domain-none',
    }
    const result = await storage.read({ ...readRequest('page'), domain: other })
    expect(summary(result)).toBe('unavailable/domain_unavailable')
    const hex = Buffer.from('domain-none').toString('hex')
    expect(existsSync(join(workspace.storageRoot, 'domains', `${hex}.sqlite`))).toBe(false)
  })

  it('treats a domain of another scope like an absent one', async () => {
    const { storage } = await readyProvider(workspace, built)
    const result = await storage.read({
      ...readRequest('page'),
      domain: { scope: { kind: 'tenant', tenant: 'tenant-b' }, transactionDomain: DOMAIN },
    })
    expect(summary(result)).toBe('unavailable/domain_unavailable')
  })
})

describe('limits and handler failures (C15, SPEC 9.2 steps 4 to 13)', () => {
  it('returns read_limit when the rows read exceed maxRowsRead, and no output', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 5)
    const result = await storage.read(readRequest('rows', { limit: 5 }))
    expect(summary(result)).toBe('unavailable/read_limit')
    expect(result).not.toHaveProperty('output')
    expect(summary(await storage.read(readRequest('rows', { limit: 3 })))).toBe('read')
  })

  it('keeps read_limit even when the handler swallows the error', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 5)
    expect(summary(await storage.read(readRequest('swallow')))).toBe('unavailable/read_limit')
  })

  it('returns read_limit when the output is larger than maxOutputBytes', async () => {
    const { storage } = await readyProvider(workspace, built)
    expect(summary(await storage.read(readRequest('bigout', { n: 500 })))).toBe(
      'unavailable/read_limit',
    )
    expect(summary(await storage.read(readRequest('bigout', { n: 10 })))).toBe('read')
  })

  it('returns read_limit for an input above maxReadInputBytes', async () => {
    const { storage } = await readyProvider(workspace, built, { maxReadInputBytes: 64 })
    const result = await storage.read(readRequest('page', { pad: 'x'.repeat(200) }))
    expect(summary(result)).toBe('unavailable/read_limit')
  })

  it('returns read_limit for an input that nests deeper than maxJsonDepth', async () => {
    const { storage } = await readyProvider(workspace, built, { maxJsonDepth: 4 })
    const result = await storage.read(readRequest('page', { a: { b: { c: { d: { e: 1 } } } } }))
    expect(summary(result)).toBe('unavailable/read_limit')
  })

  it('returns read_failed when the handler returns failed', async () => {
    const { storage } = await readyProvider(workspace, built)
    expect(summary(await storage.read(readRequest('fail')))).toBe('unavailable/read_failed')
  })

  it('returns read_failed when the output is not JSON', async () => {
    const { storage } = await readyProvider(workspace, built)
    expect(summary(await storage.read(readRequest('notjson')))).toBe('unavailable/read_failed')
  })

  it('returns read_failed for a statement without LIMIT', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    expect(summary(await storage.read(readRequest('nolimit')))).toBe('unavailable/read_failed')
  })

  it('returns handler_unavailable for a handler that the catalog lacks', async () => {
    const { storage } = await readyProvider(workspace, built)
    expect(summary(await storage.read(readRequest('nope')))).toBe('unavailable/handler_unavailable')
  })

  it('returns handler_unavailable when the handler may return more than maxReadResultBytes', async () => {
    const { storage } = await readyProvider(workspace, built, {
      maxReadResultBytes: 64,
      globalReadResultBytes: 64,
    })
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/handler_unavailable')
  })

  it('returns schema_unavailable when a required migration marker is missing', async () => {
    const { storage } = await readyProvider(workspace, built)
    expect(summary(await storage.read(readRequest('ghost')))).toBe('unavailable/schema_unavailable')
  })

  it('returns invalid for a request that does not decode', async () => {
    const { storage } = await readyProvider(workspace, built)
    const result = await storage.read({ ...readRequest('page'), requestKey: '' })
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'invalid', requestKey: null })
  })

  it('returns cancelled when the signal is already aborted', async () => {
    const { storage } = await readyProvider(workspace, built)
    const result = await storage.read(readRequest('page'), { signal: AbortSignal.abort() })
    expect(result.kind).toBe('cancelled')
  })

  it('returns queue_full when the result reservation of the handler does not fit', async () => {
    const { storage } = await readyProvider(workspace, built, {
      maxReadResultBytes: 4096,
      globalReadResultBytes: 4096,
    })
    const first = storage.read(readRequest('slow', { ms: 300 }))
    await delay(50)
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_full')
    expect(summary(await first)).toBe('read')
  })

  it('returns queue_full when the read queue of the domain is full', async () => {
    const { storage } = await readyProvider(workspace, built, {
      readQueuePerDomain: 2,
      readQueueGlobal: 4,
      maxReadWorkersPerDomain: 1,
    })
    const held = [
      storage.read(readRequest('slow', { ms: 300 })),
      storage.read(readRequest('slow', { ms: 10 })),
    ]
    await delay(50)
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_full')
    expect((await Promise.all(held)).map(summary)).toEqual(['read', 'read'])
  })
})

describe('the read connection (C11)', () => {
  it('refuses a write from a handler and leaves the data unchanged', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    expect(summary(await storage.read(readRequest('writer')))).toBe('unavailable/read_failed')
    expect(await storage.read(readRequest('page'))).toMatchObject({ output: { a: '1' } })
    const db = new DatabaseSync(
      join(workspace.storageRoot, 'domains', `${Buffer.from(DOMAIN).toString('hex')}.sqlite`),
      { readOnly: true },
    )
    expect(db.prepare('select count(*) as n from t_ledger').get()).toEqual({ n: 1 })
    db.close()
  })

  it('refuses a read of a provider table', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    expect(summary(await storage.read(readRequest('foreign')))).toBe('unavailable/read_failed')
  })
})
