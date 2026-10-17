import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  judgePresence,
  judgeResolution,
  type Binding,
  type CustodianState,
} from '@omne-harness/model'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
  type SendFace,
} from '@omne-harness/model-contract'
import { expect, it } from 'vitest'

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

it('denies without looking at bindings when the state is closed, the send is unauthorized or the purpose differs', () => {
  const bindings = [held('active')]
  expect(judgeResolution(state(bindings, { closed: true }), reference, face)).toEqual({
    kind: 'denied',
  })
  expect(judgeResolution(state(bindings), reference, { ...face, authorized: false })).toEqual({
    kind: 'denied',
  })
  const other = { ...reference, purpose: 'other' } as unknown as CredentialReference
  expect(judgeResolution(state(bindings), other, face)).toEqual({ kind: 'denied' })
  expect(judgePresence(state(bindings), other)).toEqual({ kind: 'denied' })
})

it('reports presence by holder: the same id under another tenant is not present', () => {
  expect(judgePresence(state([held('active')]), reference)).toMatchObject({
    kind: 'known',
    present: true,
  })
  expect(judgePresence(state([held('active', tenantB)]), reference)).toMatchObject({
    kind: 'known',
    present: false,
  })
})
