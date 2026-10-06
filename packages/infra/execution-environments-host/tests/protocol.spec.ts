import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { expect, test, vi } from 'vitest'
import type {
  CommandRequest,
  EnvironmentPlacementSource,
} from '@omne-harness-lite/execution-environments'
import { fixture, requirement, call, description } from './protocol-fixture.ts'

async function acquired(h: ReturnType<typeof fixture>) {
  const result = await h.registry.operations.acquire(h.request())
  if (result.kind !== 'acquired') throw new Error(`acquisition failed: ${result.reason}`)
  return result.lease
}
const command: CommandRequest = {
  executable: 'literal',
  args: ['$HOME'],
  cwd: '/explicit',
  env: {},
}

test('placement source is unique; missing policy and host prohibition are explicit, never a caller permit', async () => {
  const h = fixture()
  try {
    expect(() => h.registry.placements.registerPlacementSource(h.source)).toThrow('duplicate')
    h.setPermission('never-allow')
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
    await h.removeSource()
    expect(await h.registry.operations.acquire(h.request())).toEqual({
      kind: 'rejected',
      reason: 'policyUnavailable',
    })
    h.setPermission('auto_place')
    h.registry.placements.registerPlacementSource(h.source)
    expect((await h.registry.operations.acquire(h.request())).kind).toBe('acquired')
    expect(h.source.select).toHaveBeenCalledOnce()
  } finally {
    await h.dispose()
  }
})

test('source replacement owns pending reads and an old disposer cannot affect the new entry', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const original = vi.mocked(h.source.read).getMockImplementation()
    if (!original) throw new Error('source fixture missing')
    vi.mocked(h.source.read).mockImplementationOnce(async (...args) => {
      entered.resolve()
      await finish.promise
      return original(...args)
    })
    const pending = h.registry.operations.acquire(h.request())
    await entered.promise
    let drained = false
    const removal = h.removeSource().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    h.registry.placements.registerPlacementSource({ ...h.source, generation: h.source.generation })
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'placementChanged' })
    await removal
    await h.removeSource()
    expect((await h.registry.operations.acquire(h.request())).kind).toBe('acquired')
  } finally {
    finish.resolve()
    await h.dispose()
  }
})

test('permission changes during acquire release that original lease, without a retry or retarget', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const original = vi.mocked(h.provider.acquire).getMockImplementation()
    if (!original) throw new Error('provider fixture missing')
    vi.mocked(h.provider.acquire).mockImplementationOnce(async input => {
      entered.resolve()
      await finish.promise
      return original(input)
    })
    const pending = h.registry.operations.acquire(h.request())
    await entered.promise
    h.setPermission('never-allow')
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'placementChanged' })
    expect(h.release).toHaveBeenCalledOnce()
    expect(h.provider.acquire).toHaveBeenCalledOnce()
  } finally {
    finish.resolve()
    await h.dispose()
  }
})

test('new command/files check current permission; original output, completion and stop survive revocation', async () => {
  const h = fixture()
  try {
    const lease = await acquired(h),
      cmd = lease.facilities.command,
      files = lease.facilities.files
    if (!cmd || !files) throw new Error('required facilities missing')
    const started = await cmd.start(command)
    if (started.kind !== 'started') throw new Error('command rejected')
    const iterator = started.process.output[Symbol.asyncIterator](),
      first = iterator.next()
    h.output.emit('stdout', new Uint8Array([1, 2]))
    expect(await first).toMatchObject({
      done: false,
      value: { stream: 'stdout', data: new Uint8Array([1, 2]) },
    })
    let settled = false
    void started.process.result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    h.setPermission('never-allow')
    expect(await files.write('/original', new Uint8Array([3]))).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await cmd.start(command)).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect(h.write).not.toHaveBeenCalled()
    expect(h.start).toHaveBeenCalledOnce()
    await iterator.return?.()
    expect(h.stop).not.toHaveBeenCalled()
    h.output.emit('stderr', new Uint8Array([4, 5, 6]))
    h.finish()
    const results = await Promise.all([started.process.result, started.process.result])
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toMatchObject({
      kind: 'completed',
      output: { stderr: { observedBytes: 3, discardedBytes: 3 } },
    })
    expect(await started.process.stop('forced')).toBe('unconfirmed')
    expect(h.stop).toHaveBeenCalledOnce()
  } finally {
    await h.dispose()
  }
})

test('an access revoke during policy authorization cannot start a new file effect', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const lease = await acquired(h)
    const files = lease.facilities.files
    if (!files) throw new Error('files missing')
    vi.mocked(h.source.authorizeOperation).mockImplementationOnce(async () => {
      entered.resolve()
      await finish.promise
      return { kind: 'authorized' }
    })
    const pending = files.write('/original', new Uint8Array([1]))
    await entered.promise
    h.revoke()
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect(h.write).not.toHaveBeenCalled()
  } finally {
    finish.resolve()
    await h.dispose()
  }
})

test('literal command arguments, explicit env and input bytes are captured before an authorization wait', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>()
  try {
    const lease = await acquired(h),
      cmd = lease.facilities.command
    if (!cmd) throw new Error('command missing')
    vi.mocked(h.source.authorizeOperation).mockImplementationOnce(async () => {
      entered.resolve()
      await finish.promise
      return { kind: 'authorized' }
    })
    const input = {
      ...command,
      args: ['$HOME'],
      env: { ONLY: 'original' },
      stdin: new Uint8Array([1, 2]),
    }
    const pending = cmd.start(input)
    await entered.promise
    input.args[0] = 'changed'
    input.env.ONLY = 'changed'
    input.stdin[0] = 9
    finish.resolve()
    expect((await pending).kind).toBe('started')
    expect(h.start).toHaveBeenCalledWith({
      ...command,
      env: { ONLY: 'original' },
      stdin: new Uint8Array([1, 2]),
    })
    const adopted = vi.mocked(h.source.authorizeOperation).mock.calls[0]?.[3]
    expect(adopted?.instance).toEqual(description.instance)
  } finally {
    finish.resolve()
    await h.dispose()
  }
})

test('unread output stays bounded, reports exact overflow and cannot block command completion', async () => {
  const h = fixture()
  try {
    const lease = await acquired(h),
      cmd = lease.facilities.command
    if (!cmd) throw new Error('command missing')
    const started = await cmd.start(command)
    if (started.kind !== 'started') throw new Error('start failed')
    h.output.emit('stdout', new Uint8Array(20))
    h.output.emit('stderr', new Uint8Array(12))
    h.finish()
    expect(await started.process.result).toMatchObject({
      kind: 'completed',
      output: {
        stdout: { observedBytes: 20, discardedBytes: 12 },
        stderr: { observedBytes: 12, discardedBytes: 12 },
      },
    })
    const chunks = []
    for await (const chunk of started.process.output) chunks.push(chunk)
    expect(chunks.reduce((n, chunk) => n + chunk.data.length, 0)).toBe(8)
    expect(
      chunks.every(chunk => chunk.data.length <= started.process.outputPolicy.maxChunkBytes),
    ).toBe(true)
    expect(h.stop).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('a failed command retains known loss counts without inventing a completion or exit code', async () => {
  const h = fixture()
  try {
    const lease = await acquired(h),
      started = await lease.facilities.command?.start(command)
    if (started?.kind !== 'started') throw new Error('start failed')
    h.output.emit('stdout', new Uint8Array(20))
    h.output.close()
    h.terminal.resolve({
      kind: 'failed',
      reason: 'effectUnknown',
      observedDurationMs: 1,
      output: h.output.summary(),
    })
    expect(await started.process.result).toEqual({
      kind: 'failed',
      reason: 'effectUnknown',
      observedDurationMs: 1,
      output: {
        stdout: { observedBytes: 20, discardedBytes: 12 },
        stderr: { observedBytes: 0, discardedBytes: 0 },
      },
    })
    expect(await started.process.result).not.toHaveProperty('exit')
  } finally {
    await h.dispose()
  }
})

test('aggregate-only command handles are not exposed as a valid streaming facility', async () => {
  const h = fixture()
  try {
    const lease = await acquired(h)
    vi.mocked(h.start).mockResolvedValueOnce({
      kind: 'started',
      // @ts-expect-error Negative provider boundary: mandatory output port is missing.
      process: { ...h.process, output: undefined },
    })
    expect(await lease.facilities.command?.start(command)).toEqual({
      kind: 'rejected',
      reason: 'effectUnknown',
    })
  } finally {
    await h.dispose()
  }
})

test('unsupported declared facility cannot bypass the gate through type augmentation or a same-named object', async () => {
  const h = fixture()
  try {
    const required = { ...requirement, facilities: ['browser'] }
    vi.mocked(h.source.read).mockImplementation(async (scope, _access, original) => ({
      kind: 'placement',
      placement: {
        scope,
        ...original,
        requirement: required,
        permission: 'always-allow',
        revision: 'one',
        evidence: null,
      },
    }))
    expect(await h.registry.operations.acquire({ ...h.request(), requirement: required })).toEqual({
      kind: 'rejected',
      reason: 'unsupportedFacility',
    })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('stateless descriptions cannot be shared between different calls of the same tool/session', async () => {
  const h = fixture()
  try {
    const other = parseOpaqueIdentifier('other-call', 'CallId')
    if (!('ok' in other)) throw new Error('other call invalid')
    const required = { ...requirement, bindingLayer: 'stateless_sandbox' as const }
    vi.mocked(h.source.read).mockImplementation(async (scope, _access, original) => ({
      kind: 'placement',
      placement: {
        scope,
        ...original,
        requirement: required,
        permission: 'never-allow',
        revision: 'one',
        evidence: null,
      },
    }))
    vi.mocked(h.provider.describe).mockImplementation(async scope => ({
      kind: 'descriptions',
      values: [
        {
          ...description,
          bindingLayer: 'stateless_sandbox',
          binding: { kind: 'stateless_sandbox', scope, execution: other.ok },
        },
      ],
    }))
    expect(
      await h.registry.operations.acquire({ ...h.request(), call, requirement: required }),
    ).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })
    expect(h.provider.acquire).not.toHaveBeenCalled()
  } finally {
    await h.dispose()
  }
})

test('describe never exposes a foreign tenant or session binding, even if the provider returns its valid shape', async () => {
  const h = fixture()
  try {
    const other = parseOpaqueIdentifier('other-session', 'SessionRef')
    if (!('ok' in other)) throw new Error('other scope invalid')
    vi.mocked(h.provider.describe).mockImplementation(async scope => ({
      kind: 'descriptions',
      values: [
        {
          ...description,
          bindingLayer: 'session_sandbox',
          binding: { kind: 'session_sandbox', scope: { ...scope, session: other.ok } },
        },
      ],
    }))
    expect(await h.registry.operations.describe(h.request().scope, h.token)).toEqual({
      kind: 'rejected',
      reason: 'providerUnavailable',
    })
  } finally {
    await h.dispose()
  }
})

test('provider retirement waits through provisional lease adoption and original release', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>()
  const original = vi.mocked(h.source.read).getMockImplementation()
  if (!original) throw new Error('placement fixture missing')
  let reads = 0
  vi.mocked(h.source.read).mockImplementation(async (...args) => {
    if (++reads === 3) {
      entered.resolve()
      await resume.promise
    }
    return original(...args)
  })
  try {
    const acquiring = h.registry.operations.acquire(h.request())
    await entered.promise
    const removing = h.removeProvider()
    expect(h.provider.retire).not.toHaveBeenCalled()
    resume.resolve()
    expect(await acquiring).toMatchObject({ reason: 'providerUnavailable' })
    await removing
    expect(h.release).toHaveBeenCalledTimes(1)
    expect(vi.mocked(h.release).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(h.provider.retire).mock.invocationCallOrder[0] ?? 0,
    )
  } finally {
    resume.resolve()
    await h.dispose()
  }
})

test('an exception at provisional lease validation still releases the original lease exactly once', async () => {
  const h = fixture()
  const raw = await h.provider.acquire({
    ...h.request(),
    placement: {
      scope: h.request().scope,
      ...call,
      requirement,
      permission: 'always-allow',
      revision: 'one',
      evidence: null,
    },
  })
  if (raw.kind !== 'acquired') throw new Error('lease fixture missing')
  vi.mocked(h.provider.acquire).mockResolvedValue({
    ...raw,
    lease: {
      ...raw.lease,
      get invalidated(): Promise<{ readonly reason: string }> {
        throw new Error('invalid provider port')
      },
    },
  })
  try {
    expect(await h.registry.operations.acquire(h.request())).toMatchObject({
      reason: 'providerUnavailable',
    })
    expect(h.release).toHaveBeenCalledTimes(1)
  } finally {
    await h.dispose()
  }
})

test('access revoked during the final placement reread prevents lease delivery and releases the original', async () => {
  const h = fixture(),
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>()
  const original = vi.mocked(h.source.read).getMockImplementation()
  if (!original) throw new Error('placement fixture missing')
  let reads = 0
  vi.mocked(h.source.read).mockImplementation(async (...args) => {
    if (++reads === 3) {
      entered.resolve()
      await resume.promise
    }
    return original(...args)
  })
  try {
    const acquiring = h.registry.operations.acquire(h.request())
    await entered.promise
    h.revoke()
    resume.resolve()
    expect(await acquiring).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect(h.release).toHaveBeenCalledTimes(1)
    expect(h.start).not.toHaveBeenCalled()
  } finally {
    resume.resolve()
    await h.dispose()
  }
})
