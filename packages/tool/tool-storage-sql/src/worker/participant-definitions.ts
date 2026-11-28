import { createHash } from 'node:crypto'
import {
  packText,
  unpackText,
  type ParticipantPort,
  type ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import type { DefinitionFact, DefinitionPutFacts, StopBasis } from './facts.ts'
import { oneRow } from './support.ts'

export type DefinitionAnswer =
  | Readonly<{ kind: 'kept' }>
  | Readonly<{ kind: 'stopped'; basis: StopBasis }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>

const KEPT: DefinitionAnswer = { kind: 'kept' }

export function definitionHeld(port: ParticipantPort, tenant: string, digest: string): boolean {
  return (
    oneRow(port, 'SELECT 1 AS held FROM tl_definition WHERE tenant = ? AND digest = ? LIMIT 1', [
      tenant,
      digest,
    ]) !== undefined
  )
}

function staged(port: ParticipantPort, tenant: string, fact: DefinitionFact): string | null {
  if ('text' in fact) return fact.text
  const parts: string[] = []
  for (let seq = 0; seq < fact.chunks; seq += 1) {
    const row = oneRow(
      port,
      'SELECT data FROM tl_definition_chunk WHERE tenant = ? AND digest = ? AND seq = ? LIMIT 1',
      [tenant, fact.digest, BigInt(seq)],
    )
    const data = row?.['data']
    if (!(data instanceof Uint8Array)) return null
    parts.push(unpackText(data))
  }
  return parts.join('')
}

function ensure(port: ParticipantPort, tenant: string, fact: DefinitionFact): DefinitionAnswer {
  if (definitionHeld(port, tenant, fact.digest)) return KEPT
  const text = staged(port, tenant, fact)
  if (text === null) return { kind: 'stopped', basis: { reason: 'definition-missing' } }
  const digest = `sha256:${createHash('sha256').update(text).digest('hex')}`
  if (digest !== fact.digest)
    return { kind: 'failed', diagnostic: 'the definition text differs from its digest' }
  port.execute('INSERT INTO tl_definition (tenant, digest, adoption, body) VALUES (?, ?, ?, ?)', [
    tenant,
    fact.digest,
    fact.adoption,
    packText(text),
  ])
  port.execute('DELETE FROM tl_definition_chunk WHERE tenant = ? AND digest = ?', [
    tenant,
    fact.digest,
  ])
  return KEPT
}

export function ensureDefinitions(
  port: ParticipantPort,
  tenant: string,
  facts: readonly DefinitionFact[],
): DefinitionAnswer {
  for (const fact of facts) {
    const answer = ensure(port, tenant, fact)
    if (answer.kind !== 'kept') return answer
  }
  return KEPT
}

export function releaseDefinitions(
  port: ParticipantPort,
  tenant: string,
  digests: Iterable<string>,
): void {
  for (const digest of new Set(digests)) {
    if (
      oneRow(
        port,
        'SELECT 1 AS held FROM tl_definition_use WHERE tenant = ? AND digest = ? LIMIT 1',
        [tenant, digest],
      ) !== undefined
    )
      continue
    port.execute('DELETE FROM tl_definition WHERE tenant = ? AND digest = ?', [tenant, digest])
    port.execute('DELETE FROM tl_definition_chunk WHERE tenant = ? AND digest = ?', [
      tenant,
      digest,
    ])
  }
}

export function commitDefinitionPut(
  facts: DefinitionPutFacts,
  port: ParticipantPort,
): ParticipantReply {
  if (!definitionHeld(port, facts.tenant, facts.digest))
    port.execute(
      `INSERT INTO tl_definition_chunk (tenant, digest, seq, data) VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant, digest, seq) DO UPDATE SET data = excluded.data`,
      [facts.tenant, facts.digest, BigInt(facts.seq), packText(facts.text)],
    )
  return { kind: 'participated', response: { kind: 'definition-kept' } }
}
