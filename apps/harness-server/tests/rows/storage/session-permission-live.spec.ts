// @module-tag slow
// Original login, authorization and governance rows; Session initialization is a named fixture.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { loginStateCodec } from '@omne-harness/legal-identity'
import type {
  ActingForTenantPrincipal,
  PrincipalIssuer,
  IdentityGovernance,
} from '@omne-harness/identity'
import { principalIssuerKey, identityGovernanceKey } from '@omne-harness/identity/cordis'
import {
  mutationAccessRequest,
  type SessionAccessCheck,
  type SessionCommand,
} from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import {
  sessionAccessCheckKey,
  sessionDelegatedTransactionsKey,
  type SessionDelegatedTransactionsService,
} from '@omne-harness/session-cordis-contract/cordis'
import { principalIssuer, principalVerifier } from '../../../src/entry/principals.ts'
import { governanceDirectoryPrincipals } from '../../../src/entry/governance-directory-principals.ts'
import { governanceInstallationPrincipals } from '../../../src/entry/governance-installation-principals.ts'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import {
  toolContributionAuthority,
  toolReleaseRegistrant,
  loadProductionRelease,
} from '../../../src/entry/tool-release.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../../src/rows/authorization/session-permission-write.ts'
import { identityRow } from '../../../src/rows/identity/index.ts'
import { governanceRow } from '../../../src/rows/governance/index.ts'
import { releaseIdentityConfig } from '../identity/fixtures.ts'
import { createCommand, createGuards, declared, loadStorageTree } from './fixtures/tree.ts'

const cleanup: Array<() => unknown | Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

it('sets and clears a Session permission through the original login and delegated row, then recalls the old operation', async () => {
  const stateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'permission-live-')))
  cleanup.push(() => rmSync(stateRoot, { recursive: true, force: true }))
  const tree = await loadStorageTree({
    stateRoot,
    storageRoot: join(stateRoot, 'storage'),
    directoryFile: join(stateRoot, 'storage', 'tenant-domains.json'),
    includePrincipalVerifier: false,
    authorizationRow: declared(authorization),
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
  cleanup.push(() => tree.shutdown())
  expect(tree.result.kind).toBe('started')
  const credentials = { loginIdentifier: 'session-permission-user', credential: 'test-password' }
  const registered = await tree.root.identityOperations.registerAndActivate(credentials)
  if (registered.kind !== 'succeeded') throw new Error(JSON.stringify(registered))
  const issued = await tree.root.identityOperations.issueLogin(credentials)
  if (issued.kind !== 'succeeded') throw new Error(JSON.stringify(issued))
  const recognized = await tree.root.identityOperations.recognizeLogin({
    loginProof: issued.loginProof,
  })
  if (recognized.kind !== 'recognized') throw new Error(JSON.stringify(recognized))
  const login = loginStateCodec.encode(recognized.login)
  if (!login.ok) throw new Error('original login encoding failed')
  const issuer = tree.trusted<PrincipalIssuer>(principalIssuerKey)
  const actor = issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('server actor not issued')
  const principal = issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: registered.tenant,
    work: { owner: 'identity-login', work: login.value },
  })
  if ('failure' in principal) throw new Error('original login principal not issued')
  const access = {
    principal: principal.ok,
    tenant: registered.tenant,
    session: sessionId('live-permission-session'),
  }
  const checker = tree.service<SessionAccessCheck<ActingForTenantPrincipal>>(sessionAccessCheckKey)
  const transactions = tree.trusted<SessionDelegatedTransactionsService<ActingForTenantPrincipal>>(
    sessionDelegatedTransactionsKey,
  )
  async function checkedView(command: SessionCommand) {
    const request = mutationAccessRequest(access, command)
    const decision = await checker.check(request)
    expect(decision.kind).toBe('allowed')
    if (decision.kind !== 'allowed') throw new Error(JSON.stringify(decision))
    return transactions.bind({
      request,
      evidence: decision.evidence,
      ...(decision.writeQualification === undefined
        ? {}
        : { writeQualification: decision.writeQualification }),
    })
  }
  const creation = createCommand(access.tenant, access.session)
  expect(
    await (
      await checkedView(creation)
    ).commit({ access, command: creation, guards: createGuards(creation) }),
  ).toHaveProperty('ok')
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const permission = release.manifest.entries.find(entry => entry.asset.name === 'Shell')
    ?.governance.declaration.permissions[0]
  if (permission === undefined) throw new Error('actual Shell permission absent')
  const command = {
    kind: 'change',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('live-permission-set'),
      declaration: {
        kind: 'permission-assignment',
        capabilityId: permission.capabilityId,
        enforcementKey: permission.enforcementKey,
        definition: permission.reference,
        rule: { pick: 'auto', allowedSet: null },
        expectedRevision: '0',
        authorization: SESSION_PERMISSION_OWN_LOGIN_POLICY,
      },
    },
  } satisfies SessionCommand
  const setView = await checkedView(command)
  expect(await setView.commit({ access, command, guards: [] })).toMatchObject({
    ok: { recovered: false },
  })
  expect(await setView.readWork(access)).toMatchObject({
    ok: {
      permissions: { revision: '1', assignments: [{ rule: { pick: 'auto', allowedSet: null } }] },
    },
  })
  const clear = {
    ...command,
    input: {
      ...command.input,
      operation: operationId('live-permission-clear'),
      declaration: { ...command.input.declaration, rule: null, expectedRevision: '1' },
    },
  }
  const clearView = await checkedView(clear)
  expect(await clearView.commit({ access, command: clear, guards: [] })).toMatchObject({
    ok: { recovered: false },
  })
  const cleared = await clearView.readWork(access)
  expect(cleared).toMatchObject({ ok: { permissions: { revision: '2', assignments: [] } } })
  expect(await setView.commit({ access, command, guards: [] })).toMatchObject({
    ok: { recovered: true },
  })
  expect(await setView.readWork(access)).toEqual(cleared)
  const next = {
    ...command,
    input: {
      ...command.input,
      operation: operationId('after-revoke'),
      declaration: { ...command.input.declaration, expectedRevision: '2' },
    },
  }
  const admittedBeforeRevocation = await checkedView(next)
  expect(
    await tree.trusted<IdentityGovernance>(identityGovernanceKey).revokeLogin({
      login: recognized.login,
      target: recognized.login,
    }),
  ).toMatchObject({ kind: 'succeeded' })
  expect(
    await admittedBeforeRevocation.commit({ access, command: next, guards: [] }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(await setView.readWork(access)).toEqual(cleared)
  expect(await checker.check(mutationAccessRequest(access, next))).toMatchObject({ kind: 'denied' })
  expect(await setView.commit({ access, command, guards: [] })).toMatchObject({
    ok: { recovered: true },
  })
  expect(await setView.readWork(access)).toEqual(cleared)
})
