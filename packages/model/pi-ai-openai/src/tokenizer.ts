import o200k from 'js-tiktoken/ranks/o200k_base'
import type { TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { OPENAI_TOKENIZER } from './records.ts'

export function openAiTokenizerResources(): TiktokenResources {
  return {
    definition: OPENAI_TOKENIZER,
    ranks: {
      patStr: o200k.pat_str,
      specialTokens: o200k.special_tokens,
      bpeRanks: o200k.bpe_ranks,
    },
    specialTokens: {},
  }
}
