// The three Service definitions of the cordis entry (SPEC 2.2 to 2.4), loaded in a real Context.
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type {
  CloseLeasePort,
  SqlStorage,
  StorageHost,
  TenantDomains,
} from '@omne-harness/sql-contract'
import {
  StorageHostService,
  StorageService,
  TenantDomainsService,
  storageHostKey,
  storageKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { createMemorySqlStorage } from '@omne-harness/sql-contract/testing'
import { createFixtureMaterials } from '../src/testing/fixtures.ts'
import { commitRequest, registerSmall } from './helpers.ts'

describe('keys', () => {
  it('each key equals the provide of its class and names a capability', () => {
    expect(StorageService.provide).toBe('storage')
    expect(storageKey).toBe('storage')
    expect(StorageHostService.provide).toBe('storageHost')
    expect(storageHostKey).toBe('storageHost')
    expect(TenantDomainsService.provide).toBe('tenantDomains')
    expect(tenantDomainsKey).toBe('tenantDomains')
  })
})

describe('StorageService', () => {
  it('loads under the storage key, forwards to the provider, and is removed on unload', async () => {
    const fixture = await createFixtureMaterials()
    try {
      const inner = await createMemorySqlStorage({ materials: fixture.materials })
      class Probe extends StorageService {
        readonly registerCombination: SqlStorage['registerCombination'] = input =>
          inner.storage.registerCombination(input)
        readonly commit: SqlStorage['commit'] = (input, options) =>
          inner.storage.commit(input, options)
        readonly query: SqlStorage['query'] = identity => inner.storage.query(identity)
        readonly read: SqlStorage['read'] = (input, options) => inner.storage.read(input, options)
      }
      const ctx = new Context()
      const fiber = await ctx.plugin(Probe)
      try {
        const service = ctx.get(storageKey)
        expect(service).toBeInstanceOf(Probe)
        expect(service).toBeInstanceOf(Service)
        if (service === undefined) throw new Error('storage service was not installed')
        await registerSmall(service, fixture)
        const result = await service.commit(commitRequest(fixture))
        expect(result.kind).toBe('committed')
        // The close control is not reachable through the service.
        expect(Object.keys(service).filter(key => /control|close/i.test(key))).toEqual([])
      } finally {
        await fiber.dispose()
      }
      expect(ctx.get(storageKey)).toBeUndefined()
    } finally {
      await fixture.remove()
    }
  })
})

describe('StorageHostService', () => {
  it('loads under the storageHost key and exposes the three runtime objects', async () => {
    const fixture = await createFixtureMaterials()
    try {
      const leases: CloseLeasePort = { admit: () => ({}), release: () => undefined }
      const attached: unknown[] = []
      class Host extends StorageHostService implements StorageHost {
        readonly materials = fixture.materials
        readonly closeLeases = leases
        readonly attachControl: StorageHost['attachControl'] = control => {
          attached.push(control)
        }
      }
      const ctx = new Context()
      const fiber = await ctx.plugin(Host)
      try {
        const host = ctx.get(storageHostKey)
        expect(host).toBeInstanceOf(Host)
        expect(host?.materials).toBe(fixture.materials)
        expect(host?.closeLeases).toBe(leases)
        const { control } = await createMemorySqlStorage({ materials: fixture.materials })
        host?.attachControl(control)
        expect(attached).toEqual([control])
      } finally {
        await fiber.dispose()
      }
      expect(ctx.get(storageHostKey)).toBeUndefined()
    } finally {
      await fixture.remove()
    }
  })
})

describe('TenantDomainsService', () => {
  it('loads under the tenantDomains key and has only enumerate', async () => {
    class Directory extends TenantDomainsService<string> implements TenantDomains<string> {
      readonly enumerate: TenantDomains<string>['enumerate'] = ({ principal }) =>
        Promise.resolve(
          principal === 'ops' ? { kind: 'ready', revision: '1', entries: [] } : { kind: 'denied' },
        )
    }
    const ctx = new Context()
    const fiber = await ctx.plugin(Directory)
    try {
      const service = ctx.get(tenantDomainsKey)
      expect(service).toBeInstanceOf(Directory)
      await expect(service?.enumerate({ principal: 'ops' })).resolves.toEqual({
        kind: 'ready',
        revision: '1',
        entries: [],
      })
      await expect(service?.enumerate({ principal: 'x' })).resolves.toEqual({ kind: 'denied' })
      expect(Object.keys(service ?? {}).filter(key => key !== 'ctx' && key !== 'name')).toEqual([
        'enumerate',
      ])
    } finally {
      await fiber.dispose()
    }
  })
})
