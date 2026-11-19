import type { DurableEvidence } from '@omne-harness/exchange-refs'
import { canonicalText } from './evidence.ts'

export type GrantLayer = 'tenant' | 'session'
export type GateRef = Readonly<{ capability: string; key: string }>

export type GrantRef =
  | Readonly<{ via: 'verdict'; layer: GrantLayer; holder: string; gate: GateRef; revision: string }>
  | Readonly<{ via: 'session-grant'; holder: string; gate: GateRef; source: DurableEvidence }>
  | Readonly<{ via: 'once'; holder: string; source: DurableEvidence }>
  | Readonly<{ via: 'skip-ask'; holder: string; source: DurableEvidence }>

export const GRANT_REF_TEXT_LIMIT = 2048

export function grantLayerOf(grant: GrantRef): GrantLayer {
  return grant.via === 'verdict' ? grant.layer : 'session'
}

export function grantRefText(grant: GrantRef): string {
  return canonicalText(grant)
}

type Fields = Readonly<Record<string, unknown>>

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function exactly(value: Fields, names: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === names.length && names.every(name => keys.includes(name))
}

const isGate = (value: unknown): value is GateRef =>
  isFields(value) &&
  exactly(value, ['capability', 'key']) &&
  text(value.capability) &&
  text(value.key)

const isEvidence = (value: unknown): value is DurableEvidence =>
  isFields(value) &&
  exactly(value, ['owner', 'record', 'revision', 'digest']) &&
  text(value.owner) &&
  text(value.record) &&
  text(value.revision) &&
  text(value.digest)

function isGrant(value: unknown): value is GrantRef {
  if (!isFields(value)) return false
  switch (value.via) {
    case 'verdict':
      return (
        exactly(value, ['via', 'layer', 'holder', 'gate', 'revision']) &&
        (value.layer === 'tenant' || value.layer === 'session') &&
        text(value.holder) &&
        isGate(value.gate) &&
        text(value.revision)
      )
    case 'session-grant':
      return (
        exactly(value, ['via', 'holder', 'gate', 'source']) &&
        text(value.holder) &&
        isGate(value.gate) &&
        isEvidence(value.source)
      )
    case 'once':
    case 'skip-ask':
      return (
        exactly(value, ['via', 'holder', 'source']) &&
        text(value.holder) &&
        isEvidence(value.source)
      )
    default:
      return false
  }
}

export function parseGrantRef(value: string): GrantRef | null {
  if (Buffer.byteLength(value) > GRANT_REF_TEXT_LIMIT) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  return isGrant(parsed) && grantRefText(parsed) === value ? parsed : null
}
