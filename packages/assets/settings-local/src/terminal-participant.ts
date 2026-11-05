import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { canonical, equal, json } from './encoding.ts'
import { readTerminal, terminalKey } from './terminal-record.ts'
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
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_terminal_input' }
    const { kind, binding } = parsed.data
    const current = readTerminal(port, binding)
    const reject = (reason: 'operation_conflict' | 'basis_changed') => ({
      kind: 'conflict' as const,
      basis: json({ binding, failure: { kind: 'rejected', reason } }),
    })
    if (current && !equal(current.binding, binding)) return reject('operation_conflict')
    if (kind === 'consume' && current)
      return reject(current.state === 'aborted' ? 'basis_changed' : 'operation_conflict')
    const terminal = current ?? { binding, state: kind === 'consume' ? 'committed' : 'aborted' }
    if (!current)
      port.execute('INSERT INTO st_terminals (operation_key, record) VALUES (?, ?)', [
        terminalKey(binding),
        canonical(terminal),
      ])
    port.provideFact(TERMINAL_FACT, json({ binding, kind }))
    return { kind: 'participated', response: json(terminal) }
  },
} satisfies ParticipantModule
