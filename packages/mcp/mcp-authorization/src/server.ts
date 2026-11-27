import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isConnectionTarget } from '@omne-harness/mcp-contract'
import { flagOf, isPlain, scopesOf, textOf, textsOf } from './plain.ts'

export type AuthorizationServer = Readonly<{
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
  metadataDocuments: boolean
  issRequired: boolean
  scopesSupported: readonly string[]
  authMethods: readonly string[]
}>

export type ServerRefusal = 'issuer-mismatch' | 'no-pkce' | 'insecure-endpoint' | 'malformed'

export type ResourceMetadata = Readonly<{ issuer: string; scopes: readonly string[] }>

/** RFC 8414 with OIDC Discovery: path insertion first; an issuer with a path also tries path appending. */
export function serverMetadataCandidatesOf(issuer: string): readonly string[] {
  const url = new URL(issuer)
  const path = url.pathname.replace(/\/$/u, '')
  const at = (suffix: string) => new URL(suffix, url.origin).href
  if (path === '')
    return [at('/.well-known/oauth-authorization-server'), at('/.well-known/openid-configuration')]
  return [
    at(`/.well-known/oauth-authorization-server${path}`),
    at(`/.well-known/openid-configuration${path}`),
    at(`${path}/.well-known/openid-configuration`),
  ]
}

/** The first authorization server a protected resource names, and the scopes it lists. */
export function readResourceMetadata(json: unknown): ResourceMetadata | undefined {
  const issuer = textsOf(json, 'authorization_servers')[0]
  if (issuer === undefined || !isConnectionTarget(issuer)) return undefined
  return { issuer, scopes: textsOf(json, 'scopes_supported') }
}

export function challengeScopesOf(challenge: ReadonlyMap<string, string>): readonly string[] {
  return scopesOf(challenge.get('scope'))
}

function endpointsOf(
  json: unknown,
): Outcome<readonly [string, string, string | undefined], ServerRefusal> {
  const authorization = textOf(json, 'authorization_endpoint')
  const token = textOf(json, 'token_endpoint')
  const registration = textOf(json, 'registration_endpoint')
  if (authorization === undefined || token === undefined) return fail('malformed')
  const named = [authorization, token, ...(registration === undefined ? [] : [registration])]
  if (!named.every(isConnectionTarget)) return fail('insecure-endpoint')
  return succeed([authorization, token, registration])
}

/** Metadata is used only when its issuer is the one the address was built from, character for character. */
export function readServerMetadata(
  issuer: string,
  json: unknown,
): Outcome<AuthorizationServer, ServerRefusal> {
  if (!isPlain(json)) return fail('malformed')
  if (json['issuer'] !== issuer) return fail('issuer-mismatch')
  if (!textsOf(json, 'code_challenge_methods_supported').includes('S256')) return fail('no-pkce')
  const endpoints = endpointsOf(json)
  if ('failure' in endpoints) return endpoints
  const [authorizationEndpoint, tokenEndpoint, registrationEndpoint] = endpoints.ok
  return succeed({
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    ...(registrationEndpoint === undefined ? {} : { registrationEndpoint }),
    metadataDocuments: flagOf(json, 'client_id_metadata_document_supported'),
    issRequired: flagOf(json, 'authorization_response_iss_parameter_supported'),
    scopesSupported: textsOf(json, 'scopes_supported'),
    authMethods: textsOf(json, 'token_endpoint_auth_methods_supported'),
  })
}
