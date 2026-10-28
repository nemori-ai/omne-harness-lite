// Registration types that the root entry declares and `./cordis` re-exports. They have no Cordis
// dependency, so a consumer can name them without installing the framework.
import type { Adoption, DurableEvidence } from '@omne-harness/model-contract'
import type {
  ConverterKey,
  ModelConverter,
  ModelInstanceHost,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'

export type ModelRegistrationFailure =
  | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type ModelPublication = Extract<
  Awaited<ReturnType<ModelInstanceHost<never>['publish']>>,
  { ok: unknown }
>['ok']

export type ModelRegistrationInput<P> = Readonly<{
  publication: Parameters<ModelInstanceHost<P>['publish']>
  authority: DurableEvidence
}>

export type ModelRegistration = Readonly<{
  receipt: ModelPublication
  release(): Promise<Readonly<{ removed: boolean }>>
}>

export interface ModelPublicationAuthority<P> {
  check(input: ModelRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>
}

export type ModelConverterRegistrationInput<P> = Readonly<{
  key: ConverterKey
  converter: ModelConverter<P>
  adoption: Adoption
  authority: DurableEvidence
  release?(): Promise<void>
}>

export interface ModelConverterAuthority<P> {
  check(input: ModelConverterRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>
}

export type ModelConverterRegistration = Readonly<{
  token: string
  release(): Promise<
    Readonly<{
      removed: boolean
      failure?: Extract<ModelRegistrationFailure, { kind: 'unavailable' }>
    }>
  >
}>
