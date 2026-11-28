import { readTenantText } from '@omne-harness/public-contract'
import { InlineNotice, LoadingIndicator } from '@omne-harness/ui-kit'
import { useEffect, useState, type JSX } from 'react'
import type { EndpointState } from './endpoint-state.tsx'
import { mcpEndpointConnect } from './parts.ts'
import type { McpStatus } from './port.ts'

const POLL_MS = 2_000

/** Why a connection could not be begun, in the person's words; the server's sentence is for the machine. */
const NOT_BEGUN: Readonly<Record<string, string>> = {
  disabled: '这个接入点停用了。',
  'target-missing': '还没有地址：在下面「连接目标」一行填上。',
  'target-invalid': '地址不对：要 https，或本机回环地址上的 http。',
  'client-id-invalid': '「客户端标识」的配值不对，在下面那一行改。',
  'no-resource-metadata': '对方没有说明它要怎样授权，这个地址接不了 OAuth。',
  'no-authorization-server': '对方没有给出授权服务器，这个地址接不了 OAuth。',
  'issuer-mismatch': '授权服务器说的身份和它的地址对不上，不连。',
  'no-pkce': '授权服务器不支持 PKCE（S256），不连。',
  'insecure-endpoint': '授权服务器给的地址不是 https，不连。',
  malformed: '授权服务器的说明读不懂。',
  'no-registration':
    '对方要求先登记一个应用：在对方那里登记，回跳地址填下面这个，得到的客户端标识填进下面「客户端标识」一行，再点「连接」。',
  'registration-refused':
    '对方拒绝了自动登记：在对方那里登记一个应用，回跳地址填下面这个，客户端标识填进下面「客户端标识」一行。',
}

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
              ? (NOT_BEGUN[answer.body.reason] ?? `连不上：${answer.body.text}`)
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
      {present || endpoint.callback === undefined ? null : (
        <p className="mcp-endpoint-callback">
          回跳地址（在对方那里登记应用时填它）：<code>{endpoint.callback}</code>
        </p>
      )}
    </div>
  )
}
