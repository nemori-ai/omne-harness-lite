import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type QualifiedCredentialQuery,
} from '@omne-harness/model-contract/provider'
import { expect, it } from 'vitest'
import {
  judgeQualifiedPresence,
  judgeQualifiedResolution,
  type CustodianState,
} from '../src/index.ts'

function tenantOf(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
}

function id(text: string) {
  const parsed = decodeCredentialId(text)
  if (!('ok' in parsed)) throw new Error('fixture credential')
  return parsed.ok
}

const owner = tenantOf('5')
const other = tenantOf('6')
const input: QualifiedCredentialQuery<unknown> = {
  id: id('qualified'),
  purpose: MODEL_SEND,
  official: true,
  access: {
    tenant: owner,
    get principal(): never {
      throw new Error('principal verification belongs to the trusted boundary')
    },
  },
}
const empty: CustodianState = { closed: false, factorySecret: 'synth-factory', bindings: [] }
const bound: CustodianState = {
  ...empty,
  bindings: [
    { id: input.id, tenant: owner, purpose: MODEL_SEND, secret: 'synth-tenant', life: 'active' },
  ],
}

it('uses access.tenant for the tenant binding without reading the principal', () => {
  expect(judgeQualifiedPresence(bound, input)).toEqual({
    kind: 'known',
    present: true,
    id: input.id,
    tenant: owner,
    purpose: MODEL_SEND,
  })
  expect(judgeQualifiedResolution(bound, input)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'synth-tenant',
  })
  expect(
    judgeQualifiedResolution(bound, { ...input, access: { tenant: other, principal: null } }),
  ).toEqual({ kind: 'denied' })
  expect(
    judgeQualifiedPresence(bound, { ...input, access: { tenant: other, principal: null } }),
  ).toEqual({ kind: 'denied' })
})

it('offers the factory only for an official profile with no tenant binding', () => {
  expect(judgeQualifiedResolution(empty, input)).toEqual({
    kind: 'value',
    scope: 'factory',
    value: 'synth-factory',
  })
  expect(judgeQualifiedResolution(empty, { ...input, official: false })).toEqual({ kind: 'absent' })
  expect(judgeQualifiedResolution(bound, { ...input, id: id('another') })).toEqual({
    kind: 'absent',
  })
  const foreign = {
    ...bound,
    bindings: bound.bindings.map(binding => ({ ...binding, tenant: other })),
  }
  expect(judgeQualifiedResolution(foreign, input)).toEqual({ kind: 'denied' })
})

it.each(['revoked', 'unreadable'] as const)(
  'keeps a %s binding from falling back to the factory',
  life => {
    const state = { ...bound, bindings: bound.bindings.map(binding => ({ ...binding, life })) }
    expect(judgeQualifiedPresence(state, input)).toMatchObject({ kind: 'known', present: true })
    expect(judgeQualifiedResolution(state, input)).toEqual({
      kind: life === 'revoked' ? 'denied' : 'unreadable',
    })
  },
)

it('denies a closed custodian and a copied tenant', () => {
  expect(judgeQualifiedPresence({ ...bound, closed: true }, input)).toEqual({ kind: 'denied' })
  expect(judgeQualifiedResolution({ ...bound, closed: true }, input)).toEqual({ kind: 'denied' })
  expect(
    judgeQualifiedResolution(empty, {
      ...input,
      access: { tenant: structuredClone(owner), principal: null },
    }),
  ).toEqual({ kind: 'denied' })
})
