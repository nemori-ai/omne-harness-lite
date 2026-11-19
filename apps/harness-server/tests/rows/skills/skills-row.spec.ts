// @module-tag slow
// Opens a real sqlite store with its worker threads and publishes packages to disk.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { access, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { capabilityId, createCategoryPoint } from '@omne-harness/assets'
import {
  modelProviderBodyContract,
  modelProviderCategoryDisplay,
} from '@omne-harness/model-contract/provider-asset'
import { skillBodyContract, skillCategoryDisplay } from '@omne-harness/skill-contract'
import { toolBodyContract, toolCategoryDisplay } from '@omne-harness/tool-contract'
import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import {
  assetsSettingsProjectionCommand,
  createTenantPublisher,
  newHoldingRef,
} from '@omne-harness/assets-local'
import { SettingsOwnerProjectionSchema } from '@omne-harness/settings-local'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { SkillsAccess } from '@omne-harness/tool-definitions'
import {
  principalIssuer,
  principalVerifier,
  sessionWorkIssuerOf,
} from '../../../src/entry/principals.ts'
import {
  routedSkills,
  tenantSkills,
  TenantSkillsHost,
} from '../../../src/rows/skills/tenant-skills.ts'
import {
  domainRoot,
  openTenantAssets,
  TenantAssetsHost,
} from '../../../src/rows/tenant-assets/host.ts'
import { createBoundSkills } from '../../../src/rows/tool-bindings/skills.ts'
import { productionStorageCatalog } from '../../../src/rows/storage/production-catalog.ts'
import { governanceStorageCombinations } from '../../../src/rows/governance/storage-combinations.ts'
import { governedCapture } from '../../../src/rows/governance/governed-capture.ts'
import { fixtureEnv, fixtureTenant, okOf } from '../../entry/support.ts'
import { providerConfig } from '../storage/fixtures/tree.ts'
import {
  directoryReader,
  openSkillPublisher,
  publishSkill,
  SAMPLE_LINE,
  writeSampleSkill,
} from '../../skills/support.ts'

const ranking = { k1: 1.2, b: 0.75 }
const signal = new AbortController().signal
const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function domainOf(tenant: TenantId, name: string): DomainRef {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('tenant')
  return { scope: { kind: 'tenant', tenant: encoded.value }, transactionDomain: name }
}

async function world() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'skills-row-')))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const materials = await productionStorageCatalog()
  const made = await createSqliteStorage({
    config: providerConfig(join(root, 'storage'), {
      maxWorkers: 2,
      reservedWriterSlots: 1,
      maxReadWorkersPerDomain: 1,
    }),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  cleanups.push(() => made.control.close({ initiator: 'disposal' }).then(() => undefined))
  const alpha = fixtureTenant('a')
  const beta = fixtureTenant('b')
  const domains = new Map<string, DomainRef>()
  for (const [tenant, name] of [
    [alpha, 'tenant-alpha'],
    [beta, 'tenant-beta'],
  ] as const) {
    const domain = domainOf(tenant, name)
    if (domain.scope.kind === 'tenant') domains.set(domain.scope.tenant, domain)
  }
  let lookups = 0
  let lookupDown = false
  const lookup: TenantDomainLookup = {
    async lookup({ tenant }) {
      lookups += 1
      if (lookupDown) return { kind: 'unavailable', diagnostic: 'test' } as never
      const domain = domains.get(tenant)
      return domain === undefined ? { kind: 'unregistered' } : { kind: 'ready', domain }
    },
  }
  const packageRoot = join(root, 'assets')
  const categories = createCategoryPoint()
  categories.contribute({ contract: toolBodyContract(), display: toolCategoryDisplay })
  categories.contribute({
    contract: modelProviderBodyContract(),
    display: modelProviderCategoryDisplay,
  })
  categories.contribute({ contract: skillBodyContract(), display: skillCategoryDisplay })
  const store = { storage: made.storage, materials, packageRoot, categories }
  const tenantAssets = new TenantAssetsHost({
    domains: lookup,
    open: domain => openTenantAssets(store, domain),
  })
  cleanups.push(() => tenantAssets.close())
  const host = new TenantSkillsHost({
    async open(tenant, tenantRef) {
      const assets = await tenantAssets.open(tenantRef)
      return assets === undefined ? undefined : tenantSkills(assets, tenant, ranking)
    },
  })
  cleanups.push(() => host.close())
  const routed = routedSkills(host)
  const fixture = fixtureEnv([principalIssuerKey])
  await fixture.install(principalVerifier)
  await fixture.install(principalIssuer)
  const bound = (tenant: TenantId, session: string): SkillsAccess => {
    const principal = okOf(sessionWorkIssuerOf(fixture.env)({ tenant, session }), 'principal')
    return createBoundSkills({ principal, tenant, request: {} as FixedToolRequest } as never, {
      verifier: () => fixture.root.get('principalVerifier'),
      catalog: () => routed.catalog,
      access: () => routed.access,
    })
  }
  const publish = async (tenant: TenantId, name: string, enabled = true) => {
    const dir = await writeSampleSkill(join(root, 'sources', name), name)
    const domain = domainOf(tenant, tenant === alpha ? 'tenant-alpha' : 'tenant-beta')
    return publishSkill({
      storage: made.storage,
      materials,
      domain,
      packageRoot,
      dir,
      name,
      enabled,
    })
  }
  const capture = (excluded: readonly string[]) => {
    const domain = domainOf(alpha, 'tenant-alpha')
    const binding = {
      domain,
      principalRef: 'governance-reader',
      captureId: `capture-${Math.random().toString(16).slice(2)}`,
      request: {
        deploymentRef: 'harness-local',
        mode: 'management' as const,
        targets: [],
        selectionRef: null,
      },
    }
    return made.storage.commit({
      identity: {
        ...domain,
        operation: 'test.governance-capture',
        protocolVersion: '2',
        operationKey: binding.captureId,
      },
      combinationVersion: assets.combinationVersion,
      manifestDigest: assets.manifestDigest,
      commands: [assetsSettingsProjectionCommand(binding, { excluded })],
    })
  }
  const assets = governanceStorageCombinations(materials).assets
  return {
    capture,
    governed: governedCapture(categories),
    alpha: bound(alpha, 'session-alpha'),
    beta: bound(beta, 'session-beta'),
    publish: (name: string, enabled = true) => publish(alpha, name, enabled),
    async publishMany(names: readonly string[]) {
      const publisher = await openSkillPublisher({
        storage: made.storage,
        materials,
        domain: domainOf(alpha, 'tenant-alpha'),
        packageRoot,
      })
      try {
        for (const name of names)
          await publisher.publish(await writeSampleSkill(join(root, 'sources', name), name), name)
      } finally {
        await publisher.close()
      }
    },
    async publishThroughTenantAssets(name: string) {
      const dir = await writeSampleSkill(join(root, 'sources', name), name)
      const encoded = tenantCodec.encode(alpha)
      if (!encoded.ok) throw new Error('tenant')
      const tenantRef = encoded.value
      const assets = await tenantAssets.open(tenantRef)
      if (assets === undefined) throw new Error('the local assets of alpha did not open')
      const made = capabilityId('skill', name)
      if (!made.ok) throw new Error('capability')
      return createTenantPublisher(assets, tenantRef).publish({
        operationId: `publish-${name}`,
        capability: made.id,
        content: { kind: 'directory', from: directoryReader(dir) },
      })
    },
    host,
    storage: made,
    lookups: () => lookups,
    breakLookup: () => {
      lookupDown = true
    },
    alphaTenant: alpha,
    alphaRoot: domainRoot(packageRoot, domainOf(alpha, 'tenant-alpha')),
    routed,
  }
}

const search = (skills: SkillsAccess, query: string) =>
  skills.search({ query, after: null, limit: 10 }, signal)

describe('the skills row and the Skills binding over a real store', () => {
  it('publishes a Skill directory into the one local assets of the tenant, and Skills reads it', async () => {
    const w = await world()
    expect(await w.publishThroughTenantAssets('weekly-report')).toMatchObject({
      kind: 'published',
      holdingRef: newHoldingRef('publish-weekly-report'),
      changed: true,
    })
    expect(await search(w.alpha, '出周报')).toMatchObject({
      ok: { entries: [{ kind: 'available', name: 'weekly-report' }] },
    })
    const body = await w.alpha.read({ skill: 'weekly-report', offset: 0, maxBytes: 65536 }, signal)
    expect(body).toMatchObject({ ok: { text: expect.stringContaining('scripts/collect.mjs') } })
  })

  it('cleans what an interrupted publish left when the tenant set opens, and keeps what was recorded', async () => {
    const w = await world()
    await w.publish('weekly-report')
    const versions = join(w.alphaRoot, 'skills', 'weekly-report')
    const [placed] = readdirSync(versions)
    if (placed === undefined) throw new Error('no version directory')
    const unrecorded = join(versions, `sha256-${'0'.repeat(64)}`)
    cpSync(join(versions, placed), unrecorded, { recursive: true })
    const staging = join(w.alphaRoot, '.staging', 'interrupted', 'files')
    mkdirSync(staging, { recursive: true })
    writeFileSync(join(staging, 'SKILL.md'), 'half')
    const body = await w.alpha.read({ skill: 'weekly-report', offset: 0, maxBytes: 65536 }, signal)
    expect(body).toMatchObject({ ok: { directory: join(versions, placed) } })
    expect(readdirSync(versions)).toEqual([placed])
    expect(readdirSync(join(w.alphaRoot, '.staging'))).toEqual([])
  })

  it('gives a principal that is not session work of the tenant neither the Skill nor its content', async () => {
    const w = await world()
    await w.publish('weekly-report')
    const outsider = access('governance-reader', w.alphaTenant)
    const id = capabilityId('skill', 'weekly-report')
    if (!id.ok) throw new Error('capability')
    expect(await w.routed.catalog.search(outsider, null, { text: '' })).toStrictEqual({ ok: [] })
    expect(
      await w.routed.access.read(outsider, null, {
        capability: id.id,
        part: { kind: 'body' },
      }),
    ).toMatchObject({ failure: { kind: 'not-available-to-you' } })
  })

  it('lets the tenant that published a Skill find it, read it with its directory, list it and read its script', async () => {
    const w = await world()
    await w.publish('weekly-report')
    expect(await search(w.alpha, '出周报')).toMatchObject({
      ok: { entries: [{ kind: 'available', name: 'weekly-report' }], next: null },
    })
    const body = await w.alpha.read({ skill: 'weekly-report', offset: 0, maxBytes: 65536 }, signal)
    if (!('ok' in body)) throw new Error(JSON.stringify(body))
    expect(body.ok.text).toContain('scripts/collect.mjs')
    expect(body.ok.directory).toMatch(/skills/u)
    const listed = await w.alpha.list({ skill: 'weekly-report' }, signal)
    if (!('ok' in listed)) throw new Error(JSON.stringify(listed))
    expect(listed.ok.files.map(file => file.path)).toEqual(['scripts/collect.mjs'])
    expect(listed.ok.directory).toBe(body.ok.directory)
    const script = await w.alpha.readFile(
      { skill: 'weekly-report', path: 'scripts/collect.mjs', offset: 0, maxBytes: 65536 },
      signal,
    )
    expect(script).toMatchObject({ ok: { text: expect.stringContaining(SAMPLE_LINE) } })
  })

  it('keeps one tenant from seeing another: the same answer for a Skill it may not read and one that does not exist', async () => {
    const w = await world()
    await w.publish('weekly-report')
    expect(await search(w.beta, 'weekly')).toStrictEqual({ ok: { entries: [], next: null } })
    const hidden = await w.beta.read({ skill: 'weekly-report', offset: 0, maxBytes: 4096 }, signal)
    const missing = await w.beta.read({ skill: 'no-such-skill', offset: 0, maxBytes: 4096 }, signal)
    expect(hidden).toStrictEqual({ failure: { kind: 'not-found' } })
    expect(missing).toStrictEqual(hidden)
    expect(
      await w.alpha.read({ skill: 'no-such-skill', offset: 0, maxBytes: 4096 }, signal),
    ).toStrictEqual(hidden)
  })

  it('lists a disabled Skill with its reason and answers disabled when it is read', async () => {
    const w = await world()
    await w.publish('meeting-notes', false)
    expect(await search(w.alpha, '')).toMatchObject({
      ok: { entries: [{ kind: 'disabled', name: 'meeting-notes', reason: expect.any(String) }] },
    })
    expect(
      await w.alpha.read({ skill: 'meeting-notes', offset: 0, maxBytes: 4096 }, signal),
    ).toMatchObject({
      failure: { kind: 'disabled' },
    })
  })

  it('answers invalid for a name that is not a Skill name, before any lookup', async () => {
    const w = await world()
    expect(
      await w.alpha.read({ skill: 'Not A Name', offset: 0, maxBytes: 4096 }, signal),
    ).toStrictEqual({
      failure: { kind: 'invalid', field: 'skill', reason: 'not a Skill name' },
    })
    expect(w.lookups()).toBe(0)
  })

  it('pages a search with a cursor bound to the results, and refuses a cursor once the results change', async () => {
    const w = await world()
    await w.publish('alpha-notes')
    await w.publish('beta-notes')
    const first = await w.alpha.search({ query: '', after: null, limit: 1 }, signal)
    if (!('ok' in first) || first.ok.next === null) throw new Error(JSON.stringify(first))
    expect(first.ok.entries.map(entry => entry.name)).toEqual(['alpha-notes'])
    const second = await w.alpha.search({ query: '', after: first.ok.next, limit: 1 }, signal)
    expect(second).toMatchObject({ ok: { entries: [{ name: 'beta-notes' }], next: null } })
    await w.publish('gamma-notes')
    expect(
      await w.alpha.search({ query: '', after: first.ok.next, limit: 1 }, signal),
    ).toStrictEqual({
      failure: { kind: 'invalid-cursor' },
    })
    expect(
      await w.alpha.search({ query: '', after: 'not-a-cursor', limit: 1 }, signal),
    ).toStrictEqual({
      failure: { kind: 'invalid-cursor' },
    })
  })

  it('finds a Skill published after the first search on the next search', async () => {
    const w = await world()
    await w.publish('alpha-notes')
    expect(await search(w.alpha, 'notes')).toMatchObject({
      ok: { entries: [{ name: 'alpha-notes' }] },
    })
    await w.publish('beta-notes')
    expect(await search(w.alpha, 'notes')).toMatchObject({
      ok: { entries: [{ name: 'alpha-notes' }, { name: 'beta-notes' }] },
    })
  })

  it('builds one set for concurrent first calls of a tenant', async () => {
    const w = await world()
    await Promise.all([search(w.alpha, ''), search(w.alpha, 'x'), search(w.alpha, 'y')])
    expect(w.lookups()).toBe(1)
  })

  it('answers unavailable when the tenant domain cannot be looked up, and does not keep that failure', async () => {
    const w = await world()
    w.breakLookup()
    expect(await search(w.alpha, '')).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await search(w.alpha, '')).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(w.lookups()).toBe(2)
  })

  it('answers unavailable once the row has closed', async () => {
    const w = await world()
    await w.publish('weekly-report')
    expect(await search(w.alpha, '')).toHaveProperty('ok')
    await w.host.close()
    expect(await search(w.alpha, '')).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(
      await w.alpha.read({ skill: 'weekly-report', offset: 0, maxBytes: 4096 }, signal),
    ).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('answers unavailable when the store cannot be read', async () => {
    const w = await world()
    await w.publish('weekly-report')
    expect(await search(w.alpha, '')).toHaveProperty('ok')
    await w.storage.control.close({ initiator: 'disposal' })
    expect(await search(w.alpha, '')).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('leaves the governance capture of a tenant domain unchanged by a published Skill', async () => {
    const w = await world()
    expect(w.governed().excluded).toEqual(['skill'])
    await w.publish('placeholder-skill')
    const before = await w.capture(w.governed().excluded)
    await w.publish('weekly-report')
    const after = await w.capture(w.governed().excluded)
    expect(before.kind).toBe('committed')
    expect(after.kind).toBe('committed')
    if (before.kind !== 'committed' || after.kind !== 'committed') throw new Error('capture')
    const views = (result: typeof before & { kind: 'committed' }) =>
      SettingsOwnerProjectionSchema.parse(result.responses[0]?.reply.response).views
    expect(views(after)).toStrictEqual(views(before))
  })

  it('keeps 130 Skill holdings out of the governance capture and its limit of 128', async () => {
    const w = await world()
    await w.publishMany(Array.from({ length: 130 }, (_, index) => `skill-${String(index)}`))
    const governed = await w.capture(w.governed().excluded)
    expect(governed.kind).toBe('committed')
    const everything = await w.capture(
      w.governed().excluded.filter(category => category !== 'skill'),
    )
    expect(everything.kind).toBe('rolled_back')
    expect(JSON.stringify(everything)).toContain('limit_exceeded')
  })
})
