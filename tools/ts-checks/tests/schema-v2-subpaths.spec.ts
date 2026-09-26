import { describe, expect, it } from 'vitest'
import { CORE_PURE_DEPENDENCIES, PUBLIC_SUBPATHS, corePureImports } from '../src/index.ts'

const providers = [
  'content-blocks',
  'messages',
  'model-response',
  'loop-extension',
  'tool-definition',
  'asset-model',
]

describe('core-pure-imports — 精确旧冻结 v2 Schema 资源接线', () => {
  it('登记恰六个 schema/v2 入口；OE1 和 CB 中性 runtime 仍在原范围', () => {
    expect(
      Object.entries(PUBLIC_SUBPATHS)
        .filter(([, values]) => values.includes('schema/v2'))
        .map(([name]) => name)
        .sort(),
    ).toEqual([...providers].sort())
    expect(PUBLIC_SUBPATHS['offer-expiry']).toEqual(['schema/v1'])
    expect(PUBLIC_SUBPATHS['content-blocks']).toEqual(['schema-runtime', 'schema/v2'])
  })

  for (const provider of providers) {
    for (const [consumer, dependencies] of Object.entries(CORE_PURE_DEPENDENCIES)) {
      if (!dependencies.includes(provider)) continue
      it(`${consumer} 已批准依赖 ${provider} 时只接受精确 schema/v2`, () => {
        const path = `core/${consumer}/src/schema.ts`
        expect(
          corePureImports.check([
            { path, text: `import schema from '@omne-harness-lite/${provider}/schema/v2'` },
          ]),
        ).toEqual([])
        for (const suffix of [
          'schema/v1',
          'schema/v3',
          'schema/v20',
          'schema/v2/private',
          'schema/v2.json',
          'schema/v2/testing',
          'schema-testing',
          'src/schema/v2.ts',
          'dist/schema/v2.js',
        ])
          expect(
            corePureImports.check([
              { path, text: `import '@omne-harness-lite/${provider}/${suffix}'` },
            ]),
          ).toHaveLength(1)
      })
    }

    it(`${provider} 的精确子入口不新增依赖边，也不允许本包源码绕行自身公开入口`, () => {
      const consumer = Object.entries(CORE_PURE_DEPENDENCIES).find(
        ([, dependencies]) => !dependencies.includes(provider),
      )?.[0]
      if (consumer === undefined) throw new Error(`缺少 ${provider} 的禁止依赖负例`)
      for (const name of [consumer, provider])
        expect(
          corePureImports.check([
            {
              path: `core/${name}/src/schema.ts`,
              text: `import '@omne-harness-lite/${provider}/schema/v2'`,
            },
          ]),
        ).toHaveLength(1)
    })
  }

  it('model-response 无现行 core 依赖消费者，登记项存在不冒称已实际消费', () => {
    expect(
      Object.values(CORE_PURE_DEPENDENCIES).some(values => values.includes('model-response')),
    ).toBe(false)
  })
})
