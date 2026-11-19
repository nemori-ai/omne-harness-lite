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
type Check = (value: unknown) => boolean

const text: Check = value => typeof value === 'string' && value.length > 0
const oneOf =
  (...allowed: readonly string[]): Check =>
  value =>
    typeof value === 'string' && allowed.includes(value)

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Exactly these members, each passing its check. */
const shaped =
  (shape: Readonly<Record<string, Check>>): Check =>
  value => {
    if (!isFields(value)) return false
    const names = Object.keys(shape)
    const keys = Object.keys(value)
    return keys.length === names.length && names.every(name => shape[name]!(value[name]))
  }

const gate = shaped({ capability: text, key: text })
const evidence = shaped({ owner: text, record: text, revision: text, digest: text })
const GRANTS: Readonly<Record<GrantRef['via'], Check>> = {
  verdict: shaped({
    via: oneOf('verdict'),
    layer: oneOf('tenant', 'session'),
    holder: text,
    gate,
    revision: text,
  }),
  'session-grant': shaped({ via: oneOf('session-grant'), holder: text, gate, source: evidence }),
  once: shaped({ via: oneOf('once'), holder: text, source: evidence }),
  'skip-ask': shaped({ via: oneOf('skip-ask'), holder: text, source: evidence }),
}

function isGrant(value: unknown): value is GrantRef {
  if (!isFields(value) || typeof value.via !== 'string' || !Object.hasOwn(GRANTS, value.via))
    return false
  return GRANTS[value.via as GrantRef['via']](value)
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
