// After signing in: reads the current tenant with `identity/v1` `query-current-tenant`, shows it
// in the top bar, and hands its wire text to whatever renders the workspace.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { ShellChrome } from '../shell/shell.tsx'

type Read =
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly tenant: string }
  | { readonly kind: 'failed'; readonly text: string }

export type CurrentTenantProps = Readonly<{
  identity: ClientOf<IdentityProtocol>
  chrome: ShellChrome
  children: (tenant: string) => ReactNode
}>

const shorten = (text: string): string =>
  text.length <= 14 ? text : `${text.slice(0, 8)}…${text.slice(-4)}`

export function CurrentTenant(props: CurrentTenantProps) {
  const { identity, chrome } = props
  const [read, setRead] = useState<Read>({ kind: 'reading' })

  const load = useCallback(async () => {
    setRead({ kind: 'reading' })
    const answer = await identity['query-current-tenant']({})
    if (answer.outcome === 'succeeded') {
      const text = tenantCodec.encode(answer.body.tenantId)
      if (text.ok) {
        const organization = answer.body.tenantId.organization.text
        chrome.setScope({ short: shorten(organization), full: text.value })
        return setRead({ kind: 'read', tenant: text.value })
      }
    }
    setRead({
      kind: 'failed',
      text:
        answer.outcome === 'denied'
          ? '登录可能已经失效，正在确认……'
          : answer.outcome === 'uncertain'
            ? '没有收到可信的答复，读不到当前租户。'
            : '读不到当前租户：服务暂时不可用。',
    })
  }, [identity, chrome])

  useEffect(() => {
    void load()
    return () => chrome.setScope(undefined)
  }, [load, chrome])

  if (read.kind === 'read') return <>{props.children(read.tenant)}</>
  return (
    <div className="notice" role="status">
      <p className="notice-title">{read.kind === 'reading' ? '正在读取当前租户……' : read.text}</p>
      {read.kind === 'failed' ? (
        <button type="button" className="button" onClick={() => void load()}>
          重试
        </button>
      ) : null}
    </div>
  )
}
