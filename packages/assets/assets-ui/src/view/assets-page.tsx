import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { AttachedEntry, AttachedLayout } from '@omne-harness/shell-contract'
import { Button, EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { CategoryGovernance, CategorySnapshot, GovernanceModel } from '../model/governance.ts'
import type { Holding } from '../model/holdings.ts'
import { NoticeLine } from './notice.tsx'
import { RowView } from './setting-row.tsx'

export type AssetsPageProps = Readonly<{
  governance: GovernanceModel
  tenant: string
  categoryLabels?: Readonly<Record<string, string>>
  categorySlot?: (category: string) => ReactNode
  holdingSlot?: (category: string, name: string) => ReactNode
  pages?: (layout: AttachedLayout) => ReactNode
}>

type Extras = Readonly<{
  label: (category: string) => string
  categorySlot: (category: string) => ReactNode
  holdingSlot: (category: string, name: string) => ReactNode
}>

const nothing = (): null => null
const noPages = (layout: AttachedLayout): ReactNode => layout([])

function useView(
  governance: GovernanceModel,
  tenant: TenantId,
  category: string | null,
): CategoryGovernance | null {
  const [view, setView] = useState<CategoryGovernance | null>(null)
  useEffect(() => {
    const opened =
      category === null ? governance.openAll(tenant) : governance.open(tenant, category)
    setView(opened)
    return opened.close
  }, [governance, tenant, category])
  return view
}

export function AssetsPage(props: AssetsPageProps): JSX.Element {
  const tenant = useMemo(() => readTenantText(props.tenant), [props.tenant])
  if (tenant === undefined)
    return (
      <PageColumn className="assets-page">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，资产页不能工作。' }} />
      </PageColumn>
    )
  const labels = props.categoryLabels
  const extras: Extras = {
    label: category => labels?.[category] ?? category,
    categorySlot: props.categorySlot ?? nothing,
    holdingSlot: props.holdingSlot ?? nothing,
  }
  return (
    <PageColumn className="assets-page">
      <PageHeader title="资产" description="这一层：当前租户" />
      <Overview
        governance={props.governance}
        tenant={tenant}
        extras={extras}
        pages={props.pages ?? noPages}
      />
    </PageColumn>
  )
}

type OverviewProps = Readonly<{
  governance: GovernanceModel
  tenant: TenantId
  extras: Extras
  pages: (layout: AttachedLayout) => ReactNode
}>

function Overview(props: OverviewProps) {
  const all = useView(props.governance, props.tenant, null)
  return all === null ? null : <OverviewBody {...props} all={all} />
}

function OverviewBody({
  all,
  governance,
  tenant,
  extras,
  pages,
}: OverviewProps & { all: CategoryGovernance }) {
  const snapshot = useSyncExternalStore(all.subscribe, all.getSnapshot)
  const [chosen, setChosen] = useState<string | null>(null)
  const data = snapshot.kind === 'read' ? categoriesOf(snapshot.holdings) : []
  return (
    <>
      <ListNotice snapshot={snapshot} retry={all.read} />
      {pages(entries => (
        <Tabs
          entries={entries}
          data={data}
          reading={snapshot.kind === 'reading'}
          chosen={chosen}
          choose={setChosen}
          extras={extras}
          generic={category => (
            <CategoryPage
              governance={governance}
              tenant={tenant}
              category={category}
              extras={extras}
            />
          )}
        />
      ))}
    </>
  )
}

function ListNotice({
  snapshot,
  retry,
}: {
  readonly snapshot: CategorySnapshot
  readonly retry: () => void
}) {
  if (snapshot.kind === 'unreadable')
    return <NoticeLine notice={snapshot.notice} action={{ label: '重试', onClick: retry }} />
  if (snapshot.kind === 'read' && snapshot.partial)
    return (
      <NoticeLine
        notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
      />
    )
  return null
}

const byCodeUnit = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1

function categoriesOf(holdings: readonly Holding[]): readonly string[] {
  return [...new Set(holdings.map(holding => holding.category))].sort(byCodeUnit)
}

type TabsProps = Readonly<{
  entries: readonly AttachedEntry[]
  data: readonly string[]
  reading: boolean
  chosen: string | null
  choose: (category: string) => void
  extras: Extras
  generic: (category: string) => ReactNode
}>

function Tabs({ entries, data, reading, chosen, choose, extras, generic }: TabsProps) {
  const contributed = new Map(entries.map(entry => [entry.id, entry]))
  const ids = [...contributed.keys(), ...data.filter(category => !contributed.has(category))]
  if (ids.length === 0)
    return reading ? (
      <LoadingState label="正在读取资产……" />
    ) : (
      <EmptyState title="这一层还没有可以管的资产，也没有类别带来自己的页面。" />
    )
  const selected = chosen !== null && ids.includes(chosen) ? chosen : ids[0]!
  const labelOf = (category: string) => contributed.get(category)?.label ?? extras.label(category)
  return (
    <div className="assets-page-body">
      <div role="tablist" aria-label="资产的类别" className="assets-page-tabs">
        {ids.map(category => (
          <Button
            key={category}
            role="tab"
            variant="ghost"
            className="assets-page-tab"
            aria-selected={category === selected}
            data-active={category === selected}
            onClick={() => choose(category)}
          >
            {labelOf(category)}
          </Button>
        ))}
      </div>
      {ids.map(category => {
        const page = contributed.get(category)
        if (page === undefined && category !== selected) return null
        return (
          <section
            key={category}
            role="tabpanel"
            aria-label={labelOf(category)}
            hidden={category !== selected}
            className="assets-page-panel"
          >
            {page === undefined ? generic(category) : page.node}
          </section>
        )
      })}
    </div>
  )
}

type CategoryPageProps = Readonly<{
  governance: GovernanceModel
  tenant: TenantId
  category: string
  extras: Extras
}>

function CategoryPage({ governance, tenant, category, extras }: CategoryPageProps) {
  const view = useView(governance, tenant, category)
  return view === null ? null : <CategoryBody view={view} category={category} extras={extras} />
}

function CategoryBody({
  view,
  category,
  extras,
}: {
  readonly view: CategoryGovernance
  readonly category: string
  readonly extras: Extras
}): JSX.Element | null {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  if (snapshot.kind !== 'read') return null
  return (
    <div className="assets-category">
      <h2 className="assets-category-title">{extras.label(category)}</h2>
      <div className="assets-category-slot">{extras.categorySlot(category)}</div>
      {snapshot.holdings.map(holding => (
        <HoldingBlock key={holding.name} holding={holding} view={view} extras={extras} />
      ))}
    </div>
  )
}

function HoldingBlock({
  holding,
  view,
  extras,
}: {
  readonly holding: Holding
  readonly view: CategoryGovernance
  readonly extras: Extras
}) {
  return (
    <section className="assets-holding" aria-label={holding.name}>
      <header className="assets-holding-head">
        <h3 className="assets-holding-title">{holding.name}</h3>
        <span className="assets-holding-category">{extras.label(holding.category)}</span>
      </header>
      <ul className="assets-settings-list">
        {holding.rows.map(row => (
          <RowView key={row.key} row={row} driver={view} />
        ))}
      </ul>
      <div className="assets-holding-slot">
        {extras.holdingSlot(holding.category, holding.name)}
      </div>
    </section>
  )
}
