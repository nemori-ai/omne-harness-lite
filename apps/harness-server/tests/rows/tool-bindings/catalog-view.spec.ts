import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { releaseOf } from '../../../src/entry/tool-release.ts'
import {
  createReleaseCatalogView,
  type ReleaseCatalogViewPorts,
} from '../../../src/rows/tool-bindings/catalog-view.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import { heldToolAuthority } from '../../../src/rows/tool-host/held-tools.ts'
import { releaseFixture } from '../tool-host/support.ts'

async function setup() {
  const fixture = await releaseFixture()
  const tenant = fixtureTenant('a')
  const session = sessionId('catalog-session')
  const principal = okOf(sessionWorkIssuerOf(fixture.env)({ tenant, session }), 'principal')
  const adopted = { owner: 'test', name: 'coding', revision: '1', digest: 'definition-1' }
  let residents: WorkSnapshot['residents'] = []
  const ports: ReleaseCatalogViewPorts = {
    verifier: () => fixture.root.get('principalVerifier'),
    release: () => releaseOf(fixture.root),
    readWork: async () =>
      succeed({
        session,
        tenant,
        lifecycle: 'active',
        frozen: null,
        residents,
        definition: { name: 'coding', adopted },
      }),
  }
  return {
    ports,
    principal,
    tenant,
    session,
    adopted,
    admit: (names: readonly string[]) => {
      residents = names.map(capability => ({
        capability,
        version: '1',
        shape: { kind: 'null' },
        admitted: { owner: 'session', record: capability, revision: '1', digest: capability },
      }))
    },
  }
}

type Ports = ReleaseCatalogViewPorts
type Held = NonNullable<Ports['held']>

const shown = (view: {
  entries: readonly { key: { asset: { name: string } }; resident: boolean }[]
}) => view.entries.map(entry => ({ name: entry.key.asset.name, resident: entry.resident }))

/** What a tenant holds as tools, by name; a name that maps to nothing is held and not in force. */
function holding(
  tenant: ReturnType<typeof fixtureTenant>,
  tools: Readonly<Record<string, Awaited<ReturnType<Held['current']>>['kind']>>,
): Held {
  return {
    names: async () => Object.keys(tools),
    current: async (_access, name) => {
      const kind = tools[name] ?? 'none'
      if (kind === 'unavailable') return { kind, diagnostic: 'cannot be read' }
      if (kind === 'unfit') return { kind, reason: 'cannot be loaded' }
      if (kind === 'none') return { kind }
      const held = {
        asset: `tool/${name}`,
        version: 'sha256:held',
        disabled: false,
        immutable: false,
        replaceLocked: false,
      }
      return { kind, authority: heldToolAuthority(tenant, name, held) }
    },
    definition: () => undefined,
  }
}

describe('release catalog lawful inclusion', () => {
  it('offers every tool of the release, whatever the adopted definition names', async () => {
    const { ports, principal, tenant } = await setup()
    const release = ports.release()
    if (release.kind !== 'trusted') throw new Error('fixture release missing')
    const answer = okOf(await createReleaseCatalogView(ports).read({ principal, tenant }), 'view')
    expect(shown(answer)).toEqual(
      release.manifest.entries.map(entry => ({ name: entry.asset.name, resident: false })),
    )
    expect(answer.entries.every(entry => entry.key.layer.kind === 'official')).toBe(true)
  })

  it('marks what the Session admitted as resident, and the version of the view follows it', async () => {
    const w = await setup()
    const view = createReleaseCatalogView(w.ports)
    const before = okOf(await view.read(w), 'before')
    w.admit(['Shell'])
    const after = okOf(await view.read(w), 'after')
    expect(shown(after).filter(entry => entry.resident)).toEqual([
      { name: 'Shell', resident: true },
    ])
    expect(after.revision).not.toBe(before.revision)
  })

  it('adds the tools the tenant of the call holds in force, in the layer of that tenant', async () => {
    const w = await setup()
    const held = holding(w.tenant, {
      wordcount: 'held',
      switched_off: 'none',
      broken: 'unfit',
      Files: 'held',
    })
    const before = okOf(await createReleaseCatalogView(w.ports).read(w), 'before')
    const after = okOf(await createReleaseCatalogView({ ...w.ports, held }).read(w), 'after')
    const added = after.entries.slice(before.entries.length)
    expect(added.map(entry => entry.key)).toEqual([
      {
        layer: { kind: 'tenant', tenant: w.tenant },
        asset: heldToolAuthority(w.tenant, 'wordcount', {
          asset: 'tool/wordcount',
          version: 'sha256:held',
          disabled: false,
          immutable: false,
          replaceLocked: false,
        }).asset,
      },
    ])
    expect(shown(after).filter(entry => entry.name === 'Files')).toHaveLength(1)
    expect(after.revision).not.toBe(before.revision)
  })

  it('keeps the version a session took as a resident when the tenant no longer holds that tool in force', async () => {
    const w = await setup()
    const taken = {
      asset: 'tool/wordcount',
      version: 'sha256:taken',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const { layer, asset } = heldToolAuthority(w.tenant, 'wordcount', taken)
    const asked: unknown[] = []
    const held: Held = {
      ...holding(w.tenant, { wordcount: 'none', other: 'held' }),
      recorded: async (_access, resident) => {
        asked.push(resident.capability)
        return resident.capability === 'wordcount' ? { key: { layer, asset } } : undefined
      },
    }
    w.admit(['Files', 'wordcount', 'other'])
    const view = okOf(await createReleaseCatalogView({ ...w.ports, held }).read(w), 'view')
    const mine = view.entries.filter(entry => entry.key.layer.kind === 'tenant')
    expect(mine.map(entry => [entry.key.asset.name, entry.resident])).toEqual([
      ['other', true],
      ['wordcount', true],
    ])
    expect(mine[1]?.key).toEqual({ layer, asset })
    // A resident of the release, and one whose tool is in force, are not asked for.
    expect(asked).toEqual(['wordcount'])
  })

  it('asks what is held as the tenant of the call', async () => {
    const w = await setup()
    const asked: unknown[] = []
    const held: Held = {
      ...holding(w.tenant, {}),
      names: async access => {
        asked.push(access.tenant)
        return []
      },
    }
    okOf(await createReleaseCatalogView({ ...w.ports, held }).read(w), 'view')
    expect(asked).toEqual([w.tenant])
  })

  it('rejects a principal from another tenant and a substituted Session snapshot', async () => {
    const w = await setup()
    expect(
      await createReleaseCatalogView(w.ports).read({
        principal: w.principal,
        tenant: fixtureTenant('b'),
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    const view = createReleaseCatalogView({
      ...w.ports,
      readWork: async () =>
        succeed({
          tenant: w.tenant,
          session: sessionId('another-session'),
          lifecycle: 'active',
          frozen: null,
          residents: [],
          definition: { name: 'coding', adopted: w.adopted },
        }),
    })
    expect(await view.read(w)).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('does not turn absent or failed owning services into an empty successful view', async () => {
    const w = await setup()
    const patches: Partial<Ports>[] = [
      { verifier: () => undefined },
      { readWork: () => undefined },
      { release: () => ({ kind: 'unavailable' as const, diagnostic: 'withdrawn' }) },
      {
        readWork: async () => {
          throw new Error('storage failed')
        },
      },
      { held: { ...holding(w.tenant, {}), names: async () => undefined } },
      { held: holding(w.tenant, { wordcount: 'unavailable' }) },
    ]
    for (const patch of patches)
      expect(await createReleaseCatalogView({ ...w.ports, ...patch }).read(w)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
  })

  it('refuses an active Run whose independent Session frozen fact is set', async () => {
    const w = await setup()
    const evidence = { owner: 'tool', record: 'shape-lost', revision: '1', digest: 'frozen' }
    const view = createReleaseCatalogView({
      ...w.ports,
      readWork: async () =>
        succeed({
          tenant: w.tenant,
          session: w.session,
          lifecycle: 'active',
          frozen: { cause: 'tool-shape-lost', evidence, commit: evidence },
          residents: [],
          definition: { name: 'coding', adopted: w.adopted },
        }),
    })
    expect(await view.read(w)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it.each(['initializing', 'frozen', 'archived'] as const)(
    'refuses %s Session disclosure',
    async lifecycle => {
      const w = await setup()
      const view = createReleaseCatalogView({
        ...w.ports,
        readWork: async () =>
          succeed({
            tenant: w.tenant,
            session: w.session,
            lifecycle,
            frozen: null,
            residents: [],
            definition: { name: 'coding', adopted: w.adopted },
          }),
      })
      expect(await view.read(w)).toMatchObject({ failure: { kind: 'unavailable' } })
    },
  )
})
