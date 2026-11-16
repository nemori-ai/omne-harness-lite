import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { TiktokenRanks, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { ANTHROPIC_TOKENIZER } from './records.ts'

const CLAUDE_JSON = new URL('../resources/tokenizers/anthropic-legacy/claude.json', import.meta.url)
const CLAUDE_JSON_SHA256 = '58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad'

export class TokenizerResourceError extends Error {
  override readonly name = 'TokenizerResourceError'
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function specialTokensOf(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value))
    throw new TokenizerResourceError('claude.json: special_tokens is not an object')
  const table: Record<string, number> = {}
  for (const [name, id] of Object.entries(value)) {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0)
      throw new TokenizerResourceError(`claude.json: special token ${name} has no valid id`)
    table[name] = id
  }
  return table
}

export function claudeRanksOf(bytes: Uint8Array): TiktokenRanks {
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== CLAUDE_JSON_SHA256)
    throw new TokenizerResourceError(`claude.json: SHA-256 ${digest} is not ${CLAUDE_JSON_SHA256}`)
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (!isRecord(parsed)) throw new TokenizerResourceError('claude.json: the file is not an object')
  const { pat_str: patStr, bpe_ranks: bpeRanks } = parsed
  if (typeof patStr !== 'string' || typeof bpeRanks !== 'string')
    throw new TokenizerResourceError('claude.json: pat_str and bpe_ranks must be strings')
  return { patStr, specialTokens: specialTokensOf(parsed['special_tokens']), bpeRanks }
}

export function anthropicTokenizerResources(): TiktokenResources {
  return {
    definition: ANTHROPIC_TOKENIZER,
    ranks: claudeRanksOf(readFileSync(CLAUDE_JSON)),
    specialTokens: {},
  }
}
