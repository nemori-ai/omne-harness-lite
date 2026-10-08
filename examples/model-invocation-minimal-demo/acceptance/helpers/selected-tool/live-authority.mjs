import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Test-owned trusted application bootstrap. No issuer is exported as a Cordis service.
// Public operations consult real account, member and Session ownership in one SQL unit.
export function createLiveAuthority(host) {
  const bindings = new WeakMap()
  let admitting = true
  const recovery = Object.freeze({})
  const sameScope = (left, right) =>
    left?.session === right?.session && host.I.tenantIdEquals(left.tenant, right.tenant)
  async function current(unit, scope) {
    if (!sameScope(scope, host.scope)) return false
    const identity = await host.logins.participate(unit).verify(host.actor.loginState)
    if (!('ok' in identity) || identity.ok !== host.actor.account) return false
    const standing = await host.memberships.participate(unit).standing(scope.tenant)
    if (standing.standing !== 'effective') return false
    const owner = await host.sessionTenancy.participate(unit).holdingTenant(scope.session)
    return 'tenant' in owner && host.I.tenantIdEquals(owner.tenant, scope.tenant)
  }
  async function checkIn(unit, access, scope, operation) {
    if (!admitting) return { kind: 'rejected', reason: 'ownerStopped' }
    const bound = bindings.get(access)
    if (
      !bound ||
      bound.revoked ||
      !bound.operations.has(operation) ||
      !sameScope(bound.identity.scope, scope)
    )
      return { kind: 'rejected', reason: 'notAuthorized' }
    const valid = await current(unit, scope)
    return valid && !bound.revoked && admitting
      ? { kind: 'authorized', identity: bound.identity }
      : { kind: 'rejected', reason: 'notAuthorized' }
  }
  const operations = Object.freeze({
    authorize: (access, scope, operation) =>
      host.storage.atomic(unit => unit.run(() => checkIn(unit, access, scope, operation))),
  })
  const issuer = Object.freeze({
    async issue(consumer, requested) {
      assert.ok(admitting)
      assert.ok(
        await host.storage.atomic(unit => unit.run(() => current(unit, host.scope))),
        'Current real authority required before issuance',
      )
      const access = Object.freeze({})
      const identity = Object.freeze({
        binding: randomUUID(),
        principal: host.actor.account,
        principalKind: 'human',
        scope: host.scope,
        consumer,
        contextKeys: [],
      })
      bindings.set(access, { identity, operations: new Set(requested), revoked: false })
      return access
    },
    revoke(access) {
      const row = bindings.get(access)
      if (row) row.revoked = true
    },
  })
  const logAuthority = Object.freeze({
    storage: host.storage,
    async authorize(unit, access, scope) {
      unit.assertStorage(host.storage)
      if (admitting && access === recovery && sameScope(scope, host.scope)) {
        const held = await host.sessionTenancy.participate(unit).holdingTenant(scope.session)
        return {
          kind:
            'tenant' in held && host.I.tenantIdEquals(held.tenant, scope.tenant)
              ? 'authorized'
              : 'denied',
        }
      }
      const checked = await checkIn(unit, access, scope, 'session.log.coordinate')
      return { kind: checked.kind === 'authorized' ? 'authorized' : 'denied' }
    },
    async authorizeEnumeration(unit, access) {
      unit.assertStorage(host.storage)
      return { kind: admitting && access === recovery ? 'authorized' : 'denied' }
    },
  })
  return {
    operations,
    issuer,
    logAuthority,
    recovery,
    stop() {
      admitting = false
    },
  }
}
