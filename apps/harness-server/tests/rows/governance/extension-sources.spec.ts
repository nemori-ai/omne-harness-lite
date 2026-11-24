import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  GovernanceExtensionSources,
  tenantExtensionSources,
} from '../../../src/rows/governance/extension-sources.ts'

const TENANT = JSON.stringify({
  organization: `org_${'a'.repeat(26)}`,
  account: `acc_${'1'.repeat(26)}`,
})
const capability = { category: 'loop-extension', name: 'guard' } as never

function settingsDouble() {
  const listeners = new Set<() => void>()
  const log: string[] = []
  return {
    log,
    fire: () => listeners.forEach(listener => listener()),
    access: {
      async read() {
        log.push('read')
        return { completeness: 'complete', views: [] }
      },
      writer: {},
      changes: {
        subscribe(listener: () => void) {
          log.push('subscribe')
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    } as never,
  }
}

const assetsDouble = (held: 'absent' | 'held' = 'held') =>
  ({
    async readHeldCapability() {
      return held === 'held' ? { kind: 'held', holding: { holdingRef: 'h-1' } } : { kind: 'absent' }
    },
    async domainRevision() {
      return { kind: 'domain', revision: 7 }
    },
  }) as never

function sourcesOver(settings: () => Promise<unknown>, assets = assetsDouble()) {
  let asked = 0
  const sources = tenantExtensionSources({
    assets,
    settings: async () => {
      asked += 1
      return settings() as never
    },
    tenantRef: TENANT,
    deploymentRef: 'deployment',
    layers: [],
    assetsChanged: () => () => {},
  })
  return { sources, asked: () => asked }
}

describe('the tenant sources of the loop extensions over the governance of a tenant', () => {
  it('do not ask for the settings of the tenant until the run setting of a held extension is read', async () => {
    const settings = settingsDouble()
    const { sources, asked } = sourcesOver(async () => settings.access)
    sources.changes.subscribe(() => {})
    expect(await sources.basis()).toEqual({ assets: '7', settings: 'seen:0' })
    expect(asked()).toBe(0)
    expect(await sources.run({ capability, asset: 'a' })).toEqual({ kind: 'absent' })
    expect(asked()).toBe(1)
  })

  it('do not ask for the settings for a capability the tenant does not hold', async () => {
    const settings = settingsDouble()
    const { sources, asked } = sourcesOver(async () => settings.access, assetsDouble('absent'))
    expect(await sources.run({ capability, asset: 'a' })).toEqual({ kind: 'absent' })
    expect(asked()).toBe(0)
  })

  it('watch the settings before they read them, and pass each change on with a new basis', async () => {
    const settings = settingsDouble()
    const { sources } = sourcesOver(async () => settings.access)
    let heard = 0
    sources.changes.subscribe(() => (heard += 1))
    await sources.run({ capability, asset: 'a' })
    await sources.run({ capability, asset: 'a' })
    expect(settings.log).toEqual(['subscribe', 'read', 'read'])
    settings.fire()
    expect(heard).toBe(1)
    expect(await sources.basis()).toEqual({ assets: '7', settings: 'seen:1' })
  })

  it('answer unavailable for the run setting while the settings cannot be had', async () => {
    const { sources } = sourcesOver(async () => undefined)
    expect(await sources.run({ capability, asset: 'a' })).toEqual({ kind: 'unavailable' })
  })
})

describe('the sources of a tenant as the governance row gives them', () => {
  const access = () => {
    const tenant = tenantCodec.parse(TENANT)
    if (!tenant.ok) throw new Error('fixture tenant')
    return { principal: 'p', tenant: tenant.value }
  }
  function service() {
    let assets: unknown = assetsDouble()
    let settings = settingsDouble()
    let asked = 0
    const sources = new GovernanceExtensionSources(new Context(), {
      assets: async () => assets as never,
      settings: async () => {
        asked += 1
        return settings.access
      },
      layers: () => [],
      assetsChanged: () => () => {},
      deploymentRef: 'deployment',
    })
    return {
      sources,
      asked: () => asked,
      renewAssets: () => (assets = assetsDouble()),
      renewSettings: () => (settings = settingsDouble()),
      noAssets: () => (assets = undefined),
    }
  }

  it('are the same object from read to read and open no settings while none was needed', async () => {
    const { sources, asked } = service()
    const first = await sources.of(access())
    expect(first).toBeDefined()
    expect(await sources.of(access())).toBe(first)
    expect(asked()).toBe(0)
  })

  it('are away while the assets of the tenant are away, and new once the assets are', async () => {
    const { sources, noAssets, renewAssets } = service()
    const first = await sources.of(access())
    noAssets()
    expect(await sources.of(access())).toBeUndefined()
    renewAssets()
    const again = await sources.of(access())
    expect(again).toBeDefined()
    expect(again).not.toBe(first)
  })

  it('once the settings were read, are new when the settings of the tenant are another object', async () => {
    const { sources, renewSettings } = service()
    const first = await sources.of(access())
    await first?.run({ capability, asset: 'a' })
    expect(await sources.of(access())).toBe(first)
    renewSettings()
    expect(await sources.of(access())).not.toBe(first)
  })
})
