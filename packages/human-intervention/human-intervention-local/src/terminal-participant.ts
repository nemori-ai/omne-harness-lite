import { stringCell } from './string-cell.ts'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { equal, json, operationKey } from './encoding.ts'
import { readTerminal } from './terminal-record.ts'
import {
  TERMINAL_FACT,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
  terminalCommandSchema,
} from './terminal-schema.ts'

export default {
  participant: TERMINAL_PARTICIPANT,
  protocol: TERMINAL_PROTOCOL,
  execute(facts, port) {
    const parsed = terminalCommandSchema.safeParse(facts)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'hitl_terminal_input' }
    const { kind, binding } = parsed.data
    const current = readTerminal(port, binding.operationRef)
    if (current && !equal(current.binding, binding))
      return { kind: 'conflict', basis: json({ reason: 'operation-conflict' }) }
    if (kind === 'consume' && current)
      return {
        kind: 'conflict',
        basis: json({ reason: current.state === 'aborted' ? 'sealed' : 'already-committed' }),
      }
    const terminal = current ?? { binding, state: kind === 'consume' ? 'committed' : 'aborted' }
    if (!current)
      port.execute(
        'INSERT INTO hi_terminals_v2(tenant_ref,actor_ref,operation_id,operation_key,input_digest,state) VALUES (?,?,?,?,?,?)',
        [
          stringCell(binding.operationRef.tenantRef),
          stringCell(binding.operationRef.actorRef),
          stringCell(binding.operationRef.operationId),
          operationKey(binding.operationRef),
          binding.inputDigest,
          terminal.state,
        ],
      )
    port.provideFact(TERMINAL_FACT, json({ kind, binding }))
    return { kind: 'participated', response: json(terminal) }
  },
} satisfies ParticipantModule
