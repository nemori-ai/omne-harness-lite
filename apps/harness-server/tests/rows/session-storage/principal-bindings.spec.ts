// `session-storage` 行的受信会话归属读口 `sessionPrincipalBindings`（session-contract「会话归属读口与会话工作主体」，
// D-AUTH r4 4.1）在真实 SQLite 与真实目录上：session-cordis-contract 的读口套件；读到的是存储记录的租户、会话与来源，
// 不带会话内容；不问访问裁定；未知会话与已登记的别的租户都答 `not-bound`，两者相同；目录没有该租户、树停止后存储
// 正在关闭，都答 `unavailable`，不答 `not-bound`，也不登记。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type {
  SessionPrincipalBindingSource,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import { evidence, runConformanceCase, sessionId } from '@omne-harness/session-contract/testing'
import {
  sessionPrincipalBindingsKey,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { sessionPrincipalBindingsConformance } from '@omne-harness/session-cordis-contract/testing'
import type { TenantDomainLookup } from '@omne-harness/sql-contract'
import { tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import {
  TENANT_A,
  TENANT_B,
  access,
  createCommand,
  createGuards,
  loadStorageTree,
  textOf,
  type AccessPolicy,
  type LoadedTree,
} from '../storage/fixtures/tree.ts'

const live: LoadedTree[] = []
const bases: string[] = []

afterEach(async () => {
  while (live.length > 0) await live.pop()!.dispose()
  while (bases.length > 0) rmSync(bases.pop()!, { recursive: true, force: true })
})

async function load(policy?: AccessPolicy): Promise<LoadedTree> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'session-bindings-')))
  bases.push(base)
  const tree = await loadStorageTree({
    stateRoot: base,
    storageRoot: join(base, 'storage'),
    directoryFile: join(base, 'storage', 'tenant-domains.json'),
    ...(policy === undefined ? {} : { policy }),
  })
  live.push(tree)
  if (tree.result.kind !== 'started')
    throw new Error(`tree not started: ${JSON.stringify(tree.result)}`)
  return tree
}

const transactions = (tree: LoadedTree) =>
  tree.service<SessionTransactionPort<string>>(sessionTransactionsKey)
const bindings = (tree: LoadedTree) =>
  tree.trusted<SessionPrincipalBindingSource>(sessionPrincipalBindingsKey)

async function create(tree: LoadedTree, tenant: typeof TENANT_A, session: string) {
  const command = createCommand(tenant, session)
  const created = await transactions(tree).commit({
    access: access(tenant, session),
    command,
    guards: createGuards(command),
  })
  expect('ok' in created, JSON.stringify(created)).toBe(true)
}

describe('the binding suite of session-cordis-contract on the release row', () => {
  for (const item of sessionPrincipalBindingsConformance())
    test(`${item.clause}: ${item.name}`, async () => {
      const tree = await load()
      await create(tree, TENANT_A, 's1')
      // Tenant B is registered too: its foreign read goes all the way to its own domain.
      await create(tree, TENANT_B, 's2')
      const fixture = {
        source: bindings(tree),
        bound: { tenant: TENANT_A, session: sessionId('s1') },
        otherTenant: TENANT_B,
      }
      expect(await runConformanceCase(item, fixture)).toEqual({ kind: 'passed' })
    })
})

describe('the trusted scope', () => {
  test('the read port is provided only under its trusted name: the root does not resolve it', async () => {
    const tree = await load()
    expect(tree.service(sessionPrincipalBindingsKey) === undefined).toBe(true)
    expect(bindings(tree) === undefined).toBe(false)
  })
})

describe('an established session', () => {
  test('reads its own tenant, session and the source of its state, and nothing of its content', async () => {
    const tree = await load()
    await create(tree, TENANT_A, 's1')
    const work = await transactions(tree).readWork(access(TENANT_A, 's1'))
    if (!('ok' in work)) throw new Error(`readWork: ${JSON.stringify(work)}`)
    const read = await bindings(tree).read({ tenant: TENANT_A, session: sessionId('s1') })
    expect(read).toEqual({
      ok: {
        kind: 'bound',
        tenant: work.ok.tenant,
        session: sessionId('s1'),
        source: work.ok.source,
      },
    })
  })

  test('the read does not ask the access check, and answers while the check denies every read', async () => {
    const tree = await load(request =>
      request.operation === 'create'
        ? { kind: 'allowed', evidence: evidence('create') }
        : { kind: 'denied' },
    )
    await create(tree, TENANT_A, 's1')
    expect(await transactions(tree).readWork(access(TENANT_A, 's1'))).toMatchObject({
      failure: { kind: 'denied' },
    })
    const asked = tree.check.controls.asked().length
    const read = await bindings(tree).read({ tenant: TENANT_A, session: sessionId('s1') })
    expect(read).toMatchObject({ ok: { kind: 'bound' } })
    expect(tree.check.controls.asked()).toHaveLength(asked)
  })
})

describe('a session that is not there', () => {
  test('an unknown session of a registered tenant reads not-bound', async () => {
    const tree = await load()
    await create(tree, TENANT_A, 's1')
    expect(await bindings(tree).read({ tenant: TENANT_A, session: sessionId('s9') })).toEqual({
      ok: { kind: 'not-bound' },
    })
  })

  test('the session of tenant A read under registered tenant B is not-bound, the same answer as an unknown session of B', async () => {
    const tree = await load()
    await create(tree, TENANT_A, 's1')
    await create(tree, TENANT_B, 's2')
    const foreign = await bindings(tree).read({ tenant: TENANT_B, session: sessionId('s1') })
    const ghost = await bindings(tree).read({ tenant: TENANT_B, session: sessionId('s9') })
    expect(foreign).toEqual({ ok: { kind: 'not-bound' } })
    expect(foreign).toEqual(ghost)
  })
})

describe('a read that could not look', () => {
  test('a tenant that the directory has not registered is unavailable with a diagnostic, and the read registers nothing', async () => {
    const tree = await load()
    await create(tree, TENANT_A, 's1')
    const read = await bindings(tree).read({ tenant: TENANT_B, session: sessionId('s1') })
    expect(read).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('not registered') },
    })
    const lookup = tree.trusted<TenantDomainLookup>(tenantDomainLookupKey)
    expect(await lookup.lookup({ tenant: textOf(TENANT_B) })).toEqual({ kind: 'unregistered' })
  })

  test('after the tree stopped, the read is unavailable from the closing storage, not not-bound', async () => {
    const tree = await load()
    await create(tree, TENANT_A, 's1')
    const source = bindings(tree)
    expect(await source.read({ tenant: TENANT_A, session: sessionId('s1') })).toMatchObject({
      ok: { kind: 'bound' },
    })
    expect(await tree.shutdown()).toMatchObject({ overall: 'settled' })
    expect(await source.read({ tenant: TENANT_A, session: sessionId('s1') })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('closing') },
    })
  })
})
