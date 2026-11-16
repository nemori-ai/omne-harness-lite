import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { inProcessPrincipalAuthority, standingPrincipalRef } from '@omne-harness/identity'
import { fail } from '@omne-harness/operation-result'
import {
  commandDigest,
  mutationAccessRequest,
  type SessionCheckedAccess,
  type SessionCommand,
  type SessionFailure,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import type {
  SessionProtectedBasisSource,
  SessionProtectedCommit,
} from '@omne-harness/session-storage-sql'
import { sessionCommandFacts } from '@omne-harness/session-storage-sql/participants'
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
import { storageHost } from '../../../src/entry/storage-host.ts'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import {
  SessionPermissionBackendService,
  sessionPermissionBackendKey,
} from '../../../src/rows/governance/session-permission-backend-service.ts'
import type { EntryObjectModule } from '../../../src/types.ts'

type Basis = SessionProtectedBasisSource<unknown>
const denied = { failure: { kind: 'denied', action: 'change' } } as const
const refusing = () => vi.fn<Basis>(async () => fail<SessionFailure>(denied.failure))

function backendModule(basis: Basis): EntryObjectModule {
  return {
    name: sessionPermissionBackendKey,
    implementation: 'real',
    install(scope) {
      class Fixture extends SessionPermissionBackendService {
        readonly basis = basis
      }
      new Fixture(scope)
    },
  }
}

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
  const delivery: SessionProtectedCommit<unknown> = {
    access,
    command,
    qualification: checked.writeQualification!,
    session: sessionCommandFacts(command, []),
  }
  return { access, command, checked, delivery }
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
  const backend = tree.trusted<SessionPermissionBackendService>(sessionPermissionBackendKey)
  expect(await backend.basis(q.delivery)).toMatchObject({
    failure: { kind: 'unavailable', owner: 'harness.session-permission-write' },
  })
  await create(tree, q)
  expect(await backend.basis(q.delivery)).toEqual(denied)
  expect(await view(tree, q).commit({ access: q.access, command: q.command, guards: [] })).toEqual(
    denied,
  )
  const report = await tree.shutdown()
  expect(report.outcomes.find(outcome => outcome.row === 'governance')?.result).toEqual({
    kind: 'settled',
  })
  expect(await backend.basis(q.delivery)).toMatchObject({ failure: { kind: 'unavailable' } })
}, 30_000)

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

it('asks the backend for the basis of each tenant and operation; ordinary commands do not ask', async () => {
  const basis = refusing()
  const tree = await world([backendModule(basis)])
  const a = qualified(),
    b = qualified(TENANT_B)
  await Promise.all([create(tree, a), create(tree, b)])
  expect(basis).not.toHaveBeenCalled()
  const results = await Promise.all(
    [a, b].map(q => view(tree, q).commit({ access: q.access, command: q.command, guards: [] })),
  )
  expect(results).toEqual([denied, denied])
  expect(basis).toHaveBeenCalledTimes(2)
  for (const q of [a, b])
    expect(basis.mock.calls.map(call => call[0])).toContainEqual(
      expect.objectContaining({
        access: q.access,
        command: q.command,
        qualification: expect.objectContaining({
          tenant: q.access.tenant,
          commandDigest: commandDigest(q.command),
          principalRef: standingPrincipalRef(q.access.principal),
        }),
        session: expect.objectContaining({ participant: 'session' }),
      }),
    )
  expect(tree.service(sessionPermissionBackendKey)).toBeUndefined()
})

it('refuses an unregistered tenant and a changed command before it asks the backend', async () => {
  const basis = refusing()
  const tree = await world([backendModule(basis)])
  const q = qualified()
  expect(
    await view(tree, q).commit({ access: q.access, command: q.command, guards: [] }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(basis).not.toHaveBeenCalled()
  await create(tree, q)
  const changed = {
    ...q.command,
    input: { ...q.command.input, operation: operationId('different-operation') },
  }
  expect(
    await view(tree, q).commit({ access: q.access, command: changed, guards: [] }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(basis).not.toHaveBeenCalled()
})

it('ignores a root same-name provider', async () => {
  const tree = await world()
  const basis = refusing()
  class Intruder extends SessionPermissionBackendService {
    readonly basis = basis
  }
  await tree.root.plugin(ctx => {
    new Intruder(ctx)
  })
  const q = qualified()
  await create(tree, q)
  expect(
    await view(tree, q).commit({ access: q.access, command: q.command, guards: [] }),
  ).toMatchObject({ failure: { kind: 'unavailable', owner: 'harness.session-permission-write' } })
  expect(basis).not.toHaveBeenCalled()
})

it('the same bound view uses a remounted provider on its next call', async () => {
  const first = refusing(),
    second = refusing()
  let replace: (basis: Basis) => Promise<void> = async () => {
    throw new Error('not installed')
  }
  const entry: EntryObjectModule = {
    name: sessionPermissionBackendKey,
    implementation: 'real',
    async install(scope, env) {
      const mount = (basis: Basis) => scope.plugin(ctx => backendModule(basis).install(ctx, env))
      let fiber = mount(first)
      await fiber
      replace = async basis => {
        await fiber.dispose()
        fiber = mount(basis)
        await fiber
      }
    },
  }
  const tree = await world([entry]),
    q = qualified()
  await create(tree, q)
  const bound = view(tree, q)
  const input = { access: q.access, command: q.command, guards: [] }
  expect(await bound.commit(input)).toEqual(denied)
  await replace(second)
  expect(await bound.commit(input)).toEqual(denied)
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
})
