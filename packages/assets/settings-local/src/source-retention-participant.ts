import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { equal, json, withinBudget } from './encoding.ts'
import { readSourceGate, readSourceReservation, reserveSource } from './source-retention-records.ts'
import { sourceSnapshotFactSchema } from './source-snapshot.ts'
import { sourceWriteObservationSchema, SOURCE_WRITE_FACT } from './source-write.ts'
import {
  SOURCE_RETENTION_OWNER,
  SOURCE_RETENTION_PROTOCOL,
  SOURCE_SNAPSHOT_FACT,
  sourceRequestSchema,
} from './source-retention-schema.ts'
function write(raw: unknown, port: ParticipantPort) {
  const input = sourceWriteObservationSchema.parse(raw)
  const observed = sourceWriteObservationSchema.parse(port.requireFact(SOURCE_SNAPSHOT_FACT))
  if (!equal(input, observed))
    return { kind: 'failed' as const, diagnostic: 'settings_source_write_binding' }
  const binding = input.binding
  const { domain, target } = binding.operation
  const gate = readSourceGate(port, { domain, target })
  if (gate.pending !== null || gate.held !== 0) {
    const failure = { kind: 'rejected', reason: 'basis_changed' }
    return {
      kind: 'conflict' as const,
      basis: json(binding.kind === 'target' ? failure : { binding: binding.operation, failure }),
    }
  }
  port.provideFact(SOURCE_WRITE_FACT, json({ kind: 'open', binding }))
  return { kind: 'participated' as const, response: null }
}
function reserve(raw: unknown, port: ParticipantPort) {
  const request = sourceRequestSchema.parse(raw)
  const fact = sourceSnapshotFactSchema.parse(port.requireFact(SOURCE_SNAPSHOT_FACT))
  if (!equal(fact.request, request))
    return { kind: 'failed' as const, diagnostic: 'settings_source_reserve_binding' }
  const previous = readSourceReservation(port, request)
  const response =
    previous.kind !== 'not_found'
      ? previous
      : fact.observation.kind === 'captured'
        ? reserveSource(port, request, fact.observation.snapshot)
        : fact.observation
  return { kind: 'participated' as const, response: json(response) }
}
export default {
  participant: SOURCE_RETENTION_OWNER,
  protocol: SOURCE_RETENTION_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_source_input_limit' }
    try {
      if (facts['kind'] === 'write') return write(facts, port)
      if (facts['kind'] === 'reserve') return reserve(facts['request'], port)
      return { kind: 'failed', diagnostic: 'settings_source_operation' }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_source_invalid_data' }
    }
  },
} satisfies ParticipantModule
