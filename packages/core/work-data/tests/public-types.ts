import type {
  Action,
  AgentRef,
  AuthorizationDeclaration,
  BackgroundDeclaration,
  Binding,
  CallRef,
  Checked,
  Command,
  Confirmation,
  ContentBlock,
  DataTypes,
  Decision,
  DeferredReceiptBlock,
  DefinitionRef,
  DefinitionVersion,
  Input,
  InputBlock,
  JsonLimits,
  JsonObject,
  JsonValue,
  MediaBlock,
  MediaMetadata,
  MediaRef,
  MembershipRef,
  Money,
  OpaqueId,
  OperationRef,
  ProtocolVersion,
  RequestRef,
  ResourceRef,
  RunRef,
  SecretRef,
  SessionRef,
  StepRef,
  TextBlock,
  ToolCallBlock,
  ToolDefinition,
  ToolResultBlock,
  UserRef,
  ValidationIssue,
  WorkOwner,
  WorkRef,
} from '../dist/index.js'

type EveryPublicType = [
  Action,
  AgentRef,
  AuthorizationDeclaration,
  BackgroundDeclaration,
  Binding,
  CallRef,
  Checked<JsonValue>,
  Command,
  Confirmation,
  ContentBlock,
  DataTypes,
  Decision,
  DeferredReceiptBlock,
  DefinitionRef,
  DefinitionVersion,
  Input,
  InputBlock,
  JsonLimits,
  JsonObject,
  JsonValue,
  MediaBlock,
  MediaMetadata,
  MediaRef,
  MembershipRef,
  Money,
  OpaqueId,
  OperationRef,
  ProtocolVersion,
  RequestRef,
  ResourceRef,
  RunRef,
  SecretRef,
  SessionRef,
  StepRef,
  TextBlock,
  ToolCallBlock,
  ToolDefinition,
  ToolResultBlock,
  UserRef,
  ValidationIssue,
  WorkOwner,
  WorkRef,
]

const everyPublicTypeCompiles: EveryPublicType | undefined = undefined
void everyPublicTypeCompiles

const session: SessionRef = { tenantId: 'tenant', sessionId: 'session' }
const text: InputBlock = { blockId: 'block', kind: 'text', text: 'hello' }
void session
void text

// @ts-expect-error tool calls are trusted output content, not user InputBlock data
const untrustedToolCall: InputBlock = { blockId: 'block', kind: 'tool_call' }
// @ts-expect-error an AgentRef requires its incarnation identity
const incompleteAgent: AgentRef = session
void untrustedToolCall
void incompleteAgent
