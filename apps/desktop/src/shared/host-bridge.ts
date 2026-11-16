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

export type HostAnswer = { readonly text: string } | { readonly refused: true }

export interface HostHandle {
  close(): void
}

export interface OmneHost {
  call(request: string): Promise<HostAnswer>
  observe(request: string, listener: (event: string) => void): Promise<HostHandle | undefined>
  login(credentials: string): Promise<HostAnswer>
  logout(): Promise<HostAnswer>
  loginState(listener: (state: string) => void): Promise<HostHandle | undefined>
}

export const OMNE_HOST_GLOBAL = 'omneHost'

export const OMNE_HOST_METHODS = ['call', 'observe', 'login', 'logout', 'loginState'] as const

export const HOST_IPC = {
  call: 'omne:call',
  observe: 'omne:observe',
  observeClose: 'omne:observe-close',
  login: 'omne:login',
  logout: 'omne:logout',
  loginState: 'omne:login-state',
  observeEvent: 'omne:observe-event',
  loginStateEvent: 'omne:login-state-event',
} as const

export type ObserveStream = AsyncIterator<string, unknown, undefined>

export type ObserveOpening = { readonly stream: ObserveStream } | { readonly refused: true }

/** What the page asks of its host. Every method may reject; the page reads a rejection as "may have been sent". */
export interface HostChannel {
  call(request: string, signal?: AbortSignal): Promise<HostAnswer>
  observe(request: string, signal: AbortSignal): Promise<ObserveOpening>
  login(credentials: string): Promise<HostAnswer>
  logout(): Promise<HostAnswer>
  loginState(signal: AbortSignal): AsyncIterable<string>
}

export type HostObserveReply = { readonly id: number } | { readonly refused: true }

export type HostSubscribeReply = { readonly subscribed: true } | { readonly refused: true }

export type HostObserveEvent = { readonly id: number; readonly text: string }
