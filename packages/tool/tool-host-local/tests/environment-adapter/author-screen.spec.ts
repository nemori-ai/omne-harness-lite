import { describe, expect, it, vi } from 'vitest'
import {
  originRef,
  type EnvironmentFacilities,
  type EnvironmentLease,
  type ScreenFacility,
} from '@omne-harness/execution-environment-contract'
import { createAuthorEnvironment } from '../../src/author-environment.ts'
import { callId, principalA, tenantA } from '../coordinator-values.ts'

function environment(screen?: ScreenFacility<unknown>) {
  const facilities: Partial<EnvironmentFacilities> = screen === undefined ? {} : { screen }
  const lease: EnvironmentLease = {
    placement: {
      kind: 'placement',
      binding: { kind: 'host_machine' },
      provider: { name: 'fixture', generation: '1', version: '1' },
      quotaDomain: 'fixture',
      continuity: { kind: 'not_guaranteed' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        isolation: [],
        facilities: ['screen'],
      },
    },
    instance: { id: 'instance', generation: '1' },
    continuity: { kind: 'not_guaranteed' },
    facility: key => facilities[key],
    invalidated: new Promise(() => {}),
    release: async () => ({ kind: 'released' }),
  }
  return createAuthorEnvironment({
    access: { principal: principalA, tenant: tenantA, call: callId('call') },
    origin: originRef('original'),
    lease,
    naming: { name: vi.fn() },
    facts: { system: 'fixture', release: '1', architecture: 'fixture', facilities: ['screen'] },
    media: () => undefined,
  })
}

describe('the author reads the screen through the environment of its call', () => {
  it('each operation carries the identity of the call, its origin and the binding of its placement', async () => {
    const list = vi.fn<ScreenFacility<unknown>['list']>(async request => ({
      kind: 'done',
      requestId: request.requestId,
      value: [],
    }))
    const capture = vi.fn<ScreenFacility<unknown>['capture']>(async request => ({
      kind: 'rejected',
      requestId: request.requestId,
      reason: 'notFound',
    }))
    const value = environment({ list, capture })
    expect(await value.screen.list({})).toMatchObject({ kind: 'done', value: [] })
    expect(await value.screen.capture({ screen: 'left', region: null })).toMatchObject({
      kind: 'rejected',
      reason: 'notFound',
    })
    const bound = {
      access: { principal: principalA, tenant: tenantA },
      origin: 'original',
      binding: { kind: 'host_machine' },
    }
    expect(list.mock.calls[0]?.[0]).toMatchObject(bound)
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ ...bound, screen: 'left', region: null })
    const ids = [list.mock.calls[0]?.[0].requestId, capture.mock.calls[0]?.[0].requestId]
    expect(new Set(ids).size).toBe(2)
  })

  it('answers unavailable when the placement has no screen, and does not take one from elsewhere', async () => {
    const value = environment()
    expect(await value.screen.list({})).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    expect(await value.screen.capture({ screen: null, region: null })).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
  })

  it('takes the facility of the lease anew at each operation', async () => {
    let current: ScreenFacility<unknown> | undefined
    const lease = { facility: () => current }
    const value = createAuthorEnvironment({
      access: { principal: principalA, tenant: tenantA, call: callId('call') },
      origin: originRef('original'),
      lease: {
        ...lease,
        placement: { binding: { kind: 'host_machine' } },
      } as unknown as EnvironmentLease,
      naming: { name: vi.fn() },
      facts: { system: 'fixture', release: '1', architecture: 'fixture', facilities: ['screen'] },
      media: () => undefined,
    })
    expect(await value.screen.list({})).toMatchObject({ kind: 'rejected' })
    current = {
      list: async request => ({ kind: 'done', requestId: request.requestId, value: [] }),
      capture: vi.fn(),
    }
    expect(await value.screen.list({})).toMatchObject({ kind: 'done' })
  })
})
