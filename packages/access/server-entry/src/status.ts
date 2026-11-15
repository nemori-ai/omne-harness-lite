import type {
  GovernanceResponse,
  HitlResponse,
  SessionResponse,
} from '@omne-harness/public-contract'
import { STATUS_BY_OUTCOME as TABLE } from './pipeline/status.ts'

export type PublicOutcome =
  | GovernanceResponse['outcome']
  | SessionResponse['outcome']
  | HitlResponse['outcome']

export const STATUS_BY_OUTCOME: Readonly<Record<PublicOutcome, number>> = TABLE
