import type { Context } from '@deepseek-ai/cordis'
import {
  heldPoint,
  type BodyContract,
  type CategoryContribution,
  type PackageLayout,
} from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { SettingDefinitionsSchema } from '@omne-harness/settings'
import { defineRow } from '../../../src/row.ts'
import type { AddedRow } from '../../support/release-tree.ts'

/** Two categories that exist only in tests: what the release adds, a deployment can add too. */
export const FIXTURE = 'fixture'
export const FIXTURE_BUNDLE = 'fixture-bundle'

const DATA_SCHEMA = {
  type: 'object',
  properties: { endpoint: { type: 'string', title: '地址' } },
  required: ['endpoint'],
} as const

function json(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(json) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, item]) => ({ key, value: json(item) })),
  }
}

function stringField(body: unknown, key: string): string | undefined {
  const value = body as JsonValue
  if (value.kind !== 'object') return undefined
  const found = value.entries.find(entry => entry.key === key)?.value
  return found?.kind === 'string' ? found.value : undefined
}

function preferences(version: string) {
  return SettingDefinitionsSchema.parse({
    providerId: FIXTURE,
    definitionId: 'preferences',
    version,
    groups: [
      { id: 'general', parentId: null, title: '常用', description: '测试类别的设置', order: 0 },
    ],
    items: [
      {
        id: 'region',
        groupId: 'general',
        category: 'preference',
        presentation: {
          title: '区域',
          description: '请求发到哪个区域',
          impact: '下一次读取时生效',
          clear: '回到缺省',
          adoption: 'next-read',
          enumLabels: [
            { value: 'east', title: '东', description: '东区' },
            { value: 'west', title: '西', description: '西区' },
          ],
        },
        valueSchema: { type: 'string', enum: ['east', 'west'] },
        default: { kind: 'value', value: 'east' },
        merge: 'override',
        sensitivity: 'ordinary',
      },
      {
        id: 'retries',
        groupId: 'general',
        category: 'preference',
        presentation: {
          title: '重试次数',
          description: '失败后最多再试几次',
          impact: '下一次读取时生效',
          clear: '回到缺省',
          adoption: 'next-read',
          unit: '次',
        },
        valueSchema: { type: 'integer', minimum: 0, maximum: 5 },
        default: { kind: 'value', value: 1 },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  })
}

const dataContract: BodyContract = {
  category: FIXTURE,
  schema: json(DATA_SCHEMA),
  judge: body =>
    stringField(body, 'endpoint') === undefined
      ? { ok: false, rejected: 'endpoint' }
      : { ok: true },
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
  settings: (_body, context) => preferences(context?.definition ?? '1'),
  summarize: body => ({
    title: stringField(body, 'endpoint') ?? '',
    description: '只在测试里的数据型类别',
    facts: [{ name: '地址', text: stringField(body, 'endpoint') ?? '' }],
  }),
}

const README = 'README.md'

const bundleLayout: PackageLayout = {
  namespace: FIXTURE_BUNDLE,
  limits: { files: 4, fileBytes: 1024, totalBytes: 2048 },
  async inspect(pkg) {
    const manifest = await pkg.manifest()
    if (!('ok' in manifest)) return fail({ kind: 'source-failed', failure: manifest.failure })
    const readme = manifest.ok.entries.find(entry => entry.path === README)
    if (readme === undefined) return fail({ kind: 'invalid-package', reason: 'no README.md' })
    const opened = await pkg.open(readme.path, readme.digest)
    if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
    return succeed(
      json({ readme: new TextDecoder().decode(opened.ok), files: manifest.ok.entries.length }),
    )
  },
}

const bundleContract: BodyContract = {
  category: FIXTURE_BUNDLE,
  schema: json({ type: 'object', properties: { readme: { type: 'string' } } }),
  layout: bundleLayout,
  judge: body =>
    stringField(body, 'readme') === undefined ? { ok: false, rejected: 'readme' } : { ok: true },
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
}

export const FIXTURE_CATEGORIES: readonly CategoryContribution[] = [
  {
    contract: dataContract,
    display: {
      title: '测试数据',
      summary: '只在测试里的数据型类别，带两项设置。',
      creation: '填一个地址。',
    },
    point: 'test.site4',
  },
  {
    contract: bundleContract,
    display: {
      title: '测试包',
      summary: '只在测试里的目录型类别。',
      creation: '一个目录，根下有 README.md。',
    },
    point: 'test.site3',
  },
]

const fixtureCategoriesRow = defineRow({
  row: 'fixture-categories',
  implementation: 'real',
  manifest: { provides: [], injects: [assetCategoriesKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'fixture-categories',
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      for (const contribution of FIXTURE_CATEGORIES)
        ctx.assetCategories.contribute(
          contribution,
          heldPoint({ name: contribution.point, key: 'the item name', summary: 'Held items.' }),
        )
    },
  },
})

export const FIXTURE_ROW: AddedRow = {
  id: 'fixture-categories',
  plugin: 'fixtureCategoriesRow',
  config: {},
  definition: fixtureCategoriesRow,
}
