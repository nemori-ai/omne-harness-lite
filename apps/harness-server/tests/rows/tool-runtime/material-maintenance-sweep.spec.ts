import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import type { MaterialSweepInput } from '../../../src/rows/tool-runtime/material-maintenance-sweep.ts'
import { createMaterialMaintenanceSweep } from '../../../src/rows/tool-runtime/material-maintenance-sweep.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

function fixture() {
  const tenant = fixtureTenant('a')
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant')
  const call = okOf(decodeToolCallId('call_sweep'), 'call')
  const at = okOf(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z'), 'time')
  const events: string[] = []
  const input: MaterialSweepInput<string> = {
    domains: {
      enumerate: async ({ principal }) => {
        events.push(`enumerate:${principal}`)
        return {
          kind: 'ready',
          revision: '1',
          entries: [
            {
              tenant: encoded.value,
              domain: {
                scope: { kind: 'tenant', tenant: encoded.value },
                transactionDomain: 'fixture',
              },
            },
          ],
        }
      },
    },
    scanner: 'scanner',
    maintainer: 'maintainer',
    pageSize: 2,
    recoverBodies: async request => {
      expect(Object.keys(request).sort()).toEqual(['call', 'tenant'])
      expect(request.tenant).toEqual(tenant)
      events.push('recover-bodies')
      return succeed({ queued: true })
    },
    clock: { sample: async () => succeed(at) },
    maintenance: {
      scan: async ({ principal, limit, after }) => {
        events.push(`scan:${principal}:${limit}:${after}`)
        return succeed({ calls: [call], next: null })
      },
      expire: async ({ principal }) => {
        events.push(`expire:${principal}`)
        return succeed({ expiredBodies: 1, expiredLeases: 0, cleanupPending: true })
      },
      reclaim: async ({ principal }) => {
        events.push(`reclaim:${principal}`)
        return succeed({ kind: 'deleted' })
      },
      close: async () => {
        events.push('close')
      },
    },
  }
  return { input, events, call, at, tenant, tenantText: encoded.value }
}

describe('production material maintenance sweep', () => {
  it('enumerates with the scanner and expires/reclaims a page with the maintainer', async () => {
    const { input, events } = fixture()
    const sweep = createMaterialMaintenanceSweep(input)
    expect(await sweep.advance()).toEqual(succeed({ calls: 1, failures: 0, roundComplete: true }))
    expect(events).toEqual([
      'enumerate:scanner',
      'scan:maintainer:2:null',
      'recover-bodies',
      'expire:maintainer',
      'reclaim:maintainer',
    ])
    await sweep.close()
  })

  it('retries a full recovery queue in the next round while continuing independent material cleanup', async () => {
    const { input, events, call, tenant } = fixture()
    let attempts = 0
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      recoverBodies: async request => {
        expect(request).toEqual({ tenant, call })
        attempts++
        return attempts === 1
          ? fail({
              kind: 'unavailable',
              dependency: 'tool-body-recovery-capacity',
              diagnostic: 'full',
            })
          : succeed({ queued: true })
      },
    })
    expect(await sweep.advance()).toEqual(succeed({ calls: 1, failures: 1, roundComplete: true }))
    expect(await sweep.advance()).toEqual(succeed({ calls: 1, failures: 0, roundComplete: true }))
    expect(attempts).toBe(2)
    expect(events.filter(event => event === 'reclaim:maintainer')).toHaveLength(2)
    await sweep.close()
  })

  it('stops later maintenance IO while an accepted body wakeup drains', async () => {
    const { input, events } = fixture()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      recoverBodies: async () => {
        entered.resolve()
        await release.promise
        return succeed({ queued: true })
      },
    })
    const pending = sweep.advance()
    await entered.promise
    const closing = sweep.close()
    release.resolve()
    expect(await pending).toHaveProperty('failure.kind', 'unavailable')
    await closing
    expect(events).toEqual(['enumerate:scanner', 'scan:maintainer:2:null', 'close'])
  })

  it('continues an empty page, rotates tenants, and fixes the round time and directory', async () => {
    const { input, at, tenantText } = fixture()
    const other = tenantCodec.encode(fixtureTenant('b'))
    if (!other.ok) throw new Error('fixture tenant')
    const scans: { tenant: string; after: string | null; at: string }[] = []
    let listings = 0
    let samples = 0
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      domains: {
        enumerate: async () => {
          listings += 1
          return {
            kind: 'ready',
            revision: String(listings),
            entries: [tenantText, other.value].map(tenant => ({
              tenant,
              domain: { scope: { kind: 'tenant', tenant }, transactionDomain: 'fixture' },
            })),
          }
        },
      },
      clock: {
        sample: async () => {
          samples += 1
          return succeed(at)
        },
      },
      maintenance: {
        ...input.maintenance,
        scan: async request => {
          const text = tenantCodec.encode(request.tenant)
          if (!text.ok) throw new Error('unminted tenant')
          scans.push({ tenant: text.value, after: request.after, at: request.at })
          return succeed({
            calls: [],
            next: text.value === tenantText && request.after === null ? 'page-2' : null,
          })
        },
      },
    })
    expect(await sweep.advance()).toEqual(succeed({ calls: 0, failures: 0, roundComplete: false }))
    expect(await sweep.advance()).toEqual(succeed({ calls: 0, failures: 0, roundComplete: false }))
    expect(await sweep.advance()).toEqual(succeed({ calls: 0, failures: 0, roundComplete: true }))
    expect(scans).toEqual([
      { tenant: tenantText, after: null, at },
      { tenant: other.value, after: null, at },
      { tenant: tenantText, after: 'page-2', at },
    ])
    expect([listings, samples]).toEqual([1, 1])
    await sweep.advance()
    expect([listings, samples]).toEqual([2, 2])
    await sweep.close()
  })

  it('continues after a failed call and retries pending deletion in a later round', async () => {
    const { input, call } = fixture()
    const second = okOf(decodeToolCallId('call_second'), 'call')
    const reclaimed: string[] = []
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      maintenance: {
        ...input.maintenance,
        scan: async () => succeed({ calls: [call, second], next: null }),
        expire: async request =>
          request.call === call
            ? fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'unknown commit' })
            : succeed({ expiredBodies: 0, expiredLeases: 0, cleanupPending: true }),
        reclaim: async request => {
          reclaimed.push(request.call)
          if (request.call === call) throw new Error('private provider details')
          return succeed({ kind: 'pending' })
        },
      },
    })
    expect(await sweep.advance()).toEqual(succeed({ calls: 2, failures: 2, roundComplete: true }))
    expect(await sweep.advance()).toEqual(succeed({ calls: 2, failures: 2, roundComplete: true }))
    expect(reclaimed).toEqual([call, second, call, second])
    await sweep.close()
  })

  it('coalesces concurrent wakeups and retries failed enumeration without caching permission', async () => {
    const { input, events } = fixture()
    const blocked = Promise.withResolvers<Awaited<ReturnType<TenantDomains<string>['enumerate']>>>()
    let attempts = 0
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      domains: {
        enumerate: () => {
          attempts += 1
          return attempts === 1
            ? blocked.promise
            : input.domains.enumerate({ principal: input.scanner })
        },
      },
    })
    const first = sweep.advance()
    expect(sweep.advance()).toBe(first)
    blocked.resolve({ kind: 'denied' })
    expect(await first).toEqual(fail({ kind: 'denied', action: 'enumerate-tenants' }))
    expect(events).toEqual([])
    expect(await sweep.advance()).toEqual(succeed({ calls: 1, failures: 0, roundComplete: true }))
    expect(attempts).toBe(2)
    await sweep.close()
  })

  it('drains an accepted directory read while stopping all later IO', async () => {
    const { input, events } = fixture()
    const entered = Promise.withResolvers<void>()
    const blocked = Promise.withResolvers<Awaited<ReturnType<TenantDomains<string>['enumerate']>>>()
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      domains: {
        enumerate: () => {
          entered.resolve()
          return blocked.promise
        },
      },
    })
    const pending = sweep.advance()
    await entered.promise
    const closing = sweep.close()
    expect(sweep.close()).toBe(closing)
    let done = false
    void closing.then(() => {
      done = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(done).toBe(false)
    expect(events).toEqual(['close'])
    blocked.resolve(await input.domains.enumerate({ principal: input.scanner }))
    expect(await pending).toHaveProperty('failure.kind', 'unavailable')
    await closing
    expect(await sweep.advance()).toHaveProperty('failure.kind', 'unavailable')
    expect(events).toEqual(['close', 'enumerate:scanner'])
  })

  it('closes before a scheduled step starts without enumerating', async () => {
    const { input, events } = fixture()
    const sweep = createMaterialMaintenanceSweep(input)
    const pending = sweep.advance()
    await sweep.close()
    expect(await pending).toHaveProperty('failure.kind', 'unavailable')
    expect(events).toEqual(['close'])
  })

  it('closes during expiration without starting deletion or another call', async () => {
    const { input, events } = fixture()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      maintenance: {
        ...input.maintenance,
        expire: async () => {
          entered.resolve()
          await release.promise
          return succeed({ expiredBodies: 1, expiredLeases: 0, cleanupPending: true })
        },
      },
    })
    const pending = sweep.advance()
    await entered.promise
    const closing = sweep.close()
    release.resolve()
    expect(await pending).toHaveProperty('failure.kind', 'unavailable')
    await closing
    expect(events).toEqual([
      'enumerate:scanner',
      'scan:maintainer:2:null',
      'recover-bodies',
      'close',
    ])
  })

  it('retains a host close failure and returns the same close promise', async () => {
    const { input } = fixture()
    const error = new Error('host close failed')
    const sweep = createMaterialMaintenanceSweep({
      ...input,
      maintenance: {
        ...input.maintenance,
        close: () => {
          throw error
        },
      },
    })
    const closing = sweep.close()
    expect(sweep.close()).toBe(closing)
    await expect(closing).rejects.toBe(error)
  })

  it.each([0, 129, 1.5, Number.NaN])('rejects page size %s before IO', pageSize => {
    const { input, events } = fixture()
    expect(() => createMaterialMaintenanceSweep({ ...input, pageSize })).toThrow(RangeError)
    expect(events).toEqual([])
  })
})
