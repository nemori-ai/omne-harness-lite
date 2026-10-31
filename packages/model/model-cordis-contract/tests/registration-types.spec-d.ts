// Compile-time checks of the registration types. The root entry declares them and `./cordis`
// re-exports the same declarations, so a consumer that imports from either entry gets one type.
import type { Adoption, DurableEvidence, ModelHandle } from '@omne-harness/model-contract'
import type {
  ConverterKey,
  ExecutionRef,
  ModelConverter,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ModelConverterAuthority,
  ModelConverterRegistration,
  ModelConverterRegistrationInput,
  ModelPublication,
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from '@omne-harness/model-cordis-contract'
import type * as FromCordis from '@omne-harness/model-cordis-contract/cordis'
import { expectTypeOf, it } from 'vitest'

declare const declaredConverter: ModelConverter<string>
declare const declaredEvidence: DurableEvidence

it('re-exports the root declarations from ./cordis as the same types', () => {
  expectTypeOf<FromCordis.ModelRegistrationFailure>().toEqualTypeOf<ModelRegistrationFailure>()
  expectTypeOf<FromCordis.ModelConverterRegistrationInput<string>>().toEqualTypeOf<
    ModelConverterRegistrationInput<string>
  >()
  expectTypeOf<FromCordis.ModelConverterAuthority<string>>().toEqualTypeOf<
    ModelConverterAuthority<string>
  >()
  expectTypeOf<FromCordis.ModelConverterRegistration>().toEqualTypeOf<ModelConverterRegistration>()
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

it('carries the key, the converter, its adoption, the authority evidence and an optional release hook of the provider in a converter registration', () => {
  expectTypeOf<ModelConverterRegistrationInput<string>>().toEqualTypeOf<
    Readonly<{
      key: ConverterKey
      converter: ModelConverter<string>
      adoption: Adoption
      authority: DurableEvidence
      release?(): Promise<void>
    }>
  >()
  const withoutHook: ModelConverterRegistrationInput<string> = {
    key: { kind: 'media-type', mediaType: 'image/png' },
    converter: declaredConverter,
    adoption: declaredConverter.adoption,
    authority: declaredEvidence,
  }
  const hookWithAnswer: ModelConverterRegistrationInput<string> = {
    ...withoutHook,
    // @ts-expect-error TS2322: Type 'Promise<{ removed: boolean; }>' is not assignable to type 'Promise<void>'.
    release: async () => ({ removed: true }),
  }
  void [withoutHook, hookWithAnswer]
})

it('checks a converter registration synchronously and answers with a registration failure', () => {
  expectTypeOf<ModelConverterAuthority<string>['check']>().toEqualTypeOf<
    (input: ModelConverterRegistrationInput<string>) => Outcome<void, ModelRegistrationFailure>
  >()
})

it('gives back a string token and a release that reports whether it removed the entry, and the failure of the hook of the provider', () => {
  expectTypeOf<ModelConverterRegistration>().toEqualTypeOf<
    Readonly<{
      token: string
      release(): Promise<
        Readonly<{
          removed: boolean
          failure?: Readonly<{ kind: 'unavailable'; diagnostic: string }>
        }>
      >
    }>
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
