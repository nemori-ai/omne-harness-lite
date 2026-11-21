import type { DurableEvidence, ModelHandle } from '@omne-harness/model-contract'
import type { ExecutionRef } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ModelPublication,
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from '@omne-harness/model-cordis-contract'
import type * as FromCordis from '@omne-harness/model-cordis-contract/cordis'
import { expectTypeOf, it } from 'vitest'

it('re-exports the root declarations from ./cordis as the same types', () => {
  expectTypeOf<FromCordis.ModelRegistrationFailure>().toEqualTypeOf<ModelRegistrationFailure>()
  expectTypeOf<FromCordis.ModelPublication>().toEqualTypeOf<ModelPublication>()
  expectTypeOf<FromCordis.ModelRegistrationInput<string>>().toEqualTypeOf<
    ModelRegistrationInput<string>
  >()
  expectTypeOf<FromCordis.ModelRegistration>().toEqualTypeOf<ModelRegistration>()
  expectTypeOf<FromCordis.ModelPublicationAuthority<string>>().toEqualTypeOf<
    ModelPublicationAuthority<string>
  >()
})

it('names the failure categories of a registration and only those', () => {
  expectTypeOf<ModelRegistrationFailure>().toEqualTypeOf<
    | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
    | Readonly<{ kind: 'invalid'; reason: string }>
    | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  >()
})

it('carries the execution reference and the unguessable registration token in a publication', () => {
  expectTypeOf<ModelPublication>().toEqualTypeOf<
    Readonly<{ execution: ExecutionRef; registration: string }>
  >()
})

it('reuses the root publish parameters, execution reference and handle, next to the authority evidence', () => {
  expectTypeOf<ModelRegistrationInput<string>>().toEqualTypeOf<
    Readonly<{
      publication: [input: ExecutionRef, handle: ModelHandle<string>]
      authority: DurableEvidence
    }>
  >()
})

it('gives back the receipt of the publication and a release that reports whether it removed the entry', () => {
  expectTypeOf<ModelRegistration>().toEqualTypeOf<
    Readonly<{ receipt: ModelPublication; release(): Promise<Readonly<{ removed: boolean }>> }>
  >()
})

it('checks a publication registration synchronously and answers with a registration failure', () => {
  expectTypeOf<ModelPublicationAuthority<string>['check']>().toEqualTypeOf<
    (input: ModelRegistrationInput<string>) => Outcome<void, ModelRegistrationFailure>
  >()
})
