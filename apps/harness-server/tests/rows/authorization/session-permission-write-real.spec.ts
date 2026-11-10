// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import { inProcessPrincipalAuthority, standingPrincipalRef } from '@omne-harness/identity'
import { identityClockKey, principalVerifierKey } from '@omne-harness/identity/cordis'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { loginStateCodec } from '@omne-harness/legal-identity'
import { commandDigest, type SessionCommand } from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { parseInstant } from '@omne-harness/utc-instant'
import {
  createSessionAccessCheck,
  type AccessPorts,
} from '../../../src/rows/authorization/adapters.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { sessionPermissionQualification } from '../../../src/rows/governance/session-permission-qualification.ts'
import { fixtureSqliteStorage, releaseIdentityConfig } from '../identity/fixtures.ts'

async function openIdentity() {
  const ctx = new Context()
  const authority = inProcessPrincipalAuthority()
  const now = parseInstant('2026-11-08T00:00:00Z')
  if (!now.ok) throw new Error('test clock')
  const inputs = await ctx.plugin({
    name: 'permission-login-inputs',
    apply(scope: Context) {
      scope.provide(identityClockKey, { now: async () => ({ kind: 'read', instant: now.value }) })
      scope.provide(principalVerifierKey, authority.verifier)
    },
  })
  const storage = await ctx.plugin(fixtureSqliteStorage)
  const identity = await ctx.plugin(IdentitySqlPlugin, releaseIdentityConfig())
  const ports: AccessPorts = {
    admission: referenceAdmissionCheck({
      verifier: authority.verifier,
      standing: ctx.tenantStanding,
      permits: null,
    }),
    systemActions: {
      check: async () => {
        throw new Error('system matrix is outside this login scenario')
      },
    },
    login: ctx.identityGovernance,
  }
  return {
    context: ctx,
    issuer: authority.issuer,
    identity: ctx.identityOperations,
    governance: ctx.identityGovernance,
    ports,
    async close() {
      await identity.dispose()
      await storage.dispose()
      await inputs.dispose()
    },
  }
}
type Identity = Awaited<ReturnType<typeof openIdentity>>
const opened: Identity[] = []
afterEach(async () => {
  for (const app of opened.splice(0)) await app.close()
})
async function world() {
  const app = await openIdentity()
  opened.push(app)
  return app
}

async function writer(app: Identity, name = 'permission-writer') {
  const credential = { loginIdentifier: name, credential: 'test-password' }
  const registered = await app.identity.registerAndActivate(credential)
  if (registered.kind !== 'succeeded') throw new Error('registration failed')
  const issued = await app.identity.issueLogin(credential)
  if (issued.kind !== 'succeeded') throw new Error('login failed')
  const recognized = await app.identity.recognizeLogin({ loginProof: issued.loginProof })
  if (recognized.kind !== 'recognized') throw new Error('login not recognized')
  const login = loginStateCodec.encode(recognized.login)
  if (!login.ok) throw new Error('login not minted')
  const actor = app.issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('actor not issued')
  const principal = app.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: registered.tenant,
    work: { owner: 'identity-login', work: login.value },
  })
  if ('failure' in principal) throw new Error('principal not issued')
  const command = {
    kind: 'change',
    input: {
      tenant: registered.tenant,
      session: sessionId('permission-session'),
      operation: operationId('permission-write'),
      declaration: {
        kind: 'permission-assignment',
        capabilityId: 'schedule',
        enforcementKey: 'create',
        definition: {
          origin: { kind: 'independent', providerId: 'schedule', definitionRef: 'schedule-v1' },
          itemId: 'create',
          revision: '1',
        },
        rule: { pick: 'deny', allowedSet: null },
        expectedRevision: '0',
        authorization: {
          owner: 'authorization',
          record: 'session.permission-own-login',
          revision: '1',
          digest: 'sha256:e81423a4045df49a2cc3f3ee3567af12758947beb4dca1f457fe226cf6b4457b',
        },
      },
    },
  } satisfies SessionCommand
  const request = {
    access: { principal: principal.ok, tenant: registered.tenant },
    operation: 'change' as const,
    target: { kind: 'session' as const, session: command.input.session, command },
  }
  return { command, request, login: recognized.login }
}

it('qualifies a real own-login permission change for exactly its original operation', async () => {
  const app = await world(),
    who = await writer(app)
  const answer = await createSessionAccessCheck(app.ports).check(who.request)
  expect(answer).toMatchObject({
    kind: 'allowed',
    writeQualification: {
      tenant: who.command.input.tenant,
      session: who.command.input.session,
      operation: who.command.input.operation,
      commandDigest: commandDigest(who.command),
      permissionRevision: '0',
      principalRef: standingPrincipalRef(who.request.access.principal),
      policy: { owner: 'authorization', record: 'session.permission-own-login', revision: '1' },
    },
  })
})

it('retains the real login qualification only for the exact admitted permission command', async () => {
  const app = await world(),
    who = await writer(app)
  const answer = await createSessionAccessCheck(app.ports).check(who.request)
  if (answer.kind !== 'allowed' || answer.writeQualification === undefined)
    throw new Error('real login was not admitted')
  const checked = {
    request: who.request,
    evidence: answer.evidence,
    writeQualification: answer.writeQualification,
  }
  const saved = sessionPermissionQualification(checked, who.command)
  expect(saved).toMatchObject({
    protocol: 'harness-session-permission-qualification/1',
    session: 'permission-session',
    operation: 'sop_permission-write',
    permissionRevision: '0',
    change: {
      capabilityId: 'schedule',
      enforcementKey: 'create',
      rule: { pick: 'deny', allowedSet: null },
    },
  })
  const changed = {
    ...who.command,
    input: {
      ...who.command.input,
      declaration: { ...who.command.input.declaration, rule: { pick: 'allow', allowedSet: null } },
    },
  }
  expect(sessionPermissionQualification(checked, changed)).toBeNull()
  expect(
    sessionPermissionQualification(
      { request: who.request, evidence: answer.evidence },
      who.command,
    ),
  ).toBeNull()
})

it('rejects a copied principal and a signed principal carrying another account login', async () => {
  const app = await world(),
    who = await writer(app),
    other = await writer(app, 'another-writer')
  const checker = createSessionAccessCheck(app.ports)
  expect(
    await checker.check({
      ...who.request,
      access: { ...who.request.access, principal: { ...who.request.access.principal } },
    }),
  ).toEqual({ kind: 'denied' })
  const falseSource = app.issuer.issueActingForTenant({
    actor: who.request.access.principal.actor,
    tenant: who.request.access.tenant,
    work: other.request.access.principal.work,
  })
  if ('failure' in falseSource) throw new Error('test source not issued')
  expect(
    await checker.check({
      ...who.request,
      access: { ...who.request.access, principal: falseSource.ok },
    }),
  ).toEqual({ kind: 'denied' })
})

it('rejects a newly checked request after the original login is revoked', async () => {
  const app = await world(),
    who = await writer(app),
    checker = createSessionAccessCheck(app.ports)
  expect(await checker.check(who.request)).toHaveProperty('writeQualification')
  expect(await app.governance.revokeLogin({ login: who.login, target: who.login })).toMatchObject({
    kind: 'succeeded',
  })
  expect(await checker.check(who.request)).toEqual({ kind: 'denied' })
})

it('rejects another target tenant or Session and an unknown authorization expression', async () => {
  const app = await world(),
    who = await writer(app),
    other = await writer(app, 'other-tenant')
  const checker = createSessionAccessCheck(app.ports)
  expect(await checker.check({ ...who.request, access: other.request.access })).toEqual({
    kind: 'denied',
  })
  expect(
    await checker.check({
      ...who.request,
      target: { ...who.request.target, session: sessionId('different') },
    }),
  ).toEqual({ kind: 'denied' })
  who.command.input.declaration.authorization.record = 'caller-invented'
  expect(await checker.check(who.request)).toEqual({ kind: 'denied' })
})

it('keeps the original command binding across the login await', async () => {
  const app = await world(),
    who = await writer(app)
  const started = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>()
  const checker = createSessionAccessCheck({
    ...app.ports,
    login: {
      queryCurrentTenant: async input => {
        const answer = await app.governance.queryCurrentTenant(input)
        started.resolve()
        await resume.promise
        return answer
      },
    },
  })
  const original = {
    operation: who.command.input.operation,
    commandDigest: commandDigest(who.command),
  }
  const pending = checker.check(who.request)
  await started.promise
  who.command.input.operation = operationId('changed-after-await')
  who.command.input.declaration.expectedRevision = '9'
  resume.resolve()
  expect(await pending).toMatchObject({
    kind: 'allowed',
    writeQualification: { ...original, permissionRevision: '0' },
  })
})

it('reports a missing or failed login source as unavailable without exception text', async () => {
  const app = await world(),
    who = await writer(app)
  const { login: _login, ...withoutLogin } = app.ports
  expect(await createSessionAccessCheck(withoutLogin).check(who.request)).toMatchObject({
    kind: 'unavailable',
  })
  const checker = createSessionAccessCheck({
    ...app.ports,
    login: {
      queryCurrentTenant: async () => {
        throw new Error('SECRET LOGIN ERROR')
      },
    },
  })
  const answer = await checker.check(who.request)
  expect(answer).toMatchObject({ kind: 'unavailable' })
  expect(JSON.stringify(answer)).not.toContain('SECRET')
})

it('installs the real login qualification source through the authorization row', async () => {
  const app = await world(),
    who = await writer(app)
  const row = await app.context.plugin(authorization, {
    actionRules: { revision: 'permission-test', rules: [] },
  })
  try {
    expect(await app.context.sessionAccessCheck.check(who.request)).toMatchObject({
      kind: 'allowed',
      writeQualification: {
        operation: who.command.input.operation,
        commandDigest: commandDigest(who.command),
      },
    })
    expect(await app.governance.revokeLogin({ login: who.login, target: who.login })).toMatchObject(
      { kind: 'succeeded' },
    )
    expect(await app.context.sessionAccessCheck.check(who.request)).toEqual({ kind: 'denied' })
  } finally {
    await row.dispose()
  }
})
