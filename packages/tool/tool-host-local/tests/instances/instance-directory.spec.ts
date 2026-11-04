import { describe, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeToolCallId, type ToolExecutionRef } from '@omne-harness/tool-contract'
import { decodeToolInstanceId, type ToolHandle } from '@omne-harness/tool-contract/provider'
import { createLocalToolInstanceDirectory } from '../../src/instance-directory.ts'
import type { AccessVerdict } from '@omne-harness/tool'

function value<T, E>(result: Outcome<T, E>): T {
  if ('failure' in result) throw new Error('invalid fixture')
  return result.ok
}

function tenantOf(account = '0'): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${'0'.repeat(26)}`,
      account: `acc_${account.repeat(26)}`,
    }),
  )
  if (!parsed.ok) throw new Error('invalid fixture tenant')
  return parsed.value
}

const instance = value(decodeToolInstanceId('fixture-instance'))
const call = value(decodeToolCallId('same-call'))

// This fixture supplies routing identity only. It cannot serve a process stream.
function handleOf(generation = '1', hosted = instance): ToolHandle<string> {
  return Object.freeze({
    instance: hosted,
    generation,
    get stream(): never {
      throw new Error('routing-only fixture')
    },
    get observation(): never {
      throw new Error('routing-only fixture')
    },
  })
}

function execution(tenant = tenantOf()): ToolExecutionRef {
  return { tenant, call, instance, generation: '1' }
}

describe('local instance directory', () => {
  it('routes equal tenant identities and isolates the same call in two tenants', async () => {
    const local = createLocalToolInstanceDirectory<string>({
      instance,
      access: { qualify: async () => ({ kind: 'allowed' }) },
    })
    const first = execution()
    const second = execution(tenantOf('1'))
    const firstHandle = handleOf()
    const secondHandle = handleOf()
    expect(await local.directory.connect({ ...first, principal: 'owner' })).toEqual({
      ok: { kind: 'no-live-route' },
    })
    value(await local.publish(first, firstHandle))
    value(await local.publish(second, secondHandle))
    expect(await local.directory.connect({ ...execution(), principal: 'owner' })).toEqual({
      ok: { kind: 'live', handle: firstHandle },
    })
    expect(await local.directory.connect({ ...second, principal: 'owner' })).toEqual({
      ok: { kind: 'live', handle: secondHandle },
    })
    expect(
      await local.directory.connect({ ...execution(tenantOf('2')), principal: 'owner' }),
    ).toEqual({ ok: { kind: 'no-live-route' } })
  })

  it('recalls a live registration and ignores its token after withdrawal and republication', async () => {
    const local = createLocalToolInstanceDirectory<string>({
      instance,
      access: { qualify: async () => ({ kind: 'allowed' }) },
    })
    const ref = execution()
    const handle = handleOf()
    const first = value(await local.publish(ref, handle))
    expect(value(await local.publish(execution(), handle))).toEqual(first)
    expect(await local.publish(ref, handleOf())).toMatchObject({
      failure: { kind: 'invalid', reason: 'handle-conflict' },
    })
    expect(await local.withdraw({ ...first, registration: 'not-current' })).toEqual({
      ok: { removed: false },
    })
    expect(await local.withdraw({ ...first, execution: { ...ref, generation: '2' } })).toEqual({
      ok: { removed: false },
    })
    expect(
      await local.withdraw({
        ...first,
        execution: { ...ref, instance: value(decodeToolInstanceId('other')) },
      }),
    ).toEqual({ ok: { removed: false } })
    expect(await local.withdraw(first)).toEqual({ ok: { removed: true } })
    expect(await local.withdraw(first)).toEqual({ ok: { removed: false } })
    const next = value(await local.publish(ref, handle))
    expect(next.registration).not.toBe(first.registration)
    expect(await local.withdraw(first)).toEqual({ ok: { removed: false } })
    expect(await local.directory.connect({ ...ref, principal: 'owner' })).toEqual({
      ok: { kind: 'live', handle },
    })
  })

  it('pins the first generation and rejects mismatched execution and handle identities', async () => {
    const local = createLocalToolInstanceDirectory<string>({
      instance,
      access: { qualify: async () => ({ kind: 'allowed' }) },
    })
    const ref = execution()
    const other = value(decodeToolInstanceId('other'))
    expect(await local.publish({ ...ref, instance: other }, handleOf())).toMatchObject({
      failure: { kind: 'stale-instance' },
    })
    expect(await local.publish(ref, handleOf('1', other))).toMatchObject({
      failure: { kind: 'stale-instance' },
    })
    expect(await local.publish(ref, handleOf('2'))).toMatchObject({
      failure: { reason: 'handle-generation-mismatch' },
    })
    const publication = value(await local.publish(ref, handleOf()))
    await local.withdraw(publication)
    expect(await local.publish({ ...ref, generation: '0' }, handleOf('0'))).toMatchObject({
      failure: { reason: 'generation-conflict' },
    })
    expect(await local.publish({ ...ref, generation: '2' }, handleOf('2'))).toMatchObject({
      failure: { reason: 'generation-conflict' },
    })
  })

  it('keeps denied and unavailable qualification separate from an absent route', async () => {
    let verdict: AccessVerdict = { kind: 'denied', reason: 'revoked' }
    const qualify = vi.fn(async () => verdict)
    const local = createLocalToolInstanceDirectory<string>({ instance, access: { qualify } })
    const ref = execution()
    const handle = handleOf()
    value(await local.publish(ref, handle))
    expect(await local.directory.connect({ ...ref, principal: 'observer' })).toEqual({
      failure: { kind: 'denied', action: 'lookup' },
    })
    verdict = { kind: 'unavailable', diagnostic: 'authority-offline' }
    expect(await local.directory.connect({ ...ref, principal: 'observer' })).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'tool-instance-access',
        diagnostic: 'authority-offline',
      },
    })
    verdict = { kind: 'allowed' }
    expect(await local.directory.connect({ ...ref, principal: 'observer' })).toEqual({
      ok: { kind: 'live', handle },
    })
    expect(qualify).toHaveBeenLastCalledWith(
      expect.objectContaining({ principal: 'observer', action: 'lookup' }),
    )
  })

  it('redacts guard exceptions and never exposes a route when qualification throws', async () => {
    const local = createLocalToolInstanceDirectory<string>({
      instance,
      access: {
        qualify: async () => {
          throw new Error('secret-credential')
        },
      },
    })
    value(await local.publish(execution(), handleOf()))
    const reply = await local.directory.connect({ ...execution(), principal: 'observer' })
    expect(reply).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'tool-instance-access' },
    })
    expect(JSON.stringify(reply)).not.toContain('secret-credential')
  })

  it('reads the route after pending authorization and fixes the lookup input before awaiting', async () => {
    const authorization = Promise.withResolvers<AccessVerdict>()
    const local = createLocalToolInstanceDirectory<string>({
      instance,
      access: { qualify: () => authorization.promise },
    })
    const ref = execution()
    const published = value(await local.publish(ref, handleOf()))
    const request = { ...ref, principal: 'observer' }
    const lookup = local.directory.connect(request)
    request.call = value(decodeToolCallId('changed-after-lookup'))
    await local.withdraw(published)
    authorization.resolve({ kind: 'allowed' })
    expect(await lookup).toEqual({ ok: { kind: 'no-live-route' } })
    const handle = handleOf()
    value(await local.publish(ref, handle))
    const unchanged = { ...ref, principal: 'observer' }
    const connected = local.directory.connect(unchanged)
    unchanged.call = value(decodeToolCallId('changed-again'))
    expect(await connected).toEqual({ ok: { kind: 'live', handle } })
  })

  it('rejects structurally copied tenant values even with a permissive fixture guard', async () => {
    const local = createLocalToolInstanceDirectory<string>({
      instance,
      access: { qualify: async () => ({ kind: 'allowed' }) },
    })
    const forged = { ...execution(), tenant: { ...tenantOf() } }
    expect(await local.publish(forged, handleOf())).toMatchObject({ failure: { kind: 'denied' } })
    expect(await local.withdraw({ execution: forged, registration: 'unknown' })).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(await local.directory.connect({ ...forged, principal: 'observer' })).toMatchObject({
      failure: { kind: 'denied' },
    })
  })
})
