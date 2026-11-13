// The assembly: the only place in the page that names domains. It lists the protocol contracts the
// tree carries and fills the shell's two regions. Take a domain out here and the shell still
// compiles and runs.
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { identityProtocol, type IdentityProtocol } from '@omne-harness/identity-protocol'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import { SessionWorkspace } from '@omne-harness/session-ui'
import '@omne-harness/session-ui/session-ui.css'
import type { HostBridge } from '../shared/host-bridge.ts'
import { CurrentTenant } from './identity/current-tenant.tsx'
import { LoginScreen } from './identity/login-screen.tsx'
import type { Region } from './shell/shell.tsx'
import { serviceOf } from './tree.ts'

export const protocols: readonly ProtocolContract[] = [identityProtocol, sessionProtocol]

const IDENTITY = serviceOf(identityProtocol)
const SESSION = serviceOf(sessionProtocol)

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
      services: [IDENTITY, SESSION],
      render: ([identity, session], chrome) => (
        <CurrentTenant identity={identity as ClientOf<IdentityProtocol>} chrome={chrome}>
          {tenant => (
            // The workspace reads its tenant once, on mount: another tenant is another workspace.
            <SessionWorkspace
              key={tenant}
              client={session as ClientOf<SessionProtocol>}
              tenant={tenant}
            />
          )}
        </CurrentTenant>
      ),
    },
  }
}
