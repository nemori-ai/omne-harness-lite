import { readTenantText } from '@omne-harness/public-contract'
import { InlineNotice, LoadingIndicator } from '@omne-harness/ui-kit'
import { useEffect, useState, type JSX } from 'react'
import type { EndpointState } from './endpoint-state.tsx'
import { mcpEndpointConnect } from './parts.ts'
import type { McpStatus } from './port.ts'

const POLL_MS = 2_000

type Props = Readonly<{
  status: McpStatus | null
  tenant: string
  name: string
  state: EndpointState
  reread: () => void
}>

/** OAuth endpoints only: connect in the system browser, wait for the consent, or end the connection. */
export function EndpointConnect({
  status,
  tenant,
  name,
  state,
  reread,
}: Props): JSX.Element | null {
  const [said, setSaid] = useState<string | null>(null)
  const endpoint = state.kind === 'read' ? state.body.endpoint : undefined
  const connecting = endpoint?.connect === 'connecting'
  useEffect(() => {
    if (!connecting) return
    const timer = setInterval(reread, POLL_MS)
    return () => clearInterval(timer)
  }, [connecting, reread])
  const owner = readTenantText(tenant)
  if (endpoint?.connect === undefined || status === null || owner === undefined) return null
  const begin = status['begin-connect']
  const end = status.disconnect
  const connect = () => {
    setSaid(null)
    void begin?.({ tenant: owner, name })
      .then(answer => {
        if (answer.outcome === 'succeeded') window.open(answer.body.url, '_blank', 'noopener')
        else
          setSaid(
            answer.outcome === 'not-committed'
              ? `连不上：${answer.body.text}`
              : '现在连不了，稍后再试。',
          )
      })
      .catch(() => setSaid('现在连不了，稍后再试。'))
      .finally(reread)
  }
  const disconnect = () => {
    void end?.({ tenant: owner, name })
      .catch(() => undefined)
      .finally(reread)
  }
  const present = endpoint.credentialState === 'present'
  const action = connecting
    ? {}
    : present
      ? end === undefined
        ? {}
        : { action: { label: '断开', onClick: disconnect } }
      : begin === undefined
        ? {}
        : {
            action: {
              label: endpoint.credentialState === 'reconnect-required' ? '重新连接' : '连接',
              onClick: connect,
            },
          }
  const text = connecting
    ? '在浏览器里同意之后回到这里。'
    : present
      ? '已经经 OAuth 连上。'
      : (said ?? '这个接入点要先经 OAuth 连上。')
  return (
    <div className="mcp-endpoint-connect" aria-busy={connecting} {...mcpEndpointConnect.props}>
      <InlineNotice tone="neutral" role="status" {...action}>
        <p>{text}</p>
      </InlineNotice>
      {connecting ? <LoadingIndicator size="sm" /> : null}
    </div>
  )
}
