import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, equal, json } from './encoding.ts'
import { terminalKey } from './terminal-record.ts'
import {
  CATALOG_TERMINAL,
  CATALOG_TERMINAL_FACT,
  catalogTerminalCommandSchema,
  catalogTerminalSchema,
} from './catalog-terminal-schema.ts'

function readCatalogTerminal(port: ReadPort, key: string) {
  const row = port.execute(
    'SELECT record FROM st_catalog_terminals WHERE operation_key = ? LIMIT 1',
    [key],
  ).rows[0]
  if (!row) return undefined
  if (typeof row[0] !== 'string') throw new TypeError('Invalid catalog terminal record')
  return catalogTerminalSchema.parse(JSON.parse(row[0]))
}

export default {
  participant: CATALOG_TERMINAL.participant,
  protocol: CATALOG_TERMINAL.protocol,
  execute(facts, port) {
    const { kind, binding } = catalogTerminalCommandSchema.parse(facts)
    const key = terminalKey(binding)
    const current = readCatalogTerminal(port, key)
    const reject = (reason: 'operation_conflict' | 'basis_changed') => ({
      kind: 'conflict' as const,
      basis: { kind: 'rejected', reason },
    })
    if (current && !equal(current.binding, binding)) return reject('operation_conflict')
    if (kind === 'consume' && current)
      return reject(current.state === 'aborted' ? 'basis_changed' : 'operation_conflict')
    const terminal = current ?? { binding, state: kind === 'consume' ? 'committed' : 'aborted' }
    if (!current)
      port.execute('INSERT INTO st_catalog_terminals (operation_key, record) VALUES (?, ?)', [
        key,
        canonical(terminal),
      ])
    port.provideFact(CATALOG_TERMINAL_FACT, json({ binding, kind }))
    return { kind: 'participated', response: json(terminal) }
  },
} satisfies ParticipantModule
