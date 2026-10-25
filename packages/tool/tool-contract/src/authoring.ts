// Declarations, inspection, catalog, codecs and the author registration types.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Modality } from '@omne-harness/modality'
import type { Outcome } from '@omne-harness/operation-result'
import type { ToolWaitContract } from './author-context.ts'
import type {
  ParameterContract,
  SourceLayer,
  ToolArguments,
  ToolAssetVersion,
  ToolAvailability,
  ToolDefinition,
  ToolGovernance,
  ToolImplementationFacts,
  ToolInvocation,
  ToolReturnDeclaration,
  ToolValueSchema,
} from './definitions.ts'
import type { TextRenderer, ToolExecutor } from './execution.ts'
import type { Access, Adoption, DurableEvidence, ToolCallId } from './identity.ts'
import type { Reply, ToolResult } from './results.ts'

export type ToolDeclarations = Readonly<{
  adoption: Adoption
  environment: Adoption | null
  attachments: readonly Readonly<{ store: string; mediaTypes: readonly string[] }>[]
  inputModalities: readonly Modality[]
  outputModalities: readonly Modality[]
  settings: ToolSettingsDeclaration | null
}>
export type ToolSettingsDeclaration = Readonly<{
  schema: ParameterContract
  defaults: JsonValue
  items: readonly Readonly<{
    path: readonly string[]
    category: 'preference' | 'binding' | 'placement-identity' | 'governance'
    sensitive: boolean
  }>[]
}>
/** The consumer's own abilities. A consumer without a legal conversion gives `conversion: null`. */
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
  ): Reply<Readonly<{ entries: readonly ToolAvailability[]; next: string | null }>>
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
        executor: ToolExecutor<A, ToolResult<B>, E>
        codec: OutputCodec<ToolResult<B>>
        output: ToolReturnValidator<A, ToolResult<B>>
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
        author: Extract<ToolAuthor<A, R, E, B>, { kind: 'ordinary' }>
      }>
    | Readonly<{
        returns: ToolReturnDeclaration & Readonly<{ kind: 'structured' }>
        author: Extract<ToolAuthor<A, R, E, B>, { kind: 'structured' }>
      }>
  )
/**
 * What `defineFunctionTool` and `defineCommandTool` build: the implementation side of a tool. It
 * carries the author facts and the projected shape, and hides the operations behind the
 * `./binding` reader. It has no name, no adoption and no governance field: the loader derives the
 * `ToolDefinition` from it and the asset governance (RFC-0012 object chain).
 */
export type ToolImplementation<E, B extends ContentBlock> = Readonly<{
  facts: ToolImplementationFacts
  [toolAuthorRegistration]: Readonly<{ environment: (value: E) => E; block: (value: B) => B }>
}>
/** The implementation-side fields an author gives to `defineFunctionTool` or `defineCommandTool`. */
export type ToolImplementationDeclaration = Readonly<{
  description: string
  backgroundAllowed: boolean
  declarations: ToolDeclarations
}>
/**
 * What an implementation package exports next to its author plugin: the executor identity and the
 * factory that turns the checked construction configuration (P15) into the implementation.
 */
export type ToolImplementationModule<E, B extends ContentBlock> = Readonly<{
  executor: Adoption
  createAuthor(
    construction: JsonValue,
  ): Outcome<ToolImplementation<E, B>, Readonly<{ field: string; reason: string }>>
}>
/** The binding key of G7: source layer, capability identity and asset version. */
export type ToolBindingKey = Readonly<{ layer: SourceLayer; asset: ToolAssetVersion }>
/** A command of the shape: the parameter contract in canonical form, or the executor-owned mark. */
export type ToolShapeParameters =
  | Readonly<{
      kind: 'declared'
      schema: string
      vocabulary: Readonly<{ owner: string; name: string; digest: string }>
    }>
  | Readonly<{ kind: 'executor-owned' }>
/**
 * What `shapeOf` reads from a definition (R1–R5 same-shape): name, kind, the parameter contract
 * and the command table. Descriptions, summaries, returns, declarations, adoption and executor
 * take no part. Commands are sorted by name.
 */
export type ToolShape = Readonly<{ name: string }> &
  (
    | Readonly<{ kind: 'function'; parameters: ToolShapeParameters }>
    | Readonly<{
        kind: 'commands'
        commands: readonly Readonly<{ name: string; parameters: ToolShapeParameters }>[]
      }>
  )
declare const toolLoadedRegistration: unique symbol
/** What a trusted loader hands to the binding registry: the key, the derived definition and shape. */
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
/** The verified origin of a contribution: its layer, asset version, holding and publication (G7). */
export type ToolAuthority = Readonly<{
  layer: SourceLayer
  asset: ToolAssetVersion
  holding: DurableEvidence
  publication: DurableEvidence
}>
/** A registered contribution. `release` withdraws only this token; a repeat answers `removed: false`. */
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
/** One row of `snapshot(scope)`: key, registration ordinal, load digest, shape, state and fiber. */
export type ToolBindingEntry = Readonly<{
  key: ToolBindingKey
  ordinal: string
  digest: string
  shape: ToolShape
  state: 'live' | 'draining'
  fiber: string
}>
/** The caller's access, or the system scope of an internal caller such as the coordinator. */
export type ToolBindingScope<P> = Access<P> | Readonly<{ scope: 'system' }>
export type ToolBindingKeyFailure = Readonly<{ kind: 'unknown-key' }>
/** What `drain(key)` reports: the pin count and the calls still in flight on that key. */
export type ToolBindingDrain = Readonly<{ pins: string; inflight: readonly ToolCallId[] }>
/**
 * The binding registry of G7. `register` is synchronous: the admission and the write happen in one
 * step of the caller fiber's effect. `snapshot`, `pins`, `close`, `reopen` and `drain` read or mark
 * the in-process registry; they are not a durable ledger. Selection rules belong to the SPEC.
 */
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
  text(value: string): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
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
