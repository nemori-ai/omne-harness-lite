import type { JsonValue } from '@omne-harness/sql-contract'
import { packText } from '@omne-harness/sql-contract/worker'
import { canonicalText } from '../codec.ts'
import { readBlock } from './execution-blocks.ts'
import { big, oneRow, text, type Executor } from './support.ts'

type Json = Readonly<{ readonly [key: string]: JsonValue }>
type Choice = Readonly<{ reference: string; payload: string }>
type Retain = Readonly<{ reference: string; pub: bigint; digest: string; adoption: string }>
export type AdoptionWrite = Readonly<{ choices: readonly Choice[]; retain: Retain | null }>
type Scope = Readonly<{ tenant: string; session: string; execution: string }>

const PUB = /^[1-9][0-9]{0,17}$/
const isJson = (value: JsonValue | undefined): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value !== ''

function parseChoice(raw: JsonValue): Choice | null {
  if (!isJson(raw)) return null
  const { reference, payload } = raw
  return isText(reference) && Array.isArray(payload)
    ? { reference, payload: canonicalText(payload) }
    : null
}

function parseRetain(raw: JsonValue): Retain | null {
  if (!isJson(raw)) return null
  const { reference, pub, digest, adoption } = raw
  return isText(reference) &&
    typeof pub === 'string' &&
    PUB.test(pub) &&
    isText(digest) &&
    isJson(adoption)
    ? { reference, pub: BigInt(pub), digest, adoption: canonicalText(adoption) }
    : null
}

export function parseAdoption(raw: Json, settling: boolean): AdoptionWrite | string {
  const listed = raw['choices'] ?? []
  if (!Array.isArray(listed)) return 'the choices are not a list'
  const choices: Choice[] = []
  for (const item of listed as readonly JsonValue[]) {
    const choice = parseChoice(item)
    if (choice === null) return 'a choice'
    choices.push(choice)
  }
  const kept = raw['retain'] ?? null
  if (kept === null) return { choices, retain: null }
  const retain = parseRetain(kept)
  if (retain === null) return 'the retained adoption'
  return settling ? { choices, retain } : 'a retained adoption without settling'
}

function writeChoices(port: Executor, scope: Scope, choices: readonly Choice[]): string | null {
  for (const choice of choices) {
    const key = [scope.tenant, scope.session, choice.reference]
    const held = oneRow(
      port,
      'SELECT payload FROM er_request_choice WHERE tenant = ? AND session = ? AND reference = ? LIMIT 1',
      key,
    )
    if (held === undefined)
      port.execute(
        'INSERT INTO er_request_choice (tenant, session, reference, payload) VALUES (?, ?, ?, ?)',
        [...key, choice.payload],
      )
    else if (text(held['payload']) !== choice.payload)
      return `the choices of the model call ${choice.reference} differ from the recorded ones`
  }
  return null
}

function retainAdoption(port: Executor, scope: Scope, retain: Retain): string | null {
  const { tenant, session, execution } = scope
  const block = readBlock(port, tenant, execution, retain.digest)
  if (block === null)
    return `the retained adoption names ${retain.digest}, no block of the execution or the tenant`
  const held = oneRow(
    port,
    'SELECT pub FROM er_session_adoption WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (held !== undefined && big(held['pub']) >= retain.pub) return null
  port.execute(
    'INSERT OR REPLACE INTO er_session_adoption (tenant, session, reference, pub, execution, digest, media, size, payload, adoption) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      tenant,
      session,
      retain.reference,
      retain.pub,
      execution,
      retain.digest,
      block.media,
      BigInt(Buffer.byteLength(block.payload)),
      packText(block.payload),
      retain.adoption,
    ],
  )
  return null
}

// Runs before the settle deletes the blocks of the execution; the first rule broken, or null.
export function writeAdoption(port: Executor, scope: Scope, write: AdoptionWrite): string | null {
  const refused = writeChoices(port, scope, write.choices)
  if (refused !== null || write.retain === null) return refused
  return retainAdoption(port, scope, write.retain)
}
