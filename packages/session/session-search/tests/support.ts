import type { HistoryEntry } from '@omne-harness/session-contract'
import type { QueryLimits, SearchQuery } from '../src/index.ts'

export const LIMITS: QueryLimits = {
  maxGramsPerLiteral: 16,
  maxAlternatives: 32,
  maxLiterals: 8,
  maxLiteralLength: 256,
  maxPatternLength: 512,
  maxProgramSize: 4096,
  maxScopeSessions: 64,
}

export type TestBlock = Readonly<{ text: string; toModel?: boolean; kind?: string }>

let serial = 0

/** A log entry as the history read gives it; only what the search reads is filled in. */
export function entryOf(kind: string, blocks: readonly TestBlock[], id?: string): HistoryEntry {
  serial += 1
  const message = {
    id: `msg_${String(serial).padStart(22, '0')}`,
    role: kind.replace(/^message\./u, ''),
    blocks: blocks.map((block, at) => ({
      kind: block.kind ?? 'text',
      id: `b${String(at)}`,
      visibility: { toHuman: true, toModel: block.toModel ?? true },
      text: block.text,
    })),
  }
  return {
    id: id ?? String(serial),
    revision: String(serial),
    kind,
    schema: { name: 'test', revision: '1' },
    payload: { message },
    origin: { owner: 'test', via: null, source: { owner: 'test', record: 'r', revision: '1' } },
  } as unknown as HistoryEntry
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

/** A small deterministic generator: a failure prints its seed and reruns the same. */
export function random(seed: number) {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const below = (n: number): number => Math.floor(next() * n)
  const pick = <T>(items: readonly T[]): T => items[below(items.length)]!
  return { next, below, pick }
}

// Few symbols, so that literals and patterns hit often; with case orbits, astral and reserved ones.
export const ALPHABET = [
  ...'abAB',
  ...'sSſkKK',
  ...'受理预算中文',
  ...'σςΣ',
  ' ',
  '\n',
  '😀',
  '\u0001',
  '\u0002',
  '\u0003',
  'u',
  'm',
  '1',
] as const

export function randomText(rng: ReturnType<typeof random>, max: number): string {
  let text = ''
  for (let n = rng.below(max + 1); n > 0; n -= 1) text += rng.pick(ALPHABET)
  return text
}
