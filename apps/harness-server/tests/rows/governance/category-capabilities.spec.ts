// The declaration of a held capability lives and dies with its holding: four states, three events.
import { describe, expect, it } from 'vitest'
import type { GovernanceCollectionMember } from '@omne-harness/governance-local'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { canonicalDigest } from '@omne-harness/tool'
import {
  categoryGateRelease,
  gatedSettings,
  type CategoryGateTemplate,
} from '../../../src/entry/category-gates.ts'
import type { PermissionDeclaration } from '../../../src/entry/permission-declarations.ts'
import {
  MAX_SCOPE_LEASES,
  createCategoryCapabilities,
  type CategoryCapabilitiesOptions,
} from '../../../src/rows/governance/category-capabilities.ts'
import type { GovernedCategoryCapability } from '../../../src/rows/governance/governed-capabilities.ts'
import { fixtureTenant } from '../../entry/support.ts'

const TEMPLATE: CategoryGateTemplate = {
  category: 'probe',
  ownerId: 'test.probe-gates',
  gates: [{ id: 'invoke', title: '调用', default: 'ask' }],
}
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
const domain = {
  scope: { kind: 'tenant' as const, tenant: TENANT },
  transactionDomain: 'tenant.governance',
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

function held(
  name: string,
  over: Partial<Pick<GovernedCategoryCapability, 'enabled' | 'template'>> & {
    version?: string
  } = {},
): GovernedCategoryCapability {
  const reference = {
    assetRef: `asset-${name}`,
    category: 'probe',
    name,
    version: over.version ?? '1',
    source: 'tenant',
    bodyDigest: 'a'.repeat(64),
  }
  const release = categoryGateRelease({
    template: TEMPLATE,
    publication: reference,
    settings: gatedSettings(TEMPLATE, name, null),
  })
  if (release === undefined) throw new Error('fixture: release')
  return {
    template: over.template ?? TEMPLATE,
    target: { kind: 'asset', holdingRef: `held-${name}`, scopeRef: TENANT },
    enabled: over.enabled ?? true,
    publication: { kind: 'asset', reference },
    ...release,
  }
}

type Contribution = GovernanceCollectionMember['contribution']
type Lease = { contribution: Contribution; reference: unknown; state: 'active' | 'released' }

function world(tools: readonly GovernanceCollectionMember[] = []) {
  let holdings: readonly GovernedCategoryCapability[] | 'unreadable' = []
  const calls: string[] = []
  const operations = new Map<string, Lease>()
  const leases: Lease[] = tools.map(tool => ({
    contribution: tool.contribution,
    reference: tool.definition,
    state: 'active',
  }))
  let selected: readonly GovernanceCollectionMember[] = []
  const answers = { contribute: [] as string[], withdraw: [] as string[], adopt: [] as string[] }
  let running = 0
  let overlapped = false
  const declared = new Set<PermissionDeclaration>()
  const sources = new Map<string, unknown>()

  const service = {
    async contribute(
      _access: unknown,
      command: { operationId: string; generation: string; declaration: { reference: unknown } },
    ) {
      calls.push(`contribute:${command.operationId}`)
      const forced = answers.contribute.shift()
      const known = operations.get(command.operationId)
      const lease: Lease = known ?? {
        contribution: {
          scope,
          contributorId: TEMPLATE.ownerId,
          generation: command.generation,
          registrationId: `registration-${String(operations.size + 1)}`,
        },
        reference: command.declaration.reference,
        state: 'active',
      }
      if (known === undefined) {
        operations.set(command.operationId, lease)
        leases.push(lease)
      }
      if (forced !== undefined) return { kind: forced }
      return { kind: 'registered', state: lease.state, contribution: lease.contribution }
    },
    async withdraw(_access: unknown, command: { operationId: string; contribution: Contribution }) {
      calls.push(`withdraw:${command.contribution.registrationId}`)
      const forced = answers.withdraw.shift()
      if (forced !== undefined) return { kind: forced }
      const lease = leases.find(
        item => item.contribution.registrationId === command.contribution.registrationId,
      )
      if (lease === undefined) return { kind: 'denied' }
      const before = lease.state
      lease.state = 'released'
      return { kind: before === 'active' ? 'released' : 'already-released' }
    },
    async readCatalog() {
      const active = leases.filter(lease => lease.state === 'active')
      return {
        kind: 'page',
        completeness: 'complete',
        nextCursor: null,
        snapshot: {
          selectedDefinitions: selected.map(member => member.definition),
          adoptionRevision: 1,
          declarationRevision: 1,
        },
        items: active.map(lease => ({
          declaration: { reference: lease.reference },
          contributions: [{ contribution: lease.contribution, state: lease.state }],
          selectedTargets:
            selected.find(
              member =>
                canonicalDigest(member.contribution) === canonicalDigest(lease.contribution),
            )?.selectedTargets ?? [],
          availability: 'available',
        })),
      }
    },
    async adopt(_access: unknown, command: { complete: readonly GovernanceCollectionMember[] }) {
      calls.push(`adopt:${String(command.complete.length)}`)
      const forced = answers.adopt.shift()
      if (forced !== undefined) return { kind: forced }
      selected = command.complete.map(member => ({
        ...member,
        definition: leases.find(
          lease => canonicalDigest(lease.contribution) === canonicalDigest(member.contribution),
        )?.reference as GovernanceCollectionMember['definition'],
      }))
      return { kind: 'adopted' }
    },
  }

  const options: CategoryCapabilitiesOptions = {
    templates: [TEMPLATE],
    scope,
    domain,
    storage: {
      async read() {
        running += 1
        if (running > 1) overlapped = true
        await new Promise(resolve => setImmediate(resolve))
        running -= 1
        return holdings === 'unreadable'
          ? { kind: 'unavailable', reason: 'closed' }
          : { kind: 'read', output: { kind: 'completed', response: holdings } }
      },
    } as never,
    read: { handler: 'fixture.read', protocol: '1' },
    capture: () => ({ excluded: [] }),
    principal: principal(),
    organizationId: 'org-1',
    organizationTargets: {
      async readTarget(target: unknown) {
        const record = sources.get(canonicalDigest(target))
        return record === undefined
          ? { kind: 'not_found' }
          : { kind: 'found', retired: false, projection: record }
      },
      async mutate(command: { record: { target: unknown } }) {
        sources.set(canonicalDigest(command.record.target), {
          ...command.record,
          enabled: true,
          ownerRevision: 1,
        })
        return { kind: 'committed', revision: 1 }
      },
    } as never,
    declare(declaration) {
      declared.add(declaration)
      return () => declared.delete(declaration)
    },
    warn: message => calls.push(`warn:${message}`),
  }
  const capabilities = createCategoryCapabilities(options)
  const opened = (epoch = 'epoch-1') =>
    capabilities.open({ epoch, service: service as never, tools })
  return {
    capabilities,
    opened,
    calls,
    answers,
    hold(next: readonly GovernedCategoryCapability[] | 'unreadable') {
      holdings = next
    },
    async changed() {
      capabilities.changed()
      await capabilities.settled()
    },
    declaredNames: () =>
      [...declared].map(entry => `${entry.asset.category}.${entry.asset.name}`).sort(),
    activeLeases: () => leases.filter(lease => lease.state === 'active').length,
    selectedCount: () => selected.length,
    overlapped: () => overlapped,
    take() {
      return calls.splice(0).map(call => call.replace(/:sha256:.*/, ''))
    },
  }
}

describe('from no declaration', () => {
  it('a holding that appears is registered and the whole collection is adopted', async () => {
    const w = world()
    expect(await w.opened()).toEqual({ kind: 'installed' })
    w.take()
    w.hold([held('alpha')])
    await w.changed()
    expect(w.take()).toEqual(['contribute', 'adopt:1'])
    expect(w.declaredNames()).toEqual(['probe.alpha'])
    expect(w.capabilities.owners()).toMatchObject([
      { ownerId: 'test.probe-gates', enforcementBindings: [{ capabilityId: 'probe.alpha' }] },
    ])
  })

  it('opening the governance reconciles with what is held then', async () => {
    const w = world()
    w.hold([held('alpha'), held('beta')])
    expect(await w.opened()).toEqual({ kind: 'installed' })
    expect(w.take()).toEqual(['contribute', 'contribute', 'adopt:2'])
    expect(w.declaredNames()).toEqual(['probe.alpha', 'probe.beta'])
  })

  it.each([
    ['a disabled holding', held('alpha', { enabled: false })],
    [
      'a holding whose template the assembly did not name',
      held('alpha', {
        template: { ...TEMPLATE, gates: [{ id: 'invoke', title: '调用', default: 'auto' }] },
      }),
    ],
  ])('%s is not registered', async (_name, holding) => {
    const w = world()
    await w.opened()
    w.take()
    w.hold([holding])
    await w.changed()
    expect(w.take()).toEqual([])
    expect(w.declaredNames()).toEqual([])
    expect(w.capabilities.owners()).toEqual([
      { ownerId: 'test.probe-gates', enforcementBindings: [] },
    ])
  })
})

describe('from a registered declaration that is not adopted', () => {
  it('a later reconciliation recalls the registration by its operation and adopts', async () => {
    const w = world()
    await w.opened()
    w.hold([held('alpha')])
    w.answers.adopt.push('unavailable')
    await w.changed()
    expect(w.declaredNames()).toEqual([])
    w.take()
    await w.changed()
    expect(w.take()).toEqual(['adopt:1'])
    expect(w.activeLeases()).toBe(1)
    expect(w.declaredNames()).toEqual(['probe.alpha'])
  })

  it('a holding that goes before the adoption is withdrawn', async () => {
    const w = world()
    await w.opened()
    w.hold([held('alpha')])
    w.answers.adopt.push('unavailable')
    await w.changed()
    w.take()
    w.hold([])
    await w.changed()
    expect(w.take()).toEqual(['withdraw:registration-1'])
    expect(w.activeLeases()).toBe(0)
    expect(w.declaredNames()).toEqual([])
  })
})

describe('from an adopted declaration', () => {
  async function adopted() {
    const w = world()
    w.hold([held('alpha'), held('beta')])
    await w.opened()
    w.take()
    return w
  }

  it('a change that leaves the holdings as they are registers, withdraws and adopts nothing', async () => {
    const w = await adopted()
    await w.changed()
    expect(w.take()).toEqual([])
    expect(w.declaredNames()).toEqual(['probe.alpha', 'probe.beta'])
  })

  it('a holding that is removed or disabled is withdrawn and the rest is adopted again', async () => {
    const w = await adopted()
    w.hold([held('alpha', { enabled: false }), held('beta')])
    await w.changed()
    expect(w.take()).toEqual(['withdraw:registration-1', 'adopt:1'])
    expect(w.declaredNames()).toEqual(['probe.beta'])
    w.hold([])
    await w.changed()
    expect(w.take()).toEqual(['withdraw:registration-2', 'adopt:0'])
    expect(w.declaredNames()).toEqual([])
  })

  it('a holding that comes back is registered by a new operation, never by the released lease', async () => {
    const w = await adopted()
    w.hold([held('beta')])
    await w.changed()
    w.take()
    w.hold([held('alpha'), held('beta')])
    await w.changed()
    expect(w.take()).toEqual(['contribute', 'adopt:2'])
    expect(w.activeLeases()).toBe(2)
    expect(w.declaredNames()).toEqual(['probe.alpha', 'probe.beta'])
  })

  it('another version of a holding replaces its declaration', async () => {
    const w = await adopted()
    w.hold([held('alpha', { version: '2' }), held('beta')])
    await w.changed()
    expect(w.take()).toEqual(['withdraw:registration-1', 'contribute', 'adopt:2'])
    expect(w.declaredNames()).toEqual(['probe.alpha', 'probe.beta'])
  })
})

describe('when an outcome is not known', () => {
  it('a registration is asked again by the same operation, and no second lease is made', async () => {
    const w = world()
    await w.opened()
    w.hold([held('alpha')])
    w.answers.contribute.push('unknown')
    await w.changed()
    expect(w.declaredNames()).toEqual([])
    const asked = w.calls.filter(call => call.startsWith('contribute:'))
    await w.changed()
    const again = w.calls.filter(call => call.startsWith('contribute:'))
    expect(again).toHaveLength(2)
    expect(again[1]).toBe(asked[0])
    expect(w.activeLeases()).toBe(1)
    expect(w.declaredNames()).toEqual(['probe.alpha'])
  })

  it('a withdrawal is asked again for the same lease, and the declaration is not offered meanwhile', async () => {
    const w = world()
    w.hold([held('alpha')])
    await w.opened()
    w.take()
    w.hold([])
    w.answers.withdraw.push('unknown')
    await w.changed()
    expect(w.take().filter(call => call.startsWith('withdraw'))).toEqual([
      'withdraw:registration-1',
    ])
    expect(w.declaredNames()).toEqual([])
    await w.changed()
    expect(w.take()).toEqual(['withdraw:registration-1', 'adopt:0'])
    expect(w.activeLeases()).toBe(0)
  })

  it('an adoption that did not happen leaves a withdrawn declaration withdrawn', async () => {
    const w = world()
    w.hold([held('alpha'), held('beta')])
    await w.opened()
    w.hold([held('beta')])
    w.answers.adopt.push('unavailable')
    await w.changed()
    expect(w.declaredNames()).toEqual(['probe.beta'])
    w.take()
    w.hold([held('alpha'), held('beta')])
    await w.changed()
    expect(w.take()).toEqual(['contribute', 'adopt:2'])
    expect(w.activeLeases()).toBe(2)
  })

  it('held capabilities that cannot be read change nothing', async () => {
    const w = world()
    w.hold([held('alpha')])
    await w.opened()
    w.take()
    w.hold('unreadable')
    await w.changed()
    expect(w.take().filter(call => !call.startsWith('warn'))).toEqual([])
    expect(w.declaredNames()).toEqual(['probe.alpha'])
    expect(w.activeLeases()).toBe(1)
  })
})

describe('bounds', () => {
  it('capabilities beyond the lease budget of the scope are refused by name, the others stand', async () => {
    const tools = Array.from({ length: MAX_SCOPE_LEASES - 1 }, (_, index) => ({
      contribution: {
        scope,
        contributorId: 'tools',
        generation: 'epoch-1',
        registrationId: `tool-${String(index)}`,
      },
      definition: {
        ownerId: 'tools',
        definitionId: `tool-${String(index)}`,
        version: '1',
        digest: 'b'.repeat(64),
      },
      selectedTargets: [],
    }))
    const w = world(tools)
    w.hold([held('alpha'), held('beta')])
    expect(await w.opened()).toEqual({ kind: 'installed' })
    expect(w.declaredNames()).toEqual(['probe.alpha'])
    expect(w.capabilities.refused()).toEqual([
      { category: 'probe', name: 'beta', reason: 'lease-budget' },
    ])
  })

  it('reconciliations of one tenant run one at a time, and changes that arrive meanwhile run once more', async () => {
    const w = world()
    await w.opened()
    w.take()
    w.hold([held('alpha')])
    w.capabilities.changed()
    w.capabilities.changed()
    w.capabilities.changed()
    await w.capabilities.settled()
    expect(w.overlapped()).toBe(false)
    expect(w.take()).toEqual(['contribute', 'adopt:1'])
  })

  it('after closing, a change reconciles nothing and nothing stays declared', async () => {
    const w = world()
    w.hold([held('alpha')])
    await w.opened()
    w.take()
    w.capabilities.close()
    w.hold([])
    await w.changed()
    expect(w.take()).toEqual([])
    expect(w.declaredNames()).toEqual([])
  })
})
