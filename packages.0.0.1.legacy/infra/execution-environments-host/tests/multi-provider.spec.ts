import { commandFixture, fileFixture } from './facility-fixture.ts'
import { expect, test, vi } from 'vitest'
import type {
  EnvironmentDescription,
  EnvironmentProvider,
} from '@omne-harness-lite/execution-environments'
import { fixture, description } from './protocol-fixture.ts'

function another(h: ReturnType<typeof fixture>, name: string, facilities = ['command', 'files']) {
  const value: EnvironmentDescription = {
    ...description,
    reference: { provider: name, reference: name },
    instance: { id: name, generation: 'one' },
    facilities,
  }
  const ended = Promise.withResolvers<{ readonly reason: string }>()
  const provider: EnvironmentProvider = {
    name,
    generation: 'one',
    describe: vi.fn<EnvironmentProvider['describe']>(async () => ({
      kind: 'descriptions',
      values: [value],
    })),
    acquire: vi.fn<EnvironmentProvider['acquire']>(async () => ({
      kind: 'acquired',
      lease: {
        facilities: {
          description: value,
          ...(facilities.includes('command')
            ? { command: commandFixture({ start: h.start }) }
            : {}),
          ...(facilities.includes('files')
            ? { files: fileFixture({ read: h.read, write: h.write }) }
            : {}),
        },
        invalidated: ended.promise,
        release: vi.fn(async () => ({ kind: 'released' as const })),
      },
      evidence: { provider: name },
    })),
    listRecoveryResources: async () => ({ kind: 'resources', values: [] }),
    recover: async () => ({ status: 'unsupported' }),
    retire: vi.fn<EnvironmentProvider['retire']>(async () => {
      ended.resolve({ reason: 'ownerStopped' })
      return { kind: 'drained' }
    }),
  }
  return { provider, description: value }
}

test.each([false, true])(
  'selection sees all matching providers regardless of registration order (%s)',
  async reverse => {
    const h = fixture(),
      target = another(h, 'target')
    try {
      if (reverse) await h.removeProvider()
      h.registry.registrations.registerProvider(target.provider)
      if (reverse) h.registry.registrations.registerProvider(h.provider)
      vi.mocked(h.source.select).mockImplementation(async (_placement, candidates) => {
        expect(candidates.map(value => value.reference.provider).sort()).toEqual([
          'fixture',
          'target',
        ])
        return { kind: 'selected', reference: target.description.reference }
      })
      const result = await h.registry.operations.acquire(h.request())
      expect(result.kind).toBe('acquired')
      if (result.kind !== 'acquired') throw new Error('selected matching provider not acquired')
      expect(result.lease.facilities.description).toEqual(target.description)
      expect(h.source.select).toHaveBeenCalledOnce()
      expect(h.provider.acquire).not.toHaveBeenCalled()
      expect(target.provider.acquire).toHaveBeenCalledOnce()
      await result.lease.release()
    } finally {
      await h.dispose()
    }
  },
)

test('a partial provider cannot hide the sole provider satisfying all required facilities', async () => {
  const h = fixture(),
    target = another(h, 'complete')
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [{ ...description, facilities: ['command'] }],
    })
    h.registry.registrations.registerProvider(target.provider)
    const result = await h.registry.operations.acquire(h.request())
    expect(result.kind).toBe('acquired')
    if (result.kind !== 'acquired') throw new Error('complete instance missing')
    expect(result.lease.facilities.description.reference.provider).toBe('complete')
    expect(h.source.select).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
    await result.lease.release()
  } finally {
    await h.dispose()
  }
})

test('facilities from two incomplete instances cannot be combined into a matching instance', async () => {
  const h = fixture(),
    fileOnly = another(h, 'files-only', ['files'])
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [{ ...description, facilities: ['command'] }],
    })
    h.registry.registrations.registerProvider(fileOnly.provider)
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'missingFacility',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
    expect(fileOnly.provider.acquire).not.toHaveBeenCalled()
    expect(h.source.select).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('a strategy cannot return an unobserved provider reference', async () => {
  const h = fixture(),
    second = another(h, 'second')
  try {
    h.registry.registrations.registerProvider(second.provider)
    vi.mocked(h.source.select).mockResolvedValue({
      kind: 'selected',
      reference: { provider: 'unobserved', reference: 'invented' },
    })
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'policyUnavailable',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
    expect(second.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('duplicate references cannot identify two different instance generations', async () => {
  const h = fixture()
  try {
    vi.mocked(h.provider.describe).mockResolvedValue({
      kind: 'descriptions',
      values: [
        description,
        { ...description, instance: { ...description.instance, generation: 'another' } },
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

test('withdrawal during selection cannot acquire a replacement with the same provider name', async () => {
  const h = fixture(),
    selected = another(h, 'selected'),
    replacement = another(h, 'selected')
  const entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const remove = h.registry.registrations.registerProvider(selected.provider)
    vi.mocked(h.source.select).mockImplementation(async () => {
      entered.resolve()
      await finish.promise
      return { kind: 'selected', reference: selected.description.reference }
    })
    const pending = h.registry.operations.acquire(h.request())
    await entered.promise
    await remove()
    h.registry.registrations.registerProvider(replacement.provider)
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'providerUnavailable' })
    expect(selected.provider.acquire).not.toHaveBeenCalled()
    expect(replacement.provider.acquire).not.toHaveBeenCalled()
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    finish.resolve()
    await h.dispose()
  }
})
