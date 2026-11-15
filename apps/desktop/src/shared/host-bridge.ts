import type { Transport } from '@omne-harness/sdk/core'
import type { LoginStateSource } from '@omne-harness/client-assembly/cordis'

export type LoginResult = 'signed-in' | 'auth-failed' | 'unknown' | 'unavailable'

export type LogoutResult = 'signed-out' | 'unknown'

export type LoginCredentials = Readonly<{ loginIdentifier: string; credential: string }>

export interface HostBridge {
  readonly transport: Transport
  readonly loginState: LoginStateSource
  /** Hands over the credentials. The answer is only the result, never a login proof. */
  login(credentials: LoginCredentials): Promise<LoginResult>
  logout(): Promise<LogoutResult>
}
