// `session-storage` 行（会话存储组合）与 `storage` 行在真实 sqlite-provider 上的行为：租户登记只在放行的 `create`
// 之后发生，读与被拒的 `create` 不登记；重启后已登记租户可读；委派视图只服务绑定的那次操作；参加者常量与目录一致。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SessionTransactionPort } from '@omne-harness/session-contract'
import { mutationAccessRequest } from '@omne-harness/session-contract'
import {
  sessionDelegatedTransactionsKey,
  sessionPrincipalBindingsKey,
  sessionTransactionsKey,
  type SessionDelegatedTransactionsService,
  type SessionPrincipalBindingsService,
} from '@omne-harness/session-cordis-contract/cordis'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import type { TenantDomainLookup, TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainLookupKey, tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { runTenantDomainLookupConformance } from '@omne-harness/sql-contract/testing'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { storageCatalog } from '../../../src/rows/storage/catalog.ts'
import { SESSION_COMPOSITE_PARTICIPANTS } from '../../../src/rows/session-storage/composite.ts'
import {
  DIRECTORY_FILE_FORMAT,
  deriveTransactionDomain,
} from '../../../src/rows/session-storage/directory.ts'
import {
  TENANT_A,
  TENANT_B,
  access,
  createCommand,
  createGuards,
  loadStorageTree,
  textOf,
  type LoadedTree,
} from './fixtures/tree.ts'

type Workspace = Readonly<{ stateRoot: string; storageRoot: string; directoryFile: string }>

const live: LoadedTree[] = []
const workspaces: string[] = []

function workspace(): Workspace {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'app1-session-storage-')))
  workspaces.push(base)
  return {
    stateRoot: base,
    storageRoot: join(base, 'storage'),
    directoryFile: join(base, 'storage', 'tenant-domains.json'),
  }
}

async function load(ws: Workspace, extra: Partial<Parameters<typeof loadStorageTree>[0]> = {}) {
  const tree = await loadStorageTree({ ...ws, ...extra })
  live.push(tree)
  return tree
}

afterEach(async () => {
  while (live.length > 0) await live.pop()!.dispose()
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true })
})

const transactions = (tree: LoadedTree) =>
  tree.service<SessionTransactionPort<string>>(sessionTransactionsKey)
const lookup = (tree: LoadedTree) => tree.trusted<TenantDomainLookup>(tenantDomainLookupKey)

function started(tree: LoadedTree): void {
  if (tree.result.kind !== 'started')
    throw new Error(`tree not started: ${JSON.stringify(tree.result)}`)
  for (const id of ['storage', 'authorization', 'session-storage'])
    expect(tree.state(id), id).toMatchObject({ state: 'ACTIVE' })
}

describe('tenant registration (acceptance 1)', () => {
  test('before the first create the tenant is unregistered; the create registers it in its own domain; the lookup then answers ready', async () => {
    const tree = await load(workspace())
    started(tree)
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_A) })).toEqual({
      kind: 'unregistered',
    })
    const command = createCommand(TENANT_A, 's1')
    const created = await transactions(tree).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect('ok' in created, JSON.stringify(created)).toBe(true)
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_A) })).toEqual({
      kind: 'ready',
      domain: {
        scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
        transactionDomain: deriveTransactionDomain(textOf(TENANT_A)),
      },
    })
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_B) })).toEqual({
      kind: 'unregistered',
    })
    const work = await transactions(tree).readWork(access(TENANT_A, 's1'))
    expect('ok' in work, JSON.stringify(work)).toBe(true)
  })

  test('a read of an unregistered tenant answers unavailable and registers nothing', async () => {
    const tree = await load(workspace())
    started(tree)
    const work = await transactions(tree).readWork(access(TENANT_B, 's1'))
    expect(work).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_B) })).toEqual({
      kind: 'unregistered',
    })
  })

  test('a denied create registers nothing: the access check is asked before the directory resolves', async () => {
    const ws = workspace()
    const tree = await load(ws, {
      policy: request =>
        request.operation === 'create'
          ? { kind: 'denied' }
          : { kind: 'allowed', evidence: evidence('x') },
    })
    started(tree)
    const command = createCommand(TENANT_A, 's1')
    const created = await transactions(tree).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect(created).toMatchObject({ failure: { kind: 'denied' } })
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_A) })).toEqual({
      kind: 'unregistered',
    })
    expect(existsSync(ws.directoryFile)).toBe(false)
  })

  test('a create whose access names another session than the command is denied before anything registers', async () => {
    const ws = workspace()
    const tree = await load(ws)
    started(tree)
    const command = createCommand(TENANT_A, 's2')
    const created = await transactions(tree).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect(created).toMatchObject({ failure: { kind: 'denied' } })
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_A) })).toEqual({
      kind: 'unregistered',
    })
    expect(existsSync(ws.directoryFile)).toBe(false)
  })

  test('a failed write of the directory file answers unavailable without a path, and the tenant stays unregistered in the snapshot', async () => {
    const ws = workspace()
    const tree = await load(ws)
    started(tree)
    // 临时文件的位置被一个目录占着：`openSync(…, "w")` 失败，登记表写不出去。
    mkdirSync(`${ws.directoryFile}.${String(process.pid)}.tmp`, { recursive: true })
    const command = createCommand(TENANT_A, 's1')
    const created = await transactions(tree).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect(created).toMatchObject({ failure: { kind: 'unavailable' } })
    const text = JSON.stringify(created)
    expect(text).not.toContain(ws.stateRoot)
    expect(text).not.toContain('tenant-domains')
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_A) })).toEqual({
      kind: 'unregistered',
    })
    expect(existsSync(ws.directoryFile)).toBe(false)
  })

  test('two tenants get two domains; the second create of a registered tenant does not re-register', async () => {
    const ws = workspace()
    const tree = await load(ws)
    started(tree)
    for (const [tenant, session] of [
      [TENANT_A, 'a1'],
      [TENANT_B, 'b1'],
      [TENANT_A, 'a2'],
    ] as const) {
      const command = createCommand(tenant, session)
      const created = await transactions(tree).commit({
        access: access(tenant, session),
        command,
        guards: createGuards(command),
      })
      expect('ok' in created, JSON.stringify(created)).toBe(true)
    }
    const a = await lookup(tree).lookup({ tenant: textOf(TENANT_A) })
    const b = await lookup(tree).lookup({ tenant: textOf(TENANT_B) })
    expect(a.kind).toBe('ready')
    expect(b.kind).toBe('ready')
    if (a.kind !== 'ready' || b.kind !== 'ready') return
    expect(a.domain.transactionDomain).not.toBe(b.domain.transactionDomain)
    const file = JSON.parse(readFileSync(ws.directoryFile, 'utf8')) as {
      format: string
      tenants: string[]
    }
    expect(file.format).toBe(DIRECTORY_FILE_FORMAT)
    expect(file.tenants).toEqual([textOf(TENANT_A), textOf(TENANT_B)])
  })

  test('the lookup passes the tenant-domain-lookup conformance suite over the published snapshot', async () => {
    const tree = await load(workspace())
    started(tree)
    const command = createCommand(TENANT_A, 's1')
    await transactions(tree).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    const verdicts = await runTenantDomainLookupConformance(() => ({
      lookup: lookup(tree),
      registered: {
        tenant: textOf(TENANT_A),
        domain: {
          scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
          transactionDomain: deriveTransactionDomain(textOf(TENANT_A)),
        },
      },
      unregistered: textOf(TENANT_B),
    }))
    expect(verdicts.failed).toEqual([])
    expect(verdicts.passed.length).toBeGreaterThan(0)
  })
})

describe('restart (acceptance 2, in-process)', () => {
  test('a second tree on the same state root and storage root reads the tenant back without a new registration', async () => {
    const ws = workspace()
    const first = await load(ws)
    started(first)
    const command = createCommand(TENANT_A, 's1')
    const created = await transactions(first).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect('ok' in created, JSON.stringify(created)).toBe(true)
    expect(await first.shutdown()).toMatchObject({ overall: 'settled' })

    const second = await load(ws)
    started(second)
    expect(await lookup(second).lookup({ tenant: textOf(TENANT_A) })).toMatchObject({
      kind: 'ready',
    })
    const work = await transactions(second).readWork(access(TENANT_A, 's1'))
    expect('ok' in work, JSON.stringify(work)).toBe(true)
    // 第二次启动只读目录：这个租户在目录里，所以没有再向访问裁定要 create 之外的裁定。
    expect(second.check.controls.asked().map(r => r.operation)).toEqual(['readWork'])
  })

  test('a corrupt directory file fails the session-storage row instead of starting with an empty directory', async () => {
    const ws = workspace()
    mkdirSync(ws.storageRoot, { recursive: true })
    writeFileSync(ws.directoryFile, '{ not json')
    const tree = await load(ws)
    expect(tree.state('session-storage')).toMatchObject({ state: 'FAILED' })
    expect(tree.state('session-storage').error?.message).toContain('corrupt')
  })

  test('a directory written under another domain rule is refused', async () => {
    const ws = workspace()
    mkdirSync(ws.storageRoot, { recursive: true })
    writeFileSync(
      ws.directoryFile,
      JSON.stringify({ format: DIRECTORY_FILE_FORMAT, domainRule: 'other/1', tenants: [] }),
    )
    const tree = await load(ws)
    expect(tree.state('session-storage')).toMatchObject({ state: 'FAILED' })
    expect(tree.state('session-storage').error?.message).toContain('other/1')
  })

  test('a directory with a non-tenant entry is refused; a well-formed one publishes its tenants as ready', async () => {
    const ws = workspace()
    mkdirSync(ws.storageRoot, { recursive: true })
    writeFileSync(
      ws.directoryFile,
      JSON.stringify({
        format: DIRECTORY_FILE_FORMAT,
        domainRule: 'organization-account/1',
        tenants: ['nope'],
      }),
    )
    expect((await load(ws)).state('session-storage')).toMatchObject({ state: 'FAILED' })
    writeFileSync(
      ws.directoryFile,
      JSON.stringify({
        format: DIRECTORY_FILE_FORMAT,
        domainRule: 'organization-account/1',
        tenants: [textOf(TENANT_B)],
      }),
    )
    const tree = await load(ws)
    started(tree)
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_B) })).toEqual({
      kind: 'ready',
      domain: {
        scope: { kind: 'tenant', tenant: textOf(TENANT_B) },
        transactionDomain: deriveTransactionDomain(textOf(TENANT_B)),
      },
    })
    expect(await lookup(tree).lookup({ tenant: textOf(TENANT_A) })).toEqual({
      kind: 'unregistered',
    })
  })
})

describe('the composite declaration (acceptance 6)', () => {
  test('the registered participants are the named constant, and every one of them has material in the catalog', () => {
    const catalog = storageCatalog()
    const names = catalog.participants.map(item => item.participant)
    for (const participant of SESSION_COMPOSITE_PARTICIPANTS)
      expect(names, participant).toContain(participant)
    expect([...SESSION_COMPOSITE_PARTICIPANTS]).toEqual([...SESSION_COMPOSITE_PARTICIPANTS].sort())
  })
})

describe('the delegated entry and the trusted reads', () => {
  test('a bound view serves the checked session only and refuses the system reads', async () => {
    const tree = await load(workspace())
    started(tree)
    const command = createCommand(TENANT_A, 's1')
    const delegated = tree.trusted<SessionDelegatedTransactionsService<string>>(
      sessionDelegatedTransactionsKey,
    )
    const checked = {
      request: mutationAccessRequest(access(TENANT_A, 's1'), command),
      evidence: evidence('bound/create'),
    }
    const view = delegated.bind(checked)
    const created = await view.commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect('ok' in created, JSON.stringify(created)).toBe(true)
    // 绑定的是这一会话的 create：同一会话的读在绑定内，别的会话、别的命令与系统读不在。
    expect('ok' in (await view.readWork(access(TENANT_A, 's1')))).toBe(true)
    const other = createCommand(TENANT_A, 's1')
    expect(
      await view.commit({
        access: access(TENANT_A, 's1'),
        command: { ...other, input: { ...other.input, operation: operationId('create-again') } },
        guards: createGuards(other),
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(await view.readWork(access(TENANT_A, 's2'))).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(
      await view.pending({ principal: 'tester', tenant: TENANT_A, after: null, limit: 10 }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    // 访问裁定没有被问过：绑定自己作答。
    expect(tree.check.controls.asked()).toEqual([])
    // 读绑定的视图服务这一次读。
    const bound = delegated.bind({
      request: {
        access: { principal: 'tester', tenant: TENANT_A },
        operation: 'readWork',
        target: { kind: 'session', session: sessionId('s1') },
      },
      evidence: evidence('bound/read'),
    })
    expect('ok' in (await bound.readWork(access(TENANT_A, 's1')))).toBe(true)
  })

  test('tenantDomains.enumerate and sessionPrincipalBindings.read answer unavailable, never ready or bound', async () => {
    const tree = await load(workspace())
    started(tree)
    const domains = tree.service<TenantDomains<string>>(tenantDomainsKey)
    expect(await domains.enumerate({ principal: 'anyone' })).toMatchObject({
      kind: 'unavailable',
    })
    const bindings = tree.trusted<SessionPrincipalBindingsService>(sessionPrincipalBindingsKey)
    expect(await bindings.read({ tenant: TENANT_A, session: sessionId('s1') })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('the cursor signing reaches the reads through the real tree', () => {
  const forged = ['eyJ4IjoxfQ', 'c3RhdGUtcm9vdC8x', 'AAAA'].join('.')
  const pendingAfter = (tree: LoadedTree) =>
    transactions(tree).pending({ principal: 'tester', tenant: TENANT_A, after: forged, limit: 1 })

  async function withTenant(extra: Partial<Parameters<typeof loadStorageTree>[0]> = {}) {
    const tree = await load(workspace(), extra)
    started(tree)
    const command = createCommand(TENANT_A, 's1')
    const created = await transactions(tree).commit({
      access: access(TENANT_A, 's1'),
      command,
      guards: createGuards(command),
    })
    expect('ok' in created, JSON.stringify(created)).toBe(true)
    return tree
  }

  test('a forged cursor is judged by the real signing service: invalid, field cursor, reason signature', async () => {
    const tree = await withTenant()
    expect(await pendingAfter(tree)).toMatchObject({
      failure: { kind: 'invalid', field: 'cursor', reason: 'signature' },
    })
  })

  test('without the sessionCursorSigning entry object the same read answers unavailable, not invalid', async () => {
    const tree = await withTenant({ entryObjects: [storageHost] })
    expect(await pendingAfter(tree)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  test('with the entry object present the read does not answer unavailable (guards the late binding)', async () => {
    const tree = await withTenant({ entryObjects: [storageHost, cursorSigning] })
    expect(await pendingAfter(tree)).not.toMatchObject({ failure: { kind: 'unavailable' } })
  })
})
