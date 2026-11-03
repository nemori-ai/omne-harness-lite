// The work cache of `readWork` (SPEC RT-04). The store stays the authority: every read first reads
// the version of the session (`session.work-version`: the Session tail and the Agent publication
// count, two primary-key point reads), and a cached snapshot is answered only
// when that version equals the version it was read at. Each case counts the handler reads the port
// sent, so a cache that answers without the check, keys without the tenant, ignores the Agent
// publications, keeps more than its bounds or reads the whole snapshot on every call turns red.
import { readAccessRequest, type WorkSnapshot } from '@omne-harness/session-contract'
import {
  evidence,
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { describe, expect, it } from 'vitest'
import { createSessionStorage } from '../src/index.ts'
import { workKey } from '../src/work-cache.ts'
import readWorkVersion from '../src/worker/read-work-version.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { activeRun, agentPublisher, startRun } from './fixtures/real-provider.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

type Answer = Awaited<ReturnType<App['port']['readWork']>>

function okOf(answer: Answer): WorkSnapshot {
  if ('failure' in answer) throw new Error(`readWork failed: ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const WHOLE = 'session.work'
const VERSION = 'session.work-version'

/** The reads of `handler` the storage served since `from` (an index into the call log). */
function readsOf(a: App, handler: string, from = 0): number {
  return a.provider.calls
    .slice(from)
    .filter(call => call.kind === 'read' && call.handler === handler).length
}

/** Another port instance over the same database: a storage object of its own, so a cache of its own. */
function otherInstance(a: App) {
  const storage: SqlStorage = {
    registerCombination: input => a.provider.storage.registerCombination(input),
    commit: request => a.provider.storage.commit(request),
    query: identity => a.provider.storage.query(identity),
    read: request => a.provider.storage.read(request),
  } as SqlStorage
  return createSessionStorage<string>({ ...a.storageOptions, storage })
}

/** `accept` of tenant A's session-1 through `port`, as the fixture's own `accept` sends it. */
const accept = (a: App, port: App['port'], name: string) =>
  port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'accept',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId(`accept-${name}`),
        value: ordinaryInput(name),
      },
    },
    guards: [guard('login', 'login-entry', 'present')],
  })

describe('T-1: readWork at one version', () => {
  it('reads the whole snapshot once and the version on every read', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const from = a.provider.calls.length
    const first = okOf(await a.port.readWork(a.access(TENANT_A)))
    const reads = 10
    for (let read = 1; read < reads; read += 1)
      expect(okOf(await a.port.readWork(a.access(TENANT_A)))).toEqual(first)
    expect([readsOf(a, WHOLE, from), readsOf(a, VERSION, from)]).toEqual([1, reads])
  })

  it('a delegated view of the port reads through the same cache', async () => {
    const a = await app()
    await a.create(TENANT_A)
    okOf(await a.pair.transactions.readWork(a.access(TENANT_A)))
    const from = a.provider.calls.length
    const view = a.pair.delegated.bind({
      request: readAccessRequest(a.access(TENANT_A), 'readWork'),
      evidence: evidence('access/face/readWork'),
    })
    okOf(await view.readWork(a.access(TENANT_A)))
    expect([readsOf(a, WHOLE, from), readsOf(a, VERSION, from)]).toEqual([0, 1])
  })
})

describe('T-2: readWork after a commit', () => {
  it('a commit of this port: the next read is whole and gives the new revision', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const before = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(await a.accept(TENANT_A, 'session-1', 'i-1')).toHaveProperty('ok')
    const from = a.provider.calls.length
    const after = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(after.revision).not.toBe(before.revision)
    expect(after.pending.length).toBe(before.pending.length + 1)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })

  it('a commit of another port instance on the same database: found by the version, read again', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const before = okOf(await a.port.readWork(a.access(TENANT_A)))
    const other = otherInstance(a)
    expect(await accept(a, other, 'i-1')).toHaveProperty('ok')
    const after = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(after.revision).not.toBe(before.revision)
    expect(after).toEqual(okOf(await other.readWork(a.access(TENANT_A))))
  })
})

describe('T-3: an Agent publication at the same Session tail', () => {
  it('the history index of the next read shows the published row', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    await a.create(TENANT_A)
    expect(await a.accept(TENANT_A, 'session-1', 'input-1')).toHaveProperty('ok')
    expect(await startRun(a, 'start-run-1')).toHaveProperty('ok')
    const run = activeRun(okOf(await a.port.readWork(a.access(TENANT_A))))
    expect(await a.accept(TENANT_A, 'session-1', 'input-2')).toHaveProperty('ok')
    const members = (work: WorkSnapshot) =>
      work.historyIndex?.inputs.find(item => item.input === 'input-2')?.members ?? []
    const before = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(members(before)).toEqual([])
    await agent.admit({
      tenant: TENANT_A,
      session: 'session-1',
      execution: run.execution,
      input: 'input-2',
      operation: 'aop-submit-2',
      accepted: evidence('agent/accepted/2'),
      grant: evidence('agent/receipt/2'),
      attachment: 'attachment-1',
      attempt: run.attempt,
    })
    const after = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(after.revision).toBe(before.revision)
    expect(members(after).map(item => item.attempt)).toEqual([run.attempt])
  })
})

describe('T-4: two tenants with the same session name', () => {
  it('each tenant reads its own snapshot, before and after a write of the other', async () => {
    const a = await app()
    await a.create(TENANT_A)
    await a.create(TENANT_B)
    const ownA = okOf(await a.port.readWork(a.access(TENANT_A)))
    const ownB = okOf(await a.port.readWork(a.access(TENANT_B)))
    expect(tenantEquals(ownA.tenant, TENANT_A)).toBe(true)
    expect(tenantEquals(ownB.tenant, TENANT_B)).toBe(true)
    expect(await a.accept(TENANT_B, 'session-1', 'i-1')).toHaveProperty('ok')
    expect(okOf(await a.port.readWork(a.access(TENANT_A)))).toEqual(ownA)
    const againB = okOf(await a.port.readWork(a.access(TENANT_B)))
    expect(tenantEquals(againB.tenant, TENANT_B)).toBe(true)
    expect(againB.pending.length).toBe(ownB.pending.length + 1)
  })

  it('the key names the tenant: one domain, one session name, two tenants, two keys', () => {
    expect(workKey('dom_0', textOf(TENANT_A), 'session-1')).not.toBe(
      workKey('dom_0', textOf(TENANT_B), 'session-1'),
    )
  })
})

describe('T-5: reads and commits of one process interleaved', () => {
  it('no answer is older than the commits that ended before it began, nor newer than the store', async () => {
    const a = await app()
    await a.create(TENANT_A)
    let committed: string = okOf(await a.port.readWork(a.access(TENANT_A))).revision
    const checks: Promise<void>[] = []
    for (let step = 0; step < 10; step += 1) {
      const floor = committed
      checks.push(
        a.port.readWork(a.access(TENANT_A)).then(answer => {
          expect(BigInt(okOf(answer).revision)).toBeGreaterThanOrEqual(BigInt(floor))
        }),
      )
      if (step % 3 === 1)
        checks.push(
          a.accept(TENANT_A, 'session-1', `i-${String(step)}`).then(answer => {
            if (!('ok' in answer)) throw new Error('accept failed')
            const revision = String(answer.ok.revision)
            if (BigInt(revision) > BigInt(committed)) committed = revision
          }),
        )
    }
    await Promise.all(checks)
    const last = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(String(last.revision)).toBe(committed)
  })
})

describe('T-6: the bounds of the cache', () => {
  const read = async (a: App, session: string) => {
    const from = a.provider.calls.length
    okOf(await a.port.readWork(a.access(TENANT_A, session)))
    return readsOf(a, WHOLE, from) === 1 ? 'whole' : 'cached'
  }

  it('over the session bound the least recently used session goes, and is read whole again', async () => {
    const a = await app({ workCache: { sessions: 2 } })
    for (const session of ['s-1', 's-2', 's-3']) await a.create(TENANT_A, session)
    expect(await read(a, 's-1')).toBe('whole')
    expect(await read(a, 's-2')).toBe('whole')
    // s-1 is used again, so s-2 is now the least recently used session.
    expect(await read(a, 's-1')).toBe('cached')
    expect(await read(a, 's-3')).toBe('whole')
    expect(await read(a, 's-1')).toBe('cached')
    expect(await read(a, 's-2')).toBe('whole')
  })

  it('a session bound of 1: two sessions read in turn are read whole every time', async () => {
    const a = await app({ workCache: { sessions: 1 } })
    for (const session of ['s-1', 's-2']) await a.create(TENANT_A, session)
    for (const session of ['s-1', 's-2', 's-1', 's-2']) expect(await read(a, session)).toBe('whole')
  })

  it('a session bound of 0 keeps nothing', async () => {
    const a = await app({ workCache: { sessions: 0 } })
    await a.create(TENANT_A, 's-1')
    for (let step = 0; step < 3; step += 1) expect(await read(a, 's-1')).toBe('whole')
  })

  it('over the byte bound the least recently used session goes, and is read whole again', async () => {
    const probe = await app()
    await probe.create(TENANT_A, 's-1')
    const one = (
      probe.provider.select(
        'dom_0',
        'SELECT length(snapshot) AS n FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
        [textOf(TENANT_A), 's-1'],
      ).rows[0]?.[0] as bigint
    ).valueOf()
    // Room for one snapshot and a half: the second session pushes the first one out.
    const a = await app({ workCache: { bytes: Math.floor(Number(one) * 1.5) } })
    for (const session of ['s-1', 's-2']) await a.create(TENANT_A, session)
    expect(await read(a, 's-1')).toBe('whole')
    expect(await read(a, 's-1')).toBe('cached')
    expect(await read(a, 's-2')).toBe('whole')
    expect(await read(a, 's-2')).toBe('cached')
    expect(await read(a, 's-1')).toBe('whole')
  })

  it('a snapshot over the byte bound is not kept', async () => {
    const a = await app({ workCache: { bytes: 1 } })
    await a.create(TENANT_A, 's-1')
    for (let step = 0; step < 3; step += 1) expect(await read(a, 's-1')).toBe('whole')
  })
})

describe('T-7: a tail that moved backwards', () => {
  it('answers unavailable, drops the entry, and the next read is whole', async () => {
    const a = await app()
    await a.create(TENANT_A)
    expect(await a.accept(TENANT_A, 'session-1', 'i-1')).toHaveProperty('ok')
    okOf(await a.port.readWork(a.access(TENANT_A)))
    a.provider.seed(
      'dom_0',
      'UPDATE sl_journal SET tail = tail - 1 WHERE tenant = ? AND session = ?',
      [textOf(TENANT_A), 'session-1'],
    )
    a.provider.seed(
      'dom_0',
      'UPDATE sl_state SET covered = covered - 1 WHERE tenant = ? AND session = ?',
      [textOf(TENANT_A), 'session-1'],
    )
    const moved = await a.port.readWork(a.access(TENANT_A))
    expect('failure' in moved && moved.failure).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(moved)).toMatch(/backwards/)
    const from = a.provider.calls.length
    okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })
})

describe('a snapshot row behind the tail', () => {
  it('answers unavailable, never the cached snapshot of the earlier tail', async () => {
    const a = await app()
    await a.create(TENANT_A)
    okOf(await a.port.readWork(a.access(TENANT_A)))
    a.provider.seed(
      'dom_0',
      'UPDATE sl_journal SET tail = tail + 1 WHERE tenant = ? AND session = ?',
      [textOf(TENANT_A), 'session-1'],
    )
    const from = a.provider.calls.length
    const behind = await a.port.readWork(a.access(TENANT_A))
    expect('failure' in behind && behind.failure.kind).toBe('unavailable')
    expect(JSON.stringify(behind)).toMatch(/does not cover the tail/)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })
})

describe('T-8: the answer of a hit is frozen', () => {
  it('a reader that writes to it throws, and the next reader sees the snapshot unchanged', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const first = okOf(await a.port.readWork(a.access(TENANT_A)))
    const revision = first.revision
    expect(() => {
      ;(first as { revision: string }).revision = 'changed'
    }).toThrow(TypeError)
    expect(() => {
      ;(first.pending as unknown[]).push('changed')
    }).toThrow(TypeError)
    const again = okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(again.revision).toBe(revision)
    expect(again).toEqual(first)
  })
})

describe('T-10: the version is not known', () => {
  it('a failed version read: the whole snapshot is read and answered, the cache is not used', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const cached = okOf(await a.port.readWork(a.access(TENANT_A)))
    a.provider.failReads(VERSION)
    const from = a.provider.calls.length
    expect(okOf(await a.port.readWork(a.access(TENANT_A)))).toEqual(cached)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })

  it('a whole read that fails answers its failure, never the cached snapshot of an older version', async () => {
    const a = await app()
    await a.create(TENANT_A)
    okOf(await a.port.readWork(a.access(TENANT_A)))
    expect(await a.accept(TENANT_A, 'session-1', 'i-1')).toHaveProperty('ok')
    a.provider.failReads(WHOLE)
    const failed = await a.port.readWork(a.access(TENANT_A))
    expect('failure' in failed && failed.failure.kind).toBe('unavailable')
  })
})

describe('T-11: the key reads the position, never the content', () => {
  it('a snapshot row changed without its tail: this cache keeps the old answer, a new instance reads the row', async () => {
    const a = await app()
    await a.create(TENANT_A)
    const cached = okOf(await a.port.readWork(a.access(TENANT_A)))
    const row = a.provider.select(
      'dom_0',
      'SELECT snapshot FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
      [textOf(TENANT_A), 'session-1'],
    ).rows[0]?.[0] as string
    const changed = JSON.parse(row) as Record<string, unknown>
    changed['idleSince'] = 'changed-in-place'
    a.provider.seed('dom_0', 'UPDATE sl_state SET snapshot = ? WHERE tenant = ? AND session = ?', [
      JSON.stringify(changed),
      textOf(TENANT_A),
      'session-1',
    ])
    expect(okOf(await a.port.readWork(a.access(TENANT_A)))).toEqual(cached)
    const fresh = okOf(await otherInstance(a).readWork(a.access(TENANT_A)))
    expect((fresh as unknown as Record<string, unknown>)['idleSince']).toBe('changed-in-place')
  })
})

describe('the version read', () => {
  /** One session whose stored snapshot is `bytes` long, and the statements the handler ran on it. */
  function versionRead(bytes: number) {
    const { port } = migratedPort()
    const tenant = textOf(TENANT_A)
    port.execute(
      'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
      [tenant, 's', 7n, 7n, 'epoch:0'],
    )
    port.execute('INSERT INTO sl_state (tenant, session, snapshot, covered) VALUES (?, ?, ?, ?)', [
      tenant,
      's',
      JSON.stringify({ pad: 'p'.repeat(bytes) }),
      7n,
    ])
    port.execute('INSERT INTO er_root (tenant, session, published) VALUES (?, ?, ?)', [
      tenant,
      's',
      3n,
    ])
    const statements: { sql: string; rows: number; cells: number }[] = []
    const outcome = readWorkVersion.read({ tenant, session: 's' }, {
      execute: (sql: string, params: readonly SqlValue[]) => {
        const result = port.execute(sql, params)
        const cells = result.rows.flat().reduce<number>((n, cell) => n + String(cell).length, 0)
        statements.push({ sql, rows: result.rows.length, cells })
        return result
      },
    } as never)
    return { outcome, statements }
  }

  it('one statement, one row, and its rows and bytes do not grow with the snapshot', () => {
    const small = versionRead(10)
    const large = versionRead(1 << 20)
    expect(small.outcome).toEqual({
      kind: 'read',
      output: { kind: 'version', tail: '7', published: '3' },
    })
    expect(large.outcome).toEqual(small.outcome)
    expect(large.statements).toEqual(small.statements)
    expect(small.statements).toHaveLength(1)
    expect(small.statements[0]?.rows).toBe(1)
    expect(small.statements[0]?.sql).not.toMatch(/sl_state|snapshot|sl_entry/)
  })
})
