// The subpath entry `./chat-completions`: the gateway engine for family packages. The only runtime
// value is `bindChatCompletions`; the record vocabulary, the hooks and the meter seam are types.
// Planning, projection, the body writer and the decoder stay inside the package.
export { bindChatCompletions, type ChatCompletionsBindingInput } from './bind.ts'
export type {
  ChatCompletionsLimits,
  ChatCompletionsRecord,
  ChatUsage,
  ChatUsageItem,
  ExtensionRule,
  FamilyMeter,
  FieldsOfValue,
  GatewayField,
  GatewayParam,
  GatewayUsage,
  ParameterAccept,
  ParameterKind,
  ParameterRule,
  ParameterTable,
  ParameterValue,
  ParameterWire,
  ProjectedPart,
  ProjectedRequest,
  ProjectedTurn,
  ReasoningCodec,
  ReasoningDetail,
  ReplayPart,
  ReplayWire,
  ServingPin,
  UsageDiagnostic,
  VendorHooks,
  WireProfile,
} from './vocabulary.ts'
