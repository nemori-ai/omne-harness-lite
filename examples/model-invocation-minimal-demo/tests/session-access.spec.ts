import { Context } from '@deepseek-ai/cordis'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { SessionAccessAuthorityService } from '@omne-harness-lite/session-tenancy/cordis'
import type { AccessIdentity, AccessOperation, SessionAccessAuthorityOperations } from '@omne-harness-lite/session-tenancy'
import { expect, test, vi } from 'vitest'
import { createSessionAccessOwner } from '../src/session-access.ts'
import { createTrustedSessionAccessPlugin } from '../src/trusted-session-access.ts'

const tenant = parseTenantId({ organization: 'personal-member', account: 'member' })
const session = parseOpaqueIdentifier('session', 'SessionRef')
if (!('ok' in tenant) || !('ok' in session)) throw new Error('invalid fixture')
const scope = { tenant: tenant.ok, session: session.ok }
const ingress: AccessIdentity = {
  binding: 'authenticated-login-1', principal: 'member', principalKind: 'human', scope,
  consumer: 'tool', contextKeys: ['public', 'tool'],
}
const request = { ...ingress, contextKeys: ['tool'], operations: ['context.read'] satisfies AccessOperation[] }
function fixture() {
  let current = true
  const authority: SessionAccessAuthorityOperations = { check: vi.fn<SessionAccessAuthorityOperations['check']>(async (identity, operation) =>
    current && identity.binding === ingress.binding && identity.principal === ingress.principal && operation === 'context.read'
      ? { kind: 'authorized', identity } : { kind: 'rejected', reason: 'notAuthorized' }) }
  return { authority, revoke() { current = false } }
}

test('private token membership, narrowed context and current authority are all required', async () => {
  const f = fixture(), owner = createSessionAccessOwner(f.authority)
  const issuer = owner.issuerFor(ingress), issued = await issuer.issue(request)
  expect(issued.kind).toBe('issued')
  if (issued.kind !== 'issued') throw new Error('issue failed')
  expect(await owner.operations.authorize(issued.access, scope, 'context.read')).toEqual({
    kind: 'authorized', identity: { ...ingress, contextKeys: ['tool'] },
  })
  expect(await owner.operations.authorize(issued.access, scope, 'tool.submit')).toMatchObject({ reason: 'notAuthorized' })
  const other = createSessionAccessOwner(f.authority)
  expect(await other.operations.authorize(issued.access, scope, 'context.read')).toMatchObject({ reason: 'notAuthorized' })
  expect(await owner.operations.authorize({ ...issued.access }, scope, 'context.read')).toMatchObject({ reason: 'notAuthorized' })
  f.revoke()
  expect(await owner.operations.authorize(issued.access, scope, 'context.read')).toMatchObject({ reason: 'notAuthorized' })
})

test('issuer cannot invent an ingress binding, enlarge keys, or change principal kind', async () => {
  const f = fixture(), owner = createSessionAccessOwner(f.authority)
  expect(await owner.issuerFor({ ...ingress, binding: 'invented' }).issue(request)).toMatchObject({ reason: 'notAuthorized' })
  const issuer = owner.issuerFor(ingress)
  expect(await issuer.issue({ ...request, contextKeys: ['secret'] })).toMatchObject({ reason: 'notAuthorized' })
  expect(await issuer.issue({ ...request, principalKind: 'system' })).toMatchObject({ reason: 'notAuthorized' })
})

test('revocation and owner stop during current-authority await win over an old answer', async () => {
  const f = fixture(), owner = createSessionAccessOwner(f.authority), issuer = owner.issuerFor(ingress)
  const issued = await issuer.issue(request)
  if (issued.kind !== 'issued') throw new Error('issue failed')
  let resume = () => {}
  const gate = new Promise<void>(resolve => { resume = resolve })
  vi.mocked(f.authority.check).mockImplementation(async identity => { await gate; return { kind: 'authorized', identity } })
  const checking = owner.operations.authorize(issued.access, scope, 'context.read')
  issuer.revoke(issued.access)
  resume()
  expect(await checking).toMatchObject({ reason: 'notAuthorized' })
  const issuing = issuer.issue(request)
  owner.stop()
  expect(await issuing).toMatchObject({ reason: 'ownerStopped' })
})

test('caller mutation cannot enlarge inputs held across an authority await; dependency failure is explicit', async () => {
  const f = fixture(), owner = createSessionAccessOwner(f.authority)
  let resume = () => {}
  const gate = new Promise<void>(resolve => { resume = resolve })
  vi.mocked(f.authority.check).mockImplementation(async identity => { await gate; return { kind: 'authorized', identity } })
  const mutable = { ...request, contextKeys: ['tool'], operations: ['context.read'] satisfies AccessOperation[] }
  const work = owner.issuerFor(ingress).issue(mutable)
  mutable.contextKeys.push('secret'); mutable.operations.push('context.read')
  resume()
  const issued = await work
  if (issued.kind !== 'issued') throw new Error('issue failed')
  expect(await owner.operations.authorize(issued.access, scope, 'context.read')).toMatchObject({ identity: { contextKeys: ['tool'] } })
  vi.mocked(f.authority.check).mockRejectedValue(new Error('authority offline'))
  expect(await owner.operations.authorize(issued.access, scope, 'context.read')).toMatchObject({ reason: 'unavailable' })
})

test('actual Cordis dependency replacement cannot revive old issuer or tokens', async () => {
  const ctx = new Context(), f = fixture(), assembly = createTrustedSessionAccessPlugin()
  class Authority extends SessionAccessAuthorityService {
    check(...args: Parameters<SessionAccessAuthorityOperations['check']>) { return f.authority.check(...args) }
  }
  const authorityPlugin = { name: 'test-authority', apply(inner: Context) { new Authority(inner) } }
  let authorityFiber = await ctx.plugin(authorityPlugin)
  const fiber = await ctx.plugin(assembly.plugin, {})
  try {
    const old = assembly.currentIssuer(ingress)
    if ('unavailable' in old) throw new Error('issuer missing')
    const issued = await old.issue(request)
    if (issued.kind !== 'issued') throw new Error('issue failed')
    const oldService = ctx.sessionAccess
    await authorityFiber.dispose()
    expect(await old.issue(request)).toMatchObject({ reason: 'ownerStopped' })
    expect(await oldService.authorize(issued.access, scope, 'context.read')).toMatchObject({ reason: 'ownerStopped' })
    authorityFiber = await ctx.plugin(authorityPlugin)
    await fiber
    expect(await ctx.sessionAccess.authorize(issued.access, scope, 'context.read')).toMatchObject({ reason: 'notAuthorized' })
    expect(await old.issue(request)).toMatchObject({ reason: 'ownerStopped' })
  } finally { await fiber.dispose(); await authorityFiber.dispose() }
})
