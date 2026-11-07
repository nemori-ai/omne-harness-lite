import { sourceFinalizationFactSchema, finalizationRequestSchema } from './finalization-schema.ts'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { equal, json, withinBudget } from './encoding.ts'
import {
  readSourceGate,
  readSourceReservation,
  reserveSource,
  finishSourceUpdate,
  beginSourceUpdate,
} from './source-retention-records.ts'
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
function finalize(raw: unknown, port: ParticipantPort) {
  const request = finalizationRequestSchema.parse(raw)
  const fact = sourceFinalizationFactSchema.parse(port.requireFact(SOURCE_SNAPSHOT_FACT))
  if (!equal(request, fact.request))
    throw new Error('Settings source finalization request mismatch')
  const result = finalizeSource(port, fact.action)
  if (result.kind === 'blocked' || result.kind === 'conflict')
    return { kind: 'conflict' as const, basis: { reason: 'settings_source_finalization_conflict' } }
  port.provideFact(SOURCE_WRITE_FACT, json({ kind: 'finalized', request, result }))
  return { kind: 'participated' as const, response: json(result) }
}
function finalizeSource(
  port: ParticipantPort,
  action: ReturnType<typeof sourceFinalizationFactSchema.parse>['action'],
) {
  if (action.kind === 'none') return { kind: 'none' as const }
  if (action.kind === 'begin') return beginSourceUpdate(port, action.update)
  if (action.kind === 'finish') return finishSourceUpdate(port, action.update, action.outcome)
  const gate = readSourceGate(port, action.source)
  return gate.pending === null && gate.held === 0
    ? { kind: 'checked-open' as const, source: action.source }
    : { kind: 'blocked' as const }
}
export default {
  participant: SOURCE_RETENTION_OWNER,
  protocol: SOURCE_RETENTION_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_source_input_limit' }
    try {
      if (facts['kind'] === 'finalize') return finalize(facts['request'], port)
      if (facts['kind'] === 'write') return write(facts, port)
      if (facts['kind'] === 'reserve') return reserve(facts['request'], port)
      return { kind: 'failed', diagnostic: 'settings_source_operation' }
    } catch {
      return { kind: 'failed', diagnostic: 'settings_source_invalid_data' }
    }
  },
} satisfies ParticipantModule
