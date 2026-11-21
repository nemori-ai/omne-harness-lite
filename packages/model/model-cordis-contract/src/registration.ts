import type { DurableEvidence } from '@omne-harness/model-contract'
import type { ModelInstanceHost } from '@omne-harness/model-contract/provider'
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
