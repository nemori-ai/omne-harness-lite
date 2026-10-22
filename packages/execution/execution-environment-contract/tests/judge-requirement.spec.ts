import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  executionPlacementBlock,
  judgeRequirement,
} from '@omne-harness/execution-environment-contract'

function mintedTenant() {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}

it('decodes a requirement and keeps the tenant object of a tenant sandbox', () => {
  const tenant = mintedTenant()
  const judged = judgeRequirement({
    allowedBindings: [
      { kind: 'session_sandbox', scope: { ref: 'scope-1', parent: { ref: 'tenant-scope' } } },
      { kind: 'tenant_sandbox', tenant },
      { kind: 'host_machine' },
    ],
    facilities: ['files'],
    isolation: ['process'],
  })
  expect(judged).toEqual({
    ok: {
      allowedBindings: [
        { kind: 'session_sandbox', scope: { ref: 'scope-1', parent: { ref: 'tenant-scope' } } },
        { kind: 'tenant_sandbox', tenant },
        { kind: 'host_machine' },
      ],
      facilities: ['files'],
      isolation: ['process'],
    },
  })
  if (!('ok' in judged)) return
  const second = judged.ok.allowedBindings[1]
  expect(second?.kind === 'tenant_sandbox' && second.tenant).toBe(tenant)
})

it('refuses a binding that still carries a session identifier instead of a scope', () => {
  const judged = judgeRequirement({
    allowedBindings: [{ kind: 'session_sandbox', sessionId: 'session-1' }],
    facilities: [],
    isolation: [],
  })
  expect(judged).toMatchObject({
    failure: { reason: 'invalidInput', issues: [{ path: ['allowedBindings', 0, 'scope'] }] },
  })
})

it('refuses a requirement that carries a placement policy word', () => {
  const judged = judgeRequirement({
    allowedBindings: [],
    facilities: [],
    isolation: [],
    policy: 'auto_place',
  })
  expect(judged).toMatchObject({ failure: { reason: 'invalidInput' } })
})

it('validates placement block values with the block schema', () => {
  const validate = executionPlacementBlock.schema['~standard'].validate
  const entry = {
    origin: 'call-1',
    binding: { kind: 'host_machine' },
    instance: { id: 'host', generation: '1' },
    continuity: { kind: 'not_guaranteed' },
    facilities: ['files'],
    observedAt: 1,
  }
  expect(validate([entry])).toEqual({ value: [entry] })
  expect(validate([{ ...entry, origin: '' }])).toMatchObject({ issues: [{ path: [0, 'origin'] }] })
})
