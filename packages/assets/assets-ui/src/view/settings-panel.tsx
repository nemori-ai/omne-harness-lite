import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Button, EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { holdingsOf, type Holding } from '../model/holdings.ts'
import { SettingsDriver } from '../model/settings-driver.ts'
import type { Row, State } from '../model/settings-machine.ts'
import { NoticeLine } from './notice.tsx'
import { RowView } from './setting-row.tsx'

export type SettingsPanelProps = Readonly<{
  client: ClientOf<AssetsProtocol>
  tenant: string
  categoryLabels?: Readonly<Record<string, string>>
  categorySlot?: (category: string) => ReactNode
  holdingSlot?: (category: string, name: string) => ReactNode
}>

type Extras = Readonly<{
  categoryLabel: (category: string) => string
  categorySlot: (category: string) => ReactNode
  holdingSlot: (category: string, name: string) => ReactNode
}>

const nothing = (): null => null

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const tenant = useMemo(() => readTenantText(props.tenant), [props.tenant])
  if (tenant === undefined)
    return (
      <PageColumn className="assets-settings">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，设置界面不能工作。' }} />
      </PageColumn>
    )
  const labels = props.categoryLabels
  const extras: Extras = {
    categoryLabel: category => labels?.[category] ?? category,
    categorySlot: props.categorySlot ?? nothing,
    holdingSlot: props.holdingSlot ?? nothing,
  }
  return <Panel client={props.client} tenant={tenant} extras={extras} />
}

function Panel({
  client,
  tenant,
  extras,
}: {
  readonly client: ClientOf<AssetsProtocol>
  readonly tenant: TenantId
  readonly extras: Extras
}) {
  const [driver, setDriver] = useState<SettingsDriver | null>(null)
  useEffect(() => {
    const created = new SettingsDriver({ client, tenant })
    setDriver(created)
    created.readList()
    return () => created.dispose()
  }, [client, tenant])
  return driver === null ? (
    <PageColumn className="assets-settings" />
  ) : (
    <Settings driver={driver} extras={extras} />
  )
}

function Settings({
  driver,
  extras,
}: {
  readonly driver: SettingsDriver
  readonly extras: Extras
}) {
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  return (
    <PageColumn className="assets-settings">
      <PageHeader title="设置" description="这一层：当前租户" />
      <Body state={state} driver={driver} extras={extras} />
    </PageColumn>
  )
}

function Body({
  state,
  driver,
  extras,
}: {
  readonly state: State
  readonly driver: SettingsDriver
  readonly extras: Extras
}) {
  const list = state.list
  switch (list.kind) {
    case 'unread':
    case 'reading':
      return <LoadingState label="正在读取设置……" />
    case 'failed':
      return (
        <NoticeLine
          notice={list.notice}
          action={{ label: '重试', onClick: () => driver.readList() }}
        />
      )
    case 'read':
      return (
        <>
          {list.partial ? (
            <NoticeLine
              notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
            />
          ) : null}
          {list.rows.length === 0 ? (
            <EmptyState title="这一层没有可以配置的设置项。" />
          ) : (
            <Groups rows={list.rows} driver={driver} extras={extras} />
          )}
        </>
      )
  }
}

const ALL = ''

function categoriesOf(rows: readonly Row[]): readonly string[] {
  return [...new Set(rows.map(row => row.view.asset.category))]
}

type RailEntry = Readonly<{ key: string; label: string; count: number }>

function Rail({
  entries,
  active,
  choose,
}: {
  readonly entries: readonly RailEntry[]
  readonly active: string
  readonly choose: (key: string) => void
}) {
  return (
    <nav className="assets-settings-rail" aria-label="设置分组">
      {entries.map(entry => (
        <Button
          key={entry.key}
          variant="ghost"
          className="assets-settings-rail-link"
          data-active={entry.key === active}
          aria-current={entry.key === active ? 'true' : undefined}
          onClick={() => choose(entry.key)}
        >
          <span>{entry.label}</span>
          <span className="assets-settings-rail-count">{entry.count}</span>
        </Button>
      ))}
    </nav>
  )
}

function HoldingBlock({
  holding,
  driver,
  extras,
}: {
  readonly holding: Holding
  readonly driver: SettingsDriver
  readonly extras: Extras
}) {
  return (
    <section className="assets-holding" aria-label={holding.name}>
      <header className="assets-holding-head">
        <h3 className="assets-holding-title">{holding.name}</h3>
        <span className="assets-holding-category">{extras.categoryLabel(holding.category)}</span>
      </header>
      <ul className="assets-settings-list">
        {holding.rows.map(row => (
          <RowView key={row.key} row={row} driver={driver} />
        ))}
      </ul>
      <div className="assets-holding-slot">
        {extras.holdingSlot(holding.category, holding.name)}
      </div>
    </section>
  )
}

function Groups({
  rows,
  driver,
  extras,
}: {
  readonly rows: readonly Row[]
  readonly driver: SettingsDriver
  readonly extras: Extras
}) {
  const [chosen, setChosen] = useState(ALL)
  const categories = categoriesOf(rows)
  const active = categories.includes(chosen) ? chosen : ALL
  const shown = active === ALL ? rows : rows.filter(row => row.view.asset.category === active)
  const entries = [
    { key: ALL, label: '全部', count: rows.length },
    ...categories.map(category => ({
      key: category,
      label: extras.categoryLabel(category),
      count: rows.filter(row => row.view.asset.category === category).length,
    })),
  ]
  return (
    <div className="assets-settings-layout">
      <Rail entries={entries} active={active} choose={setChosen} />
      <div className="assets-settings-pane">
        <h2 className="assets-settings-pane-title">
          {active === ALL ? '全部' : extras.categoryLabel(active)}
        </h2>
        {active === ALL ? null : (
          <div className="assets-category-slot">{extras.categorySlot(active)}</div>
        )}
        {holdingsOf(shown).map(holding => (
          <HoldingBlock
            key={JSON.stringify([holding.category, holding.name])}
            holding={holding}
            driver={driver}
            extras={extras}
          />
        ))}
      </div>
    </div>
  )
}
