// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import {
  modelProviderBodyContract,
  modelProviderCategoryDisplay,
} from '@omne-harness/model-contract/provider-asset'
import { originOf } from '@omne-harness/assets-local'
import { releaseProviders } from '../../../src/assets/model-providers.ts'
import { installReleaseProviders } from '../../../src/rows/governance/release-provider-installation.ts'
import { toolAssetsWorld } from './tool-assets-world.ts'

const worlds: Awaited<ReturnType<typeof toolAssetsWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

async function world() {
  const w = await toolAssetsWorld(undefined, {
    categories: [
      {
        contract: modelProviderBodyContract(),
        display: modelProviderCategoryDisplay,
        point: 'model.providers',
      },
    ],
  })
  worlds.push(w)
  return w
}

function warnings() {
  const said: string[] = []
  return { said, warn: (message: string) => void said.push(message) }
}

it('installs every release provider as an official holding of the tenant, pinned to the release version', async () => {
  const w = await world()
  const log = warnings()
  const input = {
    owner: w.owner,
    tenantRef: w.domain.scope.tenant,
    providers: releaseProviders(),
    warn: log.warn,
  }
  const installed = await installReleaseProviders(input)
  const [openrouter] = releaseProviders()
  if (openrouter === undefined) throw new Error('the release brings no provider')
  expect(installed).toEqual([{ provider: 'openrouter', kind: 'ready', target: expect.anything() }])
  const lookup = {
    holdingRef: 'harness.preinstalled.model-provider.openrouter',
    scopeRef: w.domain.scope.tenant,
  }
  const holding = await w.owner.readHolding(lookup)
  if (holding.kind !== 'holding') throw new Error(JSON.stringify(holding))
  expect(holding.holding).toMatchObject({ state: 'held', enabled: true, revision: 1 })
  expect(holding.selected?.version).toBe(openrouter.version)
  expect(originOf(holding.holding)).toBe('official')
  expect(await installReleaseProviders(input)).toEqual(installed)
  expect(await w.owner.readHolding(lookup)).toEqual(holding)
  expect(log.said).toEqual([])
})

it('a holding that could not be made is made at the next opening, and the failure is said once', async () => {
  const w = await world()
  const log = warnings()
  let refusals = 1
  const owner: typeof w.owner = {
    ...w.owner,
    async hold(input) {
      if (refusals > 0) {
        refusals -= 1
        return { kind: 'rejected', reason: 'unavailable' }
      }
      return w.owner.hold(input)
    },
  }
  const input = {
    owner,
    tenantRef: w.domain.scope.tenant,
    providers: releaseProviders(),
    warn: log.warn,
  }
  expect(await installReleaseProviders(input)).toEqual([
    { provider: 'openrouter', kind: 'unavailable', phase: 'holding' },
  ])
  expect(log.said).toEqual(['the release provider openrouter is not installed yet (holding)'])
  expect(await installReleaseProviders(input)).toMatchObject([
    { provider: 'openrouter', kind: 'ready' },
  ])
  expect(log.said).toHaveLength(1)
})

it('a holding whose reply was lost is recognised rather than made twice', async () => {
  const w = await world()
  const log = warnings()
  const owner: typeof w.owner = {
    ...w.owner,
    async hold(input) {
      const result = await w.owner.hold(input)
      expect(result.kind).toBe('committed')
      return { kind: 'unknown', operationId: input.operationId }
    },
  }
  const input = {
    owner,
    tenantRef: w.domain.scope.tenant,
    providers: releaseProviders(),
    warn: log.warn,
  }
  expect(await installReleaseProviders(input)).toMatchObject([
    { provider: 'openrouter', kind: 'ready' },
  ])
  expect(log.said).toEqual([])
})
