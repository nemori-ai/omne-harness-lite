import { describe, expect, it } from 'vitest'
import {
  buildCatalogCorpus,
  createCatalogRanking,
  tokenizeCatalog,
} from '../src/catalog-ranking.ts'

const config = { k1: 1.2, b: 0.75, maxCachedCorpora: 2 }
const docs = [
  { name: 'alpha', fields: ['apple'] },
  { name: 'bravo', fields: ['pear pear pear'] },
  { name: 'charlie', fields: ['apple pear'] },
]
describe('catalog index', () => {
  it('uses positive IDF and deduplicated query tokens with deterministic identifier and Chinese segmentation', () => {
    expect(tokenizeCatalog('readFile read_file ＡＢＣ 中文工具')).toEqual([
      'read',
      'file',
      'readfile',
      'read',
      'file',
      'read_file',
      'abc',
      '中',
      '文',
      '工',
      '具',
      '中文',
      '文工',
      '工具',
    ])
    const rank = createCatalogRanking(config)
    expect(rank(docs, 'apple pear').names).toEqual(['charlie', 'bravo', 'alpha'])
    expect(rank(docs, 'apple apple pear').names).toEqual(rank(docs, 'apple pear').names)
    expect(
      rank(
        [
          { name: 'z', fields: ['词'] },
          { name: 'a', fields: ['词'] },
        ],
        '词',
      ).names,
    ).toEqual(['a', 'z'])
  })
  it('reuses only unchanged text structures and evicts the least recently used corpus', () => {
    let builds = 0
    const rank = createCatalogRanking(config, documents => {
      builds++
      return buildCatalogCorpus(documents)
    })
    rank(docs, 'apple')
    rank(docs, 'pear')
    expect(builds).toBe(1)
    const other = [{ name: 'other', fields: ['pear'] }]
    rank(other, 'pear')
    rank(docs, 'apple')
    rank([{ name: 'third', fields: ['apple'] }], 'apple')
    expect(builds).toBe(3)
    rank(other, 'pear')
    expect(builds).toBe(4)
    rank([{ name: 'other', fields: ['changed'] }], 'changed')
    expect(builds).toBe(5)
  })
  it('rejects invalid scoring and capacity configuration', () => {
    for (const options of [
      { k1: 0 },
      { k1: Infinity },
      { b: -1 },
      { b: 1.1 },
      { b: NaN },
      { maxCachedCorpora: 0 },
      { maxCachedCorpora: 1.5 },
      { maxCachedCorpora: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(() => createCatalogRanking({ ...config, ...options })).toThrow(TypeError)
  })
})
