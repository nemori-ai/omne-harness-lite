import { expect, test, vi } from 'vitest'
import type { EnvironmentLease } from '@omne-harness-lite/execution-environments'
import { fixture } from './protocol-fixture.ts'

test.each(['pending', 'throws'] as const)(
  'rejected acquisition retains the original lease after %s release for explicit close retry',
  async failure => {
    const h = fixture()
    let confirmed = false
    const release = vi.fn<EnvironmentLease['release']>(async () => {
      if (confirmed) return { kind: 'released' }
      if (failure === 'throws') throw new Error('Original release response unavailable')
      return { kind: 'pending', resources: [] }
    })
    const original = vi.mocked(h.provider.acquire).getMockImplementation()
    if (!original) throw new Error('Original provider fixture missing')
    vi.mocked(h.provider.acquire).mockImplementation(async request => {
      const result = await original(request)
      h.setPermission('never-allow')
      return result.kind === 'acquired'
        ? { ...result, lease: { ...result.lease, release } }
        : result
    })
    try {
      expect(await h.registry.operations.acquire(h.request())).toEqual({
        kind: 'rejected',
        reason: failure === 'pending' ? 'placementChanged' : 'providerUnavailable',
      })
      expect(release).toHaveBeenCalledOnce()
      await expect(h.registry.close()).rejects.toThrow('unfinished cleanup')
      expect(release).toHaveBeenCalledTimes(2)
      expect(h.provider.retire).not.toHaveBeenCalled()
      expect(await h.registry.operations.acquire(h.request())).toEqual({
        kind: 'rejected',
        reason: 'ownerStopped',
      })
      confirmed = true
      await h.registry.close()
      expect(release).toHaveBeenCalledTimes(3)
      expect(h.provider.acquire).toHaveBeenCalledOnce()
      expect(h.provider.retire).toHaveBeenCalledOnce()
      expect(release.mock.invocationCallOrder[2]).toBeLessThan(
        vi.mocked(h.provider.retire).mock.invocationCallOrder[0] ?? 0,
      )
      await h.registry.close()
      expect(release).toHaveBeenCalledTimes(3)
      expect(h.provider.retire).toHaveBeenCalledOnce()
    } finally {
      confirmed = true
      await h.dispose()
    }
  },
)
