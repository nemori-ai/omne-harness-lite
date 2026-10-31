// A text tokenizer as an author writes it against the contract: it counts the words of the text
// segments and one token for each special token it knows, and names the special token it does not.
import { fail, succeed } from '@omne-harness/operation-result'
import type { ModelTextTokenizer, TokenizationSegment } from '@omne-harness/model-contract/provider'
import { adoption } from './values.ts'

const KNOWN_SPECIAL_TOKENS: readonly string[] = ['<bos>', '<eos>']

function wordsIn(text: string): number {
  return text.split(/\s+/u).filter(word => word !== '').length
}

export function createWordTokenizer(): ModelTextTokenizer {
  return {
    definition: {
      adoption: adoption('tokenizer'),
      implementation: adoption('word-count'),
      vocabulary: adoption('words'),
      configuration: adoption('default'),
    },
    count(segments: readonly TokenizationSegment[]) {
      let tokens = 0
      for (const segment of segments) {
        if (segment.kind === 'text') {
          tokens += wordsIn(segment.text)
        } else if (KNOWN_SPECIAL_TOKENS.includes(segment.name)) {
          tokens += 1
        } else {
          return fail({ kind: 'unsupported-token', name: segment.name })
        }
      }
      return succeed({ tokens: String(tokens) })
    },
  }
}
