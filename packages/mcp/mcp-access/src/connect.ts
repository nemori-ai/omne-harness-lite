import type { Principal } from '@omne-harness/access-cordis-contract'
import type { Access } from '@omne-harness/legal-identity'
import type { ConnectFailure, EndpointRef } from '@omne-harness/mcp-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import type { McpFaces } from './ports.ts'

type NotBegun =
  | 'disabled'
  | 'target-missing'
  | 'target-invalid'
  | 'client-id-invalid'
  | 'no-resource-metadata'
  | 'no-authorization-server'
  | 'issuer-mismatch'
  | 'no-pkce'
  | 'insecure-endpoint'
  | 'malformed'
  | 'no-registration'
  | 'registration-refused'

const TEXTS: Readonly<Record<NotBegun, string>> = {
  disabled: 'the endpoint is disabled',
  'target-missing': 'the endpoint has no address set',
  'target-invalid': 'the address of the endpoint is not a usable address',
  'client-id-invalid': 'the client identifier set for the endpoint cannot be read',
  'no-resource-metadata': 'the endpoint does not say which authorization server it uses',
  'no-authorization-server': 'the authorization server of the endpoint did not describe itself',
  'issuer-mismatch': 'the authorization server described itself as a different issuer',
  'no-pkce': 'the authorization server does not support PKCE with S256',
  'insecure-endpoint': 'the authorization server gave an address that is not https',
  malformed: 'the authorization server described itself in a form that cannot be read',
  'no-registration':
    'register an application at the authorization server first and set its client identifier',
  'registration-refused': 'the authorization server refused to register omne as a client',
}

export type ConnectAnswer =
  | Readonly<{ outcome: 'not-visible'; body: Readonly<Record<string, never>> }>
  | Readonly<{ outcome: 'unsupported'; body: Readonly<{ reason: 'not-oauth' }> }>
  | Readonly<{ outcome: 'not-committed'; body: Readonly<{ reason: NotBegun; text: string }> }>
  | Readonly<{ outcome: 'basis-unavailable' }>

function notBegun(reason: NotBegun): ConnectAnswer {
  return { outcome: 'not-committed', body: { reason, text: TEXTS[reason] } }
}

/** A failure of the connect face as mcp/v1 says it; a grant that could not be reached is unavailable, not refused. */
export function connectAnswerOf(failure: ConnectFailure): ConnectAnswer {
  switch (failure.kind) {
    case 'not-available-to-you':
      return { outcome: 'not-visible', body: {} }
    case 'unknown':
      return { outcome: 'basis-unavailable' }
    case 'blocked':
      return notBegun('disabled')
    case 'not-oauth':
      return { outcome: 'unsupported', body: { reason: 'not-oauth' } }
    case 'config-missing':
      return notBegun('target-missing')
    case 'config-invalid':
      return notBegun(failure.item === 'target' ? 'target-invalid' : 'client-id-invalid')
    case 'refused':
      return failure.reason === 'unavailable'
        ? { outcome: 'basis-unavailable' }
        : notBegun(failure.reason)
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

type Face = McpFaces['connect']
const UNAVAILABLE = { outcome: 'basis-unavailable' } as const
const UNKNOWN = { outcome: 'unknown' } as const

/** The face checks the endpoint itself; an answer it never gave is unknown, as with any commit. */
export async function beginOn(face: Face, access: Access<Principal>, ref: EndpointRef) {
  if (face === undefined) return UNAVAILABLE
  try {
    const begun = await face.begin(access, ref)
    if ('failure' in begun) return connectAnswerOf(begun.failure)
    const expiresAt = parseInstant(new Date(begun.ok.expiresAt).toISOString())
    if (!expiresAt.ok) return UNKNOWN
    return {
      outcome: 'succeeded' as const,
      body: { url: begun.ok.url, expiresAt: expiresAt.value },
    }
  } catch {
    return UNKNOWN
  }
}

export async function disconnectOn(face: Face, access: Access<Principal>, ref: EndpointRef) {
  if (face === undefined) return UNAVAILABLE
  try {
    const ended = await face.disconnect(access, ref)
    if (!('failure' in ended))
      return { outcome: 'succeeded' as const, body: { disconnected: 'disconnected' as const } }
    const answer = connectAnswerOf(ended.failure)
    return answer.outcome === 'not-committed' ? UNAVAILABLE : answer
  } catch {
    return UNKNOWN
  }
}
