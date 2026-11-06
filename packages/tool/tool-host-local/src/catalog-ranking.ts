import { createHash } from 'node:crypto'
import type { ToolDefinition } from '@omne-harness/tool-contract'

export type LocalToolCatalogSearchConfiguration = Readonly<{
  k1: number
  b: number
  maxCachedCorpora: number
}>

type SearchDocument = Readonly<{ name: string; fields: readonly string[] }>
type IndexedDocument = Readonly<{
  name: string
  terms: ReadonlyMap<string, number>
  length: number
}>
type Corpus = Readonly<{
  documents: readonly IndexedDocument[]
  frequencies: ReadonlyMap<string, number>
  averageLength: number
}>

export const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Canonical JSON data, including identity projections, hashed without retaining the input. */
export function catalogDigest(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => byCodeUnits(a, b)))
    return item
  })
  return createHash('sha256').update(serialized).digest('hex')
}

export function tokenizeCatalog(text: string): readonly string[] {
  const tokens: string[] = []
  for (const match of text
    .normalize('NFKC')
    .matchAll(/\p{Script=Han}+|(?:(?!\p{Script=Han})[\p{L}\p{N}_])+/gu)) {
    const word = match[0]
    if (/^\p{Script=Han}/u.test(word)) {
      const characters = [...word]
      tokens.push(...characters)
      let previous: string | undefined
      for (const character of characters) {
        if (previous !== undefined) tokens.push(previous + character)
        previous = character
      }
    } else {
      const full = word.toLowerCase()
      const parts = word
        .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/gu, '$1 $2')
        .split(/[_\s]+/u)
        .filter(Boolean)
        .map(part => part.toLowerCase())
      tokens.push(...parts)
      if (!parts.includes(full)) tokens.push(full)
    }
  }
  return tokens
}

export function catalogDocument(definition: ToolDefinition): SearchDocument {
  return {
    name: definition.name,
    fields: [
      definition.name,
      definition.description,
      ...(definition.kind === 'commands'
        ? definition.commands.flatMap(command => [command.name, command.summary])
        : []),
    ],
  }
}

export function buildCatalogCorpus(documents: readonly SearchDocument[]): Corpus {
  const frequencies = new Map<string, number>()
  const indexed = documents.map(document => {
    const terms = new Map<string, number>()
    const tokens = document.fields.flatMap(field => tokenizeCatalog(field))
    for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1)
    for (const token of terms.keys()) frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
    return Object.freeze({ name: document.name, terms, length: tokens.length })
  })
  return Object.freeze({
    documents: Object.freeze(indexed),
    frequencies,
    averageLength:
      indexed.length === 0
        ? 0
        : indexed.reduce((total, doc) => total + doc.length, 0) / indexed.length,
  })
}

function score(
  document: IndexedDocument,
  corpus: Corpus,
  tokens: readonly string[],
  config: LocalToolCatalogSearchConfiguration,
): number {
  let total = 0
  for (const token of tokens) {
    const frequency = document.terms.get(token) ?? 0
    if (frequency === 0) continue
    const df = corpus.frequencies.get(token) ?? 0
    const idf = Math.log(1 + (corpus.documents.length - df + 0.5) / (df + 0.5))
    const length = 1 - config.b + (config.b * document.length) / corpus.averageLength
    total += (idf * frequency * (config.k1 + 1)) / (frequency + config.k1 * length)
  }
  return total
}

function validateConfiguration(config: LocalToolCatalogSearchConfiguration): void {
  if (
    !Number.isFinite(config.k1) ||
    config.k1 <= 0 ||
    !Number.isFinite(config.b) ||
    config.b < 0 ||
    config.b > 1 ||
    !Number.isSafeInteger(config.maxCachedCorpora) ||
    config.maxCachedCorpora < 1
  )
    throw new TypeError('invalid catalog search configuration')
}

/** The cache owns only immutable numeric/text indexes, never current entries or access grants. */
export function createCatalogRanking(
  configuration: LocalToolCatalogSearchConfiguration,
  build = buildCatalogCorpus,
) {
  const config = Object.freeze({ ...configuration })
  validateConfiguration(config)
  const cache = new Map<string, Corpus>()
  return (documents: readonly SearchDocument[], query: string) => {
    const key = catalogDigest(['catalog-tokenizer-1', config, documents])
    let corpus = cache.get(key)
    if (corpus === undefined) corpus = build(documents)
    else cache.delete(key)
    cache.set(key, corpus)
    if (cache.size > config.maxCachedCorpora) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    const tokens = [...new Set(tokenizeCatalog(query))]
    const ranked = corpus.documents
      .map(document => ({ name: document.name, score: score(document, corpus, tokens, config) }))
      .filter(entry => query.trim() === '' || entry.score > 0)
      .sort((a, b) => b.score - a.score || byCodeUnits(a.name, b.name))
    return { key, names: ranked.map(entry => entry.name) }
  }
}
