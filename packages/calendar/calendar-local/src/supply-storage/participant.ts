import { z } from 'zod'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { ackSchema } from '../storage/schema.ts'
import { binding, canonical, digest, hash, intent } from './encoding.ts'
import { record } from './records.ts'
import { prepare, complete } from './run.ts'
import { probe } from './probe.ts'
import {
  PARTICIPANT,
  PROTOCOL,
  AUTHORITY_FACT,
  RESULT_FACT,
  MAX_MATERIAL_BYTES,
  storedSchema,
  writeSchema,
  type Write,
} from './schema.ts'

function acknowledgement(input: Extract<Write, { action: 'ack.prepare' }>, port: ParticipantPort) {
  const p = input.payload
  const previous = record(
    port,
    'SELECT record FROM ca_supply_acks WHERE scope = ? AND id = ? AND acknowledgement_key = ?',
    [input.systemScopeRef, p.id, p.acknowledgementKey],
    ackSchema,
  )
  if (previous !== null)
    return canonical(previous) === canonical(p)
      ? ({ kind: 'ok', value: previous } as const)
      : ({ kind: 'conflict', reason: 'acknowledgementMismatch' } as const)
  port.execute('INSERT INTO ca_supply_acks(scope,id,acknowledgement_key,record) VALUES (?,?,?,?)', [
    input.systemScopeRef,
    p.id,
    p.acknowledgementKey,
    canonical(p),
  ])
  return { kind: 'ok', value: p } as const
}
function material(input: Extract<Write, { action: 'material.preserve' }>, port: ParticipantPort) {
  const p = input.payload,
    bytes = Buffer.from(p.material.contentBase64, 'base64')
  if (
    bytes.length > MAX_MATERIAL_BYTES ||
    hash(bytes) !== p.material.rawHash ||
    bytes.toString('base64') !== p.material.contentBase64 ||
    p.reference !==
      `calendar-material:${digest({ scope: input.systemScopeRef, material: p.material })}`
  )
    return { kind: 'conflict', reason: 'materialIntegrity' } as const
  const previous = record(
    port,
    'SELECT record FROM ca_supply_materials WHERE scope = ? AND reference = ?',
    [input.systemScopeRef, p.reference],
    storedSchema,
  )
  if (previous !== null)
    return canonical(previous) === canonical(p)
      ? ({ kind: 'ok', value: previous } as const)
      : ({ kind: 'conflict', reason: 'materialMismatch' } as const)
  port.execute('INSERT INTO ca_supply_materials(scope,reference,record) VALUES (?,?,?)', [
    input.systemScopeRef,
    p.reference,
    canonical(p),
  ])
  return { kind: 'ok', value: p } as const
}
function execute(input: Write, port: ParticipantPort) {
  switch (input.action) {
    case 'run.prepare':
      return prepare(input, port)
    case 'run.complete':
      return complete(input, port)
    case 'probe.record':
      return probe(input, port)
    case 'ack.prepare':
      return acknowledgement(input, port)
    case 'material.preserve':
      return material(input, port)
  }
}
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const input = writeSchema.parse(facts)
    canonical(input)
    const fact = z
      .strictObject({ decision: z.enum(['allowed', 'denied']), binding: z.json() })
      .parse(port.requireFact(AUTHORITY_FACT))
    if (fact.decision !== 'allowed' || canonical(fact.binding) !== canonical(binding(input)))
      return { kind: 'conflict', basis: { reason: 'authorityRejected', intent: intent(input) } }
    const result = execute(input, port)
    if (result.kind === 'conflict')
      return { kind: 'conflict', basis: { reason: result.reason, intent: intent(input) } }
    const response = { intent: intent(input), value: result.value }
    port.provideFact(RESULT_FACT, response)
    return { kind: 'participated', response }
  },
} satisfies ParticipantModule
