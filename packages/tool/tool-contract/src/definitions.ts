import type { JsonValue } from '@omne-harness/json-text'
import type { OrganizationId, TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SchemaRef } from '@omne-harness/schema-provider'
import type { ToolDeclarations } from './authoring.ts'
import type { CommandCallEncoding } from './command-call.ts'
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
export type ToolPublishedSchema = Readonly<{
  identity: ToolSchemaIdentity
  definition: ParameterContract
}>
export type ToolBodyDeclaration =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'text'; codec: Adoption }>
  | Readonly<{ kind: 'json-document'; codec: Adoption; document: ToolPublishedSchema }>
  | Readonly<{ kind: 'json-lines'; codec: Adoption; record: ToolPublishedSchema }>
export type ToolOffloadingDeclaration = Readonly<{
  inline: Readonly<{ kind: 'system' }> | Readonly<{ kind: 'bounded'; maxInlineUtf8Bytes: number }>
  retention: Readonly<{ kind: 'system' }> | Readonly<{ kind: 'bounded'; maxRetentionMs: number }>
  preview?:
    | Readonly<{ kind: 'system' }>
    | Readonly<{ kind: 'bounded'; maxPreviewUtf8Bytes: number }>
}>
export type ToolReturnDeclaration = Readonly<{
  program: ToolProgramDeclaration
  body: ToolBodyDeclaration
  offloading: ToolOffloadingDeclaration
}> &
  (
    | Readonly<{
        kind: 'ordinary'
        value: Readonly<{ kind: 'encoded-value'; codec: Adoption; value: ToolPublishedSchema }>
      }>
    | Readonly<{
        kind: 'structured'
        value: Readonly<{ kind: 'tool-result'; contract: Adoption }>
      }>
  )
export type ToolAssetVersion = Readonly<{ name: string; adoption: Adoption }>
export type ToolGovernance = Readonly<{
  asset: ToolAssetVersion
  requiredCapabilities: readonly string[]
  programmable?: boolean
}>
export type ToolCommandDeclaration = Readonly<{
  name: string
  summary: string
  parameters:
    | Readonly<{ kind: 'declared'; value: ParameterContract }>
    | Readonly<{ kind: 'executor-owned' }>
  returns: ToolReturnDeclaration
}>
export type ToolImplementationShape =
  | Readonly<{ kind: 'function'; parameters: ParameterContract; returns: ToolReturnDeclaration }>
  | Readonly<{
      kind: 'commands'
      encoding: CommandCallEncoding
      commands: readonly ToolCommandDeclaration[]
      guide?: string
    }>
export type ToolImplementationFacts = Readonly<{
  implements: ToolImplementationShape
  description: string
  backgroundAllowed: boolean
  declarations: ToolDeclarations
}>
export type ToolDefinition = Readonly<{
  adoption: Adoption
  name: string
  description: string
  requiredCapabilities: readonly string[]
  backgroundAllowed: boolean
  programmable?: boolean
  declarations: ToolDeclarations
}> &
  ToolImplementationShape
export type SourceLayer =
  | Readonly<{ kind: 'official' }>
  | Readonly<{ kind: 'organization'; organization: OrganizationId }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
  | Readonly<{ kind: 'workspace'; workspace: WorkspaceId }>
export type ToolAvailability =
  | Readonly<{
      kind: 'available'
      definition: ToolDefinition
      executor: Adoption
      layer: SourceLayer
    }>
  | Readonly<{ kind: 'known-unavailable'; definition: ToolDefinition; reason: string }>
export type ToolArguments = Readonly<{
  original: string
  effective: string
  complete: boolean
}>
export type ResourceScope = Readonly<{ owner: string; key: string; grant: DurableEvidence }>
export type ToolInvocation = Readonly<{
  kind: 'direct' | 'programmatic'
  source: DurableEvidence
}>
export type ToolEnvironmentDeclaration = Readonly<{ adoption: Adoption; value: JsonValue }>
export type FixedToolRequest = Readonly<{
  availability: ToolAvailability
  invocation: ToolInvocation
  command: string | null
  arguments: ToolArguments
  settings: Adoption
  context: Adoption
  workspace: WorkspaceId | null
  environment: ToolEnvironmentDeclaration | null
  requesterScope: ScopeRef
  resources: readonly Adoption[]
  scope: ResourceScope
  consumer: ConsumerRef
  batchDecision: DurableEvidence | null
  mode: 'foreground' | 'background'
  limits: Readonly<{
    concurrency: number | null
    scopeBudget: number | null
    foregroundMs: number | null
    backgroundAfterMs: number | null
  }>
}>
