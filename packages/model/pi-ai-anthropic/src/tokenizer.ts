// The tokenizer resources of the family: the legacy Claude BPE of `claude.json`, renamed to the
// camel-case shape of the engine, with the definition that every record names. The assembly reads
// them once and passes them in the family configuration; the family itself never reads a file.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { TiktokenRanks, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { ANTHROPIC_TOKENIZER } from './records.ts'

/** The resource file. `src` and `dist` are both one level below the package root. */
const CLAUDE_JSON = new URL('../resources/tokenizers/anthropic-legacy/claude.json', import.meta.url)
/** SHA-256 of the file bytes, as resources/tokenizers/anthropic-legacy/provenance.json records it. */
const CLAUDE_JSON_SHA256 = '58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad'

/** Thrown when the packaged vocabulary file is not the file this package was built with. */
export class TokenizerResourceError extends Error {
  override readonly name = 'TokenizerResourceError'
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The special-token table of the file: names to non-negative safe integers. */
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

/** The ranks of the file bytes. Throws `TokenizerResourceError` for bytes of another file. */
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

/**
 * The resources that `createAnthropicFamily` passes to `createTiktokenTokenizer`. Reads the
 * packaged `claude.json` and checks its SHA-256 on every call. The special-token table is empty:
 * the meter counts visible text only and names no control token, and the file's own special
 * tokens count as ordinary text. Throws `TokenizerResourceError` when the file is not the
 * packaged file.
 */
export function anthropicTokenizerResources(): TiktokenResources {
  return {
    definition: ANTHROPIC_TOKENIZER,
    ranks: claudeRanksOf(readFileSync(CLAUDE_JSON)),
    specialTokens: {},
  }
}
