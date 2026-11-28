import { createHash } from 'node:crypto'
import type {
  ClientRegistration,
  GrantFacts,
  OAuthBody,
  PendingAuthorization,
} from '@omne-harness/mcp-contract/provider'
import type { AuthorizationServer } from './server.ts'

export type Random = (bytes: number) => Uint8Array

export const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

/** A fresh secret of 32 bytes: 43 characters, within the 43 to 128 of PKCE. */
export const secretOf = (random: Random): string => base64url(random(32))

export const challengeOf = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url')

export function authorizationUrlOf(
  server: AuthorizationServer,
  pending: PendingAuthorization,
): string {
  const url = new URL(server.authorizationEndpoint)
  const set = (name: string, value: string) => url.searchParams.set(name, value)
  set('response_type', 'code')
  set('client_id', pending.registration.clientId)
  set('redirect_uri', pending.redirectUri)
  set('code_challenge', challengeOf(pending.verifier))
  set('code_challenge_method', 'S256')
  set('state', pending.state)
  set('resource', pending.resource)
  if (pending.scopes.length > 0) set('scope', pending.scopes.join(' '))
  return url.href
}

export type TokenRequest = Readonly<{ body: OAuthBody; headers: Readonly<Record<string, string>> }>

function withClient(
  fields: Readonly<Record<string, string>>,
  registration: ClientRegistration,
  secret: string | undefined,
): TokenRequest {
  const id = { client_id: registration.clientId }
  if (registration.authMethod === 'client_secret_basic' && secret !== undefined) {
    const pair = `${encodeURIComponent(registration.clientId)}:${encodeURIComponent(secret)}`
    const authorization = `Basic ${Buffer.from(pair).toString('base64')}`
    return { body: { kind: 'form', fields }, headers: { authorization } }
  }
  const post = registration.authMethod === 'client_secret_post' && secret !== undefined
  const client = post ? { ...id, client_secret: secret } : id
  return { body: { kind: 'form', fields: { ...fields, ...client } }, headers: {} }
}

export function codeRequestOf(
  pending: PendingAuthorization,
  code: string,
  secret: string | undefined,
): TokenRequest {
  const fields = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
    resource: pending.resource,
  }
  return withClient(fields, pending.registration, secret)
}

export function refreshRequestOf(
  facts: GrantFacts,
  refreshToken: string,
  secret: string | undefined,
): TokenRequest {
  const fields = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    resource: facts.resource,
  }
  return withClient(fields, facts.registration, secret)
}
