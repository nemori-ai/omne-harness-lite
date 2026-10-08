// Moonshot public K3 and K2.7 Code tokenizers use the same pinned BPE vocabulary.
// Their prompt templates are deliberately separate in moonshot.ts.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Tiktoken } from 'js-tiktoken/lite'

const vocabularyUrl = new URL('../../resources/tokenizers/moonshot/tiktoken.model', import.meta.url)
const vocabularyHash = 'b6c497a7469b33ced9c38afb1ad6e47f03f5e5dc05f15930799210ec050c5103'

// JS Unicode regexp has no character-class intersection. The negative lookahead
// gives the same non-Han letter classes as tokenization_kimi.py at 74797c9.
const nonHanUpper = '(?:(?!\\p{Script=Han})[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}])'
const nonHanLower = '(?:(?!\\p{Script=Han})[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}])'
// JS lacks scoped case-insensitive flags; spell the contractions explicitly.
const suffix = "(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])?"
const pattern = [
  '[\\p{Script=Han}]+',
  `[^\\r\\n\\p{L}\\p{N}]?${nonHanUpper}*${nonHanLower}+${suffix}`,
  `[^\\r\\n\\p{L}\\p{N}]?${nonHanUpper}+${nonHanLower}*${suffix}`,
  '\\p{N}{1,3}',
  ' ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*',
  '\\s*[\\r\\n]+',
  '\\s+(?!\\S)',
  '\\s+',
].join('|')

type Config = { readonly added_tokens_decoder?: Record<string, { readonly content?: string }> }

function loadTokenizer(configName: string): Tiktoken {
  const vocabulary = readFileSync(vocabularyUrl)
  if (createHash('sha256').update(vocabulary).digest('hex') !== vocabularyHash)
    throw new Error('Moonshot vocabulary hash mismatch')
  const lines = vocabulary.toString('utf8').trimEnd().split('\n')
  if (lines.length !== 163584) throw new Error('Moonshot vocabulary size mismatch')
  const ranked: string[] = []
  for (const line of lines) {
    const space = line.lastIndexOf(' ')
    if (space < 1) throw new Error('malformed Moonshot vocabulary')
    const rank = Number(line.slice(space + 1))
    if (!Number.isSafeInteger(rank) || rank < 0 || rank >= lines.length || ranked[rank])
      throw new Error('malformed Moonshot rank')
    ranked[rank] = line.slice(0, space)
  }
  if (ranked.some(token => !token)) throw new Error('incomplete Moonshot vocabulary')
  const configUrl = new URL(`../../resources/tokenizers/moonshot/${configName}`, import.meta.url)
  const config: Config = JSON.parse(readFileSync(configUrl, 'utf8'))
  const specialTokens: Record<string, number> = {}
  for (const [id, item] of Object.entries(config.added_tokens_decoder ?? {})) {
    if (typeof item.content === 'string') specialTokens[item.content] = Number(id)
  }
  return new Tiktoken({
    pat_str: pattern,
    special_tokens: specialTokens,
    bpe_ranks: `! 0 ${ranked.join(' ')}`,
  })
}

let k3: Tiktoken | undefined
let k27: Tiktoken | undefined
export function moonshotTokenizer(route: 'k3' | 'k27'): Tiktoken {
  if (route === 'k3') return (k3 ??= loadTokenizer('k3-tokenizer_config.json'))
  return (k27 ??= loadTokenizer('k27-tokenizer_config.json'))
}

export function countSegments(
  tokenizer: Tiktoken,
  segments: readonly { readonly text: string; readonly control: boolean }[],
): number {
  let count = 0
  for (const segment of segments) {
    if (!segment.text) continue
    // Text from messages/tools is always ordinary, even if it looks like a
    // control token. Only the fixed template may request one special token.
    count += tokenizer.encode(segment.text, segment.control ? [segment.text] : [], []).length
  }
  return count
}
