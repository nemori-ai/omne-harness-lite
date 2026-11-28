import type { Contract, Effect } from '@omne-harness/dynamis'
export type LoginCredentials = Readonly<{ loginIdentifier: string; credential: string }>

export type LoginResult = 'signed-in' | 'auth-failed' | 'rejected' | 'unknown' | 'unavailable'

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
export type Hosted = Readonly<{
  by: string
  dispose(): Promise<void>
  /** How each item this scope put stands now: in effect, or why not. */
  effects(): readonly Effect[]
}>

/** What did not come up: a module that threw while it started, or what a module holds back and says so. */
export type Fallen = Readonly<{ name: string; why: 'threw' | 'held' }>

/** Something the host could not read in an item it drew, and what it drew instead; it names the place, not who put it. */
export type Trouble = Readonly<{ point: string; key: string; id: string; says: string }>

/** What the tree of the interface has now, for whoever tells it on: its points, its parts, and what it could not read. */
export type Described = Readonly<{
  points: readonly Readonly<{
    name: string
    summary: string
    contract: Contract
    /** The names the data of an item may use where the set is closed, each with its value now. */
    dataKeys?: readonly Readonly<{ name: string; now: string | null }>[]
    form?: Readonly<{ gives: string; example: string }>
  }>[]
  parts: readonly Readonly<{
    name: string
    label: string
    summary: string
    depths: readonly ('tokens' | 'style' | 'render')[]
    within: string | null
  }>[]
  troubles: readonly Trouble[]
}>
