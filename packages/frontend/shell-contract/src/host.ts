export type LoginCredentials = Readonly<{ loginIdentifier: string; credential: string }>

export type LoginResult = 'signed-in' | 'auth-failed' | 'unknown' | 'unavailable'

export type LogoutResult = 'signed-out' | 'unknown'

export interface ScopeSource {
  get(): string | undefined
  set(scope: string | undefined): void
  subscribe(listener: (scope: string | undefined) => void): () => void
}
