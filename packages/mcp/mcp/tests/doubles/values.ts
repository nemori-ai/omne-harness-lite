// Test helper: branded sample values and JSON trees. A bad sample throws: it is a defect of the
// test, not of the subject.
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  isAdoptionRevision,
  isConnectionTarget,
  isCredentialBinding,
  isEndpointHolding,
  isEndpointName,
  isGeneration,
  isMillis,
  isProtocolVersion,
  type AdoptionRevision,
  type ConnectionTarget,
  type CredentialBinding,
  type EndpointRef,
  type Generation,
  type Millis,
  type PeerIdentity,
} from '@omne-harness/mcp-contract'

export type Principal = Readonly<{ id: string }>

const LIMITS = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 10_000,
  maxStringLength: 1_000_000,
  maxNumberLength: 100,
} as const

export function json(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new TypeError(`test data is not JSON: ${read.kind}`)
  return read.value
}

export function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

export function ref(name: string, holding = `tenant/${name}`): EndpointRef {
  if (!isEndpointName(name) || !isEndpointHolding(holding)) throw new TypeError('bad ref sample')
  return { name, holding }
}

export function adoptionRevision(text: string): AdoptionRevision {
  if (!isAdoptionRevision(text)) throw new TypeError('bad adoption revision sample')
  return text
}

export function binding(text: string): CredentialBinding {
  if (!isCredentialBinding(text)) throw new TypeError('bad binding sample')
  return text
}

export function target(text: string): ConnectionTarget {
  if (!isConnectionTarget(text)) throw new TypeError('bad target sample')
  return text
}

export function millis(value: number): Millis {
  if (!isMillis(value)) throw new TypeError('bad millis sample')
  return value
}

export function generation(value: number): Generation {
  if (!isGeneration(value)) throw new TypeError('bad generation sample')
  return value
}

export function peerIdentity(version = '2026-07-28'): PeerIdentity {
  if (!isProtocolVersion(version)) throw new TypeError('bad protocol version sample')
  return { protocolVersion: version, capabilities: json({ tools: {} }) }
}

export const home = tenantOf('s')
export const away = tenantOf('t')
export const alice: Access<Principal> = access({ id: 'alice' }, home)
export const bob: Access<Principal> = access({ id: 'bob' }, home)
export const mallory: Access<Principal> = access({ id: 'mallory' }, away)
export const principalKey = (principal: Principal): string => principal.id
