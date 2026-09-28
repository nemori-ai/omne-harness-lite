import { currentCodecDomain } from './log-codec-domain.ts'
import { createValueCodec } from './log-codec-value.ts'
import { createEntryCodec } from './log-codec-entry.ts'
import { createSettlementCodec } from './log-codec-settlement.ts'

export const modelLogFormat = 'mrr/2'
export const { captureModelLogValue, recognizeMessageValue } = createValueCodec(currentCodecDomain)
export const { prepareModelLogEntry, inspectModelLogEntry } = createEntryCodec(currentCodecDomain)
export const { inspectSettlementMembers } = createSettlementCodec(currentCodecDomain)
export { encodeModelLogKey, decodeModelLogKey, modelLogJsonEqual } from './log-codec-key.ts'
export type { ModelLogKey, ModelLogInvalidValue } from './log-codec-key.ts'
export type {
  CapturedModelLogValue,
  ModelLogValueInput,
  ModelLogCategory,
  ModelLogResponseProjection,
  MessageValueRecognition,
} from './log-codec-value.ts'
export type {
  ModelLogShell,
  ModelLogPurpose,
  PrepareModelLogEntryInput,
  InspectModelLogEntryInput,
  InspectedModelLogEntry,
} from './log-codec-entry.ts'
export type {
  InspectSettlementMembersInput,
  ModelLogSettlementTarget,
  ModelLogSettlementAnchors,
  ModelLogSettlementCurrent,
  SettlementMembersResult,
  SettlementMemberReason,
} from './log-codec-settlement.ts'
