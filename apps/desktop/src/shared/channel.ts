import type { Transport } from '@omne-harness/sdk/core'
import type { LoginStateSource } from '@omne-harness/client-assembly/cordis'

export type LoginResult = 'signed-in' | 'auth-failed' | 'unknown' | 'unavailable'

export type LogoutResult = 'signed-out' | 'unknown'

export type LoginCredentials = Readonly<{ loginIdentifier: string; credential: string }>

export interface ForwardingBridge {
  readonly transport: Transport
  readonly loginState: LoginStateSource
  /** Hands over the credentials. The answer is only the result, never a login proof. */
  login(credentials: LoginCredentials): Promise<LoginResult>
  logout(): Promise<LogoutResult>
}

export type ChannelAnswer = { readonly text: string } | { readonly refused: true }

export type ObserveStream = AsyncIterator<string, unknown, undefined>

export type ObserveOpening = { readonly stream: ObserveStream } | { readonly refused: true }

/** What the page asks of the forwarding layer. A rejection reads as "may have been sent". */
export interface ForwardingChannel {
  call(request: string, signal?: AbortSignal): Promise<ChannelAnswer>
  observe(request: string, signal: AbortSignal): Promise<ObserveOpening>
  login(credentials: string): Promise<ChannelAnswer>
  logout(): Promise<ChannelAnswer>
  loginStanding(): Promise<ChannelAnswer>
  /** Calls `listener` each time the page's event stream opened again after it broke. */
  onReconnect?(listener: () => void): () => void
}
