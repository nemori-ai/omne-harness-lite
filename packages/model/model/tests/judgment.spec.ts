import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  deliver,
  judgePresence,
  judgeResolution,
  type Binding,
  type CustodianState,
} from '@omne-harness/model'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialQuery,
  type CredentialReference,
  type CredentialResolution,
  type CredentialPort,
  type SendFace,
} from '@omne-harness/model-contract/provider'
import { expect, it, vi } from 'vitest'

function identity(account: string, organization: string) {
  const a = accountCodec.parse(account)
  const o = organizationCodec.parse(organization)
  if (!a.ok || !o.ok) throw new Error('fixture identity')
  return tenant(o.value, a.value)
}

const tenantA = identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
const tenantB = identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')

function id(text: string) {
  const decoded = decodeCredentialId(text)
  if (!('ok' in decoded)) throw new Error('fixture credential id')
  return decoded.ok
}

const reference: CredentialReference = { id: id('cred-a'), tenant: tenantA, purpose: MODEL_SEND }
const face: SendFace = { authorized: true, official: false }

function state(bindings: readonly Binding[], overrides: Partial<CustodianState> = {}) {
  return { closed: false, factorySecret: 'synth-factory', bindings, ...overrides }
}

function held(life: Binding['life'], holder = tenantA): Binding {
  return { id: id('cred-a'), tenant: holder, purpose: MODEL_SEND, secret: 'synth-tenant', life }
}

it('resolves an active binding of the asking tenant to its tenant secret', () => {
  expect(judgeResolution(state([held('active')]), reference, face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: 'synth-tenant',
  })
})

it('denies a revoked binding, reports an unreadable one, and never falls back to the factory', () => {
  const official = { ...face, official: true }
  expect(judgeResolution(state([held('revoked')]), reference, official)).toEqual({ kind: 'denied' })
  expect(judgeResolution(state([held('unreadable')]), reference, official)).toEqual({
    kind: 'unreadable',
  })
})

it('denies a credential id held by another tenant instead of reporting it absent', () => {
  expect(judgeResolution(state([held('active', tenantB)]), reference, face)).toEqual({
    kind: 'denied',
  })
})

it('offers the factory secret only to an official send from a tenant with no binding', () => {
  const other: CredentialReference = { ...reference, id: id('cred-x') }
  const official = { ...face, official: true }
  expect(judgeResolution(state([]), other, official)).toEqual({
    kind: 'value',
    scope: 'factory',
    value: 'synth-factory',
  })
  expect(judgeResolution(state([]), other, face)).toEqual({ kind: 'absent' })
  expect(judgeResolution(state([held('active')]), other, official)).toEqual({ kind: 'absent' })
})

it('presence is denied when the store is closed, before any binding is consulted', () => {
  expect(judgePresence(state([held('active')], { closed: true }), reference)).toEqual({
    kind: 'denied',
  })
})

it('denies without looking at bindings when the state is closed, the send is unauthorized or the purpose differs', () => {
  const bindings = [held('active')]
  expect(judgeResolution(state(bindings, { closed: true }), reference, face)).toEqual({
    kind: 'denied',
  })
  expect(judgeResolution(state(bindings), reference, { ...face, authorized: false })).toEqual({
    kind: 'denied',
  })
  const other: CredentialQuery = { ...reference, purpose: 'other' }
  expect(judgeResolution(state(bindings), other, face)).toEqual({ kind: 'denied' })
  expect(judgePresence(state(bindings), other)).toEqual({ kind: 'denied' })
})

it.each([
  { label: 'active', bindings: [held('active')], present: true },
  { label: 'revoked', bindings: [held('revoked')], present: true },
  { label: 'unreadable', bindings: [held('unreadable')], present: true },
  { label: 'no binding', bindings: [], present: false },
  { label: 'same id under another tenant', bindings: [held('active', tenantB)], present: false },
])('reports the complete known presence for $label', ({ bindings, present }) => {
  expect(judgePresence(state(bindings), reference)).toEqual({
    kind: 'known',
    id: reference.id,
    tenant: tenantA,
    purpose: MODEL_SEND,
    present,
  })
})

it.each([
  { kind: 'value', scope: 'tenant', value: 'synth-delivered' },
  { kind: 'absent' },
  { kind: 'denied' },
  { kind: 'unreadable' },
  { kind: 'unavailable' },
] satisfies readonly CredentialResolution[])(
  'deliver preserves the record and sends only a value for $kind',
  resolution => {
    const record = { reference }
    const resolve = vi.fn<CredentialPort['resolve']>(() => resolution)
    const result = deliver(record, { resolve }, face)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve.mock.calls[0]?.[0]).toBe(record.reference)
    expect(resolve.mock.calls[0]?.[1]).toBe(face)
    expect(result.record).toBe(record)
    expect(result).toStrictEqual({
      record,
      send:
        resolution.kind === 'value' ? { sent: true, value: 'synth-delivered' } : { sent: false },
    })
    if (resolution.kind !== 'value') expect(result.send).not.toHaveProperty('value')
  },
)

it('denies a querying tenant that was never minted, however official the send is', () => {
  const unminted = structuredClone(tenantA)
  const other: CredentialReference = { id: id('cred-x'), tenant: unminted, purpose: MODEL_SEND }
  const official = { ...face, official: true }
  expect(judgeResolution(state([held('active')]), other, official)).toEqual({ kind: 'denied' })
  expect(judgeResolution(state([]), other, official)).toEqual({ kind: 'denied' })
  expect(judgePresence(state([held('active')]), other)).toEqual({ kind: 'denied' })
})

it('denies a querying tenant that was never minted on an unofficial face as well', () => {
  const other: CredentialReference = {
    id: id('cred-x'),
    tenant: structuredClone(tenantA),
    purpose: MODEL_SEND,
  }
  expect(judgeResolution(state([held('active')]), other, face)).toEqual({ kind: 'denied' })
  expect(judgePresence(state([held('active')]), other)).toEqual({ kind: 'denied' })
})

it('does not offer the factory secret while a binding holder cannot be recognised', () => {
  const official = { ...face, official: true }
  const other: CredentialReference = { id: id('cred-x'), tenant: tenantA, purpose: MODEL_SEND }
  const snapshot = state([held('active', structuredClone(tenantA))])
  expect(judgeResolution(snapshot, other, official)).toEqual({ kind: 'denied' })
  expect(judgeResolution(snapshot, other, face)).toEqual({ kind: 'absent' })
})
