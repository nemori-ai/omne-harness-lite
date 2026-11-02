import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeToolCallId, type ToolExecutionRef } from '@omne-harness/tool-contract'
import { decodeToolInstanceId, type ToolHandle } from '@omne-harness/tool-contract/provider'
import { createLocalToolInstanceDirectory } from '../../src/instance-directory.ts'

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
})
