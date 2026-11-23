export type LoginCredentials = Readonly<{ loginIdentifier: string; credential: string }>

export type LoginResult = 'signed-in' | 'auth-failed' | 'unknown' | 'unavailable'

export type LogoutResult = 'signed-out' | 'unknown'

export type ShellLoginState = 'signed-out' | 'signing-in' | 'signed-in' | 'signing-out'

export interface ShellLogin {
  state(): ShellLoginState
  subscribe(listener: (state: ShellLoginState) => void): () => void
  login(credentials: LoginCredentials): Promise<LoginResult>
  logout(): Promise<LogoutResult>
}

export interface ScopeSource {
  get(): string | undefined
  set(scope: string | undefined): void
  subscribe(listener: (scope: string | undefined) => void): () => void
}

/** A scope a module opened under itself: `by` is the name its entries carry on the registry. */
export type Hosted = Readonly<{ by: string; dispose(): Promise<void> }>

/** What did not come up: a module that threw while it started, or what a module holds back and says so. */
export type Fallen = Readonly<{ name: string; why: 'threw' | 'held' }>
