// 夹具 `identity` 行：没有关闭阶段的真实行。它 inject 受信名 `storage`，所以要求提供者不是 S0 替身（DP1-C10）；
// 另 inject 根上的入口对象 `identityClock`（装配页 AAP-14）。它提供的 `tenantStanding`、`identityGovernance` 是受信名，
// 装在本行的受信上下文里（R2-D203 P-9）。
// 这个目录是 R1-5 的样板：新增一行只新增这个目录，再在 `./cordis` 导出与发行配置各加一条。
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
