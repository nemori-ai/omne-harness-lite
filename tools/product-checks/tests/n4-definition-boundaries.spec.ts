import { describe, expect, it } from 'vitest'
import { corePureImports, ogS42DynamicResolve, restrictedCallSites } from '../src/rules/index.ts'

const file = (path: string, text: string) => ({ path, text })

describe('N4 migrated public boundaries', () => {
  it('allows the shared generic codec facade while retaining provider and private-path bans', () => {
    const path = 'core/model-request-runtime/src/image-codec.ts'
    expect(
      corePureImports.check([file(path, "export type * from '@omne-harness/image-codec'")]),
    ).toEqual([])
    for (const code of [
      "export * from '@omne-harness/image-codec/src/sharp-codec'",
      "import '@omne-harness/pi-ai-transport'",
      "import '@omne-harness/execution-environments-host'",
    ])
      expect(corePureImports.check([file(path, code)])).toHaveLength(1)
  })
  it('allows the existing expiry error type without opening a runtime compiler dependency', () => {
    const path = 'core/offer-expiry/src/validate.ts'
    expect(corePureImports.check([file(path, "import type { ErrorObject } from 'ajv'")])).toEqual(
      [],
    )
    for (const code of ["import Ajv from 'ajv'", "import 'ajv'", "export * from 'ajv'"])
      expect(corePureImports.check([file(path, code)])).toHaveLength(1)
    expect(
      corePureImports.check([
        file('core/offer-expiry/src/index.ts', "import type { ErrorObject } from 'ajv'"),
      ]),
    ).toHaveLength(1)
  })
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
          "import '@omne-harness/model-request-runtime-local'",
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

describe('stage 2 extracted definition boundaries', () => {
  it('permits ar3 history signature owners while rejecting providers, Cordis and the reverse runner dependency', () => {
    const path = 'core/tool-admission/src/action-history.ts'
    for (const dependency of [
      'asset-registry',
      'call-accounts',
      'session-log',
      'tool-definition',
    ]) {
      expect(
        corePureImports.check([
          file(path, `import type { Value } from '@omne-harness/${dependency}'`),
        ]),
      ).toEqual([])
    }
    for (const dependency of [
      'tool-admission-local',
      'model-invocation-minimal-demo',
      'loop-extension-runner',
      'session-log/cordis',
    ]) {
      expect(
        corePureImports.check([
          file(path, `import type { Value } from '@omne-harness/${dependency}'`),
        ]),
      ).toHaveLength(1)
    }
    expect(corePureImports.check([file(path, "import '@deepseek-ai/cordis'")])).toHaveLength(1)
  })
  it('permits the adopted digest codec without granting crypto to other runner files or admission definitions', () => {
    const text = "import { createHash } from 'node:crypto'"
    expect(
      corePureImports.check([file('core/loop-extension-runner/src/admission-digest.ts', text)]),
    ).toEqual([])
    for (const path of [
      'core/loop-extension-runner/src/index.ts',
      'core/loop-extension-runner/src/runner-admission-token.ts',
      'core/tool-admission/src/admission-digest.ts',
    ])
      expect(corePureImports.check([file(path, text)])).toHaveLength(1)
    expect(
      corePureImports.check([
        file('core/loop-extension-runner/src/admission-digest.ts', "import 'node:fs'"),
      ]),
    ).toHaveLength(1)
  })
  const owners = [
    'asset-evaluation',
    'model-request-runtime',
    'session-log',
    'session-tenancy',
    'assembly-manifest',
    'asset-registry',
    'model-profile-directory',
    'loop-extension-runner',
    'runtime-context',
    'execution-environments',
    'tool-execution-runtime',
    'tool-admission',
  ]
  it.each(owners)('%s exposes Cordis only through its explicit integration face', owner => {
    expect(
      corePureImports.check([
        file(`core/${owner}/src/cordis.ts`, "import {Service} from '@deepseek-ai/cordis'"),
      ]),
    ).toEqual([])
    for (const text of [
      "import '@deepseek-ai/cordis'",
      "export * from './cordis.ts'",
      `import '@omne-harness/${owner}'`,
      "import '@omne-harness/model-request-runtime-local'",
      "import 'node:fs'",
    ])
      expect(corePureImports.check([file(`core/${owner}/src/index.ts`, text)])).toHaveLength(1)
  })
  it('does not give new definition packages a dynamic compiler or private provider import', () => {
    for (const owner of owners.filter(owner => owner !== 'asset-evaluation'))
      for (const text of [
        "import 'ajv'",
        "import 'node:module'",
        "import '@omne-harness/model-profile-directory-local/src/records.ts'",
      ])
        expect(corePureImports.check([file(`core/${owner}/src/types.ts`, text)])).toHaveLength(1)
  })
  it('allows the tool journal fixed graph only at its declared load and build sites', () => {
    expect(
      corePureImports.check([
        file(
          'core/tool-execution-runtime/src/journal-values.ts',
          "import { createRequire } from 'node:module'",
        ),
      ]),
    ).toEqual([])
    expect(
      corePureImports.check([
        file(
          'core/tool-execution-runtime/src/schema-inputs.ts',
          "import schema from '@omne-harness/tool-execution-runtime/journal-schema'",
        ),
      ]),
    ).toEqual([])
    for (const path of [
      'core/tool-execution-runtime/src/index.ts',
      'core/tool-execution-runtime/src/journal-codec.ts',
    ]) {
      for (const code of [
        "import 'node:module'",
        "import 'ajv'",
        "import '@omne-harness/tool-execution-runtime/journal-schema'",
      ])
        expect(corePureImports.check([file(path, code)])).toHaveLength(1)
    }
    for (const owner of ['session-log', 'identity-values', 'offer-expiry'])
      expect(
        corePureImports.check([
          file(
            'core/tool-execution-runtime/src/journal-codec.ts',
            `import '@omne-harness/${owner}'`,
          ),
        ]),
      ).toEqual([])
  })
})
