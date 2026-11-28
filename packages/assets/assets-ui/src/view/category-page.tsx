import type { TenantId } from '@omne-harness/public-contract'
import {
  Button,
  EmptyState,
  GlideMenu,
  ListReadingRow,
  LoadingState,
  StatusPill,
} from '@omne-harness/ui-kit'
import { useEffect, useRef, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type {
  AssetEntry,
  CategoryAssets,
  CategoryGovernance,
  GovernanceModel,
} from '../model/governance.ts'
import type { HoldingClaims } from '../model/holding-claims.ts'
import { lacksKey } from '../model/missing-key.ts'
import {
  assetsCategory,
  assetsCategoryCreate,
  assetsCategoryHead,
  assetsItem,
  assetsList,
} from '../parts.ts'
import { AssetPage } from './asset-page.tsx'
import { BroughtPage, bringerOf } from './brought-page.tsx'
import { CreateForm } from './create-form.tsx'
import { NoticeLine } from './notice.tsx'

export type Extras = Readonly<{
  label: (category: string) => string
  categorySlot: (category: string) => ReactNode
  holdingSlot: (category: string, name: string) => ReactNode
  claims: HoldingClaims
  open: (category: string, name: string) => void
}>

type CategoryPageProps = Readonly<{
  governance: GovernanceModel
  tenant: TenantId
  category: string
  extras: Extras
}>

function useView(governance: GovernanceModel, tenant: TenantId, category: string) {
  const [view, setView] = useState<CategoryGovernance | null>(null)
  useEffect(() => {
    const opened = governance.open(tenant, category)
    setView(opened)
    return opened.close
  }, [governance, tenant, category])
  return view
}

/** The generic page of one category: everything comes through the governance port. */
export function CategoryPage({ governance, tenant, category, extras }: CategoryPageProps) {
  const view = useView(governance, tenant, category)
  return view === null ? null : <CategoryBody view={view} category={category} extras={extras} />
}

type Shown = Readonly<{ view: CategoryGovernance; category: string; extras: Extras }>

const LIST_PARTIAL = {
  kind: 'unavailable',
  text: '列表不全：有的来源暂时读不出，这里没有列全。',
} as const

function CategoryBody({ view, category, extras }: Shown): JSX.Element {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const claimLines = useSyncExternalStore(extras.claims.subscribe, () => extras.claims.of(category))
  const claimed = claimLines === '' ? [] : claimLines.split('\n')
  const [creating, setCreating] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const returnTo = useRef<string | null>(null)
  const retry = { label: '重试', onClick: view.read }
  const creation =
    snapshot.kind === 'read' && snapshot.creation?.kind !== 'none' ? snapshot.creation : null
  const entries =
    snapshot.kind === 'read' && snapshot.assets.kind === 'read' ? snapshot.assets.entries : null
  const entry = shown === null ? undefined : entries?.find(each => each.row.name === shown)
  const listed = (name: string) => entries?.some(each => each.row.name === name) ?? false
  // An asset that left the list (removed here or elsewhere) takes its page with it.
  useEffect(() => {
    if (shown === null || entries === null || entry !== undefined) return
    view.closeAsset(shown)
    setShown(null)
  }, [view, shown, entries, entry])
  useEffect(() => {
    const name = returnTo.current
    if (shown !== null || name === null) return
    returnTo.current = null
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-asset-row]') ?? []
    for (const row of rows) if (row.dataset['assetRow'] === name) row.focus()
  }, [shown])
  const enter = (name: string): void => {
    const brought = entries?.find(each => each.row.name === name)?.row.from !== undefined
    if (!brought) view.openAsset(name)
    setShown(name)
  }
  const leave = (): void => {
    if (shown === null) return
    if (entry?.row.from === undefined) view.closeAsset(shown)
    returnTo.current = shown
    setShown(null)
  }
  return (
    <div className="assets-category" {...assetsCategory.props}>
      <div ref={list} className="assets-category-list" hidden={entry !== undefined}>
        <header className="assets-category-head" {...assetsCategoryHead.props}>
          <h2 className="assets-category-title">{extras.label(category)}</h2>
          {creation !== null && (
            <Button
              variant={creating ? 'ghost' : 'outline'}
              aria-expanded={creating}
              {...assetsCategoryCreate.props}
              onClick={() => setCreating(open => !open)}
            >
              {creating ? '收起' : '新建'}
            </Button>
          )}
        </header>
        {creating && creation !== null && snapshot.kind === 'read' && (
          <CreateForm
            view={view}
            creation={creation}
            hint={snapshot.hint}
            creating={snapshot.creating}
            listed={listed}
          />
        )}
        <div className="assets-category-slot">{extras.categorySlot(category)}</div>
        {snapshot.kind === 'reading' && <LoadingState label="正在读取这一类的资产……" />}
        {snapshot.kind === 'unreadable' && <NoticeLine notice={snapshot.notice} action={retry} />}
        {snapshot.kind === 'read' && snapshot.partial && <NoticeLine notice={LIST_PARTIAL} />}
        {snapshot.kind === 'read' && (
          <AssetList
            assets={snapshot.assets}
            view={view}
            category={category}
            extras={extras}
            enter={enter}
          />
        )}
      </div>
      {entry !== undefined && entry.row.from !== undefined && (
        <BroughtPage
          entry={entry}
          from={bringerOf(entry.row.from, extras.label)}
          label={extras.label(category)}
          open={extras.open}
          onBack={leave}
        />
      )}
      {entry !== undefined && entry.row.from === undefined && (
        <AssetPage
          entry={entry}
          view={view}
          label={extras.label(category)}
          holding={extras.holdingSlot(category, entry.row.name)}
          claimed={claimed}
          onBack={leave}
        />
      )}
    </div>
  )
}

type Listing = Shown & { readonly enter: (name: string) => void }

function AssetList({ assets, ...shown }: Listing & { readonly assets: CategoryAssets }) {
  if (assets.kind === 'reading') return <LoadingState label="正在读取这一类的资产……" />
  if (assets.kind === 'unreadable')
    return (
      <NoticeLine notice={assets.notice} action={{ label: '重试', onClick: shown.view.read }} />
    )
  return (
    <>
      {assets.partial && <NoticeLine notice={LIST_PARTIAL} />}
      {assets.entries.length === 0 ? (
        <EmptyState title="这一类还没有资产。" />
      ) : (
        <GlideMenu>
          <ul
            className="assets-list"
            aria-label={`${shown.extras.label(shown.category)}的资产`}
            {...assetsList.props}
          >
            {assets.entries.map(entry => (
              <AssetItem
                key={entry.row.name}
                entry={entry}
                enter={shown.enter}
                label={shown.extras.label}
              />
            ))}
          </ul>
        </GlideMenu>
      )}
    </>
  )
}

/** One row: the title and its line, the facts worth seeing before going in; the whole row goes in. */
function AssetItem({
  entry,
  enter,
  label,
}: {
  readonly entry: AssetEntry
  readonly enter: (name: string) => void
  readonly label: (category: string) => string
}) {
  const { row } = entry
  const from = row.from === undefined ? undefined : bringerOf(row.from, label)
  const marks = [!row.enabled && '已禁用', row.origin === 'official' && '官方'].filter(
    mark => mark !== false,
  )
  const missing = lacksKey(entry.settings)
  return (
    <li className="assets-item" aria-label={row.name} {...assetsItem.props}>
      <ListReadingRow
        data-asset-row={row.name}
        title={row.summary?.title ?? row.name}
        {...(from !== undefined && { facts: `来自 ${from.title}「${from.name}」` })}
        {...(row.from === undefined &&
          row.summary !== null &&
          row.summary.description !== '' && { facts: row.summary.description })}
        {...((marks.length > 0 || missing) && {
          time: (
            <span className="assets-item-marks">
              {marks.map(mark => (
                <StatusPill key={mark} tone="neutral">
                  {mark}
                </StatusPill>
              ))}
              {missing && <StatusPill tone="caution">还没填密钥</StatusPill>}
            </span>
          ),
        })}
        onSelect={() => enter(row.name)}
      />
    </li>
  )
}
