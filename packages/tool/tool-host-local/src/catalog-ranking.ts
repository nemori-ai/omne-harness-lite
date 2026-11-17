import { createHash } from 'node:crypto'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { buildCorpus, rank, type Corpus, type SearchDocument } from '@omne-harness/text-search'

export type LocalToolCatalogSearchConfiguration = Readonly<{
  k1: number
  b: number
  maxCachedCorpora: number
}>

export const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function catalogDigest(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => byCodeUnits(a, b)))
    return item
  })
  return createHash('sha256').update(serialized).digest('hex')
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

function validateConfiguration(config: LocalToolCatalogSearchConfiguration): void {
  if (!Number.isSafeInteger(config.maxCachedCorpora) || config.maxCachedCorpora < 1)
    throw new TypeError('invalid catalog search configuration')
  rank(buildCorpus([]), '', config)
}

export function createCatalogRanking(
  configuration: LocalToolCatalogSearchConfiguration,
  build = buildCorpus,
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
    return { key, names: rank(corpus, query, config) }
  }
}
