import type { AssetRowView, SettingView } from '@omne-harness/assets-protocol'
import type { FakeClient } from './fake-client.ts'

export const assetRow = (category: string, name: string): AssetRowView => ({
  category,
  name,
  version: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  selection: 'follow',
  enabled: true,
  holding: `held-${category}-${name}`,
  origin: 'customized',
  summary: null,
})

/** The assets the settings belong to, in the order they first appear, plus any given rows. */
export function assetsOf(
  settings: readonly SettingView[],
  extra: readonly AssetRowView[] = [],
): readonly AssetRowView[] {
  const rows: AssetRowView[] = []
  for (const view of settings) {
    if (view.owner.kind !== 'asset') continue
    const { category, name } = view.owner
    if (!rows.some(row => row.category === category && row.name === name))
      rows.push(assetRow(category, name))
  }
  return [...rows, ...extra]
}

/** Every category the settings and rows name, each named by its identifier unless names says. */
export function categoriesOf(
  rows: readonly AssetRowView[],
  names: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  return { ...Object.fromEntries(rows.map(row => [row.category, row.category])), ...names }
}

function serve(
  fake: FakeClient,
  operation: 'list-assets' | 'describe-category' | 'describe-asset',
  reply: (body: Record<string, unknown>) => unknown,
) {
  void (async () => {
    for (;;) {
      const call = await fake.next(operation)
      call.answer(reply(call.body as Record<string, unknown>))
    }
  })()
}

const described = (row: AssetRowView): unknown => ({
  item: row,
  revision: 1,
  content: { kind: 'directory', entries: [{ path: 'SKILL.md', bytes: 9 }] },
  standing: { kind: 'selected' },
  settings: false,
})

type Creation = Readonly<{ detail: unknown; hint: string | null }>

/** Answers every read of the asset list, of a category and of one asset from these rows. */
export function serveAssetReads(
  fake: FakeClient,
  rows: readonly AssetRowView[],
  describe: (row: AssetRowView) => unknown = described,
  creationOf?: Creation | ((category: string) => Creation | undefined),
): void {
  serve(fake, 'list-assets', body => ({
    outcome: 'succeeded',
    body: {
      items: rows.filter(row => row.category === body['category']),
      next: null,
      completeness: 'complete',
    },
  }))
  serve(fake, 'describe-category', body => {
    const category = String(body['category'])
    const creation = typeof creationOf === 'function' ? creationOf(category) : creationOf
    return {
      outcome: 'succeeded',
      body: {
        category,
        title: category,
        summary: '',
        hint: creation?.hint ?? null,
        creation: creation?.detail ?? { kind: 'none' },
      },
    }
  })
  serve(fake, 'describe-asset', body => {
    const row = rows.find(item => item.category === body['category'] && item.name === body['name'])
    if (row === undefined) return { outcome: 'not-found', body: {} }
    return { outcome: 'succeeded', body: describe(row) }
  })
}
