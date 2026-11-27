import type { TenantId } from '@omne-harness/legal-identity'
import type { Ack, Outcome } from '@omne-harness/operation-result'
import type { EndpointHolding } from './brands.ts'

export type GrantKey = Readonly<{ tenant: TenantId; holding: EndpointHolding; endpoint: string }>

export type RegistrationWay = 'configured' | 'metadata-document' | 'dynamic'

export type ClientAuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post'

export type ClientRegistration = Readonly<{
  way: RegistrationWay
  clientId: string
  authMethod: ClientAuthMethod
}>

export type GrantState = 'valid' | 'reconnect'

/** The facts of a grant that are not secret; the tokens are secret bindings of their own. */
export type GrantFacts = Readonly<{
  issuer: string
  resource: string
  tokenEndpoint: string
  scopes: readonly string[]
  expiresAt: number | null
  registration: ClientRegistration
  state: GrantState
  minted: 'exchange' | 'refresh' | 'retry'
  wanted?: readonly string[]
  revision: number
}>

export type PendingAuthorization = Readonly<{
  key: GrantKey
  state: string
  verifier: string
  issuer: string
  issRequired: boolean
  tokenEndpoint: string
  resource: string
  scopes: readonly string[]
  redirectUri: string
  registration: ClientRegistration
  initiator: string
  expiresAt: number
}>

export interface AuthorizationRecords {
  /** Puts the pending authorization of its key; one that stood for the key is void from now on. */
  begin(pending: PendingAuthorization): Promise<Ack<'unavailable'>>
  /** Takes away the pending authorization of a state value in a tenant: each is taken at most once. */
  take(
    tenant: TenantId,
    state: string,
  ): Promise<Outcome<PendingAuthorization | 'absent', 'unavailable'>>
  void(key: GrantKey): Promise<Ack<'unavailable'>>
  read(key: GrantKey): Promise<Outcome<GrantFacts | 'absent', 'unavailable'>>
  write(
    key: GrantKey,
    facts: GrantFacts,
    expected: number | 'absent',
  ): Promise<Outcome<'written', 'conflict' | 'unavailable'>>
  remove(key: GrantKey): Promise<Ack<'unavailable'>>
  registration(
    tenant: TenantId,
    issuer: string,
  ): Promise<Outcome<ClientRegistration | 'absent', 'unavailable'>>
  register(
    tenant: TenantId,
    issuer: string,
    registration: ClientRegistration,
  ): Promise<Ack<'unavailable'>>
}

export type SecretSlot =
  | Readonly<{ kind: 'access' | 'refresh'; key: GrantKey }>
  | Readonly<{ kind: 'client'; tenant: TenantId; issuer: string }>

/** The secret side of grants: tokens and a dynamically registered client secret, each its own binding. */
export interface GrantSecrets {
  read(slot: SecretSlot): Promise<Outcome<string | 'absent', 'unavailable'>>
  write(slot: SecretSlot, value: string): Promise<Ack<'unavailable'>>
  remove(slot: SecretSlot): Promise<Ack<'unavailable'>>
}

export type OAuthAnswer = Readonly<{ status: number; json: unknown }>

export type OAuthBody =
  | Readonly<{ kind: 'form'; fields: Readonly<Record<string, string>> }>
  | Readonly<{ kind: 'json'; value: unknown }>

/** Requests to an authorization server and to protected resource metadata; redirects are not followed. */
export interface OAuthFetch {
  get(url: string, signal: AbortSignal): Promise<Outcome<OAuthAnswer, 'no-answer'>>
  post(
    url: string,
    body: OAuthBody,
    headers: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ): Promise<Outcome<OAuthAnswer, 'no-answer'>>
}

export type ConnectRefusal =
  | 'no-resource-metadata'
  | 'no-authorization-server'
  | 'issuer-mismatch'
  | 'no-pkce'
  | 'insecure-endpoint'
  | 'malformed'
  | 'no-registration'
  | 'registration-refused'
  | 'unavailable'

export type ConnectInput = Readonly<{
  key: GrantKey
  target: string
  configured?: Readonly<{ clientId: string; secret?: string }>
  metadataDocument?: string
  redirectUri: string
  initiator: string
  signal: AbortSignal
}>

export type GrantStanding = Readonly<{ grant: 'none' | GrantState; connecting: boolean }>

export interface GrantConnector {
  begin(
    input: ConnectInput,
  ): Promise<Outcome<Readonly<{ url: string; expiresAt: number }>, ConnectRefusal>>
  disconnect(key: GrantKey): Promise<Ack<'unavailable'>>
  standing(key: GrantKey): Promise<Outcome<GrantStanding, 'unavailable'>>
}

/** Where the person's browser comes back to: it listens while some connection waits for its callback. */
export interface CallbackReceiver {
  open(until: number): Promise<Outcome<string, 'unavailable'>>
}
