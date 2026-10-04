import { describe, expect, it } from 'vitest'
import { corePureImports, ogS42DynamicResolve, restrictedCallSites } from '../src/index.ts'

const file = (path: string, text: string) => ({ path, text })

describe('N4 migrated public boundaries', () => {
  it('loads Cordis only from the public definition Cordis face', () => {
    expect(
      corePureImports.check([
        file(
          'core/organization-governance/src/cordis.ts',
          "import { Service } from '@deepseek-ai/cordis'",
        ),
      ]),
    ).toEqual([])
    for (const path of ['index.ts', 'types.ts', 'extra.ts']) {
      expect(
        corePureImports.check([
          file(`core/organization-governance/src/${path}`, "import '@deepseek-ai/cordis'"),
        ]),
      ).toHaveLength(1)
      expect(
        corePureImports.check([
          file(`core/organization-governance/src/${path}`, "export * from './cordis.ts'"),
        ]),
      ).toHaveLength(1)
    }
    expect(
      corePureImports.check([
        file('core/model-request-runtime/src/retry-delay.ts', "import '@deepseek-ai/cordis'"),
      ]),
    ).toHaveLength(1)
    expect(
      corePureImports.check([
        file(
          'core/model-request-runtime/src/retry-delay.ts',
          "import '@omne-harness-lite/model-request-runtime-local'",
        ),
      ]),
    ).toHaveLength(1)
  })

  it('does not grant purge resolution to either the provider or the definition', () => {
    for (const path of [
      'tenancy/organization-governance-sql/src/plugin.ts',
      'core/organization-governance/src/cordis.ts',
      'core/organization-governance/src/other.ts',
      'tenancy/governance-center-entry-node/src/routing/x.ts',
    ]) {
      for (const key of ['organizationPurge', 'organization-purge']) {
        expect(ogS42DynamicResolve.check([file(path, `ctx.get('${key}')`)])).toHaveLength(1)
        expect(
          ogS42DynamicResolve.check([file(path, `const plugin = { inject: ['${key}'] }`)]),
        ).toHaveLength(1)
      }
    }
    expect(
      ogS42DynamicResolve.check([
        file(
          'tenancy/account-registration-sequential/src/plugin.ts',
          "ctx.get('organizationPurge')",
        ),
      ]),
    ).toEqual([])
    expect(
      ogS42DynamicResolve.check([
        file(
          'core/organization-governance/src/cordis.ts',
          'export const ORGANIZATION_PURGE_SERVICE = OrganizationPurge.provide',
        ),
      ]),
    ).toEqual([])
    expect(
      ogS42DynamicResolve.check([
        file(
          'core/organization-governance/src/other.ts',
          'const leaked = ORGANIZATION_PURGE_SERVICE',
        ),
      ]),
    ).toHaveLength(1)
  })

  it('permits declarations while preserving restricted consumer call sites', () => {
    expect(
      restrictedCallSites.check([
        file(
          'core/organization-governance/src/types.ts',
          'createPersonal(account: unknown): unknown; sweepStaleSelections(): unknown',
        ),
      ]),
    ).toEqual([])
    expect(
      restrictedCallSites.check([
        file(
          'core/organization-governance/src/other.ts',
          'createPersonal(x); sweepStaleSelections()',
        ),
      ]),
    ).toHaveLength(2)
    expect(
      restrictedCallSites.check([
        file(
          'tenancy/governance-center-entry-node/src/x.ts',
          "ctx.get('organizationPurge'); createPersonal(x)",
        ),
      ]),
    ).toHaveLength(2)
  })
})
