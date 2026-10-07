import { beforeAll, describe, expect, it } from 'vitest'
import {
  officialCatalog,
  officialCatalogRevision,
  officialModelIds,
} from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication, type AcceptanceEvent } from '../src/index.ts'
import {
  createDemoConfig,
  DEMO_MANIFEST_BASE,
  DEMO_OFFICIAL_CONFIGURATION_REVISION,
  DEMO_OFFICIAL_MANIFEST_ORDINAL,
  MODEL,
} from '../src/deployment.ts'
import { demoRetirement } from './model-request-support.ts'
import { actor, deployment, persisted } from './support.ts'

const sorted = (ids: Iterable<string>) => [...ids].sort()

function demoConfig() {
  return createDemoConfig(
    '/nonexistent/official-models-demo',
    'official-models',
    () => '2026-09-30T00:00:00Z',
    { multiplier: 1.1, reserveTokens: 256 },
    demoRetirement(),
  )
}

describe('demo official model installation follows the package catalog', () => {
  let config: ReturnType<typeof demoConfig>
  let transport: NonNullable<ReturnType<typeof demoConfig>['modelRequest']>['transport']
  // Building every official meter parses pinned tokenizers; allow for it once.
  beforeAll(() => {
    config = demoConfig()
    if (config.modelRequest === undefined) throw new Error('model request deployment absent')
    transport = config.modelRequest.transport
  }, 120_000)

  it('installs exactly the catalog identities as definitions, meters and manifest entries', () => {
    const catalogIds = sorted(officialCatalog.map(entry => entry.definition.modelId))
    expect(catalogIds).toEqual(sorted(officialModelIds))
    expect(sorted(transport.definitions.map(definition => definition.modelId))).toEqual(catalogIds)
    expect(sorted(transport.inputMeters.map(meter => meter.modelId))).toEqual(catalogIds)
    expect(sorted(config.officialManifest.entries.map(entry => entry.routeName))).toEqual(
      catalogIds,
    )
    expect(catalogIds).toHaveLength(37)
    expect(config.officialManifest.ordinal).toBe(DEMO_OFFICIAL_MANIFEST_ORDINAL)
    // The ordinal follows the package catalog revision; the earlier two-DeepSeek manifest was 3.
    expect(DEMO_OFFICIAL_MANIFEST_ORDINAL).toBe(DEMO_MANIFEST_BASE + officialCatalogRevision)
    expect(DEMO_OFFICIAL_MANIFEST_ORDINAL).toBeGreaterThan(3)
    expect(transport.definitions.some(definition => definition.modelId === MODEL)).toBe(true)
    expect(MODEL).toBe('openai/gpt-6-luna')
  })

  it.each(officialCatalog.map(entry => [entry.definition.modelId, entry] as const))(
    '%s has one route, exactly one bound meter and its derived official profile',
    (modelId, entry) => {
      const definitions = transport.definitions.filter(value => value.modelId === modelId)
      expect(definitions).toEqual([entry.definition])
      expect(Object.keys(entry.definition.routes)).toEqual([entry.provider])
      // The same exact-match rule the assembly uses to pair a contribution with its meter.
      const meters = transport.inputMeters.filter(
        meter =>
          meter.modelId === modelId &&
          meter.definitionRevision === entry.definition.revision &&
          meter.implementation.name === entry.definition.implementation.name &&
          meter.implementation.revision === entry.definition.implementation.revision &&
          Object.hasOwn(entry.definition.routes, meter.provider),
      )
      expect(meters).toHaveLength(1)
      expect(meters[0]?.provider).toBe(entry.provider)
      const profiles = config.officialManifest.entries.filter(value => value.routeName === modelId)
      expect(profiles).toHaveLength(1)
      expect(profiles[0]).toMatchObject({
        origin: 'official',
        providers: [entry.provider],
        allowFallback: false,
        adaptation: {
          implementation: entry.definition.implementation,
          definition: { modelId, revision: entry.definition.revision },
          configuration: {
            revision: DEMO_OFFICIAL_CONFIGURATION_REVISION,
            values: { cache: entry.cache },
          },
        },
      })
    },
  )

  it('shows an existing data directory the added leaf once the catalog revision rises by one', async () => {
    const base = await deployment('official-catalog-upgrade')
    const [dropped] = config.officialManifest.entries.slice(-1)
    if (dropped === undefined) throw new Error('catalog manifest empty')
    // The directory as the demo wrote it one catalog revision earlier: one leaf fewer.
    const previous = {
      ordinal: DEMO_MANIFEST_BASE + officialCatalogRevision - 1,
      entries: config.officialManifest.entries.slice(0, -1),
    }
    const first = createAcceptanceApplication(
      { ...base, officialManifest: previous },
      { stage: 'requestPreparation', diagnostics: { record() {} } },
    )
    await first.ready
    const before = await first.readOfficialProfiles(await actor(first, 'before'))
    expect((await first.close()).complete).toBe(true)
    if (!Array.isArray(before)) throw new Error('previous profiles unreadable')
    expect(before.map(row => row.profile.routeName)).not.toContain(dropped.routeName)
    expect(before).toHaveLength(previous.entries.length)
    expect(persisted(base.databaseFile).manifest).toBe(String(previous.ordinal))

    // Without the revision step the directory keeps its list: manifestNotNewer.
    const staleEvents: AcceptanceEvent[] = []
    const stale = createAcceptanceApplication(
      { ...base, officialManifest: { ...config.officialManifest, ordinal: previous.ordinal } },
      { stage: 'requestPreparation', diagnostics: { record: event => staleEvents.push(event) } },
    )
    await stale.ready
    const unchanged = await stale.readOfficialProfiles(await actor(stale, 'stale'))
    expect((await stale.close()).complete).toBe(true)
    expect(
      staleEvents.some(
        event => event.event === 'directory' && event.outcome === 'manifestNotNewer',
      ),
    ).toBe(true)
    if (!Array.isArray(unchanged)) throw new Error('stale profiles unreadable')
    expect(unchanged).toHaveLength(previous.entries.length)

    const upgraded = createAcceptanceApplication(
      { ...base, officialManifest: config.officialManifest },
      { stage: 'requestPreparation', diagnostics: { record() {} } },
    )
    await upgraded.ready
    const after = await upgraded.readOfficialProfiles(await actor(upgraded, 'after'))
    expect((await upgraded.close()).complete).toBe(true)
    if (!Array.isArray(after)) throw new Error('upgraded profiles unreadable')
    expect(sorted(after.map(row => row.profile.routeName))).toEqual(sorted(officialModelIds))
    expect(persisted(base.databaseFile).manifest).toBe(String(DEMO_OFFICIAL_MANIFEST_ORDINAL))
    for (const row of after)
      expect(row.profile.adaptation.configuration.revision).toBe(
        DEMO_OFFICIAL_CONFIGURATION_REVISION,
      )
  })
})
