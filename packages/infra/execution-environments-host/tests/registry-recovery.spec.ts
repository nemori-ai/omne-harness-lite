import { expect, test, vi } from 'vitest'
import type {
  EnvironmentProvider,
  ManagedResource,
  RecoveryAccess,
  ResourceRecoveryAuthority,
  ResourceRecoveryResult,
} from '@omne-harness-lite/execution-environments'
import { createEnvironmentRegistry } from '../src/index.ts'
import { fixture, scope } from './protocol-fixture.ts'

const access = Object.freeze({}) as RecoveryAccess
const resource: ManagedResource = {
  key: 'original-process',
  provider: 'fixture',
  reference: { unit: 'original-unit', generation: 'one' },
}
function recoveryFixture() {
  const base = fixture()
  const authorize = vi.fn<ResourceRecoveryAuthority['authorizeRecovery']>(async candidate =>
    candidate === access ? 'authorized' : 'notAuthorized',
  )
  const registry = createEnvironmentRegistry({
    access: base.access,
    recovery: { authorizeRecovery: authorize },
  })
  const recover = vi.fn<EnvironmentProvider['recover']>(async () => ({
    status: 'confirmedStopped',
  }))
  const enumerate = vi.fn<EnvironmentProvider['listRecoveryResources']>(async () => ({
    kind: 'resources',
    values: [resource],
  }))
  const retire = vi.fn<EnvironmentProvider['retire']>(async () => ({ kind: 'drained' }))
  const remove = registry.registrations.registerProvider({
    ...base.provider,
    recover,
    listRecoveryResources: enumerate,
    retire,
  })
  return {
    registry,
    authorize,
    recover,
    enumerate,
    retire,
    remove,
    async close() {
      await registry.close()
      await base.dispose()
    },
  }
}

test.each(['recover', 'recoverOwned'] as const)(
  'recovery %s requires the original maintenance authority before provider work',
  async method => {
    const f = recoveryFixture()
    try {
      const wrong = Object.freeze({}) as RecoveryAccess
      const result =
        method === 'recover'
          ? await f.registry.registrations.recover(scope, wrong, [resource])
          : await f.registry.registrations.recoverOwned(scope, wrong)
      expect(result).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
      expect(f.recover).not.toHaveBeenCalled()
      expect(f.enumerate).not.toHaveBeenCalled()
      expect(f.authorize).toHaveBeenCalledOnce()
    } finally {
      await f.close()
    }
  },
)

test.each(['confirmedStopped', 'pending', 'unsupported'] as const)(
  'recovery preserves exact %s status, original coordinates and captured evidence',
  async status => {
    const f = recoveryFixture()
    const evidence = { observation: { unit: 'original-unit' } }
    f.recover.mockResolvedValue({ status, evidence })
    try {
      const result = await f.registry.registrations.recover(scope, access, [resource])
      expect(result).toEqual([{ resource, status, evidence }])
      expect(f.recover).toHaveBeenCalledExactlyOnceWith(resource)
      expect(f.authorize).toHaveBeenCalledExactlyOnceWith(access, scope, [resource])
      evidence.observation.unit = 'later-mutation'
      expect(result).toEqual([
        { resource, status, evidence: { observation: { unit: 'original-unit' } } },
      ])
    } finally {
      await f.close()
    }
  },
)

test.each(
  [['pending'], ['confirmedStopped'], null, 0, { name: 'confirmedStopped' }, 'other'].map(
    status => ({ status }),
  ),
)('a non-protocol status $status cannot escape the public registry', async ({ status }) => {
  const f = recoveryFixture()
  f.recover.mockResolvedValue({ status } as unknown as ResourceRecoveryResult)
  try {
    expect(await f.registry.registrations.recover(scope, access, [resource])).toEqual({
      kind: 'rejected',
      reason: 'providerUnavailable',
    })
    expect(await f.registry.registrations.recoverOwned(scope, access)).toEqual({
      kind: 'recovered',
      values: [{ resource, status: 'pending' }],
      failures: [{ provider: 'fixture', reason: 'providerUnavailable' }],
    })
  } finally {
    await f.close()
  }
})

test('owned recovery checks enumerated resource authority and preserves partial observations', async () => {
  const f = recoveryFixture()
  const second = { ...resource, key: 'second-process' }
  f.enumerate.mockResolvedValue({ kind: 'resources', values: [resource, second] })
  f.recover
    .mockResolvedValueOnce({ status: 'confirmedStopped', evidence: { original: true } })
    .mockRejectedValueOnce(new Error('original second cleanup unavailable'))
  try {
    expect(await f.registry.registrations.recoverOwned(scope, access)).toEqual({
      kind: 'recovered',
      values: [
        { resource, status: 'confirmedStopped', evidence: { original: true } },
        { resource: second, status: 'pending' },
      ],
      failures: [{ provider: 'fixture', reason: 'providerUnavailable' }],
    })
    expect(f.authorize.mock.calls).toEqual([
      [access, scope, []],
      [access, scope, [resource, second]],
    ])
    expect(f.recover.mock.calls).toEqual([[resource], [second]])
  } finally {
    await f.close()
  }
})

test('owned recovery rejects foreign provider coordinates and resource authority revocation', async () => {
  const f = recoveryFixture()
  try {
    f.enumerate.mockResolvedValueOnce({
      kind: 'resources',
      values: [{ ...resource, provider: 'foreign' }],
    })
    expect(await f.registry.registrations.recoverOwned(scope, access)).toEqual({
      kind: 'recovered',
      values: [],
      failures: [{ provider: 'fixture', reason: 'providerUnavailable' }],
    })
    expect(f.recover).not.toHaveBeenCalled()
    f.authorize.mockResolvedValueOnce('authorized').mockResolvedValueOnce('notAuthorized')
    expect(await f.registry.registrations.recoverOwned(scope, access)).toEqual({
      kind: 'recovered',
      values: [],
      failures: [{ provider: 'fixture', reason: 'notAuthorized' }],
    })
    expect(f.recover).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('retirement keeps an admitted original recovery callback until it finishes', async () => {
  const f = recoveryFixture()
  const entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<ResourceRecoveryResult>()
  f.recover.mockImplementationOnce(async () => {
    entered.resolve()
    return finish.promise
  })
  try {
    const work = f.registry.registrations.recover(scope, access, [resource])
    await entered.promise
    let removed = false
    const removing = f.remove().then(() => {
      removed = true
    })
    await Promise.resolve()
    expect(removed).toBe(false)
    finish.resolve({ status: 'confirmedStopped' })
    expect(await work).toEqual([{ resource, status: 'confirmedStopped' }])
    await removing
    expect(f.retire).toHaveBeenCalledOnce()
    expect(await f.registry.registrations.recover(scope, access, [resource])).toEqual({
      kind: 'rejected',
      reason: 'providerUnavailable',
    })
  } finally {
    finish.resolve({ status: 'pending' })
    await f.close()
  }
})

test('owned recovery retries a retained original provider after partial failure', async () => {
  const f = recoveryFixture()
  f.retire.mockResolvedValueOnce({ kind: 'pending', resources: [resource] })
  f.recover.mockRejectedValueOnce(new Error('cleanup unavailable'))
  try {
    await expect(f.remove()).rejects.toThrow('cleanup pending')
    expect(await f.registry.registrations.recoverOwned(scope, access)).toEqual({
      kind: 'recovered',
      values: [{ resource, status: 'pending' }],
      failures: [{ provider: 'fixture', reason: 'providerUnavailable' }],
    })
    expect(await f.registry.registrations.recoverOwned(scope, access)).toEqual({
      kind: 'recovered',
      values: [{ resource, status: 'confirmedStopped' }],
      failures: [],
    })
    await f.remove()
    expect(f.retire).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})

test.each([
  'authority-throws',
  'enumeration-throws',
  'enumeration-rejects',
  'resource-authority-throws',
] as const)('owned %s does not invent a completed observation', async mode => {
  const f = recoveryFixture()
  if (mode === 'authority-throws')
    f.authorize.mockRejectedValueOnce(new Error('authority unavailable'))
  if (mode === 'enumeration-throws')
    f.enumerate.mockRejectedValueOnce(new Error('index unavailable'))
  if (mode === 'enumeration-rejects')
    f.enumerate.mockResolvedValueOnce({ kind: 'unavailable' })
  if (mode === 'resource-authority-throws')
    f.authorize
      .mockResolvedValueOnce('authorized')
      .mockRejectedValueOnce(new Error('resource authority unavailable'))
  try {
    const result = await f.registry.registrations.recoverOwned(scope, access)
    expect(result).toEqual(
      mode === 'authority-throws'
        ? { kind: 'rejected', reason: 'unavailable' }
        : {
            kind: 'recovered',
            values: [],
            failures: [
              {
                provider: 'fixture',
                reason:
                  mode === 'resource-authority-throws' ? 'unavailable' : 'providerUnavailable',
              },
            ],
          },
    )
    expect(f.recover).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test.each(['recover', 'recoverOwned'] as const)(
  'closed %s rejects before authority or provider work',
  async method => {
    const f = recoveryFixture()
    try {
      await f.registry.close()
      const result =
        method === 'recover'
          ? await f.registry.registrations.recover(scope, access, [resource])
          : await f.registry.registrations.recoverOwned(scope, access)
      expect(result).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
      expect(f.authorize).not.toHaveBeenCalled()
      expect(f.enumerate).not.toHaveBeenCalled()
      expect(f.recover).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)
