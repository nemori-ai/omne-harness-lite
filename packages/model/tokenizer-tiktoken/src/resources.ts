import type { TokenizerDefinition } from '@omne-harness/model-contract'

export type TiktokenRanks = Readonly<{
  patStr: string
  specialTokens: Readonly<Record<string, number>>
  bpeRanks: string
}>

export type TiktokenResources = Readonly<{
  definition: TokenizerDefinition
  ranks: TiktokenRanks
  specialTokens: Readonly<Record<string, number>>
}>
