// 发行内置 Tool 的来源权威与登记者（B3-T2a 第 2、3 项）：`verify` 只认与受信快照全等的官方来源，`admits`
// 只认本运行签发的发行登记者，快照只在清单与已安装产物全等时受信。每条用例只违反一项。
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { fail } from '@omne-harness/operation-result'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import {
  ReleaseToolContributionAuthority,
  TOOL_RELEASE_TENANT,
  loadProductionRelease,
  productionReleaseInput,
} from '../../src/entry/tool-release.ts'
import { loadToolRelease } from '../../src/entry/tool-release-manifest.ts'
import { TOOL_RESIDENCY_PRINCIPAL_KEY } from '../../src/entry/tool-residency-principal.ts'
import {
  authorityOf,
  formalManifest,
  packageCopy,
  releaseFixture,
  releaseFrom,
} from '../rows/tool-host/support.ts'
import { fixtureTenant, got, okOf } from './support.ts'

const unavailableSnapshot = async () =>
  Object.freeze({ kind: 'unavailable' as const, diagnostic: 'fixture' })

describe('toolContributionAuthority.verify', () => {
  it('passes each release entry and returns values from the snapshot, not the caller object', async () => {
    const { authority, manifest } = await releaseFixture()
    for (const name of ['Shell', 'Files']) {
      const given = { ...authorityOf(manifest, name), extra: 'caller field' } as ToolAuthority
      const verified = okOf(authority.verify(given), `verify ${name}`)
      expect(verified).toEqual(authorityOf(manifest, name))
      expect(verified).not.toHaveProperty('extra')
      expect(Object.isFrozen(verified)).toBe(true)
    }
  })

  const mutations: readonly [string, (a: ToolAuthority) => ToolAuthority][] = [
    ...(['owner', 'name', 'revision', 'digest'] as const).map(
      field =>
        [
          `asset.adoption.${field}`,
          (a: ToolAuthority) => ({
            ...a,
            asset: { ...a.asset, adoption: { ...a.asset.adoption, [field]: 'x' } },
          }),
        ] as [string, (a: ToolAuthority) => ToolAuthority],
    ),
    ...(['holding', 'publication'] as const).flatMap(part =>
      (['owner', 'record', 'revision', 'digest'] as const).map(
        field =>
          [
            `${part}.${field}`,
            (a: ToolAuthority) => ({ ...a, [part]: { ...a[part], [field]: 'x' } }),
          ] as [string, (a: ToolAuthority) => ToolAuthority],
      ),
    ),
  ]
  it.each(mutations)('answers invalid when %s differs from the release', async (_, mutate) => {
    const { authority, manifest } = await releaseFixture()
    expect(authority.verify(mutate(authorityOf(manifest, 'Shell')))).toMatchObject({
      failure: { kind: 'invalid' },
    })
  })

  it('answers invalid when the generation of both evidences is another release', async () => {
    const { authority, manifest } = await releaseFixture()
    const shell = authorityOf(manifest, 'Shell')
    const other = `sha256:${'1'.repeat(64)}`
    expect(
      authority.verify({
        ...shell,
        holding: { ...shell.holding, revision: other },
        publication: { ...shell.publication, revision: other },
      }),
    ).toMatchObject({ failure: { kind: 'invalid' } })
  })

  it('denies a layer that is not official and an asset that the release does not hold', async () => {
    const { authority, manifest } = await releaseFixture()
    const shell = authorityOf(manifest, 'Shell')
    expect(
      authority.verify({ ...shell, layer: { kind: 'tenant', tenant: fixtureTenant('a') } }),
    ).toEqual(fail({ kind: 'denied' }))
    expect(authority.verify({ ...shell, layer: { kind: 'official', extra: 1 } as never })).toEqual(
      fail({ kind: 'denied' }),
    )
    expect(authority.verify({ ...shell, asset: { ...shell.asset, name: 'Other' } })).toEqual(
      fail({ kind: 'denied' }),
    )
  })

  it('answers unavailable for every call while the snapshot is unavailable', async () => {
    const { authority, registrant } = await releaseFixture(unavailableSnapshot)
    const shell = authorityOf(formalManifest(), 'Shell')
    expect(authority.verify(shell)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(authority.admits(registrant, { kind: 'official' })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('toolContributionAuthority.admits', () => {
  it('admits only the release registrant of this run at the official layer', async () => {
    const { authority, registrant, root } = await releaseFixture()
    expect(registrant.tenant).toBe(TOOL_RELEASE_TENANT)
    expect(authority.admits(registrant, { kind: 'official' })).toEqual({ ok: undefined })
    const residency = got(root.get(TOOL_RESIDENCY_PRINCIPAL_KEY), 'toolResidencyPrincipal')
    expect(
      authority.admits({ principal: residency, tenant: registrant.tenant }, { kind: 'official' }),
    ).toEqual(fail({ kind: 'denied' }))
    // A copy of the registrant principal is not the issued object.
    expect(
      authority.admits(
        { principal: { ...(registrant.principal as object) }, tenant: registrant.tenant },
        { kind: 'official' },
      ),
    ).toEqual(fail({ kind: 'denied' }))
  })

  it('denies the registrant under another tenant and at a non-official layer', async () => {
    const { authority, registrant } = await releaseFixture()
    expect(
      authority.admits(
        { principal: registrant.principal, tenant: fixtureTenant('a') },
        { kind: 'official' },
      ),
    ).toEqual(fail({ kind: 'denied' }))
    expect(authority.admits(registrant, { kind: 'tenant', tenant: registrant.tenant })).toEqual(
      fail({ kind: 'denied' }),
    )
  })

  it('denies a registrant bound to another release generation and answers unavailable without one', async () => {
    const snapshot = await loadProductionRelease()
    expect(snapshot.kind).toBe('trusted')
    const { issuer } = inProcessPrincipalAuthority()
    const principal = okOf(issuer.issueSystem({ component: 'toolReleaseRegistrant' }), 'issue')
    const access = { principal, tenant: TOOL_RELEASE_TENANT }
    const stale = new ReleaseToolContributionAuthority(new Context(), snapshot, () => ({
      access,
      generation: `sha256:${'2'.repeat(64)}`,
    }))
    expect(stale.admits(access, { kind: 'official' })).toEqual(fail({ kind: 'denied' }))
    const absent = new ReleaseToolContributionAuthority(new Context(), snapshot, () => null)
    expect(absent.admits(access, { kind: 'official' })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('the startup snapshot', () => {
  it('is trusted for an exact copy of the installed artifacts and unavailable after one flipped byte', async () => {
    const exact = await packageCopy(false)
    const tampered = await packageCopy(true)
    try {
      expect(await releaseFrom(exact.root)()).toMatchObject({ kind: 'trusted' })
      expect(await releaseFrom(tampered.root)()).toEqual({
        kind: 'unavailable',
        diagnostic: 'artifacts differ from the manifest',
      })
    } finally {
      exact.remove()
      tampered.remove()
    }
  })

  it('is unavailable when the manifest was edited by hand, even with matching artifacts', async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'tool-release-manifest-')))
    try {
      const edited = formalManifest()
      edited.entries[1]?.construction.push('extra')
      const path = join(scratch, 'tool-release.json')
      writeFileSync(path, JSON.stringify(edited))
      expect(await loadToolRelease({ ...productionReleaseInput(), manifestPath: path })).toEqual({
        kind: 'unavailable',
        diagnostic: 'manifest differs from its recomputation',
      })
      writeFileSync(path, readFileSync(productionReleaseInput().manifestPath, 'utf8').slice(0, 40))
      expect(await loadToolRelease({ ...productionReleaseInput(), manifestPath: path })).toEqual({
        kind: 'unavailable',
        diagnostic: 'manifest unreadable',
      })
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('is unavailable when an imported module carries another executor than the manifest', async () => {
    const input = productionReleaseInput()
    const drifted = await loadToolRelease({
      ...input,
      importModules: async () => {
        const modules = await input.importModules()
        return {
          ...modules,
          filesToolModule: {
            ...modules.filesToolModule,
            executor: { ...modules.filesToolModule.executor, revision: '2' },
          },
        }
      },
    })
    expect(drifted).toEqual({
      kind: 'unavailable',
      diagnostic: 'manifest differs from its recomputation',
    })
  })
})
