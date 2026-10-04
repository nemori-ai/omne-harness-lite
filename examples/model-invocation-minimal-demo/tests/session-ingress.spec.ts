import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { LOGINS_SERVICE, type LoginsService } from '@omne-harness-lite/account-identity'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createSessionIngress } from '../src/session-ingress.ts'
import type { AuthenticatedActor } from '../src/types.ts'
import { actor, deployment, latch, PASSWORD } from './support.ts'

const who: AuthenticatedActor = {
  account: unwrap(parseOpaqueIdentifier('ingress-account', 'AccountId')),
  loginState: unwrap(parseOpaqueIdentifier('ingress-login', 'LoginStateId')),
  tenant: unwrap(parseTenantId({ organization: 'ingress-org', account: 'ingress-account' })),
}
const scope: SessionScope = {
  tenant: who.tenant,
  session: unwrap(parseOpaqueIdentifier('ingress-session', 'SessionRef')),
}

it('matches the full prebuilt identity and operation before checking current facts', async () => {
  const check = vi.fn(async () => 'authorized' as const)
  const owner = createSessionIngress(check)
  const entered = await owner.enter(who, scope, 'tool', ['session'], ['context.read'])
  if (entered.kind !== 'entered') throw new Error('not entered')
  check.mockClear()
  const identity = entered.identity
  for (const altered of [
    { ...identity, binding: 'invented' },
    { ...identity, principal: 'another' },
    { ...identity, principalKind: 'system' as const },
    { ...identity, consumer: 'model' as const },
    { ...identity, contextKeys: ['session', 'secret'] },
    {
      ...identity,
      scope: { ...scope, session: unwrap(parseOpaqueIdentifier('elsewhere', 'SessionRef')) },
    },
  ])
    expect(await owner.operations.check(altered, 'context.read')).toMatchObject({
      reason: 'notAuthorized',
    })
  expect(await owner.operations.check(identity, 'tool.submit')).toMatchObject({
    reason: 'notAuthorized',
  })
  expect(check).not.toHaveBeenCalled()
  expect(await owner.operations.check(identity, 'context.read')).toMatchObject({
    kind: 'authorized',
  })
  expect(check).toHaveBeenCalledTimes(1)
})

it('revocation during an authority read wins; revoked ingress cannot revive', async () => {
  const check = vi.fn<Parameters<typeof createSessionIngress>[0]>(async () => 'authorized')
  const owner = createSessionIngress(check)
  const entered = await owner.enter(who, scope, 'tool', ['session'], ['context.read'])
  if (entered.kind !== 'entered') throw new Error('not entered')
  const gate = latch()
  check.mockImplementation(async () => {
    await gate.promise
    return 'authorized'
  })
  const reading = owner.operations.check(entered.identity, 'context.read')
  owner.revoke(entered.identity.binding)
  gate.resolve()
  expect(await reading).toMatchObject({ reason: 'notAuthorized' })
  check.mockResolvedValue('authorized')
  expect(await owner.operations.check(entered.identity, 'context.read')).toMatchObject({
    reason: 'notAuthorized',
  })
  const fresh = await owner.enter(who, scope, 'tool', ['session'], ['context.read'])
  if (fresh.kind !== 'entered') throw new Error('not entered')
  expect(fresh.identity.binding).not.toBe(entered.identity.binding)
  check.mockResolvedValue('notAuthorized')
  expect(await owner.operations.check(fresh.identity, 'context.read')).toMatchObject({
    reason: 'notAuthorized',
  })
  check.mockResolvedValue('authorized')
  expect(await owner.operations.check(fresh.identity, 'context.read')).toMatchObject({
    reason: 'notAuthorized',
  })
})

it('unavailable facts do not grant access or permanently revoke a valid ingress', async () => {
  const check = vi.fn<Parameters<typeof createSessionIngress>[0]>(async () => 'authorized')
  const owner = createSessionIngress(check)
  const entered = await owner.enter(who, scope, 'tool', ['session'], ['context.read'])
  if (entered.kind !== 'entered') throw new Error('not entered')
  check.mockRejectedValue(new Error('facts offline'))
  expect(await owner.operations.check(entered.identity, 'context.read')).toMatchObject({
    reason: 'unavailable',
  })
  check.mockResolvedValue('authorized')
  expect(await owner.operations.check(entered.identity, 'context.read')).toMatchObject({
    kind: 'authorized',
  })
  owner.stop()
  expect(await owner.operations.check(entered.identity, 'context.read')).toMatchObject({
    reason: 'ownerStopped',
  })
})

it('binds through real login, membership and session rows; old tokens cannot survive revoked login or app close', async () => {
  const config = await deployment('tool-session-ingress')
  const dir = join(dirname(config.databaseFile), 'logs')
  await mkdir(dir, { mode: 0o700 })
  let context: Context | undefined
  const app = createAcceptanceApplication(
    {
      ...config,
      sessionLog: {
        dir,
        policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
        processOwnership: { current: 'tool-session-ingress', observeExit: async () => 'unknown' },
      },
    },
    {
      stage: 'sessionLog',
      diagnostics: { record() {} },
      hooks: {
        async fiberCreated(name, fiber) {
          if (name === 'sessionAccess') {
            await fiber
            context = fiber.ctx
          }
        },
      },
    },
  )
  try {
    await app.ready
    const alice = await actor(app),
      bob = await actor(app, 'bob')
    expect(await app.bindToolSession(alice, 'absent')).toMatchObject({ reason: 'notAuthorized' })
    expect(await app.createToolSession(alice, 'tool-session')).toHaveProperty('kind', 'bound')
    expect(await app.bindToolSession(bob, 'tool-session')).toMatchObject({
      reason: 'notAuthorized',
    })
    const bound = await app.bindToolSession(alice, 'tool-session')
    if (bound.kind !== 'bound' || !context) throw new Error('tool binding absent')
    const access = context.sessionAccess
    expect(await access.authorize(bound.tool, bound.scope, 'context.read')).toMatchObject({
      kind: 'authorized',
      identity: { consumer: 'tool', contextKeys: ['session'] },
    })
    expect(await access.authorize(bound.control, bound.scope, 'run.advance')).toMatchObject({
      kind: 'authorized',
      identity: { consumer: 'coordinator' },
    })
    expect(await access.authorize(bound.tool, bound.scope, 'context.configure')).toMatchObject({
      reason: 'notAuthorized',
    })
    expect(await access.authorize(bound.tool, bound.scope, 'tool.submit')).toMatchObject({
      kind: 'authorized',
    })
    expect(await access.authorize(bound.tool, bound.scope, 'session.log.coordinate')).toMatchObject(
      {
        reason: 'notAuthorized',
      },
    )
    const owner = context.sessionLogOwner
    expect(await owner.readPrefix(bound.tool, bound.scope)).toMatchObject({
      reason: 'notAuthorized',
    })
    expect(await owner.borrow(bound.tool, bound.scope)).toMatchObject({
      reason: 'notAuthorized',
    })
    expect(await owner.readPrefix(bound.control, bound.scope)).toMatchObject({ kind: 'prefix' })
    expect(await access.authorize({ ...bound.tool }, bound.scope, 'context.read')).toMatchObject({
      reason: 'notAuthorized',
    })
    const logins = context.get(LOGINS_SERVICE) as LoginsService
    await logins.revoke(alice.loginState, alice.loginState)
    expect(await access.authorize(bound.tool, bound.scope, 'context.read')).toMatchObject({
      reason: 'notAuthorized',
    })
    const relogged = await app.authenticate('alice', PASSWORD)
    if (!('account' in relogged)) throw new Error('new login absent')
    const newBinding = await app.bindToolSession(relogged, 'tool-session')
    if (newBinding.kind !== 'bound') throw new Error('new binding absent')
    expect(await access.authorize(newBinding.tool, bound.scope, 'context.read')).toMatchObject({
      kind: 'authorized',
    })
    expect(await access.authorize(bound.tool, bound.scope, 'context.read')).toMatchObject({
      reason: 'notAuthorized',
    })
    expect((await app.close()).complete).toBe(true)
    expect(await access.authorize(newBinding.tool, bound.scope, 'context.read')).toMatchObject({
      reason: 'ownerStopped',
    })
  } finally {
    expect((await app.close()).complete).toBe(true)
  }
})
