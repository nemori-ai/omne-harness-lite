import { expect, test, vi } from 'vitest'
import type { EnvironmentProvider } from '@omne-harness-lite/execution-environments'
import { description, fixture, scope } from './protocol-fixture.ts'

test('an unknown explicit provider does not discover or acquire another provider', async () => {
  const h = fixture()
  try {
    expect(
      await h.registry.operations.acquire({
        ...h.request(),
        reference: { provider: 'absent', reference: 'original' },
      }),
    ).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })
    expect(h.provider.describe).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('an explicit instance remains selectable among the same provider’s other instances', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [
        description,
        {
          ...description,
          reference: { provider: 'fixture', reference: 'other' },
          instance: { id: 'other', generation: 'one' },
        },
      ],
    })
    const result = await h.registry.operations.acquire({
      ...h.request(),
      reference: description.reference,
    })
    expect(result.kind).toBe('acquired')
    expect(h.source.select).not.toHaveBeenCalled()
    if (result.kind === 'acquired') await result.lease.release()
  } finally {
    await h.dispose()
  }
})

test('auto placement cannot replace the caller’s explicit instance with another legal candidate', async () => {
  const h = fixture()
  const other = {
    ...description,
    reference: { provider: 'fixture', reference: 'other' },
    instance: { id: 'other', generation: 'one' },
  }
  try {
    h.setPermission('auto_place')
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [description, other],
    })
    vi.mocked(h.source.select).mockResolvedValue({ kind: 'selected', reference: other.reference })
    expect(
      await h.registry.operations.acquire({ ...h.request(), reference: description.reference }),
    ).toEqual({ kind: 'rejected', reason: 'placementChanged' })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('an explicit instance that disappears from its original provider expires', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({ kind: 'descriptions', values: [] })
    expect(
      await h.registry.operations.acquire({ ...h.request(), reference: description.reference }),
    ).toEqual({ kind: 'rejected', reason: 'referenceExpired' })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('an owned instance at another binding layer cannot satisfy the current placement', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [
        {
          ...description,
          bindingLayer: 'tenant_sandbox',
          binding: { kind: 'tenant_sandbox', tenant: scope.tenant },
        },
      ],
    })
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'noMatchingEnvironment',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('a provider cannot describe an instance owned by a different provider', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [
        {
          ...description,
          reference: { provider: 'someone-else', reference: 'original' },
        },
      ],
    })
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'providerUnavailable',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('a policy change while discovering candidates prevents the first provider effect', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockImplementation(async () => {
      h.setPermission('never-allow')
      return { kind: 'descriptions', values: [description] }
    })
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'placementChanged',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('access revoked during discovery prevents the first provider effect', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockImplementation(async () => {
      h.revoke()
      return { kind: 'descriptions', values: [description] }
    })
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('the resource owner closing during discovery prevents acquisition', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockImplementation(async () => {
      h.close.abort()
      return { kind: 'descriptions', values: [description] }
    })
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test.each(['provider', 'source'] as const)(
  '%s withdrawal while final access is pending prevents acquisition',
  async owner => {
    const h = fixture()
    const entered = Promise.withResolvers<void>(),
      finish = Promise.withResolvers<void>()
    const original = vi.mocked(h.access.authorize).getMockImplementation()
    if (!original) throw new Error('fixture authorization missing')
    let reads = 0
    vi.mocked(h.access.authorize).mockImplementation(async (...args) => {
      if (++reads === 2) {
        entered.resolve()
        await finish.promise
      }
      return original(...args)
    })
    let withdrawal: Promise<void> | undefined
    try {
      const pending = h.registry.operations.acquire(h.request())
      await entered.promise
      withdrawal = owner === 'provider' ? h.removeProvider() : h.removeSource()
      finish.resolve()
      expect(await pending).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
      expect(h.provider.acquire).not.toHaveBeenCalled()
      await withdrawal
    } finally {
      finish.resolve()
      await withdrawal
      await h.dispose()
    }
  },
)

test('a provider withdrawn before its snapshot discovery turn is never called', async () => {
  const h = fixture()
  const entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  const describe = vi.fn<EnvironmentProvider['describe']>(async () => ({
    kind: 'descriptions',
    values: [],
  }))
  const acquire = vi.fn<EnvironmentProvider['acquire']>(async () => ({
    kind: 'rejected',
    reason: 'unavailable',
  }))
  try {
    const remove = h.registry.registrations.registerProvider({
      ...h.provider,
      name: 'later',
      describe,
      acquire,
    })
    vi.mocked(h.provider.describe).mockImplementation(async () => {
      entered.resolve()
      await finish.promise
      return { kind: 'descriptions', values: [description] }
    })
    const pending = h.registry.operations.acquire(h.request())
    await entered.promise
    await remove()
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'providerUnavailable' })
    expect(describe).not.toHaveBeenCalled()
    expect(acquire).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    finish.resolve()
    await h.dispose()
  }
})

test.each(['describe', 'acquire'] as const)(
  'a provider’s %s rejection keeps its original reason',
  async operation => {
    const h = fixture()
    try {
      vi.mocked(h.provider[operation]).mockResolvedValue({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect(await h.registry.operations.acquire(h.request())).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
      if (operation === 'describe') expect(h.provider.acquire).not.toHaveBeenCalled()
    } finally {
      await h.dispose()
    }
  },
)
