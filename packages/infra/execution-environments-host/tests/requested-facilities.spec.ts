import { expect, test, vi } from 'vitest'
import { fixture } from './protocol-fixture.ts'

test('an acquired provider cannot grant a facility outside the original requirement', async () => {
  const h = fixture()
  const requirement = { bindingLayer: 'host_machine' as const, facilities: ['command'] }
  const original = vi.mocked(h.source.read).getMockImplementation()
  if (!original) throw new Error('fixture placement source missing')
  try {
    vi.mocked(h.source.read).mockImplementation(async (...args) => {
      const value = await original(...args)
      return value.kind === 'placement'
        ? { ...value, placement: { ...value.placement, requirement } }
        : value
    })
    const result = await h.registry.operations.acquire({ ...h.request(), requirement })
    expect(result.kind).toBe('acquired')
    if (result.kind !== 'acquired') throw new Error('command facility not acquired')
    // The provider truthfully describes both ports; it must not expand the acquired authority.
    expect(result.lease.facilities.description.facilities).toEqual(['command', 'files'])
    expect(await result.lease.facilities.files?.write('unrequested', new Uint8Array([1]))).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await result.lease.facilities.files?.read('unrequested')).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(h.write).not.toHaveBeenCalled()
    expect(h.read).not.toHaveBeenCalled()
    expect(h.source.authorizeOperation).not.toHaveBeenCalled()
    await result.lease.release()
  } finally {
    await h.dispose()
  }
})
