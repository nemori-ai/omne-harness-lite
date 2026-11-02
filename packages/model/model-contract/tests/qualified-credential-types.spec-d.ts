import type { Access } from '@omne-harness/legal-identity'
import type { CredentialId } from '@omne-harness/model-contract'
import type {
  CredentialPort,
  CredentialPresence,
  CredentialPurpose,
  CredentialResolution,
  QualifiedCredentialQuery,
} from '@omne-harness/model-contract/provider'
import { expectTypeOf, it } from 'vitest'

it('carries the qualified principal in the four-field synchronous credential query', () => {
  expectTypeOf<QualifiedCredentialQuery<string>>().toEqualTypeOf<
    Readonly<{
      id: CredentialId
      purpose: CredentialPurpose
      official: boolean
      access: Access<string>
    }>
  >()
  expectTypeOf<NonNullable<CredentialPort<string>['presentFor']>>().toEqualTypeOf<
    (input: Omit<QualifiedCredentialQuery<string>, 'official'>) => CredentialPresence
  >()
  expectTypeOf<NonNullable<CredentialPort<string>['resolveFor']>>().toEqualTypeOf<
    (input: QualifiedCredentialQuery<string>) => CredentialResolution
  >()
})

it('keeps ports with only the two legacy operations assignable', () => {
  const legacy: CredentialPort = {
    present: () => ({ kind: 'unavailable' }),
    resolve: () => ({ kind: 'unavailable' }),
  }
  expectTypeOf(legacy).toEqualTypeOf<CredentialPort<unknown>>()
  expectTypeOf<Pick<CredentialPort, 'present' | 'resolve'>>().toExtend<CredentialPort>()
})
