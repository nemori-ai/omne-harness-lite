import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { LogAuthorityOperations } from '@omne-harness-lite/session-log'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type { LoginsService } from '@omne-harness-lite/account-identity'
import type { MembershipsService } from '@omne-harness-lite/organization-governance'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import type { AuthenticatedActor } from './types.ts'
import type { createTrustedSessionAccessPlugin } from './trusted-session-access.ts'
import type { createSessionIngress } from './session-ingress.ts'
export interface SqlLogAuthoritySources {
  readonly storage: AtomicStorage
  readonly recovery: RecoveryAccess
  readonly tenancy: SessionTenancyReader
  readonly logins: () => Pick<LoginsService, 'participate'> | undefined
  readonly memberships: () => Pick<MembershipsService, 'participate'> | undefined
  readonly access: ReturnType<typeof createTrustedSessionAccessPlugin>
  readonly ingress: () => ReturnType<typeof createSessionIngress> | undefined
}
type Check = 'authorized' | 'notAuthorized' | 'unavailable'
async function sameTenantIn(
  unit: StorageUnit,
  source: SqlLogAuthoritySources,
  scope: SessionScope,
): Promise<Check> {
  const held = await source.tenancy.participate(unit).holdingTenant(scope.session)
  if ('failure' in held) return held.failure === 'unavailable' ? 'unavailable' : 'notAuthorized'
  return tenantIdEquals(held.tenant, scope.tenant) ? 'authorized' : 'notAuthorized'
}
async function memberIn(
  unit: StorageUnit,
  source: SqlLogAuthoritySources,
  actor: AuthenticatedActor,
  scope: SessionScope,
): Promise<Check> {
  const memberships = source.memberships()
  if (memberships === undefined) return 'unavailable'
  const current = await memberships.participate(unit).currentTenant(actor.loginState)
  if ('failure' in current)
    return current.failure === 'unavailable' ? 'unavailable' : 'notAuthorized'
  if (!tenantIdEquals(current.ok, actor.tenant) || !tenantIdEquals(current.ok, scope.tenant))
    return 'notAuthorized'
  const standing = await memberships.participate(unit).standing(current.ok)
  if ('failure' in standing) return 'unavailable'
  return standing.standing === 'effective' ? 'authorized' : 'notAuthorized'
}
export async function checkSqlActor(
  unit: StorageUnit,
  source: SqlLogAuthoritySources,
  actor: AuthenticatedActor,
  scope: SessionScope,
): Promise<Check> {
  unit.assertStorage(source.storage)
  const logins = source.logins()
  if (logins === undefined) return 'unavailable'
  const verified = await logins.participate(unit).verify(actor.loginState)
  if ('failure' in verified) return 'notAuthorized'
  if (verified.ok !== actor.account) return 'notAuthorized'
  const member = await memberIn(unit, source, actor, scope)
  return member === 'authorized' ? sameTenantIn(unit, source, scope) : member
}
/** The private grant identifies the actor; current login, membership and tenancy use this unit. */
export function createSqlLogAuthority(source: SqlLogAuthoritySources): LogAuthorityOperations {
  return Object.freeze<LogAuthorityOperations>({
    storage: source.storage,
    async authorize(unit, access, scope) {
      unit.assertStorage(source.storage)
      if (access === source.recovery) {
        const current = await sameTenantIn(unit, source, scope)
        return { kind: current === 'notAuthorized' ? 'denied' : current }
      }
      const identity = source.access.captureIdentity(
        access as SessionAccess,
        scope,
        'session.log.coordinate',
      )
      if (identity === undefined) return { kind: 'denied' }
      const ingress = source.ingress()
      if (ingress === undefined) return { kind: 'unavailable' }
      const checked = await ingress.checkIn(
        unit,
        identity,
        'session.log.coordinate',
        (ownedUnit, actor, boundScope) => checkSqlActor(ownedUnit, source, actor, boundScope),
      )
      return {
        kind:
          checked.kind === 'authorized'
            ? 'authorized'
            : checked.reason === 'unavailable' || checked.reason === 'ownerStopped'
              ? 'unavailable'
              : 'denied',
      }
    },
    async authorizeEnumeration(unit, access) {
      unit.assertStorage(source.storage)
      return { kind: access === source.recovery ? 'authorized' : 'denied' }
    },
  })
}
