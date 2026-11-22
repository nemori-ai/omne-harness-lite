import {
  Button,
  EmptyState,
  InlineNotice,
  LoadingState,
  type NoticeAction,
} from '@omne-harness/ui-kit'
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { mcpEndpoint, mcpEndpointPermission, mcpPage } from './parts.ts'
import type {
  McpEndpoint,
  McpGovernance,
  McpNotice,
  McpPermission,
  McpRow,
  McpView,
} from './port.ts'

export const MCP_CATEGORY = 'mcp'

const NOT_CONNECTED = 'MCP 还没有接进这个应用：现在没有接入点，这一页只有机制。'
const TONE = { refused: 'danger', unavailable: 'caution', unknown: 'caution' } as const

export type McpPageProps = Readonly<{ governance: McpGovernance; tenant: string }>

export function McpPage({ governance, tenant }: McpPageProps): JSX.Element | null {
  const [view, setView] = useState<McpView | null>(null)
  useEffect(() => {
    const opened = governance.open(tenant, MCP_CATEGORY)
    setView(opened)
    return opened.close
  }, [governance, tenant])
  return view === null ? null : <McpBody view={view} />
}

function NoticeLine({
  notice,
  action,
}: {
  readonly notice: McpNotice
  readonly action?: NoticeAction | undefined
}): JSX.Element {
  return (
    <InlineNotice
      tone={TONE[notice.kind]}
      role={notice.kind === 'unknown' ? 'status' : 'alert'}
      {...(action === undefined ? {} : { action })}
    >
      <p>{notice.text}</p>
    </InlineNotice>
  )
}

function McpBody({ view }: { readonly view: McpView }): JSX.Element {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  switch (snapshot.kind) {
    case 'reading':
      return <LoadingState label="正在读取 MCP 的接入点……" />
    case 'unreadable':
      return <NoticeLine notice={snapshot.notice} action={{ label: '重试', onClick: view.read }} />
    case 'read':
      return (
        <div className="mcp-page" {...mcpPage.props}>
          {snapshot.partial ? (
            <NoticeLine
              notice={{
                kind: 'unavailable',
                text: '接入点不全：有的来源暂时读不出，这里没有列全。',
              }}
            />
          ) : snapshot.holdings.length === 0 ? (
            <EmptyState title={NOT_CONNECTED} />
          ) : null}
          {snapshot.holdings.map(endpoint => (
            <Endpoint key={endpoint.name} endpoint={endpoint} view={view} />
          ))}
        </div>
      )
  }
}

type DrawnRow = McpRow & Readonly<{ view: McpPermission }>

const drawnHere = (row: McpRow): row is DrawnRow =>
  row.view.kind === 'permission' && row.read.kind !== 'failed'

function Endpoint({
  endpoint,
  view,
}: {
  readonly endpoint: McpEndpoint
  readonly view: McpView
}): JSX.Element {
  const DefaultRow = view.Row
  return (
    <section className="mcp-endpoint" aria-label={endpoint.name} {...mcpEndpoint.props}>
      <h3 className="mcp-endpoint-title">{endpoint.name}</h3>
      {endpoint.rows.filter(drawnHere).map(row => (
        <CallPermission key={row.key} row={row} view={view} />
      ))}
      <ul className="mcp-endpoint-settings">
        {endpoint.rows
          .filter(row => !drawnHere(row))
          .map(row => (
            <DefaultRow key={row.key} rowKey={row.key} />
          ))}
      </ul>
    </section>
  )
}

function applying(setting: McpPermission): string {
  const effective = setting.effective
  switch (effective.kind) {
    case 'value': {
      const picked = setting.choices.find(choice => choice.value === effective.value)
      return `现在：${picked?.label ?? effective.value}`
    }
    case 'prohibited':
      return '现在：被禁止'
    case 'empty-bound':
      return '现在：没有可选的一档'
  }
}

function CallPermission({
  row,
  view,
}: {
  readonly row: DrawnRow
  readonly view: McpView
}): JSX.Element {
  const setting = row.view
  const open = setting.editable.kind === 'yes'
  const busy =
    row.read.kind !== 'read' || row.write.kind === 'submitting' || row.write.kind === 'unknown'
  const picked = setting.effective.kind === 'value' ? setting.effective.value : null
  return (
    <div className="mcp-permission" {...mcpEndpointPermission.props}>
      <h4 className="mcp-permission-title">{setting.declaration.title}</h4>
      <div role="group" aria-label={setting.declaration.title} className="mcp-permission-choices">
        {setting.choices.map(choice => (
          <Button
            key={choice.value}
            variant="outline"
            aria-pressed={choice.value === picked}
            disabled={busy || !open}
            onClick={() => view.set(row.key, choice.value)}
          >
            {choice.label}
          </Button>
        ))}
      </div>
      <p className="mcp-permission-now">{applying(setting)}</p>
      {open ? null : <p className="mcp-permission-closed">这一层不能改这一项。</p>}
      {open && setting.own !== null ? (
        <Button variant="ghost" disabled={busy} onClick={() => view.clear(row.key)}>
          清除这一层的挑选
        </Button>
      ) : null}
      <WriteLine row={row} view={view} />
    </div>
  )
}

function WriteLine({
  row,
  view,
}: {
  readonly row: McpRow
  readonly view: McpView
}): JSX.Element | null {
  const write = row.write
  switch (write.kind) {
    case 'unknown':
      return (
        <NoticeLine
          notice={write.notice}
          action={
            write.confirming ? undefined : { label: '再确认', onClick: () => view.confirm(row.key) }
          }
        />
      )
    case 'unconfirmed':
    case 'refused':
      return <NoticeLine notice={write.notice} />
    case 'none':
    case 'submitting':
    case 'succeeded':
      return null
  }
}
