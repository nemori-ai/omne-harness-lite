// The Session storage over the real sqlite-provider: a real write Worker and read Worker pool, real
// files in a temporary directory, built only through the public entry of the provider. The
// node:sqlite double of the other specs of this member does not appear here.
// @module-tag slow
// Why slow: real Workers, real files, a killed child process and real waits.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  adoptedInitializationFixture,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionEntriesConformance,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import {
  identityOf,
  openRealApp,
  queryKindOf,
  TENANT_A,
  TENANT_B,
  walSample,
  type RealApp,
  type RealAppOptions,
} from './fixtures/real-provider.ts'

const apps: RealApp[] = []
const roots: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function open(options: RealAppOptions = {}): Promise<RealApp> {
  const app = await openRealApp(options)
  apps.push(app)
  return app
}

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}

const CREATE_OPERATION = 'sop_create-session-1'

describe('commit through the real write Worker', () => {
  it('a created session is committed, read back through the read Worker and recalled by its original receipt', async () => {
    const app = await open()
    const created = ok<{ receipt: { revision: string } }>(await app.create(TENANT_A))
    expect(created.receipt.revision).toBe('1')
    const work = ok<{ revision: string }>(await app.port.readWork(app.access(TENANT_A)))
    expect(work.revision).toBe('1')
    const accepted = ok<{ revision: string }>(await app.accept(TENANT_A, 'session-1', 'one'))
    expect(accepted.revision).toBe('2')
    const recalled = ok<{ kind: string }>(
      await app.port.queryOperation({
        ...app.access(TENANT_A),
        operation: operationId('create-session-1'),
      }),
    )
    expect(recalled.kind).toBe('committed')
    expect(
      queryKindOf(await app.storage.query(identityOf(TENANT_A, 'dom_0', CREATE_OPERATION))),
    ).toBe('committed')
  })
})

describe('the process is killed after the receipt came back', () => {
  it('a new provider on the same files answers committed for the original identity, and the original receipt', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'session-kill-')))
    roots.push(root)
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./fixtures/real-provider-child.ts', import.meta.url)), root],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    const line = await new Promise<string>((resolve, reject) => {
      let text = ''
      child.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString()
        if (text.includes('\n')) resolve(text.trim())
      })
      child.once('exit', () => reject(new Error(`child ended before the receipt: ${text}`)))
    })
    // The receipt of the write is back in the child. Only now is the child killed.
    expect(line).toBe('RECEIPT ok')
    child.kill('SIGKILL')
    await exited

    const app = await open({ root })
    expect(
      queryKindOf(await app.storage.query(identityOf(TENANT_A, 'dom_0', CREATE_OPERATION))),
    ).toBe('committed')
    const recalled = ok<{ kind: string }>(
      await app.port.queryOperation({
        ...app.access(TENANT_A),
        operation: operationId('create-session-1'),
      }),
    )
    expect(recalled.kind).toBe('committed')
    expect(ok<{ revision: string }>(await app.port.readWork(app.access(TENANT_A))).revision).toBe(
      '1',
    )
  })
})

describe('an identity that was never committed', () => {
  it('is not_committed with all five proofs in a ready domain, and queryOperation says unknown, not not-committed (R7)', async () => {
    const app = await open()
    ok(await app.create(TENANT_A))
    const asked = await app.storage.query(identityOf(TENANT_A, 'dom_0', 'sop_never'))
    expect(queryKindOf(asked)).toBe('not_committed')
    expect(asked).toMatchObject({
      proofs: {
        writerGenerationExcluded: true,
        oldTransactionTerminated: true,
        databaseRecoveryFinished: true,
        authoritativeReadSucceeded: true,
        operationNotQueued: true,
      },
    })
    const resolved = ok<{ kind: string }>(
      await app.port.queryOperation({ ...app.access(TENANT_A), operation: operationId('never') }),
    )
    expect(resolved.kind).toBe('unknown')
  })

  it('is unknown, not not_committed, when the domain is not one the provider serves', async () => {
    const app = await open()
    const asked = await app.storage.query(identityOf(TENANT_A, 'dom_missing', 'sop_never'))
    expect(queryKindOf(asked)).toBe('unknown')
  })
})

describe('close', () => {
  it('returns every lease, and later calls neither commit nor claim the operation was not committed', async () => {
    const app = await open()
    ok(await app.create(TENANT_A))
    const closed = await app.close()
    expect(closed.kind).toBe('closed')
    const admitted = app.events.filter(event => event.startsWith('admit:')).length
    const released = app.events.filter(event => event.startsWith('release:')).length
    expect(admitted).toBeGreaterThan(0)
    expect(released).toBe(admitted)

    const identity = identityOf(TENANT_A, 'dom_0', 'sop_accept-late')
    expect(queryKindOf(await app.storage.query(identity))).toBe('unknown')
    const late = failureOf(await app.accept(TENANT_A, 'session-1', 'late'))
    expect(['commit-unknown', 'unavailable']).toContain(late['kind'])
  })
})

describe('limits', () => {
  it('a command over maxCommandBytes is refused before it is accepted, and its identity is then not_committed', async () => {
    const app = await open({ config: { maxCommandBytes: 65536, maxRequestBytes: 131072 } })
    ok(await app.create(TENANT_A))
    const refused = failureOf(await app.accept(TENANT_A, 'session-1', 'big', 'x'.repeat(200_000)))
    expect(refused).toMatchObject({ kind: 'unavailable' })
    expect(String(refused['diagnostic'])).toContain('command_limit')
    expect(
      queryKindOf(await app.storage.query(identityOf(TENANT_A, 'dom_0', 'sop_accept-big'))),
    ).toBe('not_committed')
    expect(ok<{ revision: string }>(await app.port.readWork(app.access(TENANT_A))).revision).toBe(
      '1',
    )
  })

  it('a full admission queue refuses the surplus, and refused identities are not_committed while accepted ones are committed', async () => {
    const app = await open({ config: { admissionQueueLimit: 2, groupMaxOperations: 2 } })
    const names = Array.from({ length: 10 }, (_, index) => `burst-${String(index)}`)
    const results = await Promise.all(names.map(name => app.create(TENANT_A, name)))
    const accepted = results.filter(result => 'ok' in result).length
    expect(accepted).toBeGreaterThan(0)
    expect(accepted).toBeLessThan(names.length)
    for (const [index, result] of results.entries()) {
      const kind = queryKindOf(
        await app.storage.query(identityOf(TENANT_A, 'dom_0', `sop_create-${names[index]}`)),
      )
      if ('ok' in result) expect(kind).toBe('committed')
      else {
        expect(failureOf(result)['diagnostic']).toContain('queue_full')
        expect(kind).toBe('not_committed')
      }
    }
  })
})

describe('concurrent sessions in one transaction domain', () => {
  it('counts original operations against physical write transactions; the Session participant is singleton, so nothing merges', async () => {
    const app = await open()
    ok(await app.create(TENANT_A, 'warmup'))
    const file = app.domainFile('dom_0')
    const before = walSample(file)
    const opsBefore = app.opCount()
    const names = Array.from({ length: 8 }, (_, index) => `grouped-${String(index)}`)
    const results = await Promise.all(names.map(name => app.create(TENANT_A, name)))
    for (const result of results) ok(result)
    const after = walSample(file)
    const ops = app.opCount() - opsBefore
    // The WAL restarting would make the two samples incomparable; the fixture config keeps it still.
    expect(after.generation).toBe(before.generation)
    const physical = after.commits - before.commits
    console.log(
      `group commit count: original operations ${String(ops)}, physical write transactions ${String(physical)}`,
    )
    expect(ops).toBe(names.length)
    expect(physical).toBe(ops)
  })
})

describe('reads through the real read Worker', () => {
  // The read port of the provider refuses a statement without LIMIT (sql-contract SPEC §9.4):
  // a handler that ran one answered read_port_violation instead of a page.
  it('history.begin and history.readModelView answer a page, not a read port violation', async () => {
    const app = await open()
    ok(await app.create(TENANT_A))
    ok(await app.accept(TENANT_A, 'session-1', 'one'))
    const page = ok<{ entries: readonly unknown[]; exhausted: boolean }>(
      await app.port.history.begin({
        ...app.access(TENANT_A),
        kinds: [],
        from: null,
        direction: 'forward',
        pageBytes: 1_000_000,
      }),
    )
    expect(page.exhausted).toBe(true)
    expect(page.entries.length).toBeGreaterThan(0)
    ok(
      await app.port.history.readModelView({
        ...app.access(TENANT_A),
        basis: null,
        after: null,
        pageBytes: 1_000_000,
      }),
    )
  })
})

describe('session-contract commitEntries conformance on the real provider', () => {
  const fixtureOf = (app: RealApp): SessionTransactionsFixture<string> => ({
    port: app.port,
    access: app.access(TENANT_A),
    otherAccess: app.access(TENANT_B),
    creation: creation(),
    operation: name => operationId(name),
    initializationGuards: command =>
      Promise.resolve([
        initializationFixtureGuard(
          initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
        ),
      ]),
    askedAccessChecks: () => app.accessCheck.controls.asked().length,
  })
  for (const test of sessionEntriesConformance<string>())
    it(`${test.clause}: ${test.name}`, async () => {
      await test.run(fixtureOf(await open()))
    })
})
