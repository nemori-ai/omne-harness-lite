// The half of the host that does not know Electron: the login session, the credential store and
// the HTTP connection to the server entry. A later Electron main process uses it as is.
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import type { ServerConnector } from './login-session.ts'

export {
  openLoginSession,
  type LoginSession,
  type LoginSessionOptions,
  type ServerConnector,
} from './login-session.ts'
export {
  memoryCredentialStore,
  type CredentialStore,
  type StoredLogin,
} from './credential-store.ts'

/** The server entry at `origin` over HTTP, with the given credentials on every request. */
export function httpServer(origin: string): ServerConnector {
  // Checks the origin once, at start, rather than on the first call.
  createHttpProtocolTransport({ origin })
  return credentials => createHttpProtocolTransport({ origin, credentials: () => credentials })
}
