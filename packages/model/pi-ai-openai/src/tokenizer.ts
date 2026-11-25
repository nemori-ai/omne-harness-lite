import o200k from 'js-tiktoken/ranks/o200k_base'
import type { TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { O200K_PROXY_TOKENIZER } from '@omne-harness/pi-ai-transport/family-kit'

export function openAiTokenizerResources(): TiktokenResources {
  return {
    definition: O200K_PROXY_TOKENIZER,
    ranks: {
      patStr: o200k.pat_str,
      specialTokens: o200k.special_tokens,
      bpeRanks: o200k.bpe_ranks,
    },
    specialTokens: {},
  }
}
