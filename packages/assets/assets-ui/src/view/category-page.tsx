import type { AssetStandingView } from '@omne-harness/assets-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import {
  Button,
  EmptyState,
  FactList,
  FactRow,
  InlineConfirm,
  InlineNotice,
  LoadingState,
} from '@omne-harness/ui-kit'
import { useEffect, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { Action, Described } from '../model/assets-machine.ts'
import type {
  AssetEntry,
  CategoryAssets,
  CategoryGovernance,
  GovernanceModel,
} from '../model/governance.ts'
import { CreateForm } from './create-form.tsx'
import { NoticeLine } from './notice.tsx'
import { RowView } from './setting-row.tsx'

export type Extras = Readonly<{
  label: (category: string) => string
  categorySlot: (category: string) => ReactNode
  holdingSlot: (category: string, name: string) => ReactNode
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
  const [creating, setCreating] = useState(false)
  const retry = { label: '重试', onClick: view.read }
  const creation =
    snapshot.kind === 'read' && snapshot.creation?.kind !== 'none' ? snapshot.creation : null
  const listed = (name: string) =>
    snapshot.kind === 'read' &&
    snapshot.assets.kind === 'read' &&
    snapshot.assets.entries.some(entry => entry.row.name === name)
  return (
    <div className="assets-category">
      <header className="assets-category-head">
        <h2 className="assets-category-title">{extras.label(category)}</h2>
        {creation !== null && (
          <Button
            variant={creating ? 'ghost' : 'outline'}
            aria-expanded={creating}
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
        <AssetList assets={snapshot.assets} view={view} category={category} extras={extras} />
      )}
    </div>
  )
}

function AssetList({ assets, ...shown }: Shown & { readonly assets: CategoryAssets }) {
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
        <ul className="assets-list" aria-label={`${shown.extras.label(shown.category)}的资产`}>
          {assets.entries.map(entry => (
            <AssetItem key={entry.row.name} entry={entry} {...shown} />
          ))}
        </ul>
      )}
    </>
  )
}

const shortVersion = (version: string): string => version.slice(0, 19)

function AssetItem({ entry, view, category, extras }: Shown & { readonly entry: AssetEntry }) {
  const { row } = entry
  const opened = entry.detail !== null
  const toggle = () => (opened ? view.closeAsset(row.name) : view.openAsset(row.name))
  return (
    <li className="assets-item" aria-label={row.name}>
      <h3 className="assets-item-title">
        <Button variant="ghost" aria-expanded={opened} onClick={toggle}>
          {row.summary?.title ?? row.name}
        </Button>
      </h3>
      {row.summary !== null && <p className="assets-item-description">{row.summary.description}</p>}
      <p className="assets-item-facts">
        <span>{row.name}</span>
        <span>{shortVersion(row.version)}</span>
        <span>{row.enabled ? '已启用' : '已禁用'}</span>
        {row.origin === 'official' && <span>官方</span>}
      </p>
      {opened && <AssetDetail entry={entry} view={view} category={category} extras={extras} />}
    </li>
  )
}

function AssetDetail({ entry, view, category, extras }: Shown & { readonly entry: AssetEntry }) {
  const detail = entry.detail
  const name = entry.row.name
  const asset =
    detail?.kind === 'read' ? detail.asset : detail?.kind === 'reading' ? detail.shown : undefined
  return (
    <div className="assets-detail">
      {detail?.kind === 'reading' && asset === undefined && (
        <LoadingState label="正在读取这一份……" />
      )}
      {detail?.kind === 'absent' && (
        <NoticeLine notice={{ kind: 'refused', text: '这一份已经不在了。' }} />
      )}
      {detail?.kind === 'failed' && (
        <NoticeLine
          notice={detail.notice}
          action={{ label: '重试', onClick: () => view.openAsset(name) }}
        />
      )}
      {asset !== undefined && <AssetFacts asset={asset} />}
      <AssetActions entry={entry} view={view} />
      {entry.settings.length > 0 && (
        <ul className="assets-settings-list">
          {entry.settings.map(row => (
            <RowView key={row.key} row={row} driver={view} />
          ))}
        </ul>
      )}
      <div className="assets-holding-slot">{extras.holdingSlot(category, name)}</div>
    </div>
  )
}

const FILTERED: Readonly<Record<'disabled' | 'ineligible' | 'blocked', string>> = {
  disabled: '不在用：已禁用',
  ineligible: '不在用：不合这一层的使用条件',
  blocked: '不在用：被上层挡住',
}

function standingText(standing: AssetStandingView): string {
  switch (standing.kind) {
    case 'selected':
      return '在用'
    case 'filtered':
      return standing.by === null
        ? FILTERED[standing.reason]
        : `${FILTERED[standing.reason]}（${standing.by}）`
    case 'unavailable':
      return `不在用：${standing.layer} 这一层读不出`
  }
}

function AssetFacts({ asset }: { readonly asset: Described }) {
  const { item, content, standing } = asset
  return (
    <>
      <FactList className="assets-detail-facts">
        <FactRow term="版本">{item.version}</FactRow>
        <FactRow term="来源">{item.origin === 'official' ? '官方' : '本租户'}</FactRow>
        <FactRow term="现在能不能用">{standingText(standing)}</FactRow>
        {item.summary?.facts.map(fact => (
          <FactRow key={fact.name} term={fact.name}>
            {fact.text}
          </FactRow>
        ))}
      </FactList>
      {content.kind === 'data' ? (
        <pre className="assets-detail-data">{JSON.stringify(content.body, null, 2)}</pre>
      ) : (
        <ul className="assets-detail-files" aria-label="文件">
          {content.entries.map(file => (
            <li key={file.path}>
              <span>{file.path}</span>
              <span>{`${file.bytes} 字节`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const busy = (action: Action): boolean => action.kind === 'submitting' || action.kind === 'unknown'

function AssetActions({
  entry,
  view,
}: {
  readonly entry: AssetEntry
  readonly view: CategoryGovernance
}) {
  const { row, action } = entry
  return (
    <div className="assets-detail-actions">
      {row.origin === 'official' ? (
        <p>这一份是部署装的官方资产，不能停用或移除。</p>
      ) : (
        <>
          <Button
            variant="outline"
            disabled={busy(action)}
            onClick={() => view.setEnabled(row.name, !row.enabled)}
          >
            {row.enabled ? '禁用' : '启用'}
          </Button>
          <InlineConfirm
            tone="danger"
            confirmLabel="确认移除"
            consequence="移除不能撤销，这一份的设置也随之退出。"
            disabled={busy(action)}
            onConfirm={() => view.remove(row.name)}
          >
            移除
          </InlineConfirm>
        </>
      )}
      <ActionLine action={action} confirm={() => view.confirmAsset(row.name)} />
    </div>
  )
}

function ActionLine({
  action,
  confirm,
}: {
  readonly action: Action
  readonly confirm: () => void
}) {
  switch (action.kind) {
    case 'none':
      return null
    case 'submitting':
      return <LoadingState label="正在提交……" />
    case 'done':
      return (
        <InlineNotice tone="good">
          <p>{action.text}</p>
        </InlineNotice>
      )
    case 'refused':
      return <NoticeLine notice={action.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={action.notice}
          action={action.confirming ? undefined : { label: '认回', onClick: confirm }}
        />
      )
  }
}
