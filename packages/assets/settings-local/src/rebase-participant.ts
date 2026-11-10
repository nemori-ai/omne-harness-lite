import { sourceWriteIsOpen } from './source-write.ts'
import { decideStoredSettingsRebase } from './rebase-decision.ts'
import { defineSettings, settingsSourceIdentities } from '@omne-harness/settings'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, json, operationKey, stateKey } from './encoding.ts'
import { readStateRecord } from './records.ts'
import { GUARD_FACT, RESULT_FACT } from './schema.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import {
  RebaseBindingSchema,
  RebaseGuardSchema,
  rebaseDigest,
  rebaseOperation,
} from './rebase-schema.ts'
export function rebaseAssignments(raw: unknown, port: ParticipantPort) {
  const binding = RebaseBindingSchema.parse(raw)
  const operation = rebaseOperation(binding)
  const fail = (reason: string) => ({
    kind: 'conflict' as const,
    basis: json({ binding: operation, failure: { kind: 'rejected', reason } }),
  })
  if (!sourceWriteIsOpen(port, { kind: 'rebase', operation })) return fail('forbidden')
  if (!equal(port.requireFact(TERMINAL_FACT), { kind: 'consume', binding: operation }))
    return fail('forbidden')
  if (binding.commandDigest !== rebaseDigest(binding.command)) return fail('operation_conflict')
  const fact = RebaseGuardSchema.parse(port.requireFact(GUARD_FACT))
  if (!equal(fact.binding, binding)) return fail('forbidden')
  const definition = defineSettings(fact.definition)
  if (definition.kind !== 'defined' || digest(definition.definition) !== fact.definitionRef.digest)
    return fail('definition_changed')
  const command = binding.command
  const current = readStateRecord(port, binding.domain.scope, command.target)
  if (!current) return fail('basis_changed')
  const decision = decideStoredSettingsRebase(command, current, fact)
  if (decision.kind === 'rejected') return fail(decision.reason)
  const changed = decision.kind === 'changed'
  const state = decision.state
  const result = {
    kind: 'committed',
    operationId: command.operationId,
    revision: state.revision,
    changed,
  }
  const key = stateKey(binding.domain.scope, command.target)
  port.execute('UPDATE st_states SET record = ? WHERE target_key = ?', [
    canonical({
      scope: binding.domain.scope,
      target: command.target,
      definitionRef: fact.definitionRef,
      state,
      sourceLayout: { kind: 'bound', sources: settingsSourceIdentities(fact.sources) },
    }),
    key,
  ])
  port.execute('INSERT INTO st_operations (operation_key, record) VALUES (?, ?)', [
    operationKey(binding.principalRef, command.target, command.operationId),
    canonical({ binding: operation, result }),
  ])
  if (changed)
    port.execute(
      'INSERT INTO st_changes (target_key, revision, operation_id, kind, item_id, source_id) VALUES (?, ?, ?, ?, ?, ?)',
      [key, state.revision, command.operationId, 'rebase', null, null],
    )
  const response = json({ binding: operation, result })
  port.provideFact(RESULT_FACT, response)
  return { kind: 'participated' as const, response }
}
