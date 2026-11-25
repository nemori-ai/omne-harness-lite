import type {
  LimitMetric,
  ModelModality,
  ProfileReplay,
  TokenizerDefinition,
} from '@omne-harness/model-contract'
import type { PiModelRecordHead } from '../family-table.ts'
import type { FileWire } from '../media.ts'

export type UpstreamData =
  | Readonly<{ kind: 'finite'; amount: string }>
  | Readonly<{ kind: 'unknown' }>

export type TokenLimitData = Readonly<{ provided: string; upstream: UpstreamData }>

export type LimitData = Readonly<{ metric: LimitMetric; provided: string; upstream: UpstreamData }>

export type ProfileData = Readonly<{
  input: readonly [ModelModality, ...ModelModality[]]
  output: readonly [ModelModality, ...ModelModality[]]
  context: Readonly<{
    window: TokenLimitData
    input: TokenLimitData | null
    output: TokenLimitData
  }>
  limits: readonly LimitData[]
  evidence: string
}>

/** Tokens of one image: one charge per tile the image covers, plus a fixed framing charge. */
export type ImageTokenRule = Readonly<{
  tilePixels: string
  tokensPerTile: string
  overheadTokens: string
}>

/** What every gateway record carries beside its engine fields, whatever the engine. */
export type GatewayRecord = PiModelRecordHead &
  Readonly<{
    wire: Readonly<{ image: unknown; file?: FileWire }>
    replay: Readonly<{ declaration: ProfileReplay }>
    profile: ProfileData
    meter: Readonly<{ tokenizer: TokenizerDefinition; coldRequestTokens?: string }>
  }>
