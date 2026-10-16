// Tool definitions, availability, arguments, resource scope and the fixed request.
import type { JsonValue } from '@omne-harness/json-text'
import type { SchemaRef } from '@omne-harness/schema-provider'
import type { ToolDeclarations } from './authoring.ts'
import type { Adoption, ConsumerRef, DurableEvidence } from './identity.ts'

export type ParameterContract = Readonly<{
  schema: JsonValue
  vocabulary: Adoption
  descriptions: readonly Readonly<{ path: string; text: string }>[]
}>
export type ToolSchemaIdentity = Readonly<{
  id: string
  revision: string
  digest: string
}>
export type ToolValueSchema<T> = Readonly<{
  identity: ToolSchemaIdentity
  ref: SchemaRef<T>
  maxBytes: number
}>
export type ToolProgramDeclaration =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'json'
      contract: Adoption
      schema: ToolSchemaIdentity
      definition: ParameterContract
      maxBytes: number
    }>
export type ToolReturnDeclaration = Readonly<{
  kind: 'ordinary' | 'structured'
  program: ToolProgramDeclaration
}>
export type ToolDefinitionMetadata = Readonly<{
  adoption: Adoption
  name: string
  description: string
  requiredCapabilities: readonly string[]
  backgroundAllowed: boolean
  programmable?: boolean
  declarations: ToolDeclarations
}>
export type ToolDefinition = ToolDefinitionMetadata &
  (
    | Readonly<{ kind: 'function'; parameters: ParameterContract; returns: ToolReturnDeclaration }>
    | Readonly<{
        kind: 'commands'
        commands: readonly Readonly<{
          name: string
          summary: string
          parameters:
            | Readonly<{ kind: 'declared'; value: ParameterContract }>
            | Readonly<{ kind: 'executor-owned' }>
          returns: ToolReturnDeclaration
        }>[]
      }>
  )
export type ToolAvailability =
  | Readonly<{ kind: 'available'; definition: ToolDefinition; executor: Adoption }>
  | Readonly<{ kind: 'known-unavailable'; definition: ToolDefinition; reason: string }>
export type ToolArguments = Readonly<{
  original: string
  effective: string
  complete: boolean
}>
export type ResourceScope =
  | Readonly<{ kind: 'session'; owner: string; session: string }>
  | Readonly<{ kind: 'independent'; owner: string; resource: string }>
export type ToolInvocation = Readonly<{
  kind: 'direct' | 'programmatic'
  source: DurableEvidence
}>
export type FixedToolRequest = Readonly<{
  availability: ToolAvailability
  invocation: ToolInvocation
  command: string | null
  arguments: ToolArguments
  settings: Adoption
  context: Adoption
  workspace: Adoption | null
  environment: Adoption
  resources: readonly Adoption[]
  scope: ResourceScope
  consumer: ConsumerRef
  batchDecision: DurableEvidence | null
  mode: 'foreground' | 'background'
  limits: Readonly<{
    concurrency: number | null
    foregroundMs: number | null
    backgroundAfterMs: number | null
  }>
}>
