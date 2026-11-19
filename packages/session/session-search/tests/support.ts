import type { HistoryEntry } from '@omne-harness/session-contract'
import type { QueryLimits, SearchQuery } from '../src/index.ts'
import { testEntry, type TestBlock } from '../src/testing.ts'

export const LIMITS: QueryLimits = {
  maxGramsPerLiteral: 16,
  maxAlternatives: 32,
  maxLiterals: 8,
  maxLiteralLength: 256,
  maxPatternLength: 512,
  maxProgramSize: 4096,
  maxScopeSessions: 64,
}

export { tree, type TestBlock } from '../src/testing.ts'

let serial = 0

/** A log entry as the history read gives it; only what the search reads is filled in. */
export function entryOf(kind: string, blocks: readonly TestBlock[], id?: string): HistoryEntry {
  serial += 1
  return testEntry({ kind, blocks }, id ?? String(serial), String(serial))
}

export function queryOf(over: Partial<SearchQuery> & Pick<SearchQuery, 'content'>): SearchQuery {
  return {
    scope: { kind: 'tenant' },
    archived: 'all',
    from: null,
    to: null,
    kinds: [],
    modelReadable: 'any',
    ...over,
  }
}

export const literals = (
  all: readonly string[],
  caseSensitive = false,
): SearchQuery['content'] => ({
  kind: 'literals',
  all,
  caseSensitive,
})
export const regex = (pattern: string, caseSensitive = false): SearchQuery['content'] => ({
  kind: 'regex',
  pattern,
  caseSensitive,
})

export { ALPHABET, random, randomText } from '../src/testing.ts'
