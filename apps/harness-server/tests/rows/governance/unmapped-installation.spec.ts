import { afterEach, expect, it, vi } from 'vitest'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import { unmappedCaptureWorld } from './unmapped-capture-world.ts'
import { installToolGovernance } from '../../../src/rows/governance/tool-installation.ts'
import { toolAssetTarget } from '../../../src/rows/governance/tool-installation-assets.ts'

const worlds: Awaited<ReturnType<typeof unmappedCaptureWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('installs and adopts a real asset without inventing an organization Settings source', async () => {
  const w = await unmappedCaptureWorld({}, false)
  worlds.push(w)
  const page = await w.service.readCatalog(w.access, {
    scope: w.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 100,
  })
  if (page.kind !== 'page') throw new Error(JSON.stringify(page))
  const organizationTargets = createStandaloneSettingsOwner({
    storage: w.storage,
    domain: w.domain,
    ...w.combination,
  })
  const reads = vi.spyOn(organizationTargets, 'readTarget')
  const input = {
    principal: w.principal,
    scope: w.scope,
    epoch: page.snapshot.epoch,
    release: w.release,
    service: w.service,
    assets: w.owner,
    organizationTargets,
  }
  expect(await installToolGovernance(input)).toEqual({ kind: 'installed' })
  expect(await installToolGovernance(input)).toEqual({ kind: 'installed' })
  expect(reads).not.toHaveBeenCalled()
  const target = toolAssetTarget(w.entry, w.scope.tenantRef)
  expect(
    await w.owner.readHolding({ holdingRef: target.targetRef, scopeRef: target.scopeRef }),
  ).toMatchObject({
    kind: 'holding',
    holding: { state: 'held', enabled: true, revision: 1 },
    selected: { definition: null },
  })
  const current = await w.service.readCatalog(w.access, {
    scope: w.scope,
    mode: 'runtime',
    targets: [],
    cursor: null,
    limit: 100,
  })
  expect(current).toMatchObject({
    kind: 'page',
    completeness: 'complete',
    snapshot: { selectedDefinitions: [w.declaration.reference] },
  })
})
