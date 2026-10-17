// Declarations, inspection, catalog, codecs and the author registration types.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/kernel-basis'
import type { ToolWaitContract } from './author-context.ts'
import type {
  ParameterContract,
  ToolArguments,
  ToolAvailability,
  ToolDefinition,
  ToolInvocation,
  ToolReturnDeclaration,
  ToolValueSchema,
} from './definitions.ts'
import type { TextRenderer, ToolExecutor } from './execution.ts'
import type { Access, Adoption, DurableEvidence } from './identity.ts'
import type { Reply, ToolResult } from './results.ts'

export type ToolDeclarations = Readonly<{
  adoption: Adoption
  environment: Adoption | null
  attachments: readonly Readonly<{ store: string; mediaTypes: readonly string[] }>[]
  inputModalities: readonly string[]
  outputModalities: readonly string[]
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
export type ToolConsumerProfile =
  | Readonly<{
      kind: 'model'
      capabilities: DurableEvidence
      conversion: Adoption | null
      attachmentAccess: DurableEvidence
    }>
  | Readonly<{
      kind: 'independent'
      capabilities: DurableEvidence
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
export type ToolAuthorRegistration<E, B extends ContentBlock> = Readonly<{
  definition: ToolDefinition
  [toolAuthorRegistration]: Readonly<{ environment: (value: E) => E; block: (value: B) => B }>
}>
declare const toolLoadedRegistration: unique symbol
export type ToolLoadedRegistration<E, B extends ContentBlock> = Readonly<{
  author: ToolAuthorRegistration<E, B>
  executor: Adoption
  settings: Adoption
  source: DurableEvidence
  [toolLoadedRegistration]: true
}>
export interface ToolLoader<P, E, B extends ContentBlock> {
  load(
    input: Access<P> &
      Readonly<{
        definition: Adoption
        executor: Adoption
        settings: Adoption
        source: DurableEvidence
      }>,
  ): Reply<ToolLoadedRegistration<E, B>>
}
export interface ToolBindingRegistry<P, E, B extends ContentBlock> {
  register(
    input: Access<P> &
      Readonly<{
        loaded: ToolLoadedRegistration<E, B>
        authority: DurableEvidence
      }>,
  ): Reply<Readonly<{ contribution: string; release(): Promise<Readonly<{ removed: boolean }>> }>>
}
export interface TextResultFactory<B extends ContentBlock> {
  text(value: string): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
}
export type AvailabilityFacts = Readonly<{
  definition: ToolDefinition
  executor: Adoption
  qualification: 'allowed' | 'denied'
  dependencies: readonly Readonly<{ name: string; available: boolean }>[]
  inputCompatible: boolean
  outputCompatible: boolean
  attachmentsReadable: boolean
}>
