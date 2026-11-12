// The status code of each public outcome (binding page「状态码映射」). The table itself lives in
// `pipeline/status.ts`; the three existing locations read it under the union of the outcomes they
// can encode, which the shared contract's `Outcome` covers.
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
