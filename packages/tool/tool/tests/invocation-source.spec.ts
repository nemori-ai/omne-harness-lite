import { describe, expect, it } from 'vitest'
import type { FixedToolRequest, Mutation } from '@omne-harness/tool-contract'
import { testAssembly } from './testing-values.ts'
import {
  dummyRequest,
  ok,
  operationId,
  callId,
  principalA,
  tenantA,
  tenantB,
  type Principal,
} from './runtime-values.ts'

type Input = Mutation<Principal> & Readonly<{ request: FixedToolRequest }>

const mutations: ReadonlyArray<readonly [string, (input: Input) => Input]> = [
  ['principal', input => ({ ...input, principal: { ...principalA, subject: 'mallory' } })],
  ['tenant', input => ({ ...input, tenant: tenantB })],
  ['call', input => ({ ...input, call: callId('other') })],
  ['admission', input => ({ ...input, operation: operationId('other') })],
  [
    'target',
    input => ({
      ...input,
      request: {
        ...input.request,
        availability: {
          ...dummyRequest().availability,
          definition: {
            ...input.request.availability.definition,
            adoption: { ...input.request.availability.definition.adoption, revision: 'changed' },
          },
        },
      },
    }),
  ],
  [
    'consumer',
    input => ({
      ...input,
      request: { ...input.request, consumer: { ...input.request.consumer, position: 'changed' } },
    }),
  ],
  [
    'scope',
    input => ({
      ...input,
      request: { ...input.request, scope: { ...input.request.scope, key: 'changed' } },
    }),
  ],
  [
    'payload',
    input => ({
      ...input,
      request: { ...input.request, arguments: { ...input.request.arguments, effective: '{}' } },
    }),
  ],
  [
    'origin',
    input => ({
      ...input,
      request: {
        ...input.request,
        invocation: { ...input.request.invocation, kind: 'programmatic' },
      },
    }),
  ],
  ...(['owner', 'record', 'revision', 'digest'] as const).map(
    field =>
      [
        `source.${field}`,
        (input: Input): Input => ({
          ...input,
          request: {
            ...input.request,
            invocation: {
              ...input.request.invocation,
              source: { ...input.request.invocation.source, [field]: 'forged' },
            },
          },
        }),
      ] as const,
  ),
]

async function issued() {
  const base = testAssembly()
  const payload = dummyRequest()
  const access = {
    principal: { ...principalA },
    tenant: tenantA,
    call: callId('call'),
    operation: operationId('admit'),
  }
  const invocation = ok(await base.source.issuer.bind({ ...access, request: payload }))
  const input = { ...access, request: { ...payload, invocation } }
  return { ...base, input }
}

describe('persisted invocation source binding', () => {
  it.each(mutations)('rejects a changed %s against its saved issuance', async (_field, mutate) => {
    const base = await issued()
    const forged = mutate(base.input)
    expect(await base.source.guard.verify(forged)).toMatchObject({ kind: 'forged' })
    // For tenant, the access guard is an earlier refusal. Every other forged admission reaches
    // the paired source guard inside the real ledger and is rejected before a store write.
    expect(await base.ledger.admissions.admit(forged)).toMatchObject({
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(base.store.commits).toBe(0)
    expect(await base.source.guard.verify(base.input)).toEqual({ kind: 'trusted' })
  })

  it('admits a binding only when its actual issuer and guard are paired', async () => {
    const first = await issued()
    expect(await first.ledger.admissions.admit(first.input)).toMatchObject({
      ok: { recovered: false },
    })
    const unrelated = testAssembly()
    expect(await unrelated.ledger.admissions.admit(first.input)).toEqual({
      failure: { kind: 'denied', action: 'admit' },
    })
    expect(unrelated.store.commits).toBe(0)
  })

  it('retains the original binding when caller-owned objects later change', async () => {
    const base = await issued()
    Object.assign(base.input.principal, { subject: 'changed' })
    expect(await base.source.guard.verify(base.input)).toMatchObject({ kind: 'forged' })
    Object.assign(base.input.principal, { subject: 'alice' })
    Object.assign(base.input.request.consumer, { position: 'changed' })
    expect(await base.source.guard.verify(base.input)).toMatchObject({ kind: 'forged' })
  })
})
