import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  InlineNotice,
  LoadingIndicator,
  LoadingState,
  MoreIcon,
  Segmented,
  SettingRow,
  type NoticeAction,
} from '@omne-harness/ui-kit'
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import {
  EndpointActions,
  EndpointStatus,
  useEndpointChanges,
  useEndpointState,
} from './endpoint-state.tsx'
import { mcpEndpoint, mcpEndpointPermission, mcpPage } from './parts.ts'
import type {
  McpEndpoint,
  McpGovernance,
  McpNotice,
  McpPermission,
  McpRow,
  McpStatus,
  McpView,
} from './port.ts'

export const MCP_CATEGORY = 'mcp'

const NO_ENDPOINT = '接进来的 MCP 接入点会列在这里。'
const TONE = { refused: 'danger', unavailable: 'caution', unknown: 'caution' } as const

export type McpPageProps = Readonly<{
  governance: McpGovernance
  tenant: string
  status: McpStatus | null
}>

type Reach = Readonly<{
  view: McpView
  status: McpStatus | null
  tenant: string
  changes: number
}>

export function McpPage({ governance, tenant, status }: McpPageProps): JSX.Element | null {
  const [view, setView] = useState<McpView | null>(null)
  useEffect(() => {
    const opened = governance.open(tenant, MCP_CATEGORY)
    setView(opened)
    return opened.close
  }, [governance, tenant])
  const changes = useEndpointChanges(status, tenant)
  return view === null ? null : <McpBody reach={{ view, status, tenant, changes }} />
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

function McpBody({ reach }: { readonly reach: Reach }): JSX.Element {
  const { view } = reach
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
            <EmptyState title={NO_ENDPOINT} />
          ) : null}
          {snapshot.holdings.map(endpoint => (
            <Endpoint key={endpoint.name} endpoint={endpoint} reach={reach} />
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
  reach,
}: {
  readonly endpoint: McpEndpoint
  readonly reach: Reach
}): JSX.Element {
  const { view } = reach
  const DefaultRow = view.Row
  const { state, refresh } = useEndpointState(
    reach.status,
    reach.tenant,
    endpoint.name,
    reach.changes,
  )
  return (
    <section className="mcp-endpoint" aria-label={endpoint.name} {...mcpEndpoint.props}>
      <h3 className="mcp-endpoint-title">{endpoint.name}</h3>
      <EndpointStatus state={state} />
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
      <EndpointActions state={state} refresh={refresh} />
    </section>
  )
}

const labelOf = (setting: McpPermission, value: string) =>
  setting.choices.find(choice => choice.value === value)?.label ?? value

// What stands where the control would be when nothing can be picked here.
function readOnlyValue(setting: McpPermission): string | null {
  const { effective } = setting
  switch (effective.kind) {
    case 'prohibited':
      return '被禁止'
    case 'empty-bound':
      return '没有可选的一档'
    case 'value':
      return setting.editable.kind === 'yes' ? null : labelOf(setting, effective.value)
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
  const [sent, setSent] = useState<string | null>(null)
  const busy =
    row.read.kind !== 'read' || row.write.kind === 'submitting' || row.write.kind === 'unknown'
  const fixed = readOnlyValue(setting)
  const effective = setting.effective.kind === 'value' ? setting.effective.value : ''
  const shownValue = busy && sent !== null ? sent : effective
  const clearable = setting.own !== null && setting.editable.kind === 'yes'
  return (
    <div className="mcp-permission" {...mcpEndpointPermission.props}>
      <SettingRow
        label={setting.declaration.title}
        hint={setting.own === null ? '这一层没有挑选' : '这一层设的'}
        notice={<WriteLine row={row} view={view} />}
      >
        {fixed === null ? (
          <div className="mcp-permission-control" aria-busy={busy}>
            <Segmented
              label={setting.declaration.title}
              value={shownValue}
              options={setting.choices}
              onValueChange={value => {
                if (busy) return
                setSent(value)
                view.set(row.key, value)
              }}
            />
            {busy ? <LoadingIndicator size="sm" /> : null}
          </div>
        ) : (
          <p className="mcp-permission-value">{fixed}</p>
        )}
        {clearable ? <ClearMenu busy={busy} onClear={() => view.clear(row.key)} /> : null}
      </SettingRow>
      {setting.editable.kind === 'yes' ? null : (
        <p className="mcp-permission-closed">这一层不能改这一项。</p>
      )}
    </div>
  )
}

function ClearMenu({
  busy,
  onClear,
}: {
  readonly busy: boolean
  readonly onClear: () => void
}): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="更多" size="icon-compact" disabled={busy}>
          <MoreIcon aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onClear}>清除这一层的挑选</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            write.confirming
              ? undefined
              : { label: '再确认一次', onClick: () => view.confirm(row.key) }
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
