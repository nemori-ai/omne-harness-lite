import type { Instant } from '@omne-harness-lite/offer-expiry'

export interface ServingNotice {
  readonly centerId: string
  readonly version: string
  readonly startedAt: Instant
}
export const SERVING_EVENT = 'governance-center-entry/serving-started'
export const STOPPED_EVENT = 'governance-center-entry/serving-stopped'
export const DEFECT_EVENT = 'governance-center-entry/defect-observed'
export const LISTENING_EVENT = 'governance-center-entry/ops-listening-started'
