import { fail, succeed, type Ack, type Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  CredentialRefusal,
  GrantFacts,
  GrantKey,
  HttpCredentialHandle,
} from '@omne-harness/mcp-contract/provider'
import { readTokenAnswer } from './answers.ts'
import { clientSecretOf, expiryOf, keepTokens } from './connect.ts'
import type { Deps } from './deps.ts'
import { union } from './plain.ts'
import { refreshRequestOf } from './requests.ts'

export type Refreshed =
  | Readonly<{ kind: 'refreshed'; token: string }>
  | Readonly<{ kind: 'refused' | 'unknown' | 'gone' | 'no-refresh' }>

/** At most one refresh of a grant is on its way; everyone who needs it waits for that one. */
export type Flights = Map<string, Promise<Refreshed>>

const UNKNOWN: Refreshed = { kind: 'unknown' }
const flightOf = (key: GrantKey): string => JSON.stringify([key.tenant, key.holding])

async function toReconnect(
  deps: Deps,
  key: GrantKey,
  facts: GrantFacts,
  wanted?: readonly string[],
): Promise<Ack<'unavailable'>> {
  const next: GrantFacts = {
    ...facts,
    state: 'reconnect',
    revision: facts.revision + 1,
    ...(wanted === undefined ? {} : { wanted }),
  }
  const written = await deps.records.write(key, next, facts.revision)
  return 'ok' in written ? succeed(true) : fail('unavailable')
}

async function adoptRefresh(
  deps: Deps,
  key: GrantKey,
  facts: GrantFacts,
  issued: Extract<ReturnType<typeof readTokenAnswer>, { kind: 'issued' }>,
  cause: 'due' | 'rejected',
): Promise<Refreshed> {
  const kept = await keepTokens(deps, key, issued, true)
  if ('failure' in kept) return UNKNOWN
  const next: GrantFacts = {
    ...facts,
    expiresAt: expiryOf(deps.now(), issued.expiresIn),
    scopes: issued.scopes ?? facts.scopes,
    minted: cause === 'rejected' ? 'retry' : 'refresh',
    revision: facts.revision + 1,
  }
  const written = await deps.records.write(key, next, facts.revision)
  return 'ok' in written ? { kind: 'refreshed', token: issued.access } : UNKNOWN
}

type Refreshable = Readonly<{ facts: GrantFacts; refresh: string; secret: string | undefined }>

async function refreshableOf(deps: Deps, key: GrantKey): Promise<Refreshable | Refreshed> {
  const read = await deps.records.read(key)
  if ('failure' in read) return UNKNOWN
  if (read.ok === 'absent') return { kind: 'gone' }
  const facts = read.ok
  if (facts.state === 'reconnect') return { kind: 'refused' }
  const held = await deps.secrets.read({ kind: 'refresh', key })
  if ('failure' in held) return UNKNOWN
  if (held.ok === 'absent') return { kind: 'no-refresh' }
  const secret = await clientSecretOf(deps, key, facts.issuer, facts.registration)
  return 'failure' in secret ? UNKNOWN : { facts, refresh: held.ok, secret: secret.ok }
}

/** Refresh material first, then the access token, then the facts; an outcome that is not known removes nothing. */
async function refresh(deps: Deps, key: GrantKey, cause: 'due' | 'rejected'): Promise<Refreshed> {
  const ready = await refreshableOf(deps, key)
  if ('kind' in ready) return ready
  const { facts } = ready
  const request = refreshRequestOf(facts, ready.refresh, ready.secret)
  const signal = AbortSignal.timeout(deps.requestMs)
  const reading = readTokenAnswer(
    await deps.fetch.post(facts.tokenEndpoint, request.body, request.headers, signal),
  )
  if (reading.kind === 'unknown') return UNKNOWN
  if (reading.kind === 'refused') {
    await toReconnect(deps, key, facts)
    return { kind: 'refused' }
  }
  return adoptRefresh(deps, key, facts, reading, cause)
}

export function refreshOnce(
  deps: Deps,
  flights: Flights,
  key: GrantKey,
  cause: 'due' | 'rejected',
): Promise<Refreshed> {
  const id = flightOf(key)
  const flying = flights.get(id)
  if (flying !== undefined) return flying
  const started = refresh(deps, key, cause)
    .catch(() => UNKNOWN)
    .finally(() => flights.delete(id))
  flights.set(id, started)
  return started
}

/** Each waiter waits only until its own bound; the refresh itself goes on for the others. */
async function within(work: Promise<Refreshed>, signal: AbortSignal): Promise<Refreshed> {
  if (signal.aborted) return UNKNOWN
  const stopped = Promise.withResolvers<Refreshed>()
  const stop = () => stopped.resolve(UNKNOWN)
  signal.addEventListener('abort', stop, { once: true })
  try {
    return await Promise.race([work, stopped.promise])
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

const ANSWER = { refused: 'rejected', gone: 'missing', unknown: 'unknown' } as const

async function heldToken(
  deps: Deps,
  key: GrantKey,
): Promise<Outcome<string | 'absent', CredentialFailure>> {
  const access = await deps.secrets.read({ kind: 'access', key })
  return 'failure' in access ? fail('unknown') : access
}

async function tokenOf(
  deps: Deps,
  flights: Flights,
  key: GrantKey,
  due: boolean,
  signal: AbortSignal,
): Promise<Outcome<string, CredentialFailure>> {
  if (!due) {
    const held = await heldToken(deps, key)
    if ('failure' in held) return held
    if (held.ok !== 'absent') return succeed(held.ok)
  }
  const result = await within(refreshOnce(deps, flights, key, 'due'), signal)
  if (result.kind === 'refreshed') return succeed(result.token)
  if (result.kind !== 'no-refresh') return fail(ANSWER[result.kind])
  const held = await heldToken(deps, key)
  if ('failure' in held) return held
  return held.ok === 'absent' ? fail('missing') : succeed(held.ok)
}

type Shown = Readonly<{ token: string; expiresAt: number | null }>

const isDue = (deps: Deps, expiresAt: number | null): boolean =>
  expiresAt !== null && deps.now() >= expiresAt - deps.refreshLeadMs

async function shownOf(
  deps: Deps,
  flights: Flights,
  key: GrantKey,
  target: string,
  signal: AbortSignal,
): Promise<Outcome<Shown, CredentialFailure>> {
  const read = await deps.records.read(key)
  if ('failure' in read) return fail('unknown')
  if (read.ok === 'absent') return fail('missing')
  const facts = read.ok
  if (facts.state === 'reconnect' || facts.resource !== target) return fail('rejected')
  const due = isDue(deps, facts.expiresAt)
  const token = await tokenOf(deps, flights, key, due, signal)
  if ('failure' in token) return token
  if (!due) return succeed({ token: token.ok, expiresAt: facts.expiresAt })
  const after = await deps.records.read(key)
  const fresh = 'ok' in after && after.ok !== 'absent' ? after.ok.expiresAt : facts.expiresAt
  return succeed({ token: token.ok, expiresAt: fresh })
}

/** A token is given only to a request for the resource it was granted for; each request is shown one that is not due, refreshed first when it is. */
export async function acquire(
  deps: Deps,
  flights: Flights,
  key: GrantKey,
  target: string,
  signal: AbortSignal,
): Promise<Outcome<HttpCredentialHandle, CredentialFailure>> {
  const first = await shownOf(deps, flights, key, target, signal)
  if ('failure' in first) return first
  let current = first.ok
  let fresh = true
  return succeed({
    purpose: 'http-authorization',
    async authorize(headers) {
      if (!fresh && isDue(deps, current.expiresAt)) {
        const bound = AbortSignal.timeout(deps.requestMs)
        const next = await shownOf(deps, flights, key, target, bound)
        if ('failure' in next) return fail(next.failure === 'unknown' ? 'unknown' : 'rejected')
        current = next.ok
      }
      fresh = false
      headers.set('authorization', `Bearer ${current.token}`)
      return succeed(true)
    },
    async reportRejection(refusal) {
      await rejected(deps, flights, key, current.token, refusal)
    },
    async release() {},
  })
}

/** The resource refused a token: wanting scopes asks for a new connection with them; else refresh once, and a token that a refresh for a refusal gave, refused again, asks for a new connection. */
export async function rejected(
  deps: Deps,
  flights: Flights,
  key: GrantKey,
  token: string,
  refusal: CredentialRefusal,
): Promise<void> {
  const read = await deps.records.read(key)
  if ('failure' in read || read.ok === 'absent' || read.ok.state !== 'valid') return
  const facts = read.ok
  const current = await deps.secrets.read({ kind: 'access', key })
  if ('failure' in current || current.ok !== token) return
  if (refusal.kind === 'insufficient-scope') {
    await toReconnect(deps, key, facts, union(facts.scopes, facts.wanted ?? [], refusal.scopes))
    return
  }
  if (facts.minted === 'retry') {
    await toReconnect(deps, key, facts)
    return
  }
  const result = await refreshOnce(deps, flights, key, 'rejected')
  if (result.kind === 'no-refresh') await toReconnect(deps, key, facts)
}

export async function requireScopes(
  deps: Deps,
  key: GrantKey,
  scopes: readonly string[],
): Promise<Ack<'unavailable'>> {
  const read = await deps.records.read(key)
  if ('failure' in read) return read
  if (read.ok === 'absent') return succeed(true)
  const facts = read.ok
  return toReconnect(deps, key, facts, union(facts.scopes, facts.wanted ?? [], scopes))
}

/** The secrets go before the facts: facts without secrets read as missing, never as a usable grant. */
export async function disconnect(deps: Deps, key: GrantKey): Promise<Ack<'unavailable'>> {
  const steps = [
    () => deps.records.void(key),
    () => deps.secrets.remove({ kind: 'access', key }),
    () => deps.secrets.remove({ kind: 'refresh', key }),
    () => deps.records.remove(key),
  ]
  for (const step of steps) {
    const done = await step()
    if ('failure' in done) return fail('unavailable')
  }
  return succeed(true)
}
