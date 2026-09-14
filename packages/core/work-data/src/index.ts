export type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[]
export type JsonObject = { readonly [key: string]: JsonValue }
export type OpaqueId = string
export type SessionRef = Readonly<{ tenantId: OpaqueId; sessionId: OpaqueId }>
export type AgentRef = SessionRef & Readonly<{ incarnationId: OpaqueId }>
export type UserRef = Readonly<{ userId: OpaqueId }>
export type MembershipRef = Readonly<{ tenantId: OpaqueId; userId: OpaqueId }>
export type DefinitionRef = Readonly<{ ownerTenantId: OpaqueId; definitionId: OpaqueId }>
export type DefinitionVersion = Readonly<{ definition: DefinitionRef; version: OpaqueId }>
export type RunRef = Readonly<{ session: SessionRef; runId: OpaqueId }>
export type StepRef = Readonly<{ run: RunRef; stepId: OpaqueId }>
export type WorkRef = Readonly<{ tenantId: OpaqueId; workId: OpaqueId }>
export type WorkOwner = StepRef | WorkRef
export type MediaRef = Readonly<{ tenantId: OpaqueId; mediaId: OpaqueId }>
export type MediaMetadata = Readonly<{
  media: MediaRef
  sha256: string
  byteLength: number
  mimeType: string
  filename?: string
}>
export type ResourceRef = Readonly<{
  tenantId: OpaqueId
  kind: string
  resourceId: OpaqueId
  version: OpaqueId
}>
export type SecretRef = Readonly<{
  kind: 'secret_version'
  tenantId: OpaqueId
  secretId: OpaqueId
  version: OpaqueId
}>
export type Binding = Readonly<{
  implementationId: OpaqueId
  generation: OpaqueId
  configurationRevision: OpaqueId
  environment: ResourceRef
  parserVersion: OpaqueId
}>
export type Confirmation =
  | Readonly<{ confirmation: 'none' | 'before_effect'; provisionalContract?: ResourceRef }>
  | Readonly<{ confirmation: 'provisional'; provisionalContract: ResourceRef }>
export type Action = Readonly<{
  tenantId: OpaqueId
  callId: OpaqueId
  attemptId: OpaqueId
  owner: WorkOwner
  definition: DefinitionVersion
  toolKey: OpaqueId
  commandKey: OpaqueId
  declarationVersion: OpaqueId
  binding: Binding
  params: JsonObject
  resources: readonly ResourceRef[]
  permissions: readonly string[]
  grantorKinds: readonly string[]
  impact: string
}> & Confirmation
export type CallRef = Readonly<{ owner: WorkOwner; callId: OpaqueId; attemptId: OpaqueId }>
export type RequestRef = Readonly<{ tenantId: OpaqueId; requestId: OpaqueId }>
export type Money = Readonly<{ integer: string; scale: number; currency: string }>
export type OperationRef = Readonly<{
  namespace: OpaqueId
  principalId: OpaqueId
  operationId: OpaqueId
}>
export type Decision = Readonly<{
  request: RequestRef
  contentVersion: OpaqueId
  outcomeVersion: OpaqueId
  actor: UserRef
}> & (
  | Readonly<{ outcome: 'answer'; answer: JsonValue }>
  | Readonly<{ outcome: 'approve' | 'reject'; answer?: never }>
)
export type TextBlock = Readonly<{ blockId: OpaqueId; kind: 'text'; text: string }>
export type MediaBlock = Readonly<{
  blockId: OpaqueId
  kind: 'image' | 'audio' | 'video' | 'file'
  media: MediaRef
  delivery: 'model_native' | 'agent_attachment'
}>
export type ToolCallBlock = Readonly<{
  blockId: OpaqueId
  kind: 'tool_call'
  call: CallRef
  action: Action
}>
export type ToolResultBlock = Readonly<{
  blockId: OpaqueId
  kind: 'tool_result'
  call: CallRef
  outcome: 'succeeded' | 'failed' | 'denied_before_execution' |
    'cancelled_before_execution' | 'interrupted' | 'unknown'
  value: JsonValue
}>
export type DeferredReceiptBlock = Readonly<{
  blockId: OpaqueId
  kind: 'deferred_receipt'
  call: CallRef
  request: RequestRef
  continuationId: OpaqueId
  status: 'pending'
}>
export type ContentBlock = TextBlock | MediaBlock | ToolCallBlock | ToolResultBlock | DeferredReceiptBlock
export type InputBlock = TextBlock | MediaBlock
export type Input = Readonly<{
  session: SessionRef
  inputId: OpaqueId
  revision: number
  content: readonly InputBlock[]
  busyBehavior: 'queue' | 'interrupt_then_run'
  literal: boolean
}>
export type ProtocolVersion = Readonly<{ protocolId: string; version: string }>
export type BackgroundDeclaration =
  | Readonly<{ mode: 'unsupported' }>
  | Readonly<{
      mode: 'supported'
      executionOwnerProtocol: ProtocolVersion
      requiredResources: readonly string[]
      reconnectProtocol: ProtocolVersion
      form: 'independent_execution'
      automatic?: Readonly<{ thresholdMs: number; stopMarginMs: number }>
    }>
export type AuthorizationDeclaration = Readonly<{
  version: string
  permissions: readonly string[]
  resourceResolver: Readonly<{ resolverId: string; version: string }>
  grantorKinds: readonly string[]
  impactTemplate: string
}> & Confirmation
export type Command = Readonly<{
  commandKey: string
  inputSchema: JsonObject | boolean
  outputSchema: JsonObject | boolean
  authorization: AuthorizationDeclaration
  effect: 'read' | 'write' | 'external'
  cancellation: 'supported' | 'unsupported'
  background: BackgroundDeclaration
  requiredSkills: readonly DefinitionVersion[]
  environmentCapabilities: readonly string[]
}>
export type ToolDefinition = Readonly<{
  definition: DefinitionVersion
  toolKey: string
  commands: readonly Command[]
}>

export interface DataTypes {
  OpaqueId: OpaqueId
  SessionRef: SessionRef
  AgentRef: AgentRef
  UserRef: UserRef
  MembershipRef: MembershipRef
  DefinitionRef: DefinitionRef
  DefinitionVersion: DefinitionVersion
  RunRef: RunRef
  StepRef: StepRef
  WorkRef: WorkRef
  WorkOwner: WorkOwner
  MediaRef: MediaRef
  MediaMetadata: MediaMetadata
  ResourceRef: ResourceRef
  SecretRef: SecretRef
  Binding: Binding
  Action: Action
  CallRef: CallRef
  RequestRef: RequestRef
  Money: Money
  OperationRef: OperationRef
  Decision: Decision
  Input: Input
  ContentBlock: ContentBlock
  AuthorizationDeclaration: AuthorizationDeclaration
  Command: Command
  ToolDefinition: ToolDefinition
  BackgroundDeclaration: BackgroundDeclaration
  InputBlock: InputBlock
}

export type ValidationIssue = Readonly<{
  path: string
  code: 'invalid_json' | 'schema' | 'unsupported_number' | 'capacity'
  message: string
}>
export type Checked<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>
export type JsonLimits = Readonly<{ maxBytes: number; maxDepth: number; maxNodes: number }>

const missing = <T>(operation: string): Checked<T> => ({
  ok: false,
  issues: [{ path: '', code: 'invalid_json', message: `${operation} is not implemented` }],
})

export function parseJson(_text: string, _limits: JsonLimits): Checked<JsonValue> {
  return missing('parseJson')
}

export function copyJson(_value: unknown, _limits: JsonLimits): Checked<JsonValue> {
  return missing('copyJson')
}

export function parseData<K extends keyof DataTypes>(
  _type: K,
  _value: unknown,
  _limits: JsonLimits,
): Checked<DataTypes[K]> {
  return missing('parseData')
}

export function canonicalJson(_value: JsonValue): string {
  throw new TypeError('canonicalJson is not implemented')
}

export function equalJson(_a: JsonValue, _b: JsonValue): boolean {
  return false
}
