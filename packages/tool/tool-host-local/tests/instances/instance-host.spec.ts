import { describe, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolCallId, type ToolExecutionRef } from '@omne-harness/tool-contract'
import { type ToolDriver, type ToolHandle } from '@omne-harness/tool-contract/provider'
import type { AccessVerdict } from '@omne-harness/tool'
import {
  createLocalToolInstanceHost,
  createLocalToolInstanceIdentities,
  type LocalInstanceInput,
} from '../../src/instance-host.ts'

function value<T, E>(result: Outcome<T, E>): T {
  if ('failure' in result) throw new Error('invalid fixture')
  return result.ok
}

function tenantOf(account = '0'): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'0'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('invalid fixture tenant')
  return parsed.value
}

const call = value(decodeToolCallId('same-call'))
const request = () => ({ tenant: tenantOf(), call })
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve))

async function host(capacity = 2, overrides: Partial<LocalInstanceInput<string>> = {}) {
  return value(
    await createLocalToolInstanceHost<string>({
      identities: createLocalToolInstanceIdentities(),
      access: { qualify: async () => ({ kind: 'allowed' }) },
      resolveAccess: async input => succeed({ ...input, principal: 'original-owner' }),
      capacity,
      ...overrides,
    }),
  )
}

describe('local instance host', () => {
  it('keeps a wake arriving between driver settlement and the next promise continuation', async () => {
    const local = await host()
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const run = vi.fn<ToolDriver<string>['run']>(() => {
      entered.resolve()
      return finish.promise
    })
    const installation = local.install({ run })
    value(await local.schedule(request()))
    await entered.promise
    finish.resolve()
    await finish.promise
    value(await local.schedule(request()))
    await nextTurn()
    expect(run).toHaveBeenCalledTimes(2)
    await installation.release()
  })

  it('returns the same release promise to a reentrant abort listener', async () => {
    const local = await host()
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    let reentrant: Promise<void> | null = null
    const installation = local.install({
      run: async ({ signal }) => {
        signal.addEventListener(
          'abort',
          () => {
            reentrant = installation.release()
          },
          { once: true },
        )
        entered.resolve()
        await finish.promise
      },
    })
    value(await local.schedule(request()))
    await entered.promise
    const release = installation.release()
    expect(reentrant).toBe(release)
    finish.resolve()
    await release
  })

  it('coalesces queued wakes and one dirty rerun without overlapping the same call', async () => {
    const local = await host()
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    let concurrent = 0
    let peak = 0
    const run = vi.fn<ToolDriver<string>['run']>(async () => {
      peak = Math.max(peak, ++concurrent)
      entered.resolve()
      await finish.promise
      concurrent -= 1
    })
    const installation = local.install({ run })
    await Promise.all([
      local.schedule(request()),
      local.schedule(request()),
      local.schedule(request()),
    ])
    await entered.promise
    await Promise.all([
      local.schedule(request()),
      local.schedule(request()),
      local.schedule(request()),
    ])
    finish.resolve()
    await nextTurn()
    expect(run).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
    expect(run.mock.calls[0]?.[0].principal).toBe('original-owner')
    expect(run.mock.calls[0]?.[0].instance).toBe(run.mock.calls[1]?.[0].instance)
    await installation.release()
  })

  it('bounds distinct calls including running work and reclaims capacity after completion', async () => {
    const local = await host(1)
    const finish = Promise.withResolvers<void>()
    const run = vi.fn<ToolDriver<string>['run']>(() => finish.promise)
    const installation = local.install({ run })
    value(await local.schedule(request()))
    await nextTurn()
    expect(await local.schedule(request())).toEqual({ ok: { queued: true } })
    expect(await local.schedule({ ...request(), tenant: tenantOf('1') })).toMatchObject({
      failure: { dependency: 'tool-instance-host' },
    })
    expect(
      await local.schedule({ ...request(), call: value(decodeToolCallId('second-call')) }),
    ).toMatchObject({ failure: { dependency: 'tool-instance-host' } })
    finish.resolve()
    await nextTurn()
    value(await local.schedule({ ...request(), tenant: tenantOf('1') }))
    await nextTurn()
    expect(run.mock.calls.at(-1)?.[0].tenant.account.text).toBe(`acc_${'1'.repeat(26)}`)
    await installation.release()
  })

  it('withdraws publications, seals scheduling and waits for the aborted driver to finish', async () => {
    const local = await host()
    const entered = Promise.withResolvers<Parameters<ToolDriver<string>['run']>[0]>()
    const finish = Promise.withResolvers<void>()
    expect(await local.schedule(request())).toMatchObject({
      failure: { dependency: 'tool-instance-host' },
    })
    const installation = local.install({
      run: async input => {
        entered.resolve(input)
        await finish.promise
      },
    })
    expect(() => local.install({ run: async () => undefined })).toThrow(TypeError)
    value(await local.schedule(request()))
    const running = await entered.promise
    const execution: ToolExecutionRef = { ...running, generation: '1' }
    const handle: ToolHandle<string> = {
      instance: running.instance,
      generation: '1',
      get stream(): never {
        throw new Error('routing-only fixture')
      },
      get observation(): never {
        throw new Error('routing-only fixture')
      },
    }
    const publication = value(await local.publish(execution, handle))
    expect(await local.directory.connect({ ...request(), principal: 'observer' })).toEqual({
      ok: { kind: 'live', handle },
    })
    Reflect.set(publication, 'registration', 'changed-by-caller')
    let released = false
    const release = installation.release().then(() => {
      released = true
    })
    await nextTurn()
    expect(running.signal.aborted).toBe(true)
    expect(released).toBe(false)
    expect(await local.schedule(request())).toMatchObject({
      failure: { dependency: 'tool-instance-host' },
    })
    expect(await local.publish(execution, handle)).toMatchObject({
      failure: { dependency: 'tool-instance-host' },
    })
    expect(value(await local.directory.connect({ ...request(), principal: 'observer' })).kind).toBe(
      'no-live-route',
    )
    finish.resolve()
    await release
    await installation.release()
    expect(() => local.install({ run: async () => undefined })).toThrow(TypeError)
  })

  it('does not run after release while original-principal resolution is pending', async () => {
    const resolution =
      Promise.withResolvers<Awaited<ReturnType<LocalInstanceInput<string>['resolveAccess']>>>()
    const local = await host(1, { resolveAccess: () => resolution.promise })
    const run = vi.fn<ToolDriver<string>['run']>(async () => undefined)
    const installation = local.install({ run })
    value(await local.schedule(request()))
    const release = installation.release()
    resolution.resolve(succeed({ ...request(), principal: 'original-owner' }))
    await release
    expect(run).not.toHaveBeenCalled()
  })

  it('uses a fresh minted identity for each host and preserves mint failures', async () => {
    const observed = new Set<string>()
    for (let index = 0; index < 2; index += 1) {
      const local = await host()
      const installation = local.install({
        run: async input => {
          observed.add(input.instance)
        },
      })
      value(await local.schedule(request()))
      await nextTurn()
      await installation.release()
    }
    expect(observed.size).toBe(2)
    const denied = fail({
      kind: 'unavailable' as const,
      dependency: 'identity-mint',
      diagnostic: 'offline',
    })
    expect(
      await createLocalToolInstanceHost({
        capacity: 1,
        identities: { newInstance: async () => denied },
        access: { qualify: async () => ({ kind: 'allowed' }) },
        resolveAccess: async input => succeed({ ...input, principal: 'owner' }),
      }),
    ).toBe(denied)
  })

  it('rejects invalid capacity instead of admitting an unbounded queue', async () => {
    for (const capacity of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        await createLocalToolInstanceHost({
          capacity,
          identities: createLocalToolInstanceIdentities(),
          access: { qualify: async () => ({ kind: 'allowed' }) },
          resolveAccess: async input => succeed({ ...input, principal: 'owner' }),
        }),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'capacity' } })
    }
  })

  it('qualifies the original principal on every run and never borrows an observer principal', async () => {
    let verdict: AccessVerdict = { kind: 'denied', reason: 'revoked' }
    const qualify = vi.fn(async () => verdict)
    const local = await host(1, { access: { qualify } })
    const run = vi.fn<ToolDriver<string>['run']>(async () => undefined)
    const installation = local.install({ run })
    value(await local.schedule(request()))
    await nextTurn()
    expect(run).not.toHaveBeenCalled()
    verdict = { kind: 'unavailable', diagnostic: 'authority-offline' }
    value(await local.schedule(request()))
    await nextTurn()
    expect(run).not.toHaveBeenCalled()
    verdict = { kind: 'allowed' }
    await local.directory.connect({ ...request(), principal: 'observer' })
    value(await local.schedule(request()))
    await nextTurn()
    expect(run).toHaveBeenCalledTimes(1)
    expect(qualify).toHaveBeenLastCalledWith(
      expect.objectContaining({ principal: 'original-owner', action: 'recover' }),
    )
    expect(run.mock.calls[0]?.[0].principal).toBe('original-owner')
    await installation.release()
  })

  it('refuses a resolver for another tenant or call, and contains resolver failure', async () => {
    const variants: LocalInstanceInput<string>['resolveAccess'][] = [
      async input => succeed({ ...input, tenant: tenantOf('1'), principal: 'wrong-owner' }),
      async input =>
        succeed({
          ...input,
          call: value(decodeToolCallId('different-call')),
          principal: 'wrong-owner',
        }),
      async () => fail({ kind: 'denied', action: 'recover' }),
      async () => {
        throw new Error('secret-credential')
      },
    ]
    for (const resolveAccess of variants) {
      const local = await host(1, { resolveAccess })
      const run = vi.fn<ToolDriver<string>['run']>(async () => undefined)
      const installation = local.install({ run })
      value(await local.schedule(request()))
      await nextTurn()
      expect(run).not.toHaveBeenCalled()
      await installation.release()
    }
  })

  it('reports a safe driver failure and only retries after another wakeup', async () => {
    const warning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      const local = await host()
      const run = vi.fn<ToolDriver<string>['run']>(async () => {
        throw new Error('secret-credential')
      })
      const installation = local.install({ run })
      value(await local.schedule(request()))
      await nextTurn()
      await nextTurn()
      expect(run).toHaveBeenCalledTimes(1)
      expect(warning).toHaveBeenCalledWith(expect.not.stringContaining('secret-credential'), {
        code: 'TOOL_INSTANCE_RUN_FAILED',
      })
      value(await local.schedule(request()))
      await nextTurn()
      expect(run).toHaveBeenCalledTimes(2)
      await installation.release()
    } finally {
      warning.mockRestore()
    }
  })
})
