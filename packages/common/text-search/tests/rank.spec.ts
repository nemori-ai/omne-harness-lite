import { describe, expect, it } from 'vitest'
import { buildCorpus, rank, tokenize } from '../src/index.ts'

const params = { k1: 1.2, b: 0.75 }
const docs = [
  { name: 'alpha', fields: ['apple'] },
  { name: 'bravo', fields: ['pear pear pear'] },
  { name: 'charlie', fields: ['apple pear'] },
]

describe('rank', () => {
  it('orders by BM25 score with positive IDF and deduplicated query tokens', () => {
    const corpus = buildCorpus(docs)
    expect(rank(corpus, 'apple pear', params)).toEqual(['charlie', 'bravo', 'alpha'])
    expect(rank(corpus, 'apple apple pear', params)).toEqual(rank(corpus, 'apple pear', params))
  })
  it('breaks ties by the code units of the name', () => {
    const corpus = buildCorpus([
      { name: 'z', fields: ['词'] },
      { name: 'a', fields: ['词'] },
    ])
    expect(rank(corpus, '词', params)).toEqual(['a', 'z'])
  })
  it('gives every document ordered by name for a blank query', () => {
    expect(rank(buildCorpus(docs.toReversed()), ' \n', params)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ])
  })
  it('leaves out documents whose score is zero', () => {
    expect(rank(buildCorpus(docs), 'pear', params)).toEqual(['bravo', 'charlie'])
    expect(rank(buildCorpus(docs), 'plum', params)).toEqual([])
  })
  it('matches a Chinese query that shares characters with a name', () => {
    const corpus = buildCorpus([
      { name: '生成周报', fields: ['生成周报', '每周五汇总本周的工作'] },
      { name: '整理发票', fields: ['整理发票', '把发票按月归档'] },
    ])
    expect(rank(corpus, '帮我出周报', params)).toEqual(['生成周报'])
  })
  it('counts every field of a document and its length', () => {
    const corpus = buildCorpus([
      { name: 'long', fields: ['apple', 'pear plum fig kiwi lime'] },
      { name: 'short', fields: ['apple'] },
      { name: 'other', fields: ['fig'] },
    ])
    expect(rank(corpus, 'apple', params)).toEqual(['short', 'long'])
    expect(rank(corpus, 'kiwi', params)).toEqual(['long'])
  })
  it('gives an empty answer for an empty corpus', () => {
    expect(rank(buildCorpus([]), 'apple', params)).toEqual([])
    expect(rank(buildCorpus([]), '', params)).toEqual([])
  })
  it('rejects invalid scoring parameters as a caller error', () => {
    const corpus = buildCorpus(docs)
    for (const bad of [{ k1: 0 }, { k1: Infinity }, { b: -1 }, { b: 1.1 }, { b: NaN }])
      expect(() => rank(corpus, 'apple', { ...params, ...bad })).toThrow(
        new TypeError('invalid ranking parameters'),
      )
    expect(rank(corpus, 'apple', { k1: 2, b: 0 })).toEqual(['alpha', 'charlie'])
    expect(rank(corpus, 'apple', { k1: 2, b: 1 })).toEqual(['alpha', 'charlie'])
  })
  it('agrees with the BM25 formula of the rule on generated corpora, ties included', () => {
    let state = 20261117
    const next = (n: number) => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state % n
    }
    const vocabulary = ['apple', 'pear', 'plum', 'fig', 'kiwi', 'lime']
    const words = (most: number) =>
      Array.from({ length: next(most + 1) }, () => vocabulary[next(vocabulary.length)]).join(' ')
    const settings = [
      { k1: 1.2, b: 0.75 },
      { k1: 0.5, b: 0 },
      { k1: 2, b: 1 },
      { k1: 0.9, b: 0.4 },
    ]
    for (let round = 0; round < 400; round += 1) {
      const names = ['d', 'b', 'f', 'a', 'e', 'c'].slice(0, 1 + next(6))
      const documents = names
        .toSorted(() => next(3) - 1)
        .map(name => ({
          name,
          fields: Array.from({ length: 1 + next(2) }, () => words(5)),
        }))
      const query = next(5) === 0 ? ' ' : words(3)
      const setting = settings[next(settings.length)] ?? params
      expect(rank(buildCorpus(documents), query, setting)).toEqual(
        expected(documents, query, setting),
      )
    }
  })
})

function expected(
  documents: readonly { name: string; fields: readonly string[] }[],
  query: string,
  { k1, b }: { k1: number; b: number },
): readonly string[] {
  const tokens = documents.map(document => document.fields.flatMap(field => tokenize(field)))
  const average = tokens.reduce((total, list) => total + list.length, 0) / documents.length
  const terms = [...new Set(tokenize(query))]
  return documents
    .map((document, index) => {
      const own = tokens[index] ?? []
      let score = 0
      for (const term of terms) {
        const f = own.filter(token => token === term).length
        if (f === 0) continue
        const df = tokens.filter(list => list.includes(term)).length
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5))
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * own.length) / average))
      }
      return { name: document.name, score }
    })
    .filter(entry => query.trim() === '' || entry.score > 0)
    .sort((x, y) => y.score - x.score || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
    .map(entry => entry.name)
}
