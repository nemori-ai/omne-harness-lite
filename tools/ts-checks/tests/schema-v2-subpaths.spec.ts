import { describe, expect, it } from 'vitest'
import { CORE_PURE_DEPENDENCIES, PUBLIC_SUBPATHS, corePureImports } from '../src/index.ts'

const providers = [
  'content-blocks',
  'messages',
  'model-profile',
  'model-response',
  'loop-extension',
  'tool-definition',
  'asset-model',
  'skill-package',
]

describe('core-pure-imports — 精确旧冻结 v2 Schema 资源接线', () => {
  it('登记八个已采用 schema/v2 入口；OE1 和 CB 中性 runtime 仍在原范围', () => {
    expect(
      Object.entries(PUBLIC_SUBPATHS)
        .filter(([, values]) => values.includes('schema/v2'))
        .map(([name]) => name)
        .sort(),
    ).toEqual([...providers].sort())
    expect(PUBLIC_SUBPATHS['offer-expiry']).toEqual(['schema/v1'])
    expect(PUBLIC_SUBPATHS['content-blocks']).toEqual(['schema-runtime', 'schema/v2'])
    expect(PUBLIC_SUBPATHS['skill-package']).toEqual(['v2', 'schema/v2'])
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
          'schema/v99',
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

    it(`${provider} 的精确子入口不新增依赖边，自有保留资源仅沿已采用节点`, () => {
      const consumer = Object.entries(CORE_PURE_DEPENDENCIES).find(
        ([, dependencies]) => !dependencies.includes(provider),
      )?.[0]
      if (consumer === undefined) throw new Error(`缺少 ${provider} 的禁止依赖负例`)
      expect(
        corePureImports.check([
          {
            path: `core/${consumer}/src/schema.ts`,
            text: `import '@omne-harness-lite/${provider}/schema/v2'`,
          },
        ]),
      ).toHaveLength(1)
      expect(
        corePureImports.check([
          {
            path: `core/${provider}/src/schema.ts`,
            text: `import '@omne-harness-lite/${provider}/schema/v2'`,
          },
        ]),
      ).toHaveLength(
        [
          'asset-model',
          'skill-package',
          'messages',
          'model-profile',
          'model-response',
          'loop-extension',
        ].includes(provider)
          ? 0
          : 1,
      )
    })

    it(`${provider} 的本包相邻资源路径仍禁止`, () => {
      for (const suffix of ['schema/v99', 'schema/v20', 'schema/v2/private', 'src/schema/v2.ts'])
        expect(
          corePureImports.check([
            {
              path: `core/${provider}/src/schema.ts`,
              text: `import '@omne-harness-lite/${provider}/${suffix}'`,
            },
          ]),
        ).toHaveLength(1)
    })
  }

  it('D071/D073 current owners may import their exact retained v3 resources but no adjacent or future version', () => {
    for (const provider of ['messages', 'model-response', 'loop-extension']) {
      const path = `core/${provider}/src/v3/schema.ts`
      expect(
        corePureImports.check([
          { path, text: `import '@omne-harness-lite/${provider}/schema/v3'` },
        ]),
      ).toEqual([])
      for (const suffix of [
        'schema/v4',
        'schema/v3/private',
        'schema/v3.json',
        'schema/v3/testing',
      ])
        expect(
          corePureImports.check([
            { path, text: `import '@omne-harness-lite/${provider}/${suffix}'` },
          ]),
        ).toHaveLength(1)
    }
  })

  for (const consumer of ['asset-evaluation', 'slash-command']) {
    it(`${consumer} accepts the exact adopted Skill2 value/body entry only`, () => {
      const path = `core/${consumer}/src/body.ts`
      expect(
        corePureImports.check([
          { path, text: "import { skillBodyContract } from '@omne-harness-lite/skill-package/v2'" },
        ]),
      ).toEqual([])
      for (const suffix of [
        'v1',
        'v3',
        'v20',
        'v2/private',
        'v2/testing',
        'v2.js',
        'src/v2.ts',
        'dist/v2.js',
      ])
        expect(
          corePureImports.check([
            { path, text: `import '@omne-harness-lite/skill-package/${suffix}'` },
          ]),
        ).toHaveLength(1)
    })
  }

  it('the Skill2 pure value entry does not grant new package dependency edges', () => {
    for (const consumer of ['content-blocks', 'messages', 'model-response', 'skill-package'])
      expect(
        corePureImports.check([
          {
            path: `core/${consumer}/src/body.ts`,
            text: "import '@omne-harness-lite/skill-package/v2'",
          },
        ]),
      ).toHaveLength(1)
  })

  it('model-response 无现行 core 依赖消费者，登记项存在不冒称已实际消费', () => {
    expect(
      Object.values(CORE_PURE_DEPENDENCIES).some(values => values.includes('model-response')),
    ).toBe(false)
  })
})
