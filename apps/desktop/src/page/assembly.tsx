import type { ClientOf } from '@omne-harness/sdk/core'
import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'
import { SettingsPanel } from '@omne-harness/assets-ui'
import '@omne-harness/assets-ui/assets-ui.css'
import { identityProtocol, type IdentityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import { SessionWorkspace } from '@omne-harness/session-ui'
import '@omne-harness/session-ui/session-ui.css'
import type { HostBridge } from '../shared/host-bridge.ts'
import { CurrentTenant } from './identity/current-tenant.tsx'
import { LoginScreen } from './identity/login-screen.tsx'
import type { Region } from './shell/shell.tsx'
import { serviceOf } from './tree.ts'

const IDENTITY = serviceOf(identityProtocol)
const SESSION = serviceOf(sessionProtocol)
const ASSETS = serviceOf(assetsProtocol)

export function assemble(bridge: HostBridge): {
  readonly gate: Region
  readonly workspace: Region
} {
  return {
    gate: {
      services: [IDENTITY],
      render: ([identity]) => (
        <LoginScreen identity={identity as ClientOf<IdentityProtocol>} login={bridge.login} />
      ),
    },
    workspace: {
      services: [IDENTITY],
      render: ([identity], chrome) => (
        <CurrentTenant identity={identity as ClientOf<IdentityProtocol>} chrome={chrome}>
          {tenant =>
            chrome.views([
              {
                id: 'conversation',
                title: '对话',
                services: [SESSION],
                render: ([session]) => (
                  <SessionWorkspace
                    key={tenant}
                    client={session as ClientOf<SessionProtocol>}
                    tenant={tenant}
                  />
                ),
              },
              {
                id: 'settings',
                title: '设置',
                services: [ASSETS],
                render: ([assets]) => (
                  <SettingsPanel
                    key={tenant}
                    client={assets as ClientOf<AssetsProtocol>}
                    tenant={tenant}
                  />
                ),
              },
            ])
          }
        </CurrentTenant>
      ),
    },
  }
}
