import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { originRef, type EnvironmentLease } from '@omne-harness/execution-environment-contract'
import type { ToolMediaProduct, ToolMediaStore } from '@omne-harness/tool-contract/provider'
import { createAuthorEnvironment } from '../../src/author-environment.ts'
import { callId, principalA, tenantA } from '../coordinator-values.ts'

const lease: EnvironmentLease = {
  placement: {
    kind: 'placement',
    binding: { kind: 'host_machine' },
    provider: { name: 'fixture', generation: '1', version: '1' },
    quotaDomain: 'fixture',
    continuity: { kind: 'not_guaranteed' },
    requirement: { allowedBindings: [{ kind: 'host_machine' }], isolation: [], facilities: [] },
  },
  instance: { id: 'instance', generation: '1' },
  continuity: { kind: 'not_guaranteed' },
  facility: () => undefined,
  invalidated: new Promise(() => {}),
  release: async () => ({ kind: 'released' }),
}

const product: ToolMediaProduct = {
  ref: {
    storage: 'media',
    key: 'k'.repeat(64),
    mediaType: 'image/png',
    bytes: '3',
    digest: `sha256:${'d'.repeat(64)}`,
  },
  facts: { kind: 'image', widthPixels: 2, heightPixels: 1 },
}
const png = { mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }

type Store = ToolMediaStore<typeof principalA>

function environment(media: () => Store | undefined, call = 'call') {
  return createAuthorEnvironment({
    access: { principal: principalA, tenant: tenantA, call: callId(call) },
    origin: originRef('original'),
    lease,
    naming: { name: vi.fn() },
    facts: { system: 'fixture', release: '1', architecture: 'fixture', facilities: [] },
    media,
  })
}

describe('the author hands a product over through the environment (TL-60)', () => {
  it('stores it for the tenant of the call and holds it for this call, whatever the author passes', async () => {
    const put = vi.fn<Store['put']>(async () => succeed(product))
    const value = environment(() => ({ put }))
    const sneaky = { ...png, holder: { owner: 'x', work: 'y', position: 'z', purpose: 'w' } }
    expect(await value.media.put(sneaky)).toEqual({ ok: product })
    expect(put.mock.calls).toEqual([
      [
        {
          principal: principalA,
          tenant: tenantA,
          holder: {
            owner: '@omne-harness/tool-host-local/products',
            work: 'call',
            position: 'result',
            purpose: 'product',
          },
          mediaType: 'image/png',
          bytes: png.bytes,
        },
      ],
    ])
    await environment(() => ({ put }), 'other-call').media.put(png)
    expect(put.mock.calls[1]?.[0].holder.work).toBe('other-call')
  })

  it('takes the provider anew at each put: absent answers unavailable and stores nothing', async () => {
    const put = vi.fn<Store['put']>(async () => succeed(product))
    let current: Store | undefined
    const value = environment(() => current)
    expect(await value.media.put(png)).toEqual({
      failure: {
        kind: 'unavailable',
        operation: 'media.put',
        reason: 'no provider stores products on this host',
      },
    })
    current = { put }
    expect(await value.media.put(png)).toEqual({ ok: product })
    current = undefined
    expect(await value.media.put(png)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('gives the provider’s refusal back as it is', async () => {
    const refusal = { kind: 'too-large', reason: 'over the image budget' } as const
    const value = environment(() => ({ put: async () => fail(refusal) }))
    expect(await value.media.put(png)).toEqual({ failure: refusal })
  })

  it('answers unknown when the provider throws: the product may or may not be stored', async () => {
    const value = environment(() => ({
      put: async () => {
        throw new Error('connection lost')
      },
    }))
    expect(await value.media.put(png)).toEqual({
      failure: { kind: 'unknown', operation: 'media.put', reason: 'the store did not answer' },
    })
  })
})
