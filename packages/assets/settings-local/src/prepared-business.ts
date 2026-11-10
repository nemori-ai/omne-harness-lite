import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { BusinessPlan, sourceFinalizationResultSchema } from './finalization-schema.ts'
import { readSettingsIntent, intentCommandDigest } from './intent-records.ts'
import { settleSettingsIntent, type IntentSettlement } from './intent-settlement.ts'
import { canonical, equal, operationKey, stateKey } from './encoding.ts'

function original(port: ParticipantPort, plan: BusinessPlan) {
  const { binding } = plan.request
  const root = readSettingsIntent(port, binding.identity)
  if (
    root.kind !== 'found' ||
    root.status.state !== 'open' ||
    root.attempt?.attemptId !== binding.attemptId ||
    root.intent.kind !== binding.commandKind ||
    intentCommandDigest(root.intent) !== binding.commandDigest
  )
    throw new Error('Settings business persistence binding mismatch')
  return root
}

function writeValues(port: ParticipantPort, root: ReturnType<typeof original>, plan: BusinessPlan) {
  if (plan.outcome.kind !== 'apply') return
  const { record, result } = plan.outcome
  const { identity } = root
  if (
    !equal(record.scope, identity.domain.scope) ||
    !equal(record.target, identity.operation.target) ||
    result.revision !== record.state.revision ||
    result.operationId !== identity.operation.operationId
  )
    throw new Error('Settings business record binding mismatch')
  const binding = {
    domain: identity.domain,
    principalRef: identity.principalRef,
    ...identity.operation,
    commandDigest: intentCommandDigest(root.intent),
  }
  const key = stateKey(identity.domain.scope, identity.operation.target)
  port.execute(
    'INSERT INTO st_states (target_key, record) VALUES (?, ?) ON CONFLICT(target_key) DO UPDATE SET record=excluded.record',
    [key, canonical(record)],
  )
  port.execute('INSERT INTO st_operations (operation_key, record) VALUES (?, ?)', [
    operationKey(identity.principalRef, identity.operation.target, identity.operation.operationId),
    canonical({ binding, result }),
  ])
  if (result.changed)
    port.execute(
      'INSERT INTO st_changes (target_key, revision, operation_id, kind, item_id, source_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        key,
        result.revision,
        result.operationId,
        root.intent.kind === 'change' ? 'value' : 'rebase',
        root.intent.kind === 'change' ? root.intent.command.itemId : null,
        root.intent.kind === 'change' ? root.intent.command.sourceId : null,
      ],
    )
}

function settlement(plan: BusinessPlan): IntentSettlement['event'] {
  const binding = plan.request.binding
  switch (plan.outcome.kind) {
    case 'apply':
      return { kind: 'commit', binding, result: plan.outcome.result }
    case 'abort-root':
      return { kind: 'abort', binding, reason: plan.outcome.reason }
    case 'abort-attempt':
      return { kind: 'seal', binding }
  }
}

export function applySettingsBusinessPlan(
  port: ParticipantPort,
  plan: BusinessPlan,
  source: Exclude<
    ReturnType<typeof sourceFinalizationResultSchema.parse>['result'],
    { kind: 'pending' }
  >,
) {
  const root = original(port, plan)
  const result = settleSettingsIntent(port, {
    event: settlement(plan),
    source: source.kind === 'checked-open' ? { kind: 'none' } : source,
  })
  if (result.kind !== 'found')
    throw new Error('Settings business plan did not settle its original intent')
  writeValues(port, root, plan)
  return { request: plan.request, result }
}
