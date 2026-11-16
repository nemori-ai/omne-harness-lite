import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Button, EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { SettingsDriver } from '../model/settings-driver.ts'
import type { Row, State } from '../model/settings-machine.ts'
import { NoticeLine } from './notice.tsx'
import { RowView } from './setting-row.tsx'

export type SettingsPanelProps = Readonly<{
  client: ClientOf<AssetsProtocol>
  tenant: string
}>

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const tenant = useMemo(() => readTenantText(props.tenant), [props.tenant])
  if (tenant === undefined)
    return (
      <PageColumn className="assets-settings">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，设置界面不能工作。' }} />
      </PageColumn>
    )
  return <Panel client={props.client} tenant={tenant} />
}

function Panel({
  client,
  tenant,
}: {
  readonly client: ClientOf<AssetsProtocol>
  readonly tenant: TenantId
}) {
  const [driver, setDriver] = useState<SettingsDriver | null>(null)
  useEffect(() => {
    const created = new SettingsDriver({ client, tenant })
    setDriver(created)
    created.readList()
    return () => created.dispose()
  }, [client, tenant])
  return driver === null ? <PageColumn className="assets-settings" /> : <Settings driver={driver} />
}

function Settings({ driver }: { readonly driver: SettingsDriver }) {
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  return (
    <PageColumn className="assets-settings">
      <PageHeader title="设置" description="这一层：当前租户" />
      <Body state={state} driver={driver} />
    </PageColumn>
  )
}

function Body({ state, driver }: { readonly state: State; readonly driver: SettingsDriver }) {
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
            <Groups rows={list.rows} driver={driver} />
          )}
        </>
      )
  }
}

const ALL = ''

const CATEGORY: Readonly<Record<string, string>> = {
  tool: '工具',
  model: '模型',
  skill: '技能',
  agent: '智能体',
  mcp: 'MCP',
}

const categoryName = (category: string): string => CATEGORY[category] ?? category

function categoriesOf(rows: readonly Row[]): readonly string[] {
  return [...new Set(rows.map(row => row.view.asset.category))]
}

function Groups({
  rows,
  driver,
}: {
  readonly rows: readonly Row[]
  readonly driver: SettingsDriver
}) {
  const [chosen, setChosen] = useState(ALL)
  const categories = categoriesOf(rows)
  const active = categories.includes(chosen) ? chosen : ALL
  const shown = active === ALL ? rows : rows.filter(row => row.view.asset.category === active)
  const entries = [
    { key: ALL, label: '全部', count: rows.length },
    ...categories.map(category => ({
      key: category,
      label: categoryName(category),
      count: rows.filter(row => row.view.asset.category === category).length,
    })),
  ]
  return (
    <div className="assets-settings-layout">
      <nav className="assets-settings-rail" aria-label="设置分组">
        {entries.map(entry => (
          <Button
            key={entry.key}
            variant="ghost"
            className="assets-settings-rail-link"
            data-active={entry.key === active}
            aria-current={entry.key === active ? 'true' : undefined}
            onClick={() => setChosen(entry.key)}
          >
            <span>{entry.label}</span>
            <span className="assets-settings-rail-count">{entry.count}</span>
          </Button>
        ))}
      </nav>
      <div className="assets-settings-pane">
        <h2 className="assets-settings-pane-title">
          {active === ALL ? '全部' : categoryName(active)}
        </h2>
        <ul className="assets-settings-list">
          {shown.map(row => (
            <RowView key={row.key} row={row} driver={driver} />
          ))}
        </ul>
      </div>
    </div>
  )
}
