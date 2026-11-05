import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { AgentDefinition } from '@omne-harness/agent-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { releaseOf } from '../../../src/entry/tool-release.ts'
import {
  createReleaseCatalogView,
  type ReleaseCatalogViewPorts,
} from '../../../src/rows/tool-bindings/catalog-view.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import { releaseFixture } from '../tool-host/support.ts'

async function setup() {
  const fixture = await releaseFixture()
  const tenant = fixtureTenant('a')
  const session = sessionId('catalog-session')
  const principal = okOf(sessionWorkIssuerOf(fixture.env)({ tenant, session }), 'principal')
  const adopted = { owner: 'test', name: 'coding', revision: '1', digest: 'definition-1' }
  let references: AgentDefinition['references'] = [
    { capability: { category: 'Tool', name: 'Files' }, resident: false },
  ]
  let residents: WorkSnapshot['residents'] = []
  const ports: ReleaseCatalogViewPorts = {
    verifier: () => fixture.root.get('principalVerifier'),
    release: () => releaseOf(fixture.root),
    readWork: async () =>
      succeed({
        session,
        tenant,
        lifecycle: 'active',
        residents,
        definition: { name: 'coding', adopted },
      }),
    resolve: async () =>
      succeed({
        definition: {
          category: 'AgentDefinition',
          name: 'coding',
          attributes: [],
          references,
        },
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
    change: (next: AgentDefinition['references']) => {
      references = next
    },
  }
}

describe('release catalog lawful inclusion', () => {
  it('includes a nonresident reference, excludes release tools absent from the adopted definition', async () => {
    const { ports, principal, tenant } = await setup()
    const view = createReleaseCatalogView(ports)
    const answer = okOf(await view.read({ principal, tenant }), 'view')
    expect(
      answer.entries.map(entry => ({ name: entry.key.asset.name, resident: entry.resident })),
    ).toEqual([{ name: 'Files', resident: false }])
  })

  it('reads current references and category without retaining an earlier directory', async () => {
    const w = await setup()
    const view = createReleaseCatalogView(w.ports)
    const before = okOf(await view.read(w), 'before')
    w.change([
      { capability: { category: 'Tool', name: 'Shell' }, resident: true },
      { capability: { category: 'Skill', name: 'Files' }, resident: true },
    ])
    w.admit(['Shell'])
    const after = okOf(await view.read(w), 'after')
    expect(
      after.entries.map(entry => ({ name: entry.key.asset.name, resident: entry.resident })),
    ).toEqual([{ name: 'Shell', resident: true }])
    expect(after.revision).not.toBe(before.revision)
  })

  it('uses admitted residents even after a later definition removes the candidate flag or reference', async () => {
    const w = await setup()
    w.admit(['Files'])
    const view = createReleaseCatalogView(w.ports)
    expect(okOf(await view.read(w), 'admitted').entries[0]?.resident).toBe(true)
    w.change([])
    expect(
      okOf(await view.read(w), 'retained').entries.map(item => ({
        name: item.key.asset.name,
        resident: item.resident,
      })),
    ).toEqual([{ name: 'Files', resident: true }])
    w.change([{ capability: { category: 'Tool', name: 'Shell' }, resident: true }])
    const entries = okOf(await view.read(w), 'candidate').entries
    expect(entries.find(item => item.key.asset.name === 'Shell')?.resident).toBe(false)
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
          residents: [],
          definition: { name: 'coding', adopted: w.adopted },
        }),
    })
    expect(await view.read(w)).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('does not turn absent or failed owning services into an empty successful view', async () => {
    const w = await setup()
    for (const patch of [
      { verifier: () => undefined },
      { readWork: () => undefined },
      { resolve: () => undefined },
      {
        resolve: async () =>
          fail({ kind: 'invalid' as const, field: 'adoption', reason: 'unknown' }),
      },
      { release: () => ({ kind: 'unavailable' as const, diagnostic: 'withdrawn' }) },
      {
        readWork: async () => {
          throw new Error('storage failed')
        },
      },
    ])
      expect(await createReleaseCatalogView({ ...w.ports, ...patch }).read(w)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
  })

  it('keeps the legal view version when only an unlisted release asset changes', async () => {
    const w = await setup()
    const before = okOf(await createReleaseCatalogView(w.ports).read(w), 'before')
    const release = w.ports.release()
    if (release.kind !== 'trusted') throw new Error('fixture release missing')
    const after = okOf(
      await createReleaseCatalogView({
        ...w.ports,
        release: () => ({
          ...release,
          generation: 'unrelated-release-change',
          manifest: {
            ...release.manifest,
            entries: release.manifest.entries.map(entry =>
              entry.asset.name === 'Shell'
                ? {
                    ...entry,
                    asset: { ...entry.asset, adoption: { ...entry.asset.adoption, revision: '2' } },
                  }
                : entry,
            ),
          },
        }),
      }).read(w),
      'after',
    )
    expect(after).toEqual(before)
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
            residents: [],
            definition: { name: 'coding', adopted: w.adopted },
          }),
      })
      expect(await view.read(w)).toMatchObject({ failure: { kind: 'unavailable' } })
    },
  )
})
