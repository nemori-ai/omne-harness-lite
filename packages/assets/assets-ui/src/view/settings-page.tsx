import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { groupsOf } from '../model/setting-groups.ts'
import { SettingsDriver } from '../model/settings-driver.ts'
import { assetsSettingsPage, assetsSettingsPageGroup } from '../parts.ts'
import { NoticeLine } from './notice.tsx'
import { RowView } from './setting-row.tsx'

export type SettingsPageProps = Readonly<{
  client: ClientOf<AssetsProtocol>
  tenant: string
  newId?: () => string
}>

export function SettingsPage({ client, tenant: text, newId }: SettingsPageProps): JSX.Element {
  const tenant = useMemo(() => readTenantText(text), [text])
  return (
    <PageColumn className="assets-settings" {...assetsSettingsPage.props}>
      <PageHeader title="设置" description="这一层：当前租户" />
      {tenant === undefined ? (
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，设置页不能工作。' }} />
      ) : (
        <Independent client={client} tenant={tenant} newId={newId} />
      )}
    </PageColumn>
  )
}

type IndependentProps = Readonly<{
  client: ClientOf<AssetsProtocol>
  tenant: TenantId
  newId: (() => string) | undefined
}>

function Independent({ client, tenant, newId }: IndependentProps): JSX.Element | null {
  const [driver, setDriver] = useState<SettingsDriver | null>(null)
  useEffect(() => {
    const opened = new SettingsDriver({
      client,
      tenant,
      scope: { kind: 'independent' },
      ...(newId === undefined ? {} : { newId }),
    })
    setDriver(opened)
    opened.readList()
    return () => opened.dispose()
  }, [client, tenant, newId])
  return driver === null ? null : <Groups driver={driver} />
}

function Groups({ driver }: { readonly driver: SettingsDriver }): JSX.Element {
  const list = useSyncExternalStore(driver.subscribe, driver.getState).list
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
    case 'read': {
      const groups = groupsOf(list.rows)
      return (
        <>
          {list.partial ? (
            <NoticeLine
              notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
            />
          ) : null}
          {groups.length === 0 ? <EmptyState title="这一层还没有不属于资产的设置。" /> : null}
          {groups.map(group => (
            <section
              key={group.key}
              className="assets-group"
              aria-label={group.title}
              {...assetsSettingsPageGroup.props}
            >
              <header className="assets-group-head">
                <h3 className="assets-group-title">{group.title}</h3>
                <p className="assets-group-description">{group.description}</p>
              </header>
              <ul className="assets-settings-list">
                {group.rows.map(row => (
                  <RowView key={row.key} row={row} driver={driver} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )
    }
  }
}
