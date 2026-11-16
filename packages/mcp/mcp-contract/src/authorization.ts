import type { JsonValue } from '@omne-harness/json-text'
import { isObject, itemsOf, member } from './json.ts'
import type { AuthorizationDiscovery } from './outcomes.ts'

export const METADATA_PATH = '/.well-known/oauth-protected-resource'

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

function textsOf(object: JsonValue | undefined, key: string): readonly string[] {
  const items = isObject(object) ? itemsOf(member(object, key)) : undefined
  return (items ?? []).flatMap(item => (item.kind === 'string' ? [item.value] : []))
}

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

export type MetadataFetch = (url: string, signal: AbortSignal) => Promise<JsonValue | undefined>

export type AuthorizationDiscoveryRun = Readonly<{
  soFar(): AuthorizationDiscovery
  done: Promise<AuthorizationDiscovery>
}>

export function startAuthorizationDiscovery(
  target: string,
  challenge: ReadonlyMap<string, string>,
  fetchMetadata: MetadataFetch,
  signal: AbortSignal,
): AuthorizationDiscoveryRun {
  const candidates = metadataCandidatesOf(target, challenge)
  const fetched: (JsonValue | undefined)[] = []
  const soFar = () => authorizationDiscoveryOf(challenge, candidates, fetched)
  const done = (async () => {
    for (const url of candidates) {
      if (signal.aborted) break
      const metadata = await fetchOrNothing(fetchMetadata, url, signal)
      fetched.push(metadata)
      if (isObject(metadata)) break
    }
    return soFar()
  })()
  return { soFar, done }
}

async function fetchOrNothing(
  fetchMetadata: MetadataFetch,
  url: string,
  signal: AbortSignal,
): Promise<JsonValue | undefined> {
  try {
    return await fetchMetadata(url, signal)
  } catch {
    return undefined
  }
}

export function discoverAuthorization(
  target: string,
  challenge: ReadonlyMap<string, string>,
  fetchMetadata: MetadataFetch,
  signal: AbortSignal,
): Promise<AuthorizationDiscovery> {
  return startAuthorizationDiscovery(target, challenge, fetchMetadata, signal).done
}
