// data.offer-expiry v1 的纯模块。公开入口以 realization 节点 core/offer-expiry 的投影表为准。
export {
  type Instant,
  type Duration,
  type Clock,
  type ClockCheckpoint,
  instantFromEpochMs,
  instantFromRfc3339,
  instantToRfc3339,
  compareInstants,
  addDuration,
  parseOfferTtl,
} from './time.ts'
export {
  type OfferTiming,
  type SettledState,
  type OfferState,
  type TargetExistence,
  type DeriveStateInput,
  SETTLED_STATES,
  OFFER_STATES,
  timingFrom,
  parseOfferTiming,
  parseSettledState,
  deriveState,
  acceptable,
} from './offer.ts'
export {
  type SchemaDefName,
  type SchemaValidation,
  SCHEMA_DEF_NAMES,
  validate,
  schemaId,
} from './validate.ts'
export { compareRfc3339Instants } from './rfc3339-order.ts'
