// Tool definitions, availability, arguments, resource scope and the fixed request.
import type { JsonValue } from '@omne-harness/json-text'
import type { OrganizationId, TenantId, WorkspaceId } from '@omne-harness/legal-identity'
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
/**
 * The published version of a tool asset: the capability name and the version adoption. A derived
 * definition carries `adoption` equal to this version; the binding key and `ToolAuthority` name the
 * same value (RFC-0012 object chain).
 */
export type ToolAssetVersion = Readonly<{ name: string; adoption: Adoption }>
/** The asset side of a definition: what the asset governs, not how the implementation works. */
export type ToolGovernance = Readonly<{
  asset: ToolAssetVersion
  requiredCapabilities: readonly string[]
  programmable?: boolean
}>
/** One declared command of a multi-command implementation. */
export type ToolCommandDeclaration = Readonly<{
  name: string
  summary: string
  parameters:
    | Readonly<{ kind: 'declared'; value: ParameterContract }>
    | Readonly<{ kind: 'executor-owned' }>
  returns: ToolReturnDeclaration
}>
/** The shape an implementation projects: one function, or a command table. */
export type ToolImplementationShape =
  | Readonly<{ kind: 'function'; parameters: ParameterContract; returns: ToolReturnDeclaration }>
  | Readonly<{ kind: 'commands'; commands: readonly ToolCommandDeclaration[] }>
/** The implementation side of a definition: its shape and what the author declares about it. */
export type ToolImplementationFacts = Readonly<{
  implements: ToolImplementationShape
  description: string
  backgroundAllowed: boolean
  declarations: ToolDeclarations
}>
/**
 * The complete definition that `deriveDefinition(governance, facts)` composes. Its shape is the
 * fixed definition shape of P02: the asset fields, the author facts and the implementation shape.
 */
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
/**
 * The source layer of a contribution: one position on the asset ownership order (G7). It comes
 * from the verified authority, never from the registrant's `Access.tenant`.
 */
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
/**
 * The concurrency scope a call counts and queues in. The scope owner grants `key` to the tenant
 * and caller; `grant` is the evidence of that grant, which admission verifies.
 */
export type ResourceScope = Readonly<{ owner: string; key: string; grant: DurableEvidence }>
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
  workspace: WorkspaceId | null
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
