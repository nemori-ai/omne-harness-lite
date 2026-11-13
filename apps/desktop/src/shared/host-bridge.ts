// What the page gets from its host (RFC-0015 §10「页面与主进程之间的通道」, seam four of the
// first vertical). Pure types: no Node, no Electron. The web host of this run and a later Electron
// main process implement the same object; the page does not change.
import type { Transport } from '@omne-harness/sdk/core'
import type { LoginStateSource } from '@omne-harness/client-assembly/cordis'

export type LoginResult = 'signed-in' | 'auth-failed' | 'unknown' | 'unavailable'

export type LogoutResult = 'signed-out' | 'unknown'

/**
 * The credentials the page hands over. The field names are the body of `identity/v1`
 * `issue-login`: `loginIdentifier` and `credential`.
 */
export type LoginCredentials = Readonly<{ loginIdentifier: string; credential: string }>

export interface HostBridge {
  /** Sends calls and opens observations. The host refuses operations marked `carriesCredential`. */
  readonly transport: Transport
  /** Four states: signed out, signing in, signed in, signing out. */
  readonly loginState: LoginStateSource
  /** Hands over the credentials. The answer is only the result, never a login proof. */
  login(credentials: LoginCredentials): Promise<LoginResult>
  logout(): Promise<LogoutResult>
}
