// Real storage rows; prechecked access and backend selection are named contract fixtures.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { inProcessPrincipalAuthority, standingPrincipalRef } from '@omne-harness/identity'
import {
  commandDigest,
  mutationAccessRequest,
  type SessionCheckedAccess,
  type SessionCommand,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import {
  sessionDelegatedTransactionsKey,
  sessionTransactionsKey,
  type SessionDelegatedTransactionsService,
} from '@omne-harness/session-cordis-contract/cordis'
import { declaration } from '../../../../../packages/governance/governance-local/tests/definition-fixture.ts'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../../src/rows/authorization/session-permission-write.ts'
import {
  TENANT_A,
  TENANT_B,
  createCommand,
  createGuards,
  loadStorageTree,
  textOf,
  declared,
} from './fixtures/tree.ts'
import { identityRow } from '../../../src/rows/identity/index.ts'
import { governanceRow } from '../../../src/rows/governance/index.ts'
import { principalIssuer, principalVerifier } from '../../../src/entry/principals.ts'
import { governanceInstallationPrincipals } from '../../../src/entry/governance-installation-principals.ts'
import { governanceDirectoryPrincipals } from '../../../src/entry/governance-directory-principals.ts'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import {
  toolContributionAuthority,
  toolReleaseRegistrant,
} from '../../../src/entry/tool-release.ts'
import { releaseIdentityConfig } from '../identity/fixtures.ts'
import { sessionPermissionBackendModule } from '../../../src/entry/session-permission-backend.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import {
  SessionPermissionBackendService,
  sessionPermissionBackendKey,
} from '../../../src/rows/governance/session-permission-backend-service.ts'
import type {
  SessionPermissionBackendReader,
  SessionPermissionWriteBackend,
  SessionPermissionWriteContext,
} from '../../../src/rows/governance/session-permission-commit.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { sessionPermissionQualification } from '../../../src/rows/governance/session-permission-qualification.ts'

const cleanup: Array<() => Promise<unknown> | void> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function world(entries: readonly EntryObjectModule[] = []) {
  const stateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'session-permission-delegated-')))
  cleanup.push(() => rmSync(stateRoot, { recursive: true, force: true }))
  const tree = await loadStorageTree({
    entryObjects: [storageHost, cursorSigning, ...entries],
    stateRoot,
    storageRoot: join(stateRoot, 'storage'),
    directoryFile: join(stateRoot, 'storage', 'tenant-domains.json'),
  })
  cleanup.push(tree.dispose)
  expect(tree.result.kind).toBe('started')
  return tree
}

function qualified(tenant: TenantId = TENANT_A) {
  const authority = inProcessPrincipalAuthority()
  const actor = authority.issuer.issueSystem({ component: 'prechecked-access-fixture' })
  if (!('ok' in actor)) throw new Error('actor fixture')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: 'identity-login', work: 'prechecked-login-fixture' },
  })
  if (!('ok' in issued)) throw new Error('principal fixture')
  const principal = issued.ok
  const access = { principal, tenant, session: sessionId('permission-session') }
  const permission = declaration().permissions[0]!
  const command = {
    kind: 'change',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('permission-change'),
      declaration: {
        kind: 'permission-assignment',
        capabilityId: permission.capabilityId,
        enforcementKey: permission.enforcementKey,
        definition: permission.reference,
        rule: { pick: 'allow', allowedSet: null },
        expectedRevision: '0',
        authorization: SESSION_PERMISSION_OWN_LOGIN_POLICY,
      },
    },
  } satisfies SessionCommand
  const checked: SessionCheckedAccess<typeof principal> = {
    request: mutationAccessRequest(access, command),
    evidence: evidence('prechecked-permission-fixture'),
    writeQualification: {
      tenant: access.tenant,
      session: access.session,
      operation: command.input.operation,
      commandDigest: commandDigest(command),
      permissionRevision: '0',
      principalRef: standingPrincipalRef(principal),
      policy: SESSION_PERMISSION_OWN_LOGIN_POLICY,
    },
  }
  return { access, command, checked }
}

it('publishes a real tenant backend from the governance row without authorizing a fixture principal', async () => {
  const stateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'governance-row-')))
  cleanup.push(() => rmSync(stateRoot, { recursive: true, force: true }))
  const tree = await loadStorageTree({
    stateRoot,
    storageRoot: join(stateRoot, 'storage'),
    directoryFile: join(stateRoot, 'storage', 'tenant-domains.json'),
    includePrincipalVerifier: false,
    entryObjects: [
      principalVerifier,
      principalIssuer,
      governanceDirectoryPrincipals,
      governanceInstallationPrincipals,
      toolReleaseRegistrant,
      toolContributionAuthority,
      identityClock,
      storageHost,
      cursorSigning,
    ],
    extraRows: [
      declared(identityRow, releaseIdentityConfig()),
      declared(governanceRow, {
        deploymentId: 'harness-local',
        logicalServiceId: 'harness-governance',
        recoveryPagesPerPass: 4,
        closeTimeoutMs: 3000,
      }),
    ],
  })
  cleanup.push(async () => {
    await tree.shutdown()
  })
  expect(tree.result.kind).toBe('started')
  expect(tree.state('governance').state).toBe('ACTIVE')
  expect(tree.root.get(sessionPermissionBackendKey)).toBeUndefined()
  const identity = await tree.root.identityOperations.registerAndActivate({
    loginIdentifier: 'row-user',
    credential: 'row-secret',
  })
  if (identity.kind !== 'succeeded') throw new Error(JSON.stringify(identity))
  const q = qualified(identity.tenant)
  const qualification = sessionPermissionQualification(q.checked, q.command, [])
  if (qualification === null) throw new Error('qualification fixture')
  const context = { principal: q.access.principal, qualification }
  const reader = tree.trusted<SessionPermissionBackendService>(sessionPermissionBackendKey)
  expect(await reader.read(context)).toBeUndefined()
  await create(tree, q)
  const [first, second] = await Promise.all([reader.read(context), reader.read(context)])
  expect(first).toBeDefined()
  expect(second).toBe(first)
  expect(
    await view(tree, q).commit({ access: q.access, command: q.command, guards: [] }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  const report = await tree.shutdown()
  expect(report.outcomes.find(outcome => outcome.row === 'governance')?.result).toEqual({
    kind: 'settled',
  })
  expect(await reader.read(context)).toBeUndefined()
})

it('reports the missing protected backend from the real delegated entry', async () => {
  const tree = await world()
  const q = qualified()
  const creation = createCommand(TENANT_A, q.access.session)
  expect(
    await tree.service<SessionTransactionPort<unknown>>(sessionTransactionsKey).commit({
      access: q.access,
      command: creation,
      guards: createGuards(creation),
    }),
  ).toHaveProperty('ok')
  const view = tree
    .trusted<SessionDelegatedTransactionsService<unknown>>(sessionDelegatedTransactionsKey)
    .bind(q.checked)
  expect(await view.commit({ access: q.access, command: q.command, guards: [] })).toMatchObject({
    failure: { kind: 'unavailable', owner: 'harness.session-permission-write' },
  })
})

function deniedBackend() {
  const execute = vi.fn(async (_context: SessionPermissionWriteContext, _intent: unknown) => ({
    kind: 'denied' as const,
  }))
  const backend: SessionPermissionWriteBackend = {
    writes: { execute },
    storage: {
      query: async () => {
        throw new Error('denial must not query a terminal')
      },
    },
  }
  return { backend, execute }
}

async function create(tree: Awaited<ReturnType<typeof world>>, q: ReturnType<typeof qualified>) {
  const command = createCommand(q.access.tenant, q.access.session)
  const view = tree
    .trusted<SessionDelegatedTransactionsService<unknown>>(sessionDelegatedTransactionsKey)
    .bind({
      request: mutationAccessRequest(q.access, command),
      evidence: evidence('prechecked-create-fixture'),
    })
  expect(
    await view.commit({ access: q.access, command, guards: createGuards(command) }),
  ).toHaveProperty('ok')
}

function view(tree: Awaited<ReturnType<typeof world>>, q: ReturnType<typeof qualified>) {
  return tree
    .trusted<SessionDelegatedTransactionsService<unknown>>(sessionDelegatedTransactionsKey)
    .bind(q.checked)
}

it('selects the backend per original tenant and operation; ordinary commands do not select it', async () => {
  const first = deniedBackend(),
    second = deniedBackend()
  const select = vi.fn<SessionPermissionBackendReader>(async context =>
    context.qualification.tenantRef === textOf(TENANT_A) ? first.backend : second.backend,
  )
  const tree = await world([sessionPermissionBackendModule(select)])
  const a = qualified(),
    b = qualified(TENANT_B)
  await Promise.all([create(tree, a), create(tree, b)])
  expect(select).not.toHaveBeenCalled()
  const results = await Promise.all(
    [a, b].map(q => view(tree, q).commit({ access: q.access, command: q.command, guards: [] })),
  )
  expect(results).toEqual([
    { failure: { kind: 'denied', action: 'change' } },
    { failure: { kind: 'denied', action: 'change' } },
  ])
  expect(select).toHaveBeenCalledTimes(2)
  for (const [q, writer] of [
    [a, first],
    [b, second],
  ] as const) {
    expect(writer.execute).toHaveBeenCalledTimes(1)
    expect(writer.execute.mock.calls[0]?.[0]).toMatchObject({
      principal: q.access.principal,
      qualification: {
        tenantRef: textOf(q.access.tenant),
        commandDigest: commandDigest(q.command),
        principalRef: standingPrincipalRef(q.access.principal),
      },
    })
    expect(writer.execute.mock.calls[0]?.[1]).toMatchObject({
      operationId: q.command.input.operation,
    })
  }
  expect(tree.service(sessionPermissionBackendKey)).toBeUndefined()
})

it('refuses an unregistered tenant and a changed command before selecting a backend', async () => {
  const select = vi.fn<SessionPermissionBackendReader>(async () => deniedBackend().backend)
  const tree = await world([sessionPermissionBackendModule(select)])
  const q = qualified()
  expect(
    await view(tree, q).commit({ access: q.access, command: q.command, guards: [] }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(select).not.toHaveBeenCalled()
  await create(tree, q)
  const changed = {
    ...q.command,
    input: { ...q.command.input, operation: operationId('different-operation') },
  }
  expect(
    await view(tree, q).commit({ access: q.access, command: changed, guards: [] }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(select).not.toHaveBeenCalled()
})

it('ignores a root same-name provider', async () => {
  const tree = await world()
  const read = vi.fn<SessionPermissionBackendReader>(async () => deniedBackend().backend)
  class Intruder extends SessionPermissionBackendService {
    readonly read = read
  }
  await tree.root.plugin(ctx => {
    new Intruder(ctx)
  })
  const q = qualified()
  await create(tree, q)
  expect(
    await view(tree, q).commit({ access: q.access, command: q.command, guards: [] }),
  ).toMatchObject({ failure: { kind: 'unavailable', owner: 'harness.session-permission-write' } })
  expect(read).not.toHaveBeenCalled()
})

it('the same bound view uses a remounted provider on its next call', async () => {
  const first = deniedBackend(),
    second = deniedBackend()
  let replace: (select: SessionPermissionBackendReader) => Promise<void> = async () => {
    throw new Error('not installed')
  }
  const entry: EntryObjectModule = {
    name: sessionPermissionBackendKey,
    implementation: 'real',
    async install(scope, env) {
      const mount = (select: SessionPermissionBackendReader) =>
        scope.plugin(ctx => sessionPermissionBackendModule(select).install(ctx, env))
      let fiber = mount(async () => first.backend)
      await fiber
      replace = async select => {
        await fiber.dispose()
        fiber = mount(select)
        await fiber
      }
    },
  }
  const tree = await world([entry]),
    q = qualified()
  await create(tree, q)
  const bound = view(tree, q)
  const input = { access: q.access, command: q.command, guards: [] }
  expect(await bound.commit(input)).toMatchObject({ failure: { kind: 'denied' } })
  await replace(async () => second.backend)
  expect(await bound.commit(input)).toMatchObject({ failure: { kind: 'denied' } })
  expect(first.execute).toHaveBeenCalledTimes(1)
  expect(second.execute).toHaveBeenCalledTimes(1)
})

it('a disposed reader rejects both a pending selection and later use of its old reference', async () => {
  const root = new Context(),
    q = qualified(),
    result = deniedBackend()
  cleanup.push(() => root.fiber.dispose())
  const pending = Promise.withResolvers<SessionPermissionWriteBackend>()
  const select = vi.fn<SessionPermissionBackendReader>(() => pending.promise)
  const module = sessionPermissionBackendModule(select)
  const fiber = root.plugin(ctx =>
    module.install(ctx, {
      stateRoot: '',
      readTrusted: () => {
        throw new Error('not consumed')
      },
      once: (_key, make) => make(),
    }),
  )
  await fiber
  const reader = root.get(sessionPermissionBackendKey)!
  const qualification = sessionPermissionQualification(
    { ...q.checked, request: mutationAccessRequest(q.access, q.command) },
    q.command,
  )
  if (qualification === null) throw new Error('qualification fixture')
  const context = { principal: q.access.principal, qualification }
  const inFlight = reader.read(context)
  expect(select).toHaveBeenCalledTimes(1)
  await fiber.dispose()
  pending.resolve(result.backend)
  expect(await inFlight).toBeUndefined()
  expect(await reader.read(context)).toBeUndefined()
  expect(select).toHaveBeenCalledTimes(1)
})
