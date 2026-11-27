import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ClientAuthMethod,
  ClientRegistration,
  OAuthAnswer,
  OAuthBody,
} from '@omne-harness/mcp-contract/provider'
import { textOf } from './plain.ts'
import type { AuthorizationServer } from './server.ts'

export type ConfiguredClient = Readonly<{ clientId: string; secret?: string }>

export type RegistrationChoice =
  | Readonly<{ kind: 'ready'; registration: ClientRegistration }>
  | Readonly<{ kind: 'register'; endpoint: string }>

export type RegistrationInput = Readonly<{
  server: AuthorizationServer
  configured?: ConfiguredClient
  metadataDocument?: string
  saved?: ClientRegistration
}>

function secretMethodOf(server: AuthorizationServer): ClientAuthMethod {
  const offered = server.authMethods
  return offered.length === 0 || offered.includes('client_secret_basic')
    ? 'client_secret_basic'
    : 'client_secret_post'
}

/** The order of the protocol: a client the person configured, a metadata document, one registered before, dynamic registration. */
export function chooseRegistration(
  input: RegistrationInput,
): Outcome<RegistrationChoice, 'no-registration'> {
  const { server, configured, metadataDocument, saved } = input
  if (configured !== undefined) {
    const authMethod = configured.secret === undefined ? 'none' : secretMethodOf(server)
    return succeed({
      kind: 'ready',
      registration: { way: 'configured', clientId: configured.clientId, authMethod },
    })
  }
  if (server.metadataDocuments && metadataDocument !== undefined)
    return succeed({
      kind: 'ready',
      registration: { way: 'metadata-document', clientId: metadataDocument, authMethod: 'none' },
    })
  if (saved !== undefined && saved.way === 'dynamic')
    return succeed({ kind: 'ready', registration: saved })
  if (server.registrationEndpoint !== undefined)
    return succeed({ kind: 'register', endpoint: server.registrationEndpoint })
  return fail('no-registration')
}

export function registrationRequestOf(redirectUri: string, scopes: readonly string[]): OAuthBody {
  return {
    kind: 'json',
    value: {
      client_name: 'omne',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
      ...(scopes.length === 0 ? {} : { scope: scopes.join(' ') }),
    },
  }
}

export type Registered = Readonly<{ registration: ClientRegistration; secret?: string }>

export function readRegistrationAnswer(
  answer: Outcome<OAuthAnswer, 'no-answer'>,
  server: AuthorizationServer,
): Outcome<Registered, 'refused' | 'unknown'> {
  if ('failure' in answer || answer.ok.status >= 500) return fail('unknown')
  const { status, json } = answer.ok
  const clientId = textOf(json, 'client_id')
  if (status !== 200 && status !== 201) return fail('refused')
  if (clientId === undefined) return fail('unknown')
  const secret = textOf(json, 'client_secret')
  const authMethod = secret === undefined ? 'none' : secretMethodOf(server)
  return succeed({
    registration: { way: 'dynamic', clientId, authMethod },
    ...(secret === undefined ? {} : { secret }),
  })
}
