// 夹具 `identity` 行：没有关闭阶段的真实行。它 inject 受信名 `storage`，所以要求提供者不是 S0 替身（DP1-C10）。
// 这个目录是 R1-5 的样板：新增一行只新增这个目录，再在 `./cordis` 导出与发行配置各加一条。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { defineRow } from '../../../../../src/row.ts'
import {
  FixtureIdentityService,
  FixtureTenantStandingSourceService,
  identityKey,
  storageKey,
  tenantStandingSourceKey,
} from '../../definitions.ts'

class IdentityImpl extends FixtureIdentityService {}
class TenantStandingSourceImpl extends FixtureTenantStandingSourceService {}

const memberPlugin: Plugin.Object = {
  name: 'fixture-identity',
  inject: [storageKey],
  apply(ctx: Context) {
    new IdentityImpl(ctx)
    new TenantStandingSourceImpl(ctx)
  },
}

export const fixtureIdentity = defineRow({
  row: 'identity',
  implementation: 'real',
  manifest: {
    provides: [identityKey, tenantStandingSourceKey],
    injects: [storageKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: memberPlugin,
})
