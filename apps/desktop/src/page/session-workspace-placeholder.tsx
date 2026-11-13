// A stand-in with the props of seam five, until `@omne-harness/session-ui` is on the track. The
// assembly imports it in the one line that will import the real `SessionWorkspace`.
import type { SessionProtocol } from '@omne-harness/session-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'

export type SessionWorkspaceProps = Readonly<{
  client: ClientOf<SessionProtocol>
  tenant: string
}>

export function SessionWorkspace(props: SessionWorkspaceProps) {
  return (
    <div className="notice" data-testid="session-workspace" data-tenant={props.tenant}>
      <p className="notice-title">会话界面还没有装上</p>
      <p className="notice-detail">登录与租户已就绪；装上会话界面之后，这里是对话。</p>
    </div>
  )
}
