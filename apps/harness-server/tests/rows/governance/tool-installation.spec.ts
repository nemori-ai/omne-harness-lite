import { expect, it, vi } from 'vitest'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { toolAssetPublication } from '../../../src/rows/governance/tool-assets.ts'
import { installToolGovernance } from '../../../src/rows/governance/tool-installation.ts'
import { fixtureTenant } from '../../entry/support.ts'

type Input = Parameters<typeof installToolGovernance>[0]
type Command = { declaration: { reference: { definitionId: string } } }

const tenant = fixtureTenant('a')
const encoded = tenantCodec.encode(tenant)
if (!encoded.ok) throw new Error('fixture: tenant text')
const TENANT = encoded.value
const scope = {
  tenantRef: TENANT,
  deploymentId: 'test',
  logicalServiceId: 'harness-governance',
  visibility: { kind: 'tenant' as const, tenantRef: TENANT },
}

function principal() {
  const authority = inProcessPrincipalAuthority()
  const actor = authority.issuer.issueSystem({ component: 'governance-installation-fixture' })
  if (!('ok' in actor)) throw new Error('fixture: actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: 'harness.governance', work: 'installation' },
  })
  if (!('ok' in issued)) throw new Error('fixture: principal')
  return issued.ok
}

const loaded = await loadProductionRelease()
if (loaded.kind !== 'trusted') throw new Error(JSON.stringify(loaded))
const release = loaded
const entries = release.manifest.entries
const publications = new Map(entries.map(entry => [entry.asset.name, toolAssetPublication(entry)]))
const byAsset = new Map([...publications.values()].map(value => [value.assetRef, value]))

function assets(events: string[]) {
  const version = (assetRef: string) => {
    const { pinned, publicationRef } = byAsset.get(assetRef)!
    return {
      kind: 'version',
      version: {
        assetRef,
        category: publicationRef.category,
        name: publicationRef.name,
        version: pinned.version,
        source: pinned.source,
        body: pinned.body,
      },
    }
  }
  return {
    readAsset: async ({ assetRef }: { assetRef: string }) => {
      events.push(`asset:${assetRef}`)
      return { kind: 'asset', asset: { revision: 1 } }
    },
    readVersion: async ({ assetRef }: { assetRef: string }) => version(assetRef),
    readHolding: async ({ holdingRef }: { holdingRef: string }) => {
      const value = publications.get(holdingRef.replace('harness.preinstalled.tool.', ''))!
      return {
        kind: 'holding',
        holding: { assetRef: value.assetRef, state: 'held', enabled: true, revision: 1 },
        selected: { version: value.pinned.version },
      }
    },
  } as unknown as Input['assets']
}

function service(contribute: (command: Command) => Promise<unknown>) {
  const members: { contribution: unknown; definition: unknown }[] = []
  return {
    contribute: vi.fn(async (_access: unknown, command: Command) => {
      const result = await contribute(command)
      if (
        typeof result === 'object' &&
        result !== null &&
        'contribution' in result &&
        'state' in result
      )
        members.push({
          contribution: result.contribution,
          definition: command.declaration.reference,
        })
      return result
    }),
    readCatalog: async () => ({
      kind: 'page',
      completeness: 'complete',
      nextCursor: null,
      snapshot: {
        selectedDefinitions: members.map(member => member.definition),
        adoptionRevision: 1,
        declarationRevision: 1,
      },
      items: members.map(member => ({
        declaration: { reference: member.definition },
        contributions: [{ contribution: member.contribution, state: 'active' }],
        selectedTargets: [],
        availability: 'available',
      })),
    }),
    adopt: vi.fn(async () => ({ kind: 'adopted' })),
  }
}

function input(
  contributions: ReturnType<typeof service>,
  concurrency: number,
  events: string[] = [],
): Input {
  return {
    principal: principal(),
    scope,
    epoch: 'epoch-1',
    release,
    concurrency,
    service: contributions as unknown as Input['service'],
    assets: assets(events),
    organizationTargets: {
      readTarget: async () => ({ kind: 'found', retired: true, projection: { enabled: false } }),
    } as unknown as Input['organizationTargets'],
    releaseSettings: { observe: async () => ({ kind: 'current' }), rebase: vi.fn() },
    warn: vi.fn(),
  }
}

const registered = (command: Command) => ({
  kind: 'registered',
  state: 'active',
  contribution: { registrationId: command.declaration.reference.definitionId },
})
const turn = () => new Promise(resolve => setImmediate(resolve))

it.each([3, 8])(
  'installs the tools of a release side by side, at most %i at a time, each in its own order',
  async limit => {
    let inFlight = 0
    let peak = 0
    const events: string[] = []
    const contributions = service(async command => {
      events.push(`contribute:${command.declaration.reference.definitionId}`)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await turn()
      inFlight -= 1
      return registered(command)
    })
    expect(entries.length).toBeGreaterThan(limit)
    expect(await installToolGovernance(input(contributions, limit, events))).toEqual({
      kind: 'installed',
    })
    expect(peak).toBe(limit)
    expect(contributions.contribute).toHaveBeenCalledTimes(entries.length)
    for (const entry of entries) {
      const asset = events.indexOf(`asset:${toolAssetPublication(entry).assetRef}`)
      const contribute = events.indexOf(
        `contribute:${entry.governance.declaration.reference.definitionId}`,
      )
      expect(asset).toBeGreaterThanOrEqual(0)
      expect(asset).toBeLessThan(contribute)
    }
  },
)

it('answers a failed registration only after every other tool has finished', async () => {
  const failing = entries[0]!.governance.declaration.reference.definitionId
  const finished = new Set<string>()
  const contributions = service(async command => {
    const id = command.declaration.reference.definitionId
    if (id === failing) return { kind: 'unavailable', owner: 'test' }
    await turn()
    await turn()
    finished.add(id)
    return registered(command)
  })
  expect(await installToolGovernance(input(contributions, 4))).toEqual({
    kind: 'unavailable',
    phase: 'contribute',
  })
  expect(contributions.contribute).toHaveBeenCalledTimes(entries.length)
  expect(finished.size).toBe(entries.length - 1)
  expect(contributions.adopt).not.toHaveBeenCalled()
})
