import type { FilesScope } from '@omne-harness/execution-environment-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { OrganizationId, TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SchemaRef } from '@omne-harness/schema-provider'
import type { ToolDeclarations } from './authoring.ts'
import type { ToolCallLabel } from './call-label.ts'
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
/** The command may go to the background unless the call gives one of these parameters. */
export type ToolCommandBackground = Readonly<{ unless: readonly string[] }>
export type ToolGateDefault = 'deny' | 'ask' | 'auto'
export type ToolGate = Readonly<{ id: string; title: string; default: ToolGateDefault }>
/** The kind of a typed release detail, with its major version, and the JSON Schema of its value. */
export type ToolCommandReleaseDetail = Readonly<{ kind: string; schema: JsonValue }>
/** `null` declares the command ungated. */
export type ToolCommandRelease = Readonly<{
  gate: string | null
  detail?: ToolCommandReleaseDetail
}>
export type ToolCommandDeclaration = Readonly<{
  name: string
  summary: string
  parameters:
    | Readonly<{ kind: 'declared'; value: ParameterContract }>
    | Readonly<{ kind: 'executor-owned' }>
  returns: ToolReturnDeclaration
  background?: ToolCommandBackground
  release?: ToolCommandRelease
}>
export type ToolImplementationShape =
  | Readonly<{ kind: 'function'; parameters: ParameterContract; returns: ToolReturnDeclaration }>
  | Readonly<{
      kind: 'commands'
      encoding: CommandCallEncoding
      commands: readonly ToolCommandDeclaration[]
      guide?: string
      gates?: readonly ToolGate[]
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
/** Where a call works by default, its workspace instance, and the files it may touch (see `pinnedFiles`). */
export type ToolCallDirectory = Readonly<{
  path: string
  workspace: Readonly<{ id: WorkspaceId; instance: string }> | null
  files?: FilesScope
}>
export type FixedToolRequest = Readonly<{
  availability: ToolAvailability
  invocation: ToolInvocation
  command: string | null
  arguments: ToolArguments
  /** How a person and the model recognise the call. No admission, permission or approval reads it. */
  label: ToolCallLabel
  settings: Adoption
  context: Adoption
  workspace: WorkspaceId | null
  /** Given by the request source when the call is accepted; it does not change afterwards. */
  directory?: ToolCallDirectory
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
