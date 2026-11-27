import type { McpProtocol } from '@omne-harness/mcp-protocol'
import { readTenantText, type Codec } from '@omne-harness/public-contract'
import { InlineNotice, LoadingIndicator, LoadingState } from '@omne-harness/ui-kit'
import { useEffect, useState, type JSX } from 'react'
import { mcpEndpointActions, mcpEndpointStatus } from './parts.ts'
import type { McpStatus } from './port.ts'

type Succeeded = McpProtocol['operations']['read-endpoint']['outcomes']['succeeded']
export type ReadBody = Succeeded extends Codec<infer T> ? T : never
type Endpoint = ReadBody['endpoint']

export type EndpointState =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'read'; body: ReadBody; refreshing: boolean }>

const CONNECTION: Readonly<Record<Endpoint['connection']['state'], string>> = {
  none: '还没连过',
  preparing: '正在连接',
  ready: '已连上',
  degraded: '已连上，动作取不全',
  lost: '连不上',
}

export function useEndpointState(
  status: McpStatus | null,
  tenant: string,
  name: string,
): Readonly<{ state: EndpointState; refresh: () => void }> {
  const [state, setState] = useState<EndpointState>({ kind: 'reading' })
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    const owner = readTenantText(tenant)
    if (status === null || owner === undefined) {
      setState({ kind: 'unreadable' })
      return
    }
    let live = true
    const settle = (next: EndpointState) => {
      if (live) setState(next)
    }
    status['read-endpoint']({ tenant: owner, name }).then(
      answer =>
        settle(
          answer.outcome === 'succeeded'
            ? { kind: 'read', body: answer.body, refreshing: false }
            : { kind: 'unreadable' },
        ),
      () => settle({ kind: 'unreadable' }),
    )
    return () => {
      live = false
    }
  }, [status, tenant, name, turn])
  const refresh = () => {
    const owner = readTenantText(tenant)
    if (status === null || owner === undefined) return
    setState(now => (now.kind === 'read' ? { ...now, refreshing: true } : now))
    void status['refresh-endpoint']({ tenant: owner, name })
      .catch(() => undefined)
      .finally(() => setTurn(count => count + 1))
  }
  return { state, refresh }
}

const CREDENTIAL: Readonly<Partial<Record<NonNullable<Endpoint['credentialState']>, string>>> = {
  absent: '凭据没配',
  invalid: '凭据的配值不对',
  rejected: '凭据被拒，要在设置里改成对的',
  'reconnect-required': '要重新连接',
}

function statusText({ connection, credential, credentialState, use }: Endpoint): string {
  const said = CONNECTION[connection.state]
  const parts = [connection.reason === null ? said : `${said}：${connection.reason}`]
  const credentialSaid = CREDENTIAL[credentialState ?? credential]
  if (credentialSaid !== undefined) parts.push(credentialSaid)
  if (use.kind === 'blocked') parts.push(`不能用：${use.reason}`)
  return parts.join('；')
}

export function EndpointStatus({ state }: { readonly state: EndpointState }): JSX.Element {
  return (
    <p className="mcp-endpoint-status" {...mcpEndpointStatus.props}>
      {state.kind === 'reading' ? (
        <LoadingState label="正在读取状态……" />
      ) : state.kind === 'read' ? (
        statusText(state.body.endpoint)
      ) : (
        '状态读不出。'
      )}
    </p>
  )
}

export function EndpointActions({
  state,
  refresh,
}: {
  readonly state: EndpointState
  readonly refresh: () => void
}): JSX.Element | null {
  if (state.kind === 'reading') return null
  if (state.kind === 'unreadable')
    return (
      <p className="mcp-endpoint-status" {...mcpEndpointActions.props}>
        动作清单读不出。
      </p>
    )
  const { endpoint, actions } = state.body
  return actions === null ? (
    <NotAcquired catalog={endpoint.catalog} refreshing={state.refreshing} refresh={refresh} />
  ) : (
    <div className="mcp-endpoint-actions" {...mcpEndpointActions.props}>
      {actions.length === 0 ? (
        <p className="mcp-endpoint-status">这个接入点没有动作。</p>
      ) : (
        <ActionList actions={actions} />
      )}
    </div>
  )
}

function NotAcquired({
  catalog,
  refreshing,
  refresh,
}: {
  readonly catalog: Endpoint['catalog']
  readonly refreshing: boolean
  readonly refresh: () => void
}): JSX.Element {
  const why = catalog.kind === 'not-acquired' ? catalog.reason : null
  return (
    <div className="mcp-endpoint-actions" aria-busy={refreshing} {...mcpEndpointActions.props}>
      <InlineNotice
        tone="neutral"
        role="status"
        {...(refreshing ? {} : { action: { label: '刷新', onClick: refresh } })}
      >
        <p>{why === null ? '动作清单还没取得。' : `动作清单还没取得：${why}`}</p>
      </InlineNotice>
      {refreshing ? <LoadingIndicator size="sm" /> : null}
    </div>
  )
}

function ActionList({
  actions,
}: {
  readonly actions: NonNullable<ReadBody['actions']>
}): JSX.Element {
  return (
    <ul className="mcp-action-list" aria-label="这个接入点的动作">
      {actions.map(action => (
        <li key={action.name} className="mcp-action">
          <span className="mcp-action-name">{action.name}</span>
          <span className="mcp-action-summary">
            {action.available
              ? action.summary
              : `${action.summary}（用不了：${action.reason ?? ''}）`}
          </span>
        </li>
      ))}
    </ul>
  )
}
