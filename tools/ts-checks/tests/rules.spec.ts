// 每条规则的「故意违反就失败」自测：违反的夹具必须被报出，干净的夹具必须无违反。
import { describe, expect, it } from 'vitest'
import {
  noBailControl,
  noTestingImport,
  noWallClock,
  restrictedCallSites,
  runRules,
  type SourceFile,
} from '../src/index.ts'

const file = (path: string, text: string): SourceFile => ({ path, text })

describe('no-wall-clock', () => {
  it('CG1显示时刻仅豁免具名文件，其余frontend和领域文件仍报错', () => {
    const observation = file(
      'frontend/governance-client-operations-local/src/observation-time.ts',
      'new Date()',
    )
    const action = file('frontend/governance-client-operations-local/src/actions.ts', 'new Date()')
    const domain = file('tenancy/account-identity-sql/src/observation-time.ts', 'new Date()')
    expect(noWallClock.check([observation, action, domain]).map(x => x.path)).toEqual([
      action.path,
      domain.path,
    ])
  })

  it('产品源码用 Date.now() ⇒ 报出；infra/clock 与测试豁免', () => {
    const bad = file('tenancy/organization-governance-sql/src/offers.ts', 'const t = Date.now()\n')
    const clockImpl = file('infra/clock/src/clock.ts', 'wall: () => Date.now()\n')
    const test = file('tenancy/organization-governance-sql/tests/x.spec.ts', 'Date.now()\n')
    const clean = file(
      'tenancy/organization-governance-sql/src/offers.ts',
      'const t = clock.now()\n',
    )
    expect(noWallClock.check([bad])).toMatchObject([
      { rule: 'no-wall-clock', path: bad.path, line: 1 },
    ])
    expect(noWallClock.check([clockImpl, test, clean])).toEqual([])
  })
})

describe('no-bail-control', () => {
  it('ctx.bail( ⇒ 报出；serial 不报', () => {
    const bad = file(
      'tenancy/account-identity-sql/src/plugin.ts',
      "const vetoed = ctx.bail('x', 1)\n",
    )
    const clean = file('tenancy/account-identity-sql/src/plugin.ts', "await ctx.serial('x', 1)\n")
    expect(noBailControl.check([bad])).toHaveLength(1)
    expect(noBailControl.check([clean])).toEqual([])
  })
})

describe('restricted-call-sites', () => {
  it('account-registration 之外调 accounts.produce( 或解析 organization-purge ⇒ 报出', () => {
    const badProduce = file(
      'tenancy/organization-governance-sql/src/x.ts',
      'await accounts.produce(id, cred)\n',
    )
    const badPurge = file(
      'apps-ish/tenancy/account-identity-sql/src/x.ts',
      "ctx.get('organization-purge')\n",
    )
    const okRegistration = file(
      'tenancy/account-registration-sequential/src/register.ts',
      "accounts.produce(a, b); ctx.get('organization-purge')\n",
    )
    const okOwner = file(
      'tenancy/organization-governance-sql/src/index.ts',
      "export const ORGANIZATION_PURGE_SERVICE = 'organization-purge' as const\n",
    )
    const okAiOwner = file('tenancy/account-identity-sql/src/accounts.ts', 'produce(a, b) { }\n')
    expect(restrictedCallSites.check([badProduce, badPurge])).toHaveLength(2)
    expect(restrictedCallSites.check([okRegistration, okOwner, okAiOwner])).toEqual([])
  })
})

describe('no-testing-import', () => {
  it('产品源码 import ./testing ⇒ 报出；测试文件豁免', () => {
    const bad = file(
      'tenancy/account-identity-sql/src/plugin.ts',
      "import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'\n",
    )
    const test = file(
      'tenancy/account-identity-sql/tests/x.spec.ts',
      "import { testClock } from '@omne-harness-lite/offer-expiry/testing'\n",
    )
    const clean = file(
      'tenancy/account-identity-sql/src/plugin.ts',
      "import { definePlugin } from '@omne-harness-lite/kernel-basis'\n",
    )
    expect(noTestingImport.check([bad])).toHaveLength(1)
    expect(noTestingImport.check([test, clean])).toEqual([])
  })
})

describe('runRules', () => {
  it('汇总全部规则', () => {
    const violations = runRules([
      file('tenancy/x/src/a.ts', "Date.now(); ctx.bail('e'); accounts.produce(1)\n"),
    ])
    expect(violations.map(v => v.rule).sort()).toEqual([
      'no-bail-control',
      'no-wall-clock',
      'restricted-call-sites',
    ])
  })
})
