import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Modality } from '@omne-harness/modality'
import type { Outcome } from '@omne-harness/operation-result'
import type { SettingItem } from '@omne-harness/settings'
import type { ToolWaitContract } from './author-context.ts'
import type {
  ParameterContract,
  SourceLayer,
  ToolArguments,
  ToolAssetVersion,
  ToolAvailability,
  ToolDefinition,
  ToolEnvironmentDeclaration,
  ToolGovernance,
  ToolImplementationFacts,
  ToolInvocation,
  ToolReturnDeclaration,
  ToolValueSchema,
} from './definitions.ts'
import type { CheckpointedToolExecutor } from './checkpointed-author.ts'
import type { TextRenderer, ToolExecutor } from './execution.ts'
import type { Access, Adoption, DurableEvidence, ToolCallId } from './identity.ts'
import type { Reply, ToolRenderedResult } from './results.ts'

export type ToolDeclarations = Readonly<{
  adoption: Adoption
  environment: ToolEnvironmentDeclaration | null
  attachments: readonly Readonly<{ store: string; mediaTypes: readonly string[] }>[]
  inputModalities: readonly Modality[]
  outputModalities: readonly Modality[]
  settings: ToolSettingsDeclaration | null
}>
export type ToolSettingPresentation = Omit<SettingItem['presentation'], 'enumLabels'>
export type ToolSettingsDeclaration = Readonly<{
  schema: ParameterContract
  defaults: JsonValue
  items: readonly Readonly<{
    path: readonly string[]
    category: 'preference' | 'binding' | 'placement-identity' | 'governance'
    sensitive: boolean
    presentation: ToolSettingPresentation
  }>[]
}>
export type ToolConsumerProfile = Readonly<{
  capabilities: DurableEvidence
  conversion: Adoption | null
  attachmentAccess: DurableEvidence
}>
export type ToolInspection<P> = Access<P> &
  Readonly<{
    name: string
    command: string | null
    consumer: ToolConsumerProfile
  }>
export type ToolUsage = Readonly<{
  definition: Adoption
  command: string | null
  description: string
  parameters:
    | ParameterContract
    | Readonly<{ kind: 'executor-owned'; usage: string; protocol: Adoption }>
  returns: ToolReturnDeclaration
}>
export type ToolPresentation = Readonly<{
  name: string
  description: string
  programmable: boolean
  commands: readonly Readonly<{ name: string; summary: string }>[]
}>
export type ToolCatalogSearchEntry = ToolAvailability & Readonly<{ resident: boolean }>
export interface ToolCatalog<P> {
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  usage(input: ToolInspection<P> & Readonly<{ adoption: Adoption }>): Reply<ToolUsage>
  search(
    input: Access<P> &
      Readonly<{
        query: string
        consumer: ToolConsumerProfile
        invocation: ToolInvocation['kind']
        after: string | null
        limit: number
      }>,
  ): Reply<Readonly<{ entries: readonly ToolCatalogSearchEntry[]; next: string | null }>>
}
export interface ParameterCodec<A> {
  readonly adoption: Adoption
  parse(
    input: ToolArguments,
  ): Outcome<A, Readonly<{ kind: 'incomplete' | 'invalid'; reason: string }>>
}
export interface OutputCodec<R> {
  readonly adoption: Adoption
  encode(value: unknown): Outcome<Uint8Array, Readonly<{ reason: string }>>
  decode(bytes: Uint8Array): Outcome<R, Readonly<{ reason: string }>>
}
export interface ToolReturnValidator<A, R> {
  readonly adoption: Adoption
  check(input: Readonly<{ arguments: A; value: unknown }>): Outcome<R, Readonly<{ reason: string }>>
}
export type ToolProgramContract =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'json'; adoption: Adoption; schema: ToolValueSchema<unknown> }>
export type ToolProgramOutput<R> =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'json'
      adoption: Adoption
      schema: ToolValueSchema<unknown>
      encode(value: R): Outcome<JsonValue, Readonly<{ reason: string }>>
    }>
export type ToolAuthor<A, R, E, B extends ContentBlock> = Readonly<{
  parameters: ParameterCodec<A>
  waits: readonly ToolWaitContract<unknown, 'ask' | 'resource'>[]
}> &
  (
    | Readonly<{
        kind: 'ordinary'
        executor: ToolExecutor<A, R, E>
        codec: OutputCodec<R>
        output: ToolReturnValidator<A, R>
        renderer: TextRenderer<R>
        program: ToolProgramOutput<R>
      }>
    | Readonly<{
        kind: 'structured'
        executor: ToolExecutor<A, ToolRenderedResult<B>, E>
        codec: OutputCodec<ToolRenderedResult<B>>
        output: ToolReturnValidator<A, ToolRenderedResult<B>>
        program: ToolProgramContract
      }>
  )
export type ToolOperationParameters =
  | Readonly<{ kind: 'declared'; value: ParameterContract }>
  | Readonly<{ kind: 'executor-owned'; usage: string; protocol: Adoption }>
declare const toolOperation: unique symbol
declare const toolAuthorRegistration: unique symbol
export type ToolOperation<
  E,
  B extends ContentBlock,
  P extends ToolOperationParameters = ToolOperationParameters,
> = Readonly<{
  parameters: P
  returns: ToolReturnDeclaration
  [toolOperation]: Readonly<{ environment: (value: E) => E; block: (value: B) => B }>
}>
export type ToolAuthorExecutor<A, R, E> = ToolExecutor<A, R, E> | CheckpointedToolExecutor<A, R, E>
type SpecAuthor<T extends Readonly<{ executor: unknown }>, X> = Omit<T, 'executor'> &
  Readonly<{ executor: X }>
export type ToolOperationSpec<
  A,
  R,
  E,
  B extends ContentBlock,
  P extends ToolOperationParameters,
> = Readonly<{
  parameters: P
}> &
  (
    | Readonly<{
        returns: ToolReturnDeclaration & Readonly<{ kind: 'ordinary' }>
        author: SpecAuthor<
          Extract<ToolAuthor<A, R, E, B>, { kind: 'ordinary' }>,
          ToolAuthorExecutor<A, R, E>
        >
      }>
    | Readonly<{
        returns: ToolReturnDeclaration & Readonly<{ kind: 'structured' }>
        author: SpecAuthor<
          Extract<ToolAuthor<A, R, E, B>, { kind: 'structured' }>,
          ToolAuthorExecutor<A, ToolRenderedResult<B>, E>
        >
      }>
  )
export type ToolImplementation<E, B extends ContentBlock> = Readonly<{
  facts: ToolImplementationFacts
  [toolAuthorRegistration]: Readonly<{ environment: (value: E) => E; block: (value: B) => B }>
}>
export type ToolImplementationDeclaration = Readonly<{
  description: string
  backgroundAllowed: boolean
  declarations: ToolDeclarations
}>
export type ToolImplementationModule<E, B extends ContentBlock> = Readonly<{
  executor: Adoption
  createAuthor(
    construction: JsonValue,
  ): Outcome<ToolImplementation<E, B>, Readonly<{ field: string; reason: string }>>
}>
export type ToolBindingKey = Readonly<{ layer: SourceLayer; asset: ToolAssetVersion }>
export type ToolShapeParameters =
  | Readonly<{
      kind: 'declared'
      schema: string
      vocabulary: Readonly<{ owner: string; name: string; digest: string }>
    }>
  | Readonly<{ kind: 'executor-owned' }>
export type ToolShape = Readonly<{ name: string }> &
  (
    | Readonly<{ kind: 'function'; parameters: ToolShapeParameters }>
    | Readonly<{
        kind: 'commands'
        commands: readonly Readonly<{ name: string; parameters: ToolShapeParameters }>[]
      }>
  )
declare const toolLoadedRegistration: unique symbol
export type ToolLoadedRegistration<E, B extends ContentBlock> = Readonly<{
  implementation: ToolImplementation<E, B>
  key: ToolBindingKey
  definition: ToolDefinition
  shape: ToolShape
  executor: Adoption
  settings: Adoption
  [toolLoadedRegistration]: true
}>
export interface ToolLoader<P, E, B extends ContentBlock> {
  load(
    input: Access<P> &
      Readonly<{
        asset: ToolGovernance
        settings: Adoption
        module: ToolImplementationModule<E, B>
        services: Readonly<Record<string, unknown>>
      }>,
  ): Reply<ToolLoadedRegistration<E, B>>
}
export type ToolAuthority = Readonly<{
  layer: SourceLayer
  asset: ToolAssetVersion
  holding: DurableEvidence
  publication: DurableEvidence
}>
export type ToolContribution = Readonly<{
  key: ToolBindingKey
  token: string
  ordinal: string
  release(): Readonly<{ removed: boolean }>
}>
export type ToolContributionFailure =
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type ToolBindingEntry = Readonly<{
  key: ToolBindingKey
  ordinal: string
  digest: string
  shape: ToolShape
  state: 'live' | 'draining'
  fiber: string
}>
export type ToolBindingScope<P> = Access<P> | Readonly<{ scope: 'system' }>
export type ToolBindingKeyFailure = Readonly<{ kind: 'unknown-key' }>
export type ToolBindingDrain = Readonly<{ pins: string; inflight: readonly ToolCallId[] }>
export interface ToolBindingRegistry<P, E, B extends ContentBlock> {
  register(
    input: Access<P> &
      Readonly<{
        loaded: ToolLoadedRegistration<E, B>
        authority: ToolAuthority
      }>,
  ): Outcome<ToolContribution, ToolContributionFailure>
  snapshot(
    scope: ToolBindingScope<P>,
  ): Outcome<readonly ToolBindingEntry[], Extract<ToolContributionFailure, { kind: 'unavailable' }>>
  pins(key: ToolBindingKey): Outcome<string, ToolBindingKeyFailure>
  close(key: ToolBindingKey): Outcome<void, ToolBindingKeyFailure>
  reopen(key: ToolBindingKey): Outcome<void, ToolBindingKeyFailure>
  drain(key: ToolBindingKey): Outcome<ToolBindingDrain, ToolBindingKeyFailure>
}
export interface TextResultFactory<B extends ContentBlock> {
  text(value: string): Outcome<ToolRenderedResult<B>, Readonly<{ reason: string }>>
}
export type AvailabilityFacts = Readonly<{
  definition: ToolDefinition
  executor: Adoption
  layer: SourceLayer
  qualification: 'allowed' | 'denied'
  dependencies: readonly Readonly<{ name: string; available: boolean }>[]
  inputCompatible: boolean
  outputCompatible: boolean
  attachmentsReadable: boolean
}>
