// The tokenizer resources of the family: the js-tiktoken o200k_base ranks, renamed to the
// camel-case shape of the engine, with the definition that every record names. The import is the
// only place the package reads the vocabulary; the engine checks it once at initialization.
import o200k from 'js-tiktoken/ranks/o200k_base'
import type { TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { OPENAI_TOKENIZER } from './records.ts'

/**
 * The resources that `createOpenAiFamily` passes to `createTiktokenTokenizer`. The special-token
 * table is empty: the meter counts visible text only and names no control token.
 */
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
