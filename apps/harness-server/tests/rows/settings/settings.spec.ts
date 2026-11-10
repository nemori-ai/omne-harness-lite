// The `settings` row (web-meta-tool slice 04): the registry that follows the release definitions,
// the secret-item entry over a real vault file, and the admitted setting management in the shape of
// server-entry's `SettingsGovernance`. The pieces are composed as the row composes them, over the
// release fixture (real release snapshot, real verifier); the standing source is a double whose
// answers the test sets. One case loads the row in a `serve` tree to check the declaration, the
// trusted key and that a principal the tree cannot verify never reaches the vault.
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import {
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SettingsGovernance } from '@omne-harness/server-entry'
import {
  createSettingsSecretItems,
  parseSecretText,
  type SettingsHolding,
} from '@omne-harness/settings'
import { createSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { afterEach, describe, expect, it } from 'vitest'
import { readSystemInstant } from '../../../src/entry/session-clock.ts'
import {
  ReleaseToolContributionAuthority,
  loadProductionRelease,
  releaseOf,
  rememberReleaseDefinition,
} from '../../../src/entry/tool-release.ts'
import { governanceOf, type ToolReleaseSnapshot } from '../../../src/entry/tool-release-manifest.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { createSettingsGuard } from '../../../src/rows/authorization/settings-access.ts'
import { secretCustodyRow } from '../../../src/rows/secret-custody/index.ts'
import { createSettingsGovernance } from '../../../src/rows/settings/governance.ts'
import { releaseProvider } from '../../../src/assets/model-providers.ts'
import { holdingKey, officialHolding, toolAsset } from '../../../src/assets/official-holdings.ts'
import {
  SettingsSecretItemsService,
  createReleaseSettingsRegistry,
  settingsRow,
  settingsSecretItemsKey,
} from '../../../src/rows/settings/index.ts'
import type { RowId } from '../../../src/types.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TEST_CONSTRUCTION, releaseFixture, tree } from '../tool-host/support.ts'

/** The Settings holding of a release tool definition, or `null` when it declares no settings. */
function toolHolding(definition: ToolDefinition): SettingsHolding | null {
  const held = officialHolding(toolAsset(definition))
  return held.kind === 'declared' ? held.ref.holding : null
}

const SENTINEL = 'exa-sentinel-row-7f31c2'
const A = fixtureTenant('a')
const B = fixtureTenant('b')
const WEB = { category: 'tool', name: 'Web' }
const ITEM = 'exa.apiKey'
/** The release provider holding every table registers from the start. */
const OPENROUTER = releaseProvider('openrouter')?.holding?.ref
if (OPENROUTER === undefined) throw new Error('fixture: the release holds no openrouter provider')

const authority = inProcessPrincipalAuthority()
const system = okOf(authority.issuer.issueSystem({ component: 'server-entry' }), 'system')
function acting(tenant: TenantId, owner = 'identity-login'): ActingForTenantPrincipal {
  return okOf(
    authority.issuer.issueActingForTenant({
      actor: system,
      tenant,
      work: { owner, work: 'lgn_t' },
    }),
    'acting',
  )
}

type StandingMode = 'member' | 'not-member' | 'unavailable'
function readingOf(mode: StandingMode): TenantStandingReading {
  const evidence = { record: 'standing/test', revision: '1' }
  if (mode === 'member')
    return {
      kind: 'member',
      role: { role: 'member', model: { model: 'm', revision: '1' } },
      qualifications: [],
      evidence,
    }
  if (mode === 'not-member') return { kind: 'not-member', evidence }
  return { kind: 'unavailable', diagnostic: 'closed' }
}

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function openVault(): { path: string; vault: SecretVault } {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'settings-row-')))
  directories.push(directory)
  const path = join(directory, 'model-vault.json')
  const created = createSecretVault({ path })
  if (created.kind !== 'open') throw new Error(`fixture vault ${created.kind}`)
  return { path, vault: created.vault }
}

/** The release Web definition as the loader derives it; definitions do not depend on construction. */
function webDefinition(root: Context): ToolDefinition {
  const release = releaseOf(root)
  if (release.kind !== 'trusted') throw new Error('fixture release')
  const entry = release.manifest.entries.find(candidate => candidate.asset.name === 'Web')
  if (entry === undefined) throw new Error('fixture Web entry')
  const author = okOf(
    release.modules.webToolModule.createAuthor(tree(TEST_CONSTRUCTION.Web)),
    'author',
  )
  return okOf(
    judgeToolDefinition(deriveDefinition(governanceOf(entry), author.facts)),
    'definition',
  )
}

/** Lets the root know the Web definition, as `tool-host` does after it loaded the author. */
function rememberWeb(root: Context): ToolDefinition {
  const definition = webDefinition(root)
  const release = releaseOf(root)
  if (release.kind !== 'trusted') throw new Error('fixture release')
  if (!rememberReleaseDefinition(root, release.generation, definition))
    throw new Error('fixture: the Web definition was not remembered')
  return definition
}

/** The row's pieces as the row composes them, with the standing double and the admission switch. */
async function world() {
  const fixture = await releaseFixture()
  const { path, vault } = openVault()
  const flags = { standing: 'member' as StandingMode, admission: true }
  const standing: TenantStandingSource = { read: () => Promise.resolve(readingOf(flags.standing)) }
  const admission = referenceAdmissionCheck({
    verifier: authority.verifier,
    standing,
    permits: null,
  })
  const guard = createSettingsGuard(() => (flags.admission ? admission : undefined))
  const registry = createReleaseSettingsRegistry(fixture.root)
  const items = createSettingsSecretItems({
    declarations: { snapshot: () => registry.snapshot() },
    custody: vault,
    resolve: asset => registry.holdings(asset),
  })
  const port: SettingsGovernance = createSettingsGovernance({
    items,
    qualify: input => guard.qualify(input),
    now: readSystemInstant,
  })
  const close = () => fixture.root.fiber.dispose()
  return { root: fixture.root, path, vault, flags, registry, port, close }
}

describe('the settings row: registry, secret items and governance', () => {
  it('registers the Web definition once the release author is known, and lists its secret item', async () => {
    const w = await world()
    try {
      const access = { principal: acting(A), tenant: A }
      // Before tool-host loaded the author only the release providers are registered: Web is not
      // visible.
      expect(w.registry.snapshot().definitions.map(d => d.definitionId)).toEqual(['openrouter'])
      expect(await w.port.list({ access, asset: { name: 'Web' } })).toEqual({
        kind: 'succeeded',
        items: [],
      })
      expect(await w.port.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })).toEqual({
        kind: 'not-visible',
      })
      const definition = rememberWeb(w.root)
      const holding = toolHolding(definition)
      expect(holding).not.toBeNull()
      expect(w.registry.snapshot().definitions.map(d => d.definitionId)).toEqual([
        'openrouter',
        'Web',
      ])
      expect(w.registry.holdings()).toEqual([OPENROUTER, { asset: WEB, holding }])
      expect(w.registry.holdings({ name: 'Web' })).toHaveLength(1)
      expect(w.registry.holdings({ category: 'agent', name: 'Web' })).toEqual([])
      expect(await w.port.list({ access, asset: { name: 'Web' } })).toEqual({
        kind: 'succeeded',
        items: [
          {
            asset: WEB,
            item: ITEM,
            title: 'Exa API key',
            sensitivity: 'secret',
            state: { state: 'unbound' },
            official: { state: 'unbound' },
          },
        ],
      })
      expect(await w.port.list({ access, asset: { name: 'Shell' } })).toEqual({
        kind: 'succeeded',
        items: [],
      })
    } finally {
      await w.close()
    }
  })

  it('writes the acting tenant scope under the same key the Web attachment reads, shows and clears it', async () => {
    const w = await world()
    try {
      rememberWeb(w.root)
      const access = { principal: acting(A), tenant: A }
      const written = await w.port.set({ access, asset: WEB, item: ITEM, secret: ` ${SENTINEL} ` })
      expect(written.kind).toBe('succeeded')
      // The public operation wrote the tenant scope and nothing in the official scope.
      expect(w.vault.list({ layer: 'official' }, null, 10)).toEqual({ entries: [], next: null })
      expect(w.vault.list({ layer: 'tenant', tenant: A }, null, 10)).toMatchObject({
        entries: [{ purpose: 'setting', presence: { kind: 'bound', life: 'active' } }],
      })
      const shown = await w.port.describe({ access, asset: WEB, item: ITEM })
      expect(shown).toMatchObject({
        kind: 'succeeded',
        setting: { own: { state: 'usable', tenantId: A }, official: { state: 'unbound' } },
      })
      if (
        shown.kind === 'succeeded' &&
        shown.setting.own.state !== 'unbound' &&
        written.kind === 'succeeded'
      )
        expect(shown.setting.own.configuredAt).toEqual(written.configuredAt)
      const listed = await w.port.list({ access, asset: { name: 'Web' } })
      expect(listed).toMatchObject({
        kind: 'succeeded',
        items: [
          { item: ITEM, state: { state: 'usable', tenantId: A }, official: { state: 'unbound' } },
        ],
      })
      // Nothing the caller sees carries the secret.
      expect(inspect({ written, shown, listed }, { depth: null })).not.toContain(SENTINEL)
      expect(await w.port.clear({ access, asset: WEB, item: ITEM })).toEqual({ kind: 'succeeded' })
      expect(await w.port.clear({ access, asset: WEB, item: ITEM })).toEqual({ kind: 'no-change' })
      expect(await w.port.describe({ access, asset: WEB, item: ITEM })).toEqual({
        kind: 'succeeded',
        setting: { own: { state: 'unbound' }, official: { state: 'unbound' } },
      })
      expect(readFileSync(w.path, 'utf8')).not.toContain(SENTINEL)
    } finally {
      await w.close()
    }
  })

  it('reads presence from the custody now: a binding removed behind its back shows unbound at once', async () => {
    const w = await world()
    try {
      const definition = rememberWeb(w.root)
      const holding = toolHolding(definition)
      if (holding === null) throw new Error('fixture holding')
      const access = { principal: acting(A), tenant: A }
      expect((await w.port.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })).kind).toBe(
        'succeeded',
      )
      expect(w.vault.unbind(holdingKey({ layer: 'tenant', tenant: A }, holding, ITEM))).toBe(
        'removed',
      )
      expect(await w.port.describe({ access, asset: WEB, item: ITEM })).toEqual({
        kind: 'succeeded',
        setting: { own: { state: 'unbound' }, official: { state: 'unbound' } },
      })
      expect(await w.port.list({ access, asset: { name: 'Web' } })).toMatchObject({
        items: [{ item: ITEM, state: { state: 'unbound' } }],
      })
    } finally {
      await w.close()
    }
  })

  it('shows the official layer beside the own one, and a tenant set or clear never touches it (I-7, I-8)', async () => {
    const w = await world()
    try {
      const definition = rememberWeb(w.root)
      const holding = toolHolding(definition)
      if (holding === null) throw new Error('fixture holding')
      const officialKey = holdingKey({ layer: 'official' }, holding, ITEM)
      const secret = parseSecretText('official-test-secret')
      if (!secret.ok) throw new Error('fixture secret')
      expect(w.vault.bind(officialKey, secret.value, null)).toBe('written')
      const officialBefore = w.vault.describe(officialKey)
      const access = { principal: acting(A), tenant: A }
      expect(await w.port.describe({ access, asset: WEB, item: ITEM })).toEqual({
        kind: 'succeeded',
        setting: { own: { state: 'unbound' }, official: { state: 'usable' } },
      })
      expect(await w.port.list({ access, asset: { name: 'Web' } })).toMatchObject({
        items: [{ item: ITEM, state: { state: 'unbound' }, official: { state: 'usable' } }],
      })
      expect((await w.port.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })).kind).toBe(
        'succeeded',
      )
      expect(w.vault.describe(officialKey)).toEqual(officialBefore)
      expect(await w.port.describe({ access, asset: WEB, item: ITEM })).toMatchObject({
        setting: { own: { state: 'usable', tenantId: A }, official: { state: 'usable' } },
      })
      expect(await w.port.clear({ access, asset: WEB, item: ITEM })).toEqual({ kind: 'succeeded' })
      expect(await w.port.clear({ access, asset: WEB, item: ITEM })).toEqual({ kind: 'no-change' })
      expect(w.vault.describe(officialKey)).toEqual(officialBefore)
      expect(w.vault.use(officialKey)).toEqual({ kind: 'secret', value: secret.value })
    } finally {
      await w.close()
    }
  })

  it('another tenant, a work principal, a system principal and a forged principal are denied before the vault', async () => {
    const w = await world()
    try {
      rememberWeb(w.root)
      await w.port.set({
        access: { principal: acting(B), tenant: B },
        asset: WEB,
        item: ITEM,
        secret: 'bob-own',
      })
      const before = readFileSync(w.path, 'utf8')
      // The port's type says a login principal; the row checks the value, so the test hands in others.
      const refused = [
        { principal: acting(A), tenant: B },
        { principal: acting(B, 'session'), tenant: B },
        { principal: system as unknown as ActingForTenantPrincipal, tenant: B },
        { principal: { ...acting(B) }, tenant: B },
      ]
      for (const access of refused) {
        expect(await w.port.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })).toEqual({
          kind: 'denied',
        })
        expect(await w.port.clear({ access, asset: WEB, item: ITEM })).toEqual({ kind: 'denied' })
        expect(await w.port.describe({ access, asset: WEB, item: ITEM })).toEqual({
          kind: 'denied',
        })
        expect(await w.port.list({ access })).toEqual({ kind: 'denied' })
      }
      expect(readFileSync(w.path, 'utf8')).toBe(before)
      expect(before).not.toContain(SENTINEL)
    } finally {
      await w.close()
    }
  })

  it('a tenant that is not a member is denied; an unknown standing or a missing check is basis-unavailable', async () => {
    const w = await world()
    try {
      rememberWeb(w.root)
      const access = { principal: acting(A), tenant: A }
      const before = readFileSync(w.path, 'utf8')
      w.flags.standing = 'not-member'
      expect(await w.port.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })).toEqual({
        kind: 'denied',
      })
      w.flags.standing = 'unavailable'
      expect(await w.port.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })).toEqual({
        kind: 'basis-unavailable',
      })
      w.flags.standing = 'member'
      w.flags.admission = false
      expect(await w.port.describe({ access, asset: WEB, item: ITEM })).toEqual({
        kind: 'basis-unavailable',
      })
      expect(readFileSync(w.path, 'utf8')).toBe(before)
    } finally {
      await w.close()
    }
  })

  it('follows the release generation: after a reload with a new Web definition, items reflect the new definition', async () => {
    const snapshot = await loadProductionRelease()
    if (snapshot.kind !== 'trusted') throw new Error('fixture release')
    const root = new Context()
    // The authority as the entry installs it, in a plugin of its own so that a reload can replace it.
    const installAuthority = (release: ToolReleaseSnapshot) =>
      root.plugin({
        name: 'release-authority',
        apply: (ctx: Context) => {
          new ReleaseToolContributionAuthority(ctx, release, () => null)
        },
      })
    const { vault } = openVault()
    const scope = { layer: 'tenant', tenant: A } as const
    try {
      const first = await installAuthority(snapshot)
      const registry = createReleaseSettingsRegistry(root)
      const items = createSettingsSecretItems({
        declarations: { snapshot: () => registry.snapshot() },
        custody: vault,
        resolve: asset => registry.holdings(asset),
      })
      const definition = webDefinition(root)
      expect(rememberReleaseDefinition(root, snapshot.generation, definition)).toBe(true)
      const webItems = () => {
        const listed = items.items({ scope })
        return typeof listed === 'string' ? listed : listed.filter(entry => entry.itemId === ITEM)
      }
      expect(webItems()).toMatchObject([{ itemId: ITEM, title: 'Exa API key' }])
      const before = registry.snapshot().definitions.map(entry => entry.version)
      expect(before).toHaveLength(2)

      // The next generation: the Web author at another digest declares the item with another title.
      const next: ToolDefinition = structuredClone(definition)
      ;(next.adoption as { digest: string }).digest = `${definition.adoption.digest}-next`
      const item = next.declarations.settings?.items[0]
      if (item === undefined) throw new Error('fixture: the Web definition declares no item')
      ;(item.presentation as { title: string }).title = 'Exa API key (next)'
      const generation = `${snapshot.generation}-next`
      const reloaded: ToolReleaseSnapshot = {
        ...snapshot,
        generation,
        manifest: {
          ...snapshot.manifest,
          generation,
          entries: snapshot.manifest.entries.map(entry =>
            entry.asset.name === 'Web' ? { ...entry, definition: canonicalDigest(next) } : entry,
          ),
        },
      }
      await first.dispose()
      await installAuthority(reloaded)
      expect(rememberReleaseDefinition(root, generation, next)).toBe(true)
      expect(webItems()).toMatchObject([{ itemId: ITEM, title: 'Exa API key (next)' }])
      const after = registry.snapshot().definitions.map(entry => entry.version)
      expect(after).toHaveLength(2)
      expect(after).not.toEqual(before)
      expect(registry.holdings()).toEqual([OPENROUTER, { asset: WEB, holding: toolHolding(next) }])
    } finally {
      await root.fiber.dispose()
    }
  })

  it('a text that is not a secret text, an undeclared item and an unknown asset write nothing', async () => {
    const w = await world()
    try {
      rememberWeb(w.root)
      const access = { principal: acting(A), tenant: A }
      const before = readFileSync(w.path, 'utf8')
      expect(await w.port.set({ access, asset: WEB, item: ITEM, secret: 'bad\u0007text' })).toEqual(
        {
          kind: 'not-writable',
        },
      )
      expect(await w.port.set({ access, asset: WEB, item: 'exa.other', secret: SENTINEL })).toEqual(
        {
          kind: 'not-visible',
        },
      )
      expect(
        await w.port.set({ access, asset: { name: 'Nope' }, item: ITEM, secret: SENTINEL }),
      ).toEqual({ kind: 'not-visible' })
      expect(await w.port.describe({ access, asset: WEB, item: 'exa.other' })).toEqual({
        kind: 'not-visible',
      })
      expect(readFileSync(w.path, 'utf8')).toBe(before)
    } finally {
      await w.close()
    }
  })
})

const PROBE = 'settings-probe' as RowId
function probeRow(capture: (ctx: Context) => void) {
  return defineRow({
    row: PROBE,
    implementation: 'real',
    manifest: { provides: [], injects: [settingsSecretItemsKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'settings-probe',
      inject: [settingsSecretItemsKey],
      apply(ctx: Context) {
        capture(ctx)
      },
    },
  })
}

describe('the settings row in a serve tree', () => {
  it('declares the trusted key over the custody key, no shutdown phase', () => {
    expect(rowDeclarationOf(settingsRow)).toEqual({
      row: 'settings',
      implementation: 'real',
      manifest: {
        provides: ['settingsSecretItems'],
        injects: ['settingsSecretCustody'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('loads next to the custody row, serves the trusted key, and a principal the tree cannot verify never reaches the vault', async () => {
    const { path } = openVault()
    const stop = new AbortController()
    let ready: (ctx: Context) => void = () => {}
    const captured = new Promise<Context>(resolve => {
      ready = resolve
    })
    const visibility: ReadonlyMap<RowId, readonly string[]> = new Map([
      ...serveProfile().visibility,
      [PROBE, [settingsSecretItemsKey]],
    ])
    const running = serveOnce({
      distribution: {
        rows: [
          { id: 'secret-custody', plugin: 'secretCustodyRow', config: { path } },
          { id: 'settings', plugin: 'settingsRow', config: {} },
          { id: PROBE, plugin: 'probe', config: {} },
        ],
      },
      plugins: { secretCustodyRow, settingsRow, probe: probeRow(ready) },
      visibility,
      stopAfterStartup: false,
      stop: stop.signal,
      readinessTimeoutMs: 30_000,
      shutdownDeadlineMs: 10_000,
    })
    try {
      const ctx = await Promise.race([
        captured,
        running.then(run => {
          throw new Error(`the tree ended before the probe ran: ${JSON.stringify(run.stderr)}`)
        }),
      ])
      const service = ctx.get(settingsSecretItemsKey)
      expect(service).toBeInstanceOf(SettingsSecretItemsService)
      rememberWeb(ctx.root)
      const before = readFileSync(path, 'utf8')
      // Issued by an authority the tree does not know: the admission does not let it through.
      const access = { principal: acting(A), tenant: A }
      const written = await service!.set({ access, asset: WEB, item: ITEM, secret: SENTINEL })
      expect(['denied', 'basis-unavailable']).toContain(written.kind)
      expect(readFileSync(path, 'utf8')).toBe(before)
      expect(before).not.toContain(SENTINEL)
      stop.abort('test done')
      const run = await running
      expect(run.state('settings')).toMatchObject({ state: 'ACTIVE', missing: [] })
      expect(run.result.exitCode).toBe(0)
    } catch (error) {
      stop.abort('test failed')
      await running.catch(() => undefined)
      throw error
    }
  })
})
