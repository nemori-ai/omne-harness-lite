import { fail, succeed, type Ack, type Outcome } from '@omne-harness/operation-result'
import {
  authorizationChallengeOf,
  isConnectionTarget,
  metadataCandidatesOf,
} from '@omne-harness/mcp-contract'
import type {
  ClientRegistration,
  GrantFacts,
  GrantKey,
  PendingAuthorization,
} from '@omne-harness/mcp-contract/provider'
import { judgeCallback, readTokenAnswer, type CallbackQuery, type TokenReading } from './answers.ts'
import type { Deps } from './deps.ts'
import { isPlain } from './plain.ts'
import {
  chooseRegistration,
  readRegistrationAnswer,
  registrationRequestOf,
  type ConfiguredClient,
} from './registration.ts'
import { authorizationUrlOf, codeRequestOf, secretOf } from './requests.ts'
import {
  challengeScopesOf,
  readResourceMetadata,
  readServerMetadata,
  serverMetadataCandidatesOf,
  type AuthorizationServer,
  type ServerRefusal,
} from './server.ts'

export type BeginInput = Readonly<{
  key: GrantKey
  target: string
  challenge?: string
  configured?: ConfiguredClient
  metadataDocument?: string
  redirectUri: string
  initiator: string
  signal: AbortSignal
}>

export type BeginRefusal =
  | ServerRefusal
  | 'no-resource-metadata'
  | 'no-authorization-server'
  | 'no-registration'
  | 'registration-refused'
  | 'unavailable'

export type Begun = Readonly<{ url: string; expiresAt: number }>

export type CallbackOutcome = 'connected' | 'not-connected' | 'unknown'

/** Which tenant a state value of this process belongs to; after a restart the tenants are looked through. */
export type Routes = Map<string, Readonly<{ key: GrantKey; expiresAt: number }>>

function route(routes: Routes, pending: PendingAuthorization, now: number): void {
  const same = JSON.stringify([pending.key.tenant, pending.key.holding, pending.key.endpoint])
  for (const [state, { key, expiresAt }] of routes)
    if (expiresAt <= now || JSON.stringify([key.tenant, key.holding, key.endpoint]) === same)
      routes.delete(state)
  routes.set(pending.state, { key: pending.key, expiresAt: pending.expiresAt })
}

async function takePending(
  deps: Deps,
  routes: Routes,
  state: string,
): Promise<Outcome<PendingAuthorization | 'absent', 'unavailable'>> {
  const routed = routes.get(state)
  routes.delete(state)
  if (routed !== undefined) return deps.records.take(routed.key.tenant, state)
  const tenants = deps.tenants === undefined ? succeed([]) : await deps.tenants()
  if ('failure' in tenants) return tenants
  for (const tenant of tenants.ok) {
    const taken = await deps.records.take(tenant, state)
    if ('failure' in taken || taken.ok !== 'absent') return taken
  }
  return succeed('absent')
}

async function firstObject(
  deps: Deps,
  urls: readonly string[],
  signal: AbortSignal,
): Promise<unknown> {
  for (const url of urls.filter(isConnectionTarget)) {
    if (signal.aborted) return undefined
    const got = await deps.fetch.get(url, signal)
    if ('ok' in got && got.ok.status === 200 && isPlain(got.ok.json)) return got.ok.json
  }
  return undefined
}

async function serverOf(
  deps: Deps,
  issuer: string,
  signal: AbortSignal,
): Promise<Outcome<AuthorizationServer, BeginRefusal>> {
  const json = await firstObject(deps, serverMetadataCandidatesOf(issuer), signal)
  return json === undefined ? fail('no-authorization-server') : readServerMetadata(issuer, json)
}

async function registered(
  deps: Deps,
  input: BeginInput,
  server: AuthorizationServer,
  endpoint: string,
  scopes: readonly string[],
): Promise<Outcome<ClientRegistration, BeginRefusal>> {
  const body = registrationRequestOf(input.redirectUri, scopes)
  const read = readRegistrationAnswer(
    await deps.fetch.post(endpoint, body, {}, input.signal),
    server,
  )
  if ('failure' in read)
    return fail(read.failure === 'refused' ? 'registration-refused' : 'unavailable')
  const { tenant } = input.key
  if (read.ok.secret !== undefined) {
    const kept = await deps.secrets.write(
      { kind: 'client', tenant, issuer: server.issuer },
      read.ok.secret,
    )
    if ('failure' in kept) return fail('unavailable')
  }
  const saved = await deps.records.register(tenant, server.issuer, read.ok.registration)
  return 'failure' in saved ? fail('unavailable') : succeed(read.ok.registration)
}

async function registrationFor(
  deps: Deps,
  input: BeginInput,
  server: AuthorizationServer,
  scopes: readonly string[],
): Promise<Outcome<ClientRegistration, BeginRefusal>> {
  const saved = await deps.records.registration(input.key.tenant, server.issuer)
  if ('failure' in saved) return fail('unavailable')
  const choice = chooseRegistration({
    server,
    ...(input.configured === undefined ? {} : { configured: input.configured }),
    ...(input.metadataDocument === undefined ? {} : { metadataDocument: input.metadataDocument }),
    ...(saved.ok === 'absent' ? {} : { saved: saved.ok }),
  })
  if ('failure' in choice) return choice
  if (choice.ok.kind === 'ready') return succeed(choice.ok.registration)
  return registered(deps, input, server, choice.ok.endpoint, scopes)
}

async function wantedOf(
  deps: Deps,
  key: GrantKey,
): Promise<Outcome<readonly string[] | undefined, 'unavailable'>> {
  const facts = await deps.records.read(key)
  if ('failure' in facts) return facts
  return succeed(facts.ok === 'absent' ? undefined : facts.ok.wanted)
}

/** A new connection: discovery, a registration, then a pending authorization that voids the one before it. */
export async function begin(
  deps: Deps,
  routes: Routes,
  input: BeginInput,
): Promise<Outcome<Begun, BeginRefusal>> {
  const challenge = authorizationChallengeOf(input.challenge)
  const candidates = metadataCandidatesOf(input.target, challenge)
  const resource = await firstObject(deps, candidates, input.signal)
  if (resource === undefined) return fail('no-resource-metadata')
  const named = readResourceMetadata(resource)
  if (named === undefined) return fail('no-authorization-server')
  const server = await serverOf(deps, named.issuer, input.signal)
  if ('failure' in server) return server
  const wanted = await wantedOf(deps, input.key)
  if ('failure' in wanted) return fail('unavailable')
  const asked = challengeScopesOf(challenge)
  const scopes = wanted.ok ?? (asked.length > 0 ? asked : named.scopes)
  const registration = await registrationFor(deps, input, server.ok, scopes)
  if ('failure' in registration) return registration
  const expiresAt = deps.now() + deps.pendingMs
  const pending: PendingAuthorization = {
    key: input.key,
    state: secretOf(deps.random),
    verifier: secretOf(deps.random),
    issuer: server.ok.issuer,
    issRequired: server.ok.issRequired,
    tokenEndpoint: server.ok.tokenEndpoint,
    resource: input.target,
    scopes,
    redirectUri: input.redirectUri,
    registration: registration.ok,
    initiator: input.initiator,
    expiresAt,
  }
  const put = await deps.records.begin(pending)
  if ('failure' in put) return fail('unavailable')
  route(routes, pending, deps.now())
  return succeed({ url: authorizationUrlOf(server.ok, pending), expiresAt })
}

export async function clientSecretOf(
  deps: Deps,
  key: GrantKey,
  issuer: string,
  registration: ClientRegistration,
): Promise<Outcome<string | undefined, 'unavailable'>> {
  if (registration.authMethod === 'none') return succeed(undefined)
  const read =
    registration.way !== 'configured'
      ? await deps.secrets.read({ kind: 'client', tenant: key.tenant, issuer })
      : deps.configuredSecret === undefined
        ? succeed('absent' as const)
        : await deps.configuredSecret(key)
  if ('failure' in read) return read
  return succeed(read.ok === 'absent' ? undefined : read.ok)
}

export const expiryOf = (now: number, expiresIn: number | undefined): number | null =>
  expiresIn === undefined ? null : now + expiresIn * 1000

/** The refresh material first, then the access token; an exchange without refresh material removes the old one. */
export async function keepTokens(
  deps: Deps,
  key: GrantKey,
  issued: Readonly<{ access: string; refresh?: string }>,
  keepOldRefresh = false,
): Promise<Ack<'unavailable'>> {
  const slot = { kind: 'refresh', key } as const
  if (issued.refresh !== undefined) {
    const kept = await deps.secrets.write(slot, issued.refresh)
    if ('failure' in kept) return kept
  } else if (!keepOldRefresh) {
    const removed = await deps.secrets.remove(slot)
    if ('failure' in removed) return removed
  }
  return deps.secrets.write({ kind: 'access', key }, issued.access)
}

async function adopt(
  deps: Deps,
  pending: PendingAuthorization,
  issued: Extract<TokenReading, { kind: 'issued' }>,
): Promise<CallbackOutcome> {
  const { key } = pending
  const prior = await deps.records.read(key)
  if ('failure' in prior) return 'unknown'
  const kept = await keepTokens(deps, key, issued)
  if ('failure' in kept) return 'unknown'
  const before = prior.ok === 'absent' ? undefined : prior.ok
  const facts: GrantFacts = {
    issuer: pending.issuer,
    resource: pending.resource,
    tokenEndpoint: pending.tokenEndpoint,
    scopes: issued.scopes ?? pending.scopes,
    expiresAt: expiryOf(deps.now(), issued.expiresIn),
    registration: pending.registration,
    state: 'valid',
    minted: 'exchange',
    revision: (before?.revision ?? 0) + 1,
  }
  const written = await deps.records.write(key, facts, before?.revision ?? 'absent')
  return 'ok' in written ? 'connected' : 'unknown'
}

/** The pending authorization is taken away before anything is checked: a state value buys at most one exchange. */
export async function callback(
  deps: Deps,
  routes: Routes,
  query: CallbackQuery,
  signal: AbortSignal,
): Promise<CallbackOutcome> {
  if (query.state === undefined || query.state === '') return 'not-connected'
  const taken = await takePending(deps, routes, query.state)
  if ('failure' in taken) return 'unknown'
  if (taken.ok === 'absent') return 'not-connected'
  const pending = taken.ok
  const verdict = judgeCallback(pending, query, deps.now())
  if (verdict.kind !== 'exchange') return 'not-connected'
  const secret = await clientSecretOf(deps, pending.key, pending.issuer, pending.registration)
  if ('failure' in secret) return 'not-connected'
  const request = codeRequestOf(pending, verdict.code, secret.ok)
  const answer = await deps.fetch.post(pending.tokenEndpoint, request.body, request.headers, signal)
  const reading = readTokenAnswer(answer)
  if (reading.kind === 'refused') return 'not-connected'
  if (reading.kind === 'unknown') return 'unknown'
  return adopt(deps, pending, reading)
}
