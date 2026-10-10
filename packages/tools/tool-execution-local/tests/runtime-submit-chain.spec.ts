import { expect, test, vi } from 'vitest'
import {
  assertFinished,
  chainHead,
  otherTenant,
  pass,
  ref,
  scope,
  selectedChain,
  submitFixture,
} from './runtime-submit-fixture.ts'

for (const failure of [
  'host',
  'inactive',
  'session',
  'tenant',
  'generation',
  'headMissing',
  'headFailure',
] as const) {
  test(`public submit rejects ${failure} chain scope before intent or author`, async () => {
    const f = await submitFixture()
    try {
      await f.runtime.ready
      switch (failure) {
        case 'host':
          f.acquireReplay.mockResolvedValue({ failure: 'unavailable' })
          break
        case 'inactive':
          f.revokeHeld()
          break
        case 'session':
          f.acquireReplay.mockResolvedValue({
            ...f.held,
            binding: { ...f.held.binding, session: 'other-session' },
          })
          break
        case 'tenant':
          f.acquireReplay.mockResolvedValue({
            ...f.held,
            binding: { ...f.held.binding, tenant: otherTenant },
          })
          break
        case 'generation':
          f.acquireReplay.mockResolvedValue({
            ...f.held,
            binding: { ...f.held.binding, logGeneration: 'replacement-generation' },
          })
          break
        case 'headMissing':
          f.readHead.mockResolvedValue({ head: 0, latest: {} })
          break
        case 'headFailure':
          f.readHead.mockResolvedValue({ failure: 'unavailable' })
          break
      }
      expect(await f.runtime.operations.submit(f.submitted)).toEqual({
        kind: 'rejected',
        reason: 'runtimeUnavailable',
      })
      await f.runtime.idle()
      expect((await f.projected()).executions.size).toBe(0)
      expect(f.append).not.toHaveBeenCalled()
      expect(f.now).not.toHaveBeenCalled()
      expect(f.acquire).not.toHaveBeenCalled()
      expect(f.bindContext).not.toHaveBeenCalled()
      expect(f.bindWriter).not.toHaveBeenCalled()
      expect(f.implementation).not.toHaveBeenCalled()
      expect(f.recordResult).not.toHaveBeenCalled()
      expect(f.release).toHaveBeenCalledTimes(failure === 'host' ? 0 : 1)
      if (failure !== 'headMissing' && failure !== 'headFailure')
        expect(f.holdingTenant).not.toHaveBeenCalled()
      else expect(f.readHead).toHaveBeenCalledWith(scope.session)
      expect(f.readVersion).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  })
}

test('valid empty chain runs the author and releases its borrowed scope before intent append', async () => {
  const f = await submitFixture()
  try {
    await f.runtime.ready
    expect(await f.runtime.operations.submit(f.submitted)).toEqual({
      kind: 'recorded',
      execution: ref,
    })
    await assertFinished(f, { outcome: 'completed', result: 'factory-result' }, true)
    expect(f.readVersion).not.toHaveBeenCalled()
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(f.held.isActive()).toBe(false)
    expect(f.trace.indexOf('release')).toBeLessThan(f.trace.indexOf('append'))
    expect(f.acquireReplay.mock.calls[0]?.[0]).toEqual({
      manifest: scope.session,
      anchor: pass,
      run: 'owner-run',
      position: 'after_action',
      dimension: { scope: 'each' },
      subject: { callId: ref.callId, outcome: 'completed' },
    })
  } finally {
    await f.close()
  }
})

test('host revocation after legal reader output still prevents intent', async () => {
  const f = await submitFixture()
  const readEntered = f.gate(),
    headReady = f.gate()
  let pending: ReturnType<typeof f.runtime.operations.submit> | undefined
  try {
    await f.runtime.ready
    f.readHead.mockImplementation(async () => {
      readEntered.resolve()
      await headReady.promise
      return chainHead()
    })
    pending = f.runtime.operations.submit(f.submitted)
    await readEntered.promise
    f.revokeHeld()
    headReady.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'runtimeUnavailable' })
    expect(f.sources.isActive()).toBe(true)
    expect(f.release).toHaveBeenCalledTimes(1)
    expect((await f.projected()).executions.size).toBe(0)
    expect(f.append).not.toHaveBeenCalled()
    expect(f.acquire).not.toHaveBeenCalled()
    expect(f.implementation).not.toHaveBeenCalled()
  } finally {
    headReady.resolve()
    if (pending) await pending
    await f.close()
  }
})

test('nonempty chain uses original source methods and receivers captured before suspension', async () => {
  const f = await submitFixture({ nonempty: true })
  const holdingEntered = f.gate(),
    holdingReady = f.gate()
  let pending: ReturnType<typeof f.runtime.operations.submit> | undefined
  const replaced = vi.fn((): never => {
    throw new Error('replacement source used')
  })
  try {
    await f.runtime.ready
    f.holdingTenant.mockImplementation(async () => {
      holdingEntered.resolve()
      await holdingReady.promise
      return { tenant: scope.tenant }
    })
    pending = f.runtime.operations.submit(f.submitted)
    await holdingEntered.promise
    f.sources.sessionTenancy.holdingTenant = replaced
    f.sources.manifest.readHead = replaced
    f.sources.history.read = replaced
    holdingReady.resolve()
    expect(await pending).toEqual({ kind: 'recorded', execution: ref })
    await assertFinished(f, { outcome: 'completed', result: 'factory-result' }, true, selectedChain)
    expect(replaced).not.toHaveBeenCalled()
    expect(f.holdingTenant.mock.contexts).toEqual([f.sources.sessionTenancy])
    expect(f.readHead.mock.contexts).toEqual([f.sources.manifest])
    expect(f.readVersion.mock.contexts).toEqual([f.sources.history])
    expect(f.readVersion.mock.calls).toEqual([
      [
        {
          session: scope.session,
          tenant: scope.tenant,
          category: 'loop_extension',
          filledAt: 1,
          capability: { category: 'loop_extension', name: 'example:after' },
          asset: 'ast_after',
          version: 1,
        },
      ],
    ])
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(f.trace.indexOf('release')).toBeLessThan(f.trace.indexOf('append'))
  } finally {
    holdingReady.resolve()
    if (pending) await pending
    await f.close()
  }
})
