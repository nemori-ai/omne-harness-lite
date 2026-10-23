import type { TokenizerDefinition } from '@omne-harness/model-contract'

/**
 * One tiktoken vocabulary in the shape that `js-tiktoken/lite` reads, with camel-case names.
 * The family member supplies it. This package holds no vocabulary of its own.
 */
export type TiktokenRanks = Readonly<{
  patStr: string
  specialTokens: Readonly<Record<string, number>>
  bpeRanks: string
}>

/** Everything that `createTiktokenTokenizer` checks once and then uses for every count. */
export type TiktokenResources = Readonly<{
  definition: TokenizerDefinition
  ranks: TiktokenRanks
  /** The fixed table of special tokens that a `special-token` segment can name. */
  specialTokens: Readonly<Record<string, number>>
}>
