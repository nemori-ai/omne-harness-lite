// Typed inputs for the type-consumption probes. Nothing here runs: the spec-d files are only
// type-checked. Branded values are declared, never built, so no probe mints a brand with an
// assertion.
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type {
  IncompleteToolCallPart,
  Message,
  ToolCallPart,
  ToolResultPart,
  UnparsedToolCallPart,
} from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'
import type {
  Adoption,
  ConsumerRef,
  ContextLimits,
  CredentialId,
  DispatchId,
  DurableEvidence,
  FixedModelRequest,
  ModelCallId,
  ModelCountingBasis,
  ModelDiagnosticCursor,
  ModelDiagnosticId,
  ModelInstanceId,
  ModelLimit,
  ModelOperationId,
  OutputCursor,
  ParameterAdoption,
  ProfileSupplier,
  ReadId,
  RequestBudget,
  ResultCapacity,
  ResultVersion,
  Revision,
  Supplier,
  TokenLimit,
  ToolDeclaration,
} from '@omne-harness/model-contract'

export declare const tenant: TenantId
export declare const block: ContentBlock
export declare const reference: ContentReference
export declare const message: Message
export declare const toolCall: ToolCallPart
export declare const incompleteCall: IncompleteToolCallPart
export declare const unparsedCall: UnparsedToolCallPart
export declare const toolResult: ToolResultPart
export declare const json: JsonValue
export declare const account: CallAccount

export declare const credential: CredentialId
export declare const call: ModelCallId
export declare const dispatch: DispatchId
export declare const instance: ModelInstanceId
export declare const operation: ModelOperationId
export declare const result: ResultVersion
export declare const cursor: OutputCursor
export declare const read: ReadId
export declare const revision: Revision
export declare const diagnosticId: ModelDiagnosticId
export declare const diagnosticCursor: ModelDiagnosticCursor

export const adoption: Adoption = { owner: 'owner', name: 'name', revision: '1', digest: 'd' }
export const evidence: DurableEvidence = { owner: 'owner', record: 'r', revision: '1', digest: 'd' }
export const consumer: ConsumerRef = { owner: 'owner', work: 'w', position: 'p', purpose: 'u' }
export const supplier: Supplier = {
  adoption,
  recipient: 'recipient',
  model: 'model',
  credential: { kind: 'factory' },
}
export const profileSupplier: ProfileSupplier = { adoption, recipient: 'recipient', model: 'model' }
export const capacity: ResultCapacity = { bytes: '1', blocks: '1', attachmentBytes: '0' }
export const tool: ToolDeclaration = { name: 'tool', description: 'd', argumentsSchema: json }
export const limit: ModelLimit = { metric: 'image-bytes', provided: '1', upstream: [] }
export const tokenLimit: TokenLimit = { provided: '1', upstream: [] }
export const context: ContextLimits = {
  window: tokenLimit,
  input: null,
  output: tokenLimit,
  compactionTriggerPercent: '80',
}
export const parameterAdoption: ParameterAdoption = {
  supplier: adoption,
  applied: { kind: 'temperature', value: 1 },
  origin: { kind: 'default', source: adoption },
}
export const counting: ModelCountingBasis = {
  supplier: profileSupplier,
  meter: adoption,
  tokenization: { kind: 'not-used', method: adoption },
  prompt: { kind: 'provider-private', estimation: adoption },
  projection: adoption,
  mediaTransform: adoption,
  replay: adoption,
  evidence: adoption,
}
export const budget: RequestBudget = {
  inputDigest: 'd',
  checks: [],
  counting: [counting],
  kind: 'complete',
}
export const request: FixedModelRequest = {
  profile: adoption,
  suppliers: [supplier],
  fallback: false,
  retryPolicy: adoption,
  parameters: [],
  system: [block],
  messages: [message],
  tools: [tool],
  toolChoice: 'auto',
  representation: adoption,
  parameterAdoptions: [parameterAdoption],
  source: adoption,
}
