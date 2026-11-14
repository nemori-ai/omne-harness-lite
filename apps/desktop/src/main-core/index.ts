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

export function httpServer(origin: string): ServerConnector {
  createHttpProtocolTransport({ origin })
  return credentials => createHttpProtocolTransport({ origin, credentials: () => credentials })
}
