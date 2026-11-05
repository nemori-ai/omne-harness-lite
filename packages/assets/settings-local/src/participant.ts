import { rebaseAssignments } from './rebase-participant.ts'
import { decideSettingsChange, defineSettings } from '@omne-harness/settings'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  canonical,
  commandDigest,
  digest,
  equal,
  json,
  operationKey,
  settingsSqlOperationBinding,
  stateKey,
  withinBudget,
} from './encoding.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import { readStateRecord } from './records.ts'
import {
  bindingSchema,
  GUARD_FACT,
  guardFactSchema,
  PARTICIPANT,
  PROTOCOL,
  RESULT_FACT,
  type Binding,
} from './schema.ts'
import type { SettingsFailure } from '@omne-harness/settings'

function execute(binding: Binding, port: ParticipantPort) {
  const operationBinding = settingsSqlOperationBinding(binding)
  const fail = (reason: SettingsFailure['reason']) => ({
    kind: 'conflict' as const,
    basis: json({ binding: operationBinding, failure: { kind: 'rejected', reason } }),
  })
  if (!equal(port.requireFact(TERMINAL_FACT), { binding: operationBinding, kind: 'consume' }))
    return fail('forbidden')
  if (binding.commandDigest !== commandDigest(binding.command)) return fail('operation_conflict')
  let raw: unknown
  try {
    raw = port.requireFact(GUARD_FACT)
  } catch {
    return fail('unsupported')
  }
  if (!withinBudget(raw)) return fail('limit_exceeded')
  const parsed = guardFactSchema.safeParse(raw)
  if (!parsed.success || !equal(parsed.data.binding, binding)) return fail('forbidden')
  const fact = parsed.data
  const defined = defineSettings(fact.definition)
  if (defined.kind !== 'defined' || fact.definitionRef.digest !== digest(defined.definition))
    return fail('definition_changed')
  if (!equal(fact.definitionRef, binding.command.definitionRef)) return fail('definition_changed')
  if (
    fact.definition.items.find(item => item.id === binding.command.itemId)?.sensitivity === 'secret'
  )
    return fail('unsupported')
  if (fact.grants.some(grant => !fact.sourceIds.includes(grant.sourceId))) return fail('forbidden')
  const current = readStateRecord(port, binding.domain.scope, binding.command.target)
  if (current && !equal(current.definitionRef, fact.definitionRef))
    return fail('definition_changed')
  if (
    current &&
    !equal(
      current.state.sources.map(source => source.id),
      fact.sourceIds,
    )
  )
    return fail('basis_changed')
  const state = current?.state ?? {
    revision: 0,
    sources: fact.sourceIds.map(id => ({ id, values: [] })),
  }
  const decision = decideSettingsChange({
    command: binding.command,
    state,
    definition: fact.definition,
    definitionRef: fact.definitionRef,
    grants: fact.grants,
  })
  if (decision.kind === 'rejected') return fail(decision.reason)
  const command = binding.command
  const key = stateKey(binding.domain.scope, command.target)
  const result = {
    kind: 'committed' as const,
    operationId: command.operationId,
    revision: decision.state.revision,
    changed: decision.kind === 'changed',
  }
  port.execute(
    'INSERT INTO st_states (target_key, record) VALUES (?, ?) ON CONFLICT(target_key) DO UPDATE SET record=excluded.record',
    [
      key,
      canonical({
        scope: binding.domain.scope,
        target: command.target,
        definitionRef: fact.definitionRef,
        state: decision.state,
      }),
    ],
  )
  port.execute('INSERT INTO st_operations (operation_key, record) VALUES (?, ?)', [
    operationKey(binding.principalRef, command.target, command.operationId),
    canonical({ binding: operationBinding, result }),
  ])
  if (decision.kind === 'changed')
    port.execute(
      'INSERT INTO st_changes (target_key, revision, operation_id, kind, item_id, source_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        key,
        decision.state.revision,
        command.operationId,
        'value',
        command.itemId,
        command.sourceId,
      ],
    )
  const response = json({ binding: operationBinding, result })
  port.provideFact(RESULT_FACT, response)
  return { kind: 'participated' as const, response }
}
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return { kind: 'failed', diagnostic: 'settings_input_budget' }
    if (facts['kind'] === 'rebase') {
      try {
        return rebaseAssignments(facts['binding'], port)
      } catch {
        return { kind: 'failed', diagnostic: 'settings_rebase_invalid_data' }
      }
    }
    const parsed = bindingSchema.safeParse(facts['binding'])
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_invalid_binding' }
    return execute(parsed.data, port)
  },
} satisfies ParticipantModule
