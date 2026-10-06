import { expect, test, vi } from 'vitest'
import { fixture, scope, call, description, requirement } from './protocol-fixture.ts'

test.each([
  { inputScope: { ...scope, session: '' }, inputCall: call },
  { inputScope: scope, inputCall: { ...call, execution: '' } },
])('malformed query identity is rejected before reading its source (%#)', async input => {
  const h = fixture()
  try {
    expect(
      // Exercise external malformed data without valid SessionRef and CallId brands.
      await h.registry.operations.resolvePlacement(
        input.inputScope as typeof scope,
        h.token,
        input.inputCall as typeof call,
      ),
    ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(h.source.read).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})
test('a revoked query is rejected before reading current placement inputs', async () => {
  const h = fixture()
  h.revoke()
  try {
    expect(await h.registry.operations.resolvePlacement(scope, h.token, call)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(h.source.read).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})
test('current placement query grants no lease and the later acquire rechecks the actual requirement', async () => {
  const h = fixture()
  try {
    expect(await h.registry.operations.resolvePlacement(scope, h.token, call)).toMatchObject({
      kind: 'placement',
      placement: { scope, ...call, requirement, permission: 'always-allow' },
    })
    expect(h.provider.describe).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
    h.setPermission('never-allow')
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})
test('not applicable query has one public encoding and does not call a provider', async () => {
  const h = fixture()
  vi.mocked(h.source.read).mockResolvedValue({ kind: 'notApplicable' })
  try {
    expect(await h.registry.operations.resolvePlacement(scope, h.token, call)).toEqual({
      kind: 'notApplicable',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})
test('source withdrawal during a pending query cannot return the old placement', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    resumed = Promise.withResolvers<void>()
  const original = vi.mocked(h.source.read).getMockImplementation()!
  vi.mocked(h.source.read).mockImplementation(async (...args) => {
    entered.resolve()
    await resumed.promise
    return original(...args)
  })
  try {
    const pending = h.registry.operations.resolvePlacement(scope, h.token, call)
    await entered.promise
    const retiring = h.removeSource()
    resumed.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'placementChanged' })
    await retiring
  } finally {
    resumed.resolve()
    await h.dispose()
  }
})
test.each(['withdraw', 'replace'] as const)(
  'the last query authorization cannot return the old source after %s',
  async change => {
    const h = fixture(),
      entered = Promise.withResolvers<void>(),
      resumed = Promise.withResolvers<void>()
    const authorize = vi.mocked(h.access.authorize),
      original = authorize.getMockImplementation()!
    let calls = 0,
      removeReplacement: (() => Promise<void>) | undefined
    authorize.mockImplementation(async (...args) => {
      if (++calls === 2) {
        entered.resolve()
        await resumed.promise
      }
      return original(...args)
    })
    try {
      const pending = h.registry.operations.resolvePlacement(scope, h.token, call)
      await entered.promise
      await h.removeSource()
      if (change === 'replace')
        removeReplacement = h.registry.placements.registerPlacementSource({
          ...h.source,
          generation: 'successor',
        })
      resumed.resolve()
      expect(await pending).toEqual({ kind: 'rejected', reason: 'placementChanged' })
      expect(h.provider.acquire).not.toHaveBeenCalled()
      expect(h.source.read).toHaveBeenCalledOnce()
    } finally {
      resumed.resolve()
      await removeReplacement?.()
      await h.dispose()
    }
  },
)
test('permission revocation during query IO wins over its returned placement', async () => {
  const h = fixture(),
    original = vi.mocked(h.source.read).getMockImplementation()!
  vi.mocked(h.source.read).mockImplementation(async (...args) => {
    const value = await original(...args)
    h.revoke()
    return value
  })
  try {
    expect(await h.registry.operations.resolvePlacement(scope, h.token, call)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  } finally {
    await h.dispose()
  }
})
test('missing and throwing current sources reject without provider activity', async () => {
  const h = fixture()
  try {
    vi.mocked(h.source.read).mockRejectedValue(new Error('source unavailable'))
    expect(await h.registry.operations.resolvePlacement(scope, h.token, call)).toEqual({
      kind: 'rejected',
      reason: 'policyUnavailable',
    })
    await h.removeSource()
    expect(await h.registry.operations.resolvePlacement(scope, h.token, call)).toEqual({
      kind: 'rejected',
      reason: 'policyUnavailable',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})
test('successful adoption is issued from original registry authority and owns represented evidence', async () => {
  const h = fixture(),
    evidence = { observed: 'original' }
  const original = vi.mocked(h.provider.acquire).getMockImplementation()!
  vi.mocked(h.provider.acquire).mockImplementation(async request => {
    const value = await original(request)
    return value.kind === 'acquired' ? { ...value, evidence } : value
  })
  try {
    const result = await h.registry.operations.acquire(h.request())
    if (result.kind !== 'acquired') throw new Error(`legal fixture rejected ${result.reason}`)
    evidence.observed = 'changed'
    expect(result.adoption).toEqual({
      placement: {
        scope,
        ...call,
        requirement,
        permission: 'always-allow',
        revision: 'one',
        evidence: { basis: 'controlled-authority' },
      },
      source: { name: 'policy', generation: 'one' },
      description,
      providerEvidence: { observed: 'original' },
    })
    expect(result.evidence).toEqual({ observed: 'original' })
    await result.lease.release()
  } finally {
    await h.dispose()
  }
})
