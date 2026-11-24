import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context, type Message } from '@deepseek-ai/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  toolContributionAuthorityKey,
  type ToolContributionAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  deriveDefinition,
  judgeToolDefinition,
  programFunctions,
  programSignature,
  type ToolAuthority,
} from '@omne-harness/tool-contract/provider'
import {
  ReleaseToolContributionAuthority,
  createToolReleaseEntries,
  TOOL_RELEASE_LOGGER,
  TOOL_RELEASE_TENANT,
  loadProductionRelease,
  productionReleaseInput,
  releaseCurrentDefinitions,
  releaseDefinitionOf,
  releaseOf,
  rememberReleaseDefinition,
} from '../../src/entry/tool-release.ts'
import {
  RELEASE_ENTRY_FILE,
  governanceOf,
  loadToolRelease,
} from '../../src/entry/tool-release-manifest.ts'
import {
  filesToolModule,
  shellToolModule,
  skillsToolModule,
  webToolModule,
} from '@omne-harness/tool-definitions'
import { TOOL_RESIDENCY_PRINCIPAL_KEY } from '../../src/entry/tool-residency-principal.ts'
import {
  TEST_CONSTRUCTION,
  authorityOf,
  entryOf,
  formalManifest,
  packageCopy,
  releaseFixture,
  releaseFrom,
  tree,
} from '../rows/tool-host/support.ts'
import { heldToolAuthority } from '../../src/rows/tool-host/held-tools.ts'
import { rememberWorkspaceTool } from '../../src/rows/tool-host/workspace-tools.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

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

  it('verifies the tenant layer against what the tenant holds, and denies an asset that the release does not hold', async () => {
    const { authority, manifest } = await releaseFixture()
    const shell = authorityOf(manifest, 'Shell')
    // Nothing here tells what a tenant holds: the answer is that it cannot be read, never that it is held.
    expect(
      authority.verify({ ...shell, layer: { kind: 'tenant', tenant: fixtureTenant('a') } }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(
      authority.verify({ ...shell, layer: { kind: 'workspace', workspace: 'w' } as never }),
    ).toEqual(fail({ kind: 'denied' }))
    expect(authority.verify({ ...shell, layer: { kind: 'official', extra: 1 } as never })).toEqual(
      fail({ kind: 'denied' }),
    )
    expect(authority.verify({ ...shell, asset: { ...shell.asset, name: 'Other' } })).toEqual(
      fail({ kind: 'denied' }),
    )
  })

  it('verifies a version of a workspace tool only for the tenant a turn of which adopted that very version', async () => {
    const { authority, root } = await releaseFixture()
    const [a, b] = [fixtureTenant('a'), fixtureTenant('b')]
    const taken = {
      asset: 'workspace/shared/tool/wordcount',
      version: 'sha256:taken',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const given = heldToolAuthority(a, 'wordcount', taken)
    expect(authority.verify(given)).toEqual(fail({ kind: 'denied' }))
    rememberWorkspaceTool(root, a, taken, { kind: 'null' })
    expect(okOf(authority.verify(given), 'verify the adopted version')).toEqual(given)
    expect(authority.verify(heldToolAuthority(b, 'wordcount', taken))).toEqual(
      fail({ kind: 'denied' }),
    )
    const other = { ...taken, version: 'sha256:other' }
    expect(authority.verify(heldToolAuthority(a, 'wordcount', other))).toEqual(
      fail({ kind: 'denied' }),
    )
    // What the caller wrote beside the asset is not taken: the verified value is built again.
    const forged = { ...given, holding: { ...given.holding, record: 'forged' } }
    expect(okOf(authority.verify(forged), 'verify the forged one')).toEqual(given)
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

describe('the current definitions Tool reads by name', () => {
  it('answers unavailable without a trusted release, not that the tool is unknown', async () => {
    const definitions = releaseCurrentDefinitions<'agent'>(new Context())
    expect(
      await definitions.current({ principal: 'agent', tenant: fixtureTenant('a'), name: 'Shell' }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('what a program may call in the release', () => {
  it('marks Files, Web, Skills and Shell programmable, and no other tool', async () => {
    const fixture = await releaseFixture()
    const programmable = fixture.manifest.entries.filter(entry => entry.programmable)
    expect(programmable.map(entry => entry.asset.name).sort()).toEqual([
      'Files',
      'Shell',
      'Skills',
      'Web',
    ])
    for (const entry of fixture.manifest.entries)
      expect(governanceOf(entry).programmable).toBe(entry.programmable ? true : undefined)
  })

  it('gives a program exactly these functions, word for word, and TypeScript reads them', async () => {
    const fixture = await releaseFixture()
    const made = TEST_CONSTRUCTION
    const facts = {
      Shell: okOf(shellToolModule.createAuthor(tree(made.Shell)), 'Shell').facts,
      Files: okOf(filesToolModule.createAuthor(tree(made.Files)), 'Files').facts,
      Web: okOf(webToolModule.createAuthor(tree(made.Web)), 'Web').facts,
      Skills: okOf(skillsToolModule.createAuthor(tree(made.Skills)), 'Skills').facts,
    } as const
    const declared = fixture.manifest.entries.flatMap(entry => {
      const name = entry.asset.name as keyof typeof facts
      if (!entry.programmable) return []
      const definition = judgeToolDefinition(deriveDefinition(governanceOf(entry), facts[name]))
      return [programSignature(okOf(definition, name))]
    })
    const text = `${declared.join('\n\n')}\n`
    const expected = readFileSync(
      new URL('fixtures/program-signatures.txt', import.meta.url),
      'utf8',
    )
    expect(text).toBe(expected)
    expect(
      stripTypeScriptTypes(text)
        .replaceAll(/\/\*\*.*?\*\//gs, '')
        .trim(),
    ).toBe('')
    expect(Buffer.byteLength(text)).toBeLessThan(6 * 1024)
  })

  it('opens only the one-shot execute of Shell, closed when the call names a terminal', async () => {
    const fixture = await releaseFixture()
    const author = okOf(shellToolModule.createAuthor(tree(TEST_CONSTRUCTION.Shell)), 'author')
    const definition = okOf(
      judgeToolDefinition(
        deriveDefinition(governanceOf(entryOf(fixture.manifest, 'Shell')), author.facts),
      ),
      'definition',
    )
    expect(programFunctions(definition).map(one => [one.entry, one.unless])).toEqual([
      ['Shell.execute', ['terminal']],
    ])
  })
})

describe('the release definitions one generation remembers', () => {
  const deeplyFrozen = (value: unknown): boolean =>
    value === null ||
    typeof value !== 'object' ||
    (Object.isFrozen(value) && Object.values(value).every(deeplyFrozen))

  it('hands out one deeply frozen copy per name for the whole generation', async () => {
    const fixture = await releaseFixture()
    const release = releaseOf(fixture.root)
    if (release.kind !== 'trusted') throw new Error('fixture release')
    const author = okOf(shellToolModule.createAuthor(tree(TEST_CONSTRUCTION.Shell)), 'author')
    const given = structuredClone(
      okOf(
        judgeToolDefinition(
          deriveDefinition(governanceOf(entryOf(fixture.manifest, 'Shell')), author.facts),
        ),
        'definition',
      ),
    )
    expect(rememberReleaseDefinition(fixture.root, release.generation, given)).toBe(true)
    const first = releaseDefinitionOf(fixture.root, 'Shell')
    expect(first).toEqual(given)
    expect(first).not.toBe(given)
    expect(releaseDefinitionOf(fixture.root, 'Shell')).toBe(first)
    expect(deeplyFrozen(first)).toBe(true)
    expect(Object.isFrozen(given)).toBe(false)
  })
})

describe('the startup warning', () => {
  const warnings = (fixture: Awaited<ReturnType<typeof releaseFixture>>) =>
    fixture.logs.filter(message => message.name === TOOL_RELEASE_LOGGER && message.type === 'warn')

  it('logs one warning that names the reason when the snapshot is unavailable', async () => {
    const tampered = await packageCopy(true)
    try {
      const fixture = await releaseFixture(releaseFrom(tampered.root))
      const logged = warnings(fixture)
      expect(logged).toHaveLength(1)
      expect(logged[0]?.args).toContain('artifacts differ from the manifest')
      expect(fixture.authority.verify(authorityOf(fixture.manifest, 'Shell'))).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    } finally {
      tampered.remove()
    }
  })

  it('logs no warning for a trusted snapshot', async () => {
    expect(warnings(await releaseFixture())).toEqual([])
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
    expect(
      authority.admits(
        { principal: { ...(registrant.principal as object) }, tenant: registrant.tenant },
        { kind: 'official' },
      ),
    ).toEqual(fail({ kind: 'denied' }))
  })

  it('denies the registrant under another tenant at the official layer', async () => {
    const { authority, registrant } = await releaseFixture()
    expect(
      authority.admits(
        { principal: registrant.principal, tenant: fixtureTenant('a') },
        { kind: 'official' },
      ),
    ).toEqual(fail({ kind: 'denied' }))
  })

  it('admits at the tenant layer only an access of the tenant that holds the tool', async () => {
    const { authority, registrant } = await releaseFixture()
    const alpha = fixtureTenant('a')
    const mine = { principal: registrant.principal, tenant: alpha }
    expect(authority.admits(mine, { kind: 'tenant', tenant: alpha })).toEqual(succeed(undefined))
    expect(authority.admits(mine, { kind: 'tenant', tenant: fixtureTenant('b') })).toEqual(
      fail({ kind: 'denied' }),
    )
    expect(authority.admits(registrant, { kind: 'tenant', tenant: alpha })).toEqual(
      fail({ kind: 'denied' }),
    )
    expect(authority.admits(mine, { kind: 'workspace', workspace: 'w' } as never)).toEqual(
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
      const trusted = await releaseFrom(exact.root)()
      expect(trusted).toMatchObject({ kind: 'trusted' })
      if (trusted.kind !== 'trusted') throw new Error('unreachable')
      expect(trusted.modules.shellToolModule).not.toBe(shellToolModule)
      expect(trusted.modules.shellToolModule.executor).toEqual(shellToolModule.executor)
      expect(await releaseFrom(tampered.root)()).toEqual({
        kind: 'unavailable',
        diagnostic: 'artifacts differ from the manifest',
      })
    } finally {
      exact.remove()
      tampered.remove()
    }
  })

  it('imports the entry file from the very root whose artifacts it checked', async () => {
    const input = productionReleaseInput()
    const checked = await input.packageRoots()
    const roots: unknown[] = []
    const snapshot = await loadToolRelease({
      ...input,
      packageRoots: async () => checked,
      importModules: async given => {
        roots.push(given)
        return input.importModules(given)
      },
    })
    expect(snapshot.kind).toBe('trusted')
    expect(roots).toEqual([checked])
    for (const own of formalManifest().artifacts)
      expect(own.files.map(file => file.path)).toContain(RELEASE_ENTRY_FILE)
    expect(formalManifest().artifacts.map(own => own.package)).toEqual([
      '@omne-harness/tool-definitions',
      '@omne-harness/calendar-tools',
      '@omne-harness/schedule-tools',
      '@omne-harness/notification-tools',
      '@omne-harness/session-tools',
      '@omne-harness/dispatch-tools',
      '@omne-harness/workspace-tools',
      '@omne-harness/plugin-tools',
      '@omne-harness/assets-tools',
    ])
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
      importModules: async root => {
        const modules = await input.importModules(root)
        return {
          ...modules,
          filesToolModule: {
            ...modules.filesToolModule,
            executor: {
              ...modules.filesToolModule.executor,
              revision: `${modules.filesToolModule.executor.revision}-drift`,
            },
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

describe('the snapshot after a read that failed', () => {
  async function scripted(pauseMs: number) {
    const real = await loadProductionRelease()
    if (real.kind !== 'trusted') throw new Error('the installed release is not trusted')
    let now = 0
    const reads = vi.fn()
    const entries = createToolReleaseEntries(
      async () => {
        reads()
        if (reads.mock.calls.length === 1) throw new Error('disk busy')
        return real
      },
      { now: () => now, retryPauseMs: () => pauseMs },
    )
    const fixture = fixtureEnv([principalIssuerKey])
    const logs: Message[] = []
    fixture.root.logger.exporter({ levels: { default: 3 }, export: message => logs.push(message) })
    await fixture.install(entries.authority)
    const authority = got(
      fixture.root.get(toolContributionAuthorityKey),
      'toolContributionAuthority',
    ) as ToolContributionAuthority<unknown>
    return {
      authority,
      logs,
      reads,
      shell: authorityOf(formalManifest(), 'Shell'),
      at: (value: number) => {
        now = value
      },
    }
  }

  it('reads again after the pause and then the snapshot is available', async () => {
    const { authority, logs, reads, shell, at } = await scripted(1000)
    expect(authority.verify(shell)).toMatchObject({ failure: { kind: 'unavailable' } })
    const warned = logs.filter(
      message => message.name === TOOL_RELEASE_LOGGER && message.type === 'warn',
    )
    expect(warned).toHaveLength(1)
    expect(warned[0]?.args).toContain('disk busy')
    expect(warned[0]?.args).toContain(1000)
    at(1000)
    await vi.waitFor(() => expect(okOf(authority.verify(shell), 'verify Shell')).toEqual(shell))
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('does not read again while the pause lasts', async () => {
    const { authority, reads, shell, at } = await scripted(1000)
    expect(authority.verify(shell)).toMatchObject({ failure: { kind: 'unavailable' } })
    at(999)
    for (let call = 0; call < 3; call += 1)
      expect(authority.verify(shell)).toMatchObject({ failure: { kind: 'unavailable' } })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('admits the registrant of the run once the snapshot is available again', async () => {
    const real = await loadProductionRelease()
    let now = 0
    let reads = 0
    const fixture = await releaseFixture(
      async () => {
        reads += 1
        if (reads === 1) throw new Error('disk busy')
        return real
      },
      { now: () => now, retryPauseMs: () => 1000 },
    )
    expect(fixture.authority.admits(fixture.registrant, { kind: 'official' })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    now = 1000
    await vi.waitFor(() =>
      expect(fixture.authority.admits(fixture.registrant, { kind: 'official' })).toEqual(
        succeed(undefined),
      ),
    )
  })
})
