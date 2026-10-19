import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialId,
  CredentialPort,
  CredentialPresence,
  CredentialPurpose,
  CredentialQuery,
  CredentialReference,
  CredentialResolution,
  Identity,
  ModelCallId,
  ModelIdentityRejection,
  SendFace,
} from '@omne-harness/model-contract'
import { MODEL_SEND, decodeCredentialId, sameCredentialHolder } from '@omne-harness/model-contract'
import { call, credential, tenant } from './values.ts'

it('CredentialId is a branded string of its own key and no other brand is accepted for it', () => {
  expectTypeOf<CredentialId>().toEqualTypeOf<Identity<'ModelCredentialId'>>()
  expectTypeOf<CredentialId>().toExtend<string>()
  expectTypeOf<string>().not.toExtend<CredentialId>()
  expectTypeOf<ModelCallId>().not.toExtend<CredentialId>()
  // @ts-expect-error a plain string is not a CredentialId
  const fromString: CredentialId = 'cred-a'
  // @ts-expect-error a ModelCallId is not a CredentialId
  const fromCall: CredentialId = call
  void [fromString, fromCall]
})

it('the purpose of this delivery is the literal model-send', () => {
  expectTypeOf<typeof MODEL_SEND>().toEqualTypeOf<'model-send'>()
  expectTypeOf<CredentialPurpose>().toEqualTypeOf<'model-send'>()
})

it('a reference needs the id, the tenant and the model-send purpose; a query takes any purpose', () => {
  const reference: CredentialReference = { id: credential, tenant, purpose: MODEL_SEND }
  const query: CredentialQuery = { id: credential, tenant, purpose: 'other' }
  // @ts-expect-error a reference purpose is model-send only
  const otherPurpose: CredentialReference = { id: credential, tenant, purpose: 'other' }
  // @ts-expect-error the tenant is required
  const noTenant: CredentialReference = { id: credential, purpose: MODEL_SEND }
  // @ts-expect-error the id is a CredentialId, not a string
  const looseId: CredentialQuery = { id: 'c', tenant, purpose: MODEL_SEND }
  void [reference, query, otherPurpose, noTenant, looseId]
  expectTypeOf<CredentialReference>().toExtend<CredentialQuery>()
  expectTypeOf<CredentialQuery>().not.toExtend<CredentialReference>()
})

it('a reference cannot be mutated and carries no secret field', () => {
  const reference: CredentialReference = { id: credential, tenant, purpose: MODEL_SEND }
  // @ts-expect-error the reference is readonly
  reference.purpose = MODEL_SEND
  // @ts-expect-error a reference has no secret
  const withSecret: CredentialReference = { ...reference, secret: 's' }
  void withSecret
})

it('the send face has two booleans', () => {
  const face: SendFace = { authorized: true, official: false }
  // @ts-expect-error both flags are required
  const half: SendFace = { authorized: true }
  void [face, half]
})

it('presence and resolution are closed unions of kinds', () => {
  const presence: CredentialPresence[] = [
    { kind: 'known', present: false, id: credential, tenant, purpose: MODEL_SEND },
    { kind: 'denied' },
    { kind: 'unavailable' },
  ]
  const resolution: CredentialResolution[] = [
    { kind: 'value', scope: 'tenant', value: 's' },
    { kind: 'value', scope: 'factory', value: 's' },
    { kind: 'absent' },
    { kind: 'unreadable' },
    { kind: 'denied' },
    { kind: 'unavailable' },
  ]
  // @ts-expect-error a known presence names the reference
  const bare: CredentialPresence = { kind: 'known', present: true }
  // @ts-expect-error a value result has a scope
  const noScope: CredentialResolution = { kind: 'value', value: 's' }
  // @ts-expect-error an unlisted result
  const unlisted: CredentialResolution = { kind: 'revoked' }
  // @ts-expect-error only a value carries a secret
  const secretOnAbsent: CredentialResolution = { kind: 'absent', value: 's' }
  void [presence, resolution, bare, noScope, unlisted, secretOnAbsent]
})

it('the port has present and resolve only, and a store can add its own diagnostics', () => {
  expectTypeOf<keyof CredentialPort>().toEqualTypeOf<'present' | 'resolve'>()
  const port: CredentialPort = {
    present: () => ({ kind: 'unavailable' }),
    resolve: () => ({ kind: 'unavailable' }),
  }
  // @ts-expect-error diagnostics are not part of the port
  const withDiagnostics: CredentialPort = { ...port, diagnostics: () => [] }
  const store: CredentialPort & { diagnostics(): readonly string[] } = {
    ...port,
    diagnostics: () => [],
  }
  void [withDiagnostics, store]
  expectTypeOf(port.resolve).parameters.toEqualTypeOf<[CredentialQuery, SendFace]>()
  expectTypeOf(port.resolve).returns.toEqualTypeOf<CredentialResolution>()
})

it('decodeCredentialId returns an Outcome keyed by the credential brand', () => {
  expectTypeOf(decodeCredentialId).parameters.toEqualTypeOf<[unknown]>()
  expectTypeOf(decodeCredentialId).returns.toEqualTypeOf<
    Outcome<CredentialId, ModelIdentityRejection<'ModelCredentialId'>>
  >()
  const decoded = decodeCredentialId('cred-a')
  if ('ok' in decoded) expectTypeOf(decoded.ok).toEqualTypeOf<CredentialId>()
})

it('sameCredentialHolder compares an id and a tenant, not a whole reference', () => {
  expectTypeOf(sameCredentialHolder).returns.toEqualTypeOf<boolean>()
  const reference: CredentialReference = { id: credential, tenant, purpose: MODEL_SEND }
  const query: CredentialQuery = { id: credential, tenant, purpose: 'other' }
  sameCredentialHolder(reference, query)
  sameCredentialHolder({ id: credential, tenant }, reference)
  // @ts-expect-error the id is required
  sameCredentialHolder({ tenant }, reference)
  // @ts-expect-error a plain string is not a CredentialId
  sameCredentialHolder({ id: 'c', tenant }, reference)
})
