import type { Ack, Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  GrantKey,
  HttpCredentialHandle,
} from '@omne-harness/mcp-contract/provider'
import type { CallbackQuery } from './answers.ts'
import {
  begin,
  callback,
  type BeginInput,
  type BeginRefusal,
  type Begun,
  type CallbackOutcome,
  type Routes,
} from './connect.ts'
import type { McpAuthorizationDeps } from './deps.ts'
import { acquire, disconnect, requireScopes, type Flights } from './use.ts'

export {
  judgeCallback,
  readTokenAnswer,
  type CallbackQuery,
  type CallbackVerdict,
  type TokenReading,
} from './answers.ts'
export type { BeginInput, BeginRefusal, Begun, CallbackOutcome } from './connect.ts'
export type { McpAuthorizationDeps } from './deps.ts'
export {
  chooseRegistration,
  type ConfiguredClient,
  type RegistrationChoice,
} from './registration.ts'
export { authorizationUrlOf, challengeOf } from './requests.ts'
export {
  readResourceMetadata,
  readServerMetadata,
  serverMetadataCandidatesOf,
  type AuthorizationServer,
  type ServerRefusal,
} from './server.ts'

export type McpAuthorization = Readonly<{
  begin(input: BeginInput): Promise<Outcome<Begun, BeginRefusal>>
  callback(query: CallbackQuery, signal: AbortSignal): Promise<CallbackOutcome>
  acquire(
    key: GrantKey,
    target: string,
    signal: AbortSignal,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
  requireScopes(key: GrantKey, scopes: readonly string[]): Promise<Ack<'unavailable'>>
  disconnect(key: GrantKey): Promise<Ack<'unavailable'>>
}>

/** The OAuth grants of MCP endpoints: discovery, registration, the callback, use and refresh. */
export function createMcpAuthorization(deps: McpAuthorizationDeps): McpAuthorization {
  const flights: Flights = new Map()
  const routes: Routes = new Map()
  return {
    begin: input => begin(deps, routes, input),
    callback: (query, signal) => callback(deps, routes, query, signal),
    acquire: (key, target, signal) => acquire(deps, flights, key, target, signal),
    requireScopes: (key, scopes) => requireScopes(deps, key, scopes),
    disconnect: key => disconnect(deps, key),
  }
}
