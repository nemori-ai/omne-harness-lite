import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  onReleaseTreeRuns,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { FIXTURE, FIXTURE_BUNDLE, FIXTURE_ROW } from './fixture-categories.ts'

type Assets = ProtocolClients['assets']

const README = '# Pack\n\nA bundle that exists only in tests.\n'
const ALPHA = { kind: 'asset', category: FIXTURE, name: 'alpha' } as const
const ALPHA_SCOPE = { kind: 'asset', asset: { category: FIXTURE, name: 'alpha' } } as const
const text = (value: string) => ({ kind: 'string', value }) as const
const ALPHA_BODY = {
  kind: 'object',
  entries: [{ key: 'endpoint', value: text('https://a.example') }],
} as const

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

async function uploadPack(assets: Assets, tenant: TenantId) {
  const bytes = new TextEncoder().encode(README)
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation: 'pack-1',
    category: FIXTURE_BUNDLE,
    name: 'pack',
    manifest: [{ path: 'README.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${begun.outcome}`)
  const sent = await assets['append-asset-upload']({
    tenant,
    upload: 'pack-1',
    path: 'README.md',
    offset: 0,
    bytes,
  })
  if (sent.outcome !== 'succeeded') throw new Error(`append: ${sent.outcome}`)
  return assets['commit-asset-upload']({ tenant, upload: 'pack-1' })
}

const context = (tree: ReleaseTree) => {
  const tenantText = savedTenant(tree.home)
  return { assets: tree.clients.assets, tenantText, tenant: tenantOf(tenantText) }
}

async function revisionOf(assets: Assets, tenant: TenantId, item: string): Promise<string> {
  const described = await assets['describe-setting']({ tenant, owner: ALPHA, item })
  if (described.outcome !== 'succeeded') throw new Error(`describe ${item}: ${described.outcome}`)
  return described.body.item.revision
}

async function categoriesAndAssets(assets: Assets, tenant: TenantId) {
  const categories = await assets['list-categories']({ after: null, limit: 100 })
  if (categories.outcome !== 'succeeded') throw new Error(categories.outcome)
  expect(categories.body.items.map(item => [item.category, item.creation])).toEqual([
    ['AgentDefinition', 'directory'],
    ['converter', 'data'],
    [FIXTURE, 'data'],
    [FIXTURE_BUNDLE, 'directory'],
    ['mcp', 'data'],
    ['model-provider', 'none'],
    ['plugin', 'directory'],
    ['prompt', 'directory'],
    ['skill', 'directory'],
    ['tool', 'directory'],
  ])
  expect(await assets['describe-category']({ category: FIXTURE })).toMatchObject({
    outcome: 'succeeded',
    body: { title: '测试数据', hint: '填一个地址。', creation: { kind: 'data' } },
  })
  expect(await assets['describe-category']({ category: FIXTURE_BUNDLE })).toMatchObject({
    outcome: 'succeeded',
    body: {
      creation: { kind: 'directory', limits: { files: 4, fileBytes: 1024, totalBytes: 2048 } },
    },
  })

  const create = (operation: string, body: unknown) =>
    assets['create-asset']({
      tenant,
      operation,
      category: FIXTURE,
      name: 'alpha',
      body: body as never,
    })
  expect(await create('alpha-0', { kind: 'object', entries: [] })).toMatchObject({
    outcome: 'invalid',
  })
  const alpha = await create('alpha-1', ALPHA_BODY)
  if (alpha.outcome !== 'succeeded') throw new Error(`create: ${JSON.stringify(alpha)}`)
  expect(
    await assets['query-asset-operation']({
      tenant,
      operation: 'alpha-1',
      request: { kind: 'create-asset', category: FIXTURE, name: 'alpha', body: ALPHA_BODY },
    }),
  ).toEqual(alpha)
  const pack = await uploadPack(assets, tenant)
  if (pack.outcome !== 'succeeded') throw new Error(`commit: ${pack.outcome}`)

  const listed = async (category: string) => {
    const page = await assets['list-assets']({ tenant, category, after: null, limit: 10 })
    return page.outcome === 'succeeded' ? page.body.items.map(item => item.name) : []
  }
  expect(await listed(FIXTURE)).toEqual(['alpha'])
  expect(await listed(FIXTURE_BUNDLE)).toEqual(['pack'])
  expect(
    await assets['describe-asset']({ tenant, category: FIXTURE, name: 'alpha' }),
  ).toMatchObject({
    outcome: 'succeeded',
    body: {
      item: { summary: { facts: [{ name: '地址', text: 'https://a.example' }] } },
      content: { kind: 'data' },
      standing: { kind: 'selected' },
      settings: true,
    },
  })
  const describePack = () =>
    assets['describe-asset']({ tenant, category: FIXTURE_BUNDLE, name: 'pack' })
  expect(await describePack()).toMatchObject({
    outcome: 'succeeded',
    body: { content: { kind: 'directory', entries: [{ path: 'README.md' }] } },
  })

  const toggle = (operation: string, enabled: boolean) =>
    assets['set-asset-enabled']({ tenant, operation, holding: pack.body.holding, enabled })
  expect(await toggle('pack-off', false)).toMatchObject({ outcome: 'succeeded' })
  expect(await describePack()).toMatchObject({
    body: { standing: { kind: 'filtered', reason: 'disabled' } },
  })
  expect(await toggle('pack-on', true)).toMatchObject({ outcome: 'succeeded' })
  expect(
    await assets['remove-asset']({ tenant, operation: 'pack-rm', holding: pack.body.holding }),
  ).toMatchObject({ outcome: 'succeeded' })
  expect(await listed(FIXTURE_BUNDLE)).toEqual([])
}

async function settingsWrittenAndCleared(assets: Assets, tenant: TenantId, tenantText: string) {
  const scoped = await assets['list-settings']({
    tenant,
    scope: ALPHA_SCOPE,
    after: null,
    limit: 100,
  })
  if (scoped.outcome !== 'succeeded') throw new Error(`list: ${scoped.outcome}`)
  expect(scoped.body).toMatchObject({ completeness: 'complete', next: null })
  expect(scoped.body.items.map(item => item.item).sort()).toEqual(['region', 'retries'])
  const all = await assets['list-settings']({
    tenant,
    scope: { kind: 'asset' },
    after: null,
    limit: 100,
  })
  if (all.outcome !== 'succeeded') throw new Error(`list all: ${all.outcome}`)
  expect(all.body.completeness).toBe('complete')
  expect(
    all.body.items
      .filter(item => item.owner.kind === 'asset' && item.owner.category === FIXTURE)
      .map(item => item.item)
      .sort(),
  ).toEqual(['region', 'retries'])

  const region = await revisionOf(assets, tenant, 'region')
  const setRegion = () =>
    assets['set-setting']({
      tenant,
      owner: ALPHA,
      item: 'region',
      operation: 'set-region',
      expectedRevision: region,
      value: { kind: 'ordinary', value: text('west') },
    })
  const first = await setRegion()
  if (first.outcome !== 'succeeded') throw new Error(`set: ${first.outcome}`)
  expect(await setRegion()).toEqual(first)
  expect(await revisionOf(assets, tenant, 'region')).toBe(first.body.revision)

  expect(
    await assets['set-setting']({
      tenant,
      owner: ALPHA,
      item: 'retries',
      operation: 'set-retries',
      expectedRevision: await revisionOf(assets, tenant, 'retries'),
      value: { kind: 'ordinary', value: { kind: 'number', lexeme: '3' } },
    }),
  ).toMatchObject({ outcome: 'succeeded' })
  expect(
    await assets['clear-setting']({
      tenant,
      owner: ALPHA,
      item: 'retries',
      operation: 'clear-retries',
      expectedRevision: await revisionOf(assets, tenant, 'retries'),
    }),
  ).toMatchObject({ outcome: 'succeeded' })
  expect(await assets['describe-setting']({ tenant, owner: ALPHA, item: 'retries' })).toMatchObject(
    {
      outcome: 'succeeded',
      body: {
        item: {
          own: { kind: 'unset' },
          effective: { value: { kind: 'set', value: { kind: 'number', lexeme: '1' } } },
        },
      },
    },
  )

  const foreign = tenantOf(foreignTenant(tenantText))
  expect(
    await assets['describe-setting']({ tenant: foreign, owner: ALPHA, item: 'region' }),
  ).toMatchObject({ outcome: 'denied' })
  expect(
    await assets['set-setting']({
      tenant: foreign,
      owner: ALPHA,
      item: 'region',
      operation: 'foreign-set',
      expectedRevision: first.body.revision,
      value: { kind: 'ordinary', value: text('east') },
    }),
  ).toMatchObject({ outcome: 'denied' })
}

describe('two categories that exist only in tests, added by one row of the assembly', () => {
  it(
    'are listed, created, read, disabled, enabled and removed; the data one has two settings that are written, kept across a restart, cleared, and gone with the holding',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCodes = await onReleaseTreeRuns(
        { script: toolCallsThenText(() => []), addedRows: [FIXTURE_ROW] },
        [
          async tree => {
            await settledSession(tree, 'hello')
            const { assets, tenantText, tenant } = context(tree)
            await categoriesAndAssets(assets, tenant)
            await settingsWrittenAndCleared(assets, tenant, tenantText)
          },
          async tree => {
            const { assets, tenant } = context(tree)
            const region = await pollUntil(
              'the settings of the tenant to be readable after the restart',
              () => assets['describe-setting']({ tenant, owner: ALPHA, item: 'region' }),
              answer => answer.outcome !== 'basis-unavailable',
            )
            expect(region).toMatchObject({
              outcome: 'succeeded',
              body: { item: { own: { kind: 'set', value: text('west') } } },
            })
            const page = await assets['list-assets']({
              tenant,
              category: FIXTURE,
              after: null,
              limit: 10,
            })
            if (page.outcome !== 'succeeded') throw new Error(page.outcome)
            const holding = page.body.items[0]?.holding ?? ''
            expect(
              await assets['remove-asset']({ tenant, operation: 'alpha-rm', holding }),
            ).toMatchObject({ outcome: 'succeeded' })
            expect(
              await assets['describe-setting']({ tenant, owner: ALPHA, item: 'region' }),
            ).toMatchObject({ outcome: 'not-visible' })
            expect(
              await assets['list-settings']({
                tenant,
                scope: ALPHA_SCOPE,
                after: null,
                limit: 100,
              }),
            ).toMatchObject({ outcome: 'succeeded', body: { items: [] } })
          },
        ],
      )
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
