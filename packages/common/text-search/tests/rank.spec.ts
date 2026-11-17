import { describe, expect, it } from 'vitest'
import { buildCorpus, rank } from '../src/index.ts'

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
      expect(() => rank(corpus, 'apple', { ...params, ...bad })).toThrow(TypeError)
    expect(rank(corpus, 'apple', { k1: 2, b: 0 })).toEqual(['alpha', 'charlie'])
    expect(rank(corpus, 'apple', { k1: 2, b: 1 })).toEqual(['alpha', 'charlie'])
  })
})
