import { tokenize } from './tokenize.ts'

export type SearchDocument = Readonly<{ name: string; fields: readonly string[] }>

export type RankingParameters = Readonly<{ k1: number; b: number }>

type IndexedDocument = Readonly<{
  name: string
  terms: ReadonlyMap<string, number>
  length: number
}>

export type Corpus = Readonly<{
  documents: readonly IndexedDocument[]
  frequencies: ReadonlyMap<string, number>
  averageLength: number
}>

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function buildCorpus(documents: readonly SearchDocument[]): Corpus {
  const frequencies = new Map<string, number>()
  const indexed = documents.map(document => {
    const terms = new Map<string, number>()
    const tokens = document.fields.flatMap(field => tokenize(field))
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
  params: RankingParameters,
): number {
  let total = 0
  for (const token of tokens) {
    const frequency = document.terms.get(token) ?? 0
    if (frequency === 0) continue
    const df = corpus.frequencies.get(token) ?? 0
    const idf = Math.log(1 + (corpus.documents.length - df + 0.5) / (df + 0.5))
    const length = 1 - params.b + (params.b * document.length) / corpus.averageLength
    total += (idf * frequency * (params.k1 + 1)) / (frequency + params.k1 * length)
  }
  return total
}

function assertParameters(params: RankingParameters): void {
  if (
    !Number.isFinite(params.k1) ||
    params.k1 <= 0 ||
    !Number.isFinite(params.b) ||
    params.b < 0 ||
    params.b > 1
  )
    throw new TypeError('invalid ranking parameters')
}

export function rank(corpus: Corpus, query: string, params: RankingParameters): readonly string[] {
  assertParameters(params)
  const tokens = [...new Set(tokenize(query))]
  const blank = query.trim() === ''
  return corpus.documents
    .map(document => ({ name: document.name, score: score(document, corpus, tokens, params) }))
    .filter(entry => blank || entry.score > 0)
    .sort((a, b) => b.score - a.score || byCodeUnits(a.name, b.name))
    .map(entry => entry.name)
}
