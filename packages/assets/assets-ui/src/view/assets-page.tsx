import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { AttachedEntry, AttachedLayout } from '@omne-harness/shell-contract'
import { Button, EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import type { CategoriesRead, CategoryNames } from '../model/category-names.ts'
import type { GovernanceModel } from '../model/governance.ts'
import { CategoryPage, type Extras } from './category-page.tsx'
import { NoticeLine } from './notice.tsx'

export type AssetsPageProps = Readonly<{
  governance: GovernanceModel
  tenant: string
  categoryNames?: CategoryNames
  categorySlot?: (category: string) => ReactNode
  holdingSlot?: (category: string, name: string) => ReactNode
  pages?: (layout: AttachedLayout) => ReactNode
}>

const nothing = (): null => null
const noPages = (layout: AttachedLayout): ReactNode => layout([])

type Categories = Readonly<{ kind: 'reading' }> | CategoriesRead

const READING: Categories = { kind: 'reading' }
const NONE: Categories = { kind: 'read', names: new Map() }

function useCategories(source: CategoryNames | undefined): [Categories, () => void] {
  const [categories, setCategories] = useState<Categories>(source === undefined ? NONE : READING)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (source === undefined) {
      setCategories(NONE)
      return
    }
    let live = true
    setCategories(READING)
    void source.read().then(found => {
      if (live) setCategories(found)
    })
    return () => {
      live = false
    }
  }, [source, round])
  return [categories, () => setRound(count => count + 1)]
}

/** The page keeps the tenant's settings read while it is open, so changing tabs does not read again. */
function useTenantHold(governance: GovernanceModel, tenant: TenantId | undefined): void {
  useEffect(() => {
    if (tenant === undefined) return
    return governance.openAll(tenant).close
  }, [governance, tenant])
}

export function AssetsPage(props: AssetsPageProps): JSX.Element {
  const tenant = useMemo(() => readTenantText(props.tenant), [props.tenant])
  const [categories, retry] = useCategories(props.categoryNames)
  useTenantHold(props.governance, tenant)
  if (tenant === undefined)
    return (
      <PageColumn className="assets-page">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，资产页不能工作。' }} />
      </PageColumn>
    )
  const names = categories.kind === 'read' ? categories.names : NONE_NAMES
  const extras: Extras = {
    label: category => names.get(category) ?? category,
    categorySlot: props.categorySlot ?? nothing,
    holdingSlot: props.holdingSlot ?? nothing,
  }
  const generic = (category: string) => (
    <CategoryPage
      key={category}
      governance={props.governance}
      tenant={tenant}
      category={category}
      extras={extras}
    />
  )
  return (
    <PageColumn className="assets-page">
      <PageHeader title="资产" description="这一层：当前租户" />
      {categories.kind === 'failed' && (
        <NoticeLine notice={categories.notice} action={{ label: '重试', onClick: retry }} />
      )}
      <Overview
        categories={categories}
        extras={extras}
        pages={props.pages ?? noPages}
        generic={generic}
      />
    </PageColumn>
  )
}

const NONE_NAMES: ReadonlyMap<string, string> = new Map()

const byCodeUnit = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1

type OverviewProps = Readonly<{
  categories: Categories
  extras: Extras
  pages: (layout: AttachedLayout) => ReactNode
  generic: (category: string) => ReactNode
}>

function Overview({ categories, extras, pages, generic }: OverviewProps) {
  const [chosen, setChosen] = useState<string | null>(null)
  const data = categories.kind === 'read' ? [...categories.names.keys()].sort(byCodeUnit) : []
  return pages(entries => (
    <Tabs
      entries={entries}
      data={data}
      reading={categories.kind === 'reading'}
      chosen={chosen}
      choose={setChosen}
      extras={extras}
      generic={generic}
    />
  ))
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
