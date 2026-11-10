import {
  prepareGovernanceStanding,
  readGovernanceStanding,
  recordGovernanceHeld,
  recordGovernanceSettled,
} from '../dist/standing-custody.js'
import { applyStandingOperation, sealGovernanceStanding } from '../dist/standing-operation.js'
import { bootstrapScope } from '../dist/scope.js'
import {
  acceptOperation,
  submitOperation,
  sealOperation,
  readOperation,
} from '../dist/operation.js'
import { applyOperation } from '../dist/apply-operation.js'
import { scopeKey, definitionKey } from '../dist/encoding.js'
import { readGovernanceSource, recordGovernanceSource } from '../dist/source-custody.js'
export default {
  participant: 'governance.activation',
  protocol: 'fixture-governance-operations/1',
  execute(facts, port) {
    let response
    switch (facts.kind) {
      case 'source-read':
        response = readGovernanceSource(port, facts.binding)
        break
      case 'source-record':
        response = recordGovernanceSource(port, facts.binding, facts.receipt)
        break
      case 'standing-prepare':
        response = prepareGovernanceStanding(port, facts.input)
        break
      case 'standing-read':
        response = readGovernanceStanding(port, facts.binding)
        break
      case 'standing-held':
        response = recordGovernanceHeld(port, facts.binding, facts.reservation)
        break
      case 'standing-settled':
        response = recordGovernanceSettled(port, facts.binding, facts.reservation, facts.outcome)
        break
      case 'standing-apply':
        response = applyStandingOperation(port, facts.binding, facts.execution, facts.evidence)
        break
      case 'standing-seal':
        response = sealGovernanceStanding(port, facts.reservation, facts.route)
        break
      case 'bootstrap':
        response = bootstrapScope(port, facts.input)
        break
      case 'accept':
        response = acceptOperation(port, facts.input)
        break
      case 'submit':
        response = submitOperation(port, facts.binding, facts.execution)
        break
      case 'apply':
        response = applyOperation(port, facts.binding, facts.execution, facts.evidence)
        break
      case 'seal':
        response = sealOperation(port, facts.binding)
        break
      case 'read':
        response = readOperation(port, facts.ref)
        break
      case 'support': {
        const key = scopeKey(facts.scope),
          definition = definitionKey(facts.definition)
        for (const member of facts.members) {
          port.execute('INSERT INTO gc_member VALUES (?,?,?,?)', [
            key,
            member.registrationId,
            definition,
            facts.epoch,
          ])
          for (const target of member.targets)
            port.execute('INSERT INTO gc_member_target VALUES (?,?,?,?,?,?)', [
              key,
              member.registrationId,
              definition,
              facts.epoch,
              target,
              JSON.stringify({ target }),
            ])
        }
        port.execute('INSERT INTO gc_selected_definition VALUES (?,?,?)', [
          key,
          definition,
          facts.epoch,
        ])
        for (const target of facts.targets)
          port.execute('INSERT INTO gc_selected_target VALUES (?,?,?,?,?,?)', [
            key,
            definition,
            target,
            facts.epoch,
            'fixture-origin',
            JSON.stringify({ target }),
          ])
        response = { kind: 'seeded' }
        break
      }
      case 'selection':
        response = {
          members: port.execute(
            'SELECT registration_id,definition_key,epoch FROM gc_member WHERE scope_key=? ORDER BY registration_id LIMIT 129',
            [scopeKey(facts.scope)],
          ).rows,
          definitions: port.execute(
            'SELECT definition_key,epoch FROM gc_selected_definition WHERE scope_key=? ORDER BY definition_key LIMIT 129',
            [scopeKey(facts.scope)],
          ).rows,
          targets: port.execute(
            'SELECT definition_key,target_json FROM gc_selected_target WHERE scope_key=? ORDER BY definition_key,target_key LIMIT 129',
            [scopeKey(facts.scope)],
          ).rows,
        }
        break
      case 'targets':
        response = {
          kind: 'targets',
          rows: port.execute(
            'SELECT target_key FROM gc_selected_target WHERE scope_key=? ORDER BY target_key LIMIT 129',
            [scopeKey(facts.scope)],
          ).rows,
        }
        break
      default:
        throw new Error('Unknown operation test command')
    }
    if (facts.rollback) return { kind: 'conflict', basis: { reason: 'fixture-rollback' } }
    return { kind: 'participated', response }
  },
}
