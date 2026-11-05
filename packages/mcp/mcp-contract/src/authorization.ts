// The authorization discovery of SPEC R4 and T4, once for every transport: the parameters of the
// challenge, the metadata addresses to try in order, the discovery assembled from what was
// fetched, and the fetch loop over a transport's metadata fetch.
import type { JsonValue } from '@omne-harness/json-text'
import { isObject, itemsOf, member } from './json.ts'
import type { AuthorizationDiscovery } from './outcomes.ts'

export const METADATA_PATH = '/.well-known/oauth-protected-resource'

/**
 * The parameters of a `WWW-Authenticate` challenge by lower-case name, from `name="value"` and
 * `name=value` pairs. Any auth scheme; an absent header has no parameter.
 */
export function authorizationChallengeOf(header: string | undefined): ReadonlyMap<string, string> {
  const parameters = new Map<string, string>()
  if (header === undefined) return parameters
  for (const match of header.matchAll(/([A-Za-z_]+)=(?:"([^"]*)"|([^\s,"]+))/gu)) {
    const name = match[1]
    const value = match[2] ?? match[3]
    if (name !== undefined && value !== undefined && !parameters.has(name.toLowerCase()))
      parameters.set(name.toLowerCase(), value)
  }
  return parameters
}

/**
 * The protected resource metadata addresses to fetch, in order (R4): the `resource_metadata` of
 * the challenge alone when it names one; otherwise the well-known path with the path of the
 * target, then the root well-known path.
 */
export function metadataCandidatesOf(
  target: string,
  challenge: ReadonlyMap<string, string>,
): readonly string[] {
  const named = challenge.get('resource_metadata')
  if (named !== undefined) return [named]
  const origin = new URL(target)
  const path = origin.pathname.replace(/\/$/u, '')
  return [new URL(`${METADATA_PATH}${path}`, origin).href, new URL(METADATA_PATH, origin).href]
}

/** The text items of a list member, or none. */
function textsOf(object: JsonValue | undefined, key: string): readonly string[] {
  const items = isObject(object) ? itemsOf(member(object, key)) : undefined
  return (items ?? []).flatMap(item => (item.kind === 'string' ? [item.value] : []))
}

/**
 * The authorization discovery (R4) from the challenge, the candidate addresses and what each
 * fetch read: `fetched[i]` is the JSON read at `candidates[i]`, or undefined when nothing JSON
 * was read there. A fetch loop stops at the first JSON object, so `fetched` may be shorter than
 * `candidates`. The reported address is where an object was read, else the last candidate.
 */
export function authorizationDiscoveryOf(
  challenge: ReadonlyMap<string, string>,
  candidates: readonly string[],
  fetched: readonly (JsonValue | undefined)[],
): AuthorizationDiscovery {
  let found: Readonly<{ url: string; metadata: JsonValue }> | undefined
  for (const [index, url] of candidates.entries()) {
    const metadata = fetched[index]
    if (isObject(metadata)) {
      found = { url, metadata }
      break
    }
  }
  const scope = challenge.get('scope')
  const headerScopes = scope === undefined ? [] : scope.split(/\s+/u).filter(item => item !== '')
  const last = candidates.at(-1) ?? METADATA_PATH
  return {
    resourceMetadataUrl: found?.url ?? last,
    metadata: found === undefined ? 'unavailable' : 'fetched',
    ...(found === undefined ? {} : { resourceMetadata: { untrusted: found.metadata } }),
    issuers: textsOf(found?.metadata, 'authorization_servers'),
    scopes: headerScopes.length > 0 ? headerScopes : textsOf(found?.metadata, 'scopes_supported'),
  }
}

/** Fetches the protected resource metadata at one address: the JSON read there, or nothing. */
export type MetadataFetch = (url: string, signal: AbortSignal) => Promise<JsonValue | undefined>

/**
 * The discovery of T4 after a refused authorization (R4): the candidate addresses are fetched
 * in order until one gives a JSON object; a fetch that rejects counts as nothing fetched. The
 * signal ends the loop: what was not fetched by then is unavailable.
 */
export async function discoverAuthorization(
  target: string,
  challenge: ReadonlyMap<string, string>,
  fetchMetadata: MetadataFetch,
  signal: AbortSignal,
): Promise<AuthorizationDiscovery> {
  const candidates = metadataCandidatesOf(target, challenge)
  const fetched: (JsonValue | undefined)[] = []
  for (const url of candidates) {
    if (signal.aborted) break
    const metadata = await fetchMetadata(url, signal).catch(() => undefined)
    fetched.push(metadata)
    if (isObject(metadata)) break
  }
  return authorizationDiscoveryOf(challenge, candidates, fetched)
}
