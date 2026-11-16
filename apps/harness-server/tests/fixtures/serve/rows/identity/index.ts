import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  identityClockKey,
  StandingReservationsService,
  standingReservationsKey,
} from '@omne-harness/identity/cordis'
import { defineRow } from '../../../../../src/row.ts'
import {
  FixtureIdentityGovernanceService,
  FixtureIdentityService,
  FixtureTenantStandingSourceService,
  identityGovernanceKey,
  identityKey,
  storageKey,
  tenantStandingSourceKey,
} from '../../definitions.ts'

class IdentityImpl extends FixtureIdentityService {}
class TenantStandingSourceImpl extends FixtureTenantStandingSourceService {}
class IdentityGovernanceImpl extends FixtureIdentityGovernanceService {}
class ReservationsImpl extends StandingReservationsService {
  readonly observe = async () => ({ kind: 'unavailable' as const, diagnostic: 'fixture' })
  readonly reserve = this.observe
  readonly settle = this.observe
  readonly recover = this.observe
}

const memberPlugin: Plugin.Object = {
  name: 'fixture-identity',
  inject: [storageKey, identityClockKey],
  apply(ctx: Context) {
    new IdentityImpl(ctx)
    new TenantStandingSourceImpl(ctx)
    new IdentityGovernanceImpl(ctx)
    new ReservationsImpl(ctx)
  },
}

export const fixtureIdentity = defineRow({
  row: 'identity',
  implementation: 'real',
  manifest: {
    provides: [
      identityKey,
      tenantStandingSourceKey,
      identityGovernanceKey,
      standingReservationsKey,
    ],
    injects: [storageKey, identityClockKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: memberPlugin,
})
