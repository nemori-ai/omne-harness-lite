// The subpath entry `./chat-completions`: the gateway engine for family packages. The runtime
// values are `bindChatCompletions`, the calibrated arithmetic `calibratedAmount` and the
// measurement rules that both family meters share (`ANCHORED_METHOD`, `NO_CALIBRATION`,
// `calibratedMethod`, `calibratedDigest`, `unitExtras`). The record vocabulary, the hooks and the
// meter seam are types. Planning, projection, the body writer and the decoder stay inside the
// package.
export { bindChatCompletions, type ChatCompletionsBindingInput } from './bind.ts'
export {
  calibratedAmount,
  type CalibratedAmount,
  type CalibrationArithmeticInput,
} from './calibration.ts'
export {
  ANCHORED_METHOD,
  NO_CALIBRATION,
  calibratedDigest,
  calibratedMethod,
  unitExtras,
} from './measurement.ts'
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
  MeterUnits,
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
  ReplaySource,
  ReplayWire,
  ServingPin,
  UsageDiagnostic,
  VendorHooks,
  WireProfile,
} from './vocabulary.ts'
