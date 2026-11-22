import { randomUUID } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { DefinitionText } from './ledger-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, type TenantDomain } from './tenant.ts'
import type { DefinitionFact, DefinitionPutFacts, StoredDefinition } from './worker/facts.ts'
import {
  DEFINITION_BLOCK_BYTES,
  DEFINITION_HELD_DIGESTS,
  DEFINITION_READ_HANDLER,
  PARTICIPANT,
  PROTOCOL,
} from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type DefinitionRead<T> =
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

export function commandBytes(facts: object): number {
  return bytesOf({ participant: PARTICIPANT, facts })
}

async function readDefinitions(
  options: SqlToolStorageOptions,
  at: TenantDomain,
  input: Readonly<Record<string, JsonValue>>,
): Promise<DefinitionRead<Readonly<Record<string, JsonValue>>>> {
  const answer = await options.storage.read({
    domain: at.domain,
    handler: DEFINITION_READ_HANDLER,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input: { tenant: at.tenant, ...input },
  })
  if (answer.kind !== 'read')
    return {
      kind: 'unavailable',
      diagnostic: `definition read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`,
    }
  return isObject(answer.output)
    ? { kind: 'read', value: answer.output }
    : { kind: 'unavailable', diagnostic: 'definition read: invalid output' }
}

export async function heldDefinitions(
  options: SqlToolStorageOptions,
  at: TenantDomain,
  digests: readonly string[],
): Promise<DefinitionRead<ReadonlySet<string>>> {
  const held = new Set<string>()
  for (let first = 0; first < digests.length; first += DEFINITION_HELD_DIGESTS) {
    const page = digests.slice(first, first + DEFINITION_HELD_DIGESTS)
    const read = await readDefinitions(options, at, { digests: page })
    if (read.kind !== 'read') return read
    const listed = read.value['held']
    if (!Array.isArray(listed) || !listed.every(digest => typeof digest === 'string'))
      return { kind: 'unavailable', diagnostic: 'definition read: invalid held list' }
    for (const digest of listed) held.add(digest)
  }
  return { kind: 'read', value: held }
}

export async function definitionsByAdoption(
  options: SqlToolStorageOptions,
  at: TenantDomain,
  adoption: string,
): Promise<DefinitionRead<readonly StoredDefinition[]>> {
  const read = await readDefinitions(options, at, { adoption })
  if (read.kind !== 'read') return read
  const listed = read.value['definitions']
  if (!Array.isArray(listed))
    return { kind: 'unavailable', diagnostic: 'definition read: invalid rows' }
  const definitions: StoredDefinition[] = []
  for (const row of listed) {
    if (!isObject(row) || typeof row['digest'] !== 'string' || row['definition'] === undefined)
      return { kind: 'unavailable', diagnostic: 'definition read: invalid row' }
    definitions.push({ digest: row['digest'], definition: row['definition'] })
  }
  return { kind: 'read', value: definitions }
}

function sliceEnd(text: string, start: number, budget: number): number {
  let end = Math.min(text.length, start + budget)
  for (;;) {
    const code = text.charCodeAt(end - 1)
    if (end < text.length && end - start > 1 && code >= 0xd800 && code <= 0xdbff) end -= 1
    const bytes = bytesOf(text.slice(start, end)) - 2
    if (bytes <= budget || end - start <= 1) return end
    end =
      start + Math.max(1, Math.min(end - start - 1, Math.floor(((end - start) * budget) / bytes)))
  }
}

export function definitionSlices(tenant: string, item: DefinitionText): readonly string[] {
  const empty: DefinitionPutFacts = {
    intent: 'definition-put',
    tenant,
    digest: item.digest,
    seq: Number.MAX_SAFE_INTEGER,
    text: '',
  }
  const budget = DEFINITION_BLOCK_BYTES - commandBytes(empty)
  const slices: string[] = []
  for (let start = 0; start < item.text.length;) {
    const end = sliceEnd(item.text, start, budget)
    slices.push(item.text.slice(start, end))
    start = end
  }
  return slices
}

export type StagedDefinitions =
  | Readonly<{ kind: 'ready'; facts: readonly DefinitionFact[] }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

export async function stageDefinitions(
  options: SqlToolStorageOptions,
  at: TenantDomain,
  wanted: readonly DefinitionText[],
  base: number,
): Promise<StagedDefinitions> {
  if (wanted.length === 0) return { kind: 'ready', facts: [] }
  const held = await heldDefinitions(
    options,
    at,
    wanted.map(item => item.digest),
  )
  if (held.kind !== 'read') return { kind: 'failed', diagnostic: held.diagnostic }
  const facts: DefinitionFact[] = []
  let bytes = base
  for (const item of wanted) {
    if (held.value.has(item.digest)) continue
    const inline: DefinitionFact = { digest: item.digest, adoption: item.adoption, text: item.text }
    const added = bytesOf(inline) + 1
    if (bytes + added <= DEFINITION_BLOCK_BYTES) {
      facts.push(inline)
      bytes += added
      continue
    }
    const slices = definitionSlices(at.tenant, item)
    for (const [seq, text] of slices.entries()) {
      const put: DefinitionPutFacts = {
        intent: 'definition-put',
        tenant: at.tenant,
        digest: item.digest,
        seq,
        text,
      }
      const answer = await options.storage.commit(requestOf(options, at, put))
      if (answer.kind !== 'committed')
        return { kind: 'failed', diagnostic: `definition put: ${answer.kind}` }
    }
    facts.push({ digest: item.digest, adoption: item.adoption, chunks: slices.length })
  }
  return { kind: 'ready', facts }
}
