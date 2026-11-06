import type { ReadPort, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { settingsRecoveryKey } from './recovery-reference.ts'
import type { SettingsAttemptBinding } from './attempt-binding.ts'
import { attemptTerminalSchema, type AttemptTerminal } from './finalization-schema.ts'
import { canonical, equal } from './encoding.ts'
export function attemptTerminalKey(binding: SettingsAttemptBinding) {
  return settingsRecoveryKey({
    domain: binding.identity.domain,
    principalRef: binding.identity.principalRef,
    kind: 'attempt',
    operationId: binding.attemptId,
  })
}
export function readAttemptTerminal(port: ReadPort, binding: SettingsAttemptBinding) {
  const row = port.execute('SELECT record FROM st_terminals WHERE operation_key = ? LIMIT 1', [
    attemptTerminalKey(binding),
  ]).rows[0]
  if (!row) return null
  if (typeof row[0] !== 'string') throw new TypeError('Invalid attempt terminal')
  const terminal = attemptTerminalSchema.parse(JSON.parse(row[0]))
  if (!equal(terminal.binding, binding)) throw new TypeError('Conflicting attempt terminal binding')
  return terminal
}
export function recordAttemptTerminal(port: ParticipantPort, input: AttemptTerminal) {
  const terminal = attemptTerminalSchema.parse(input)
  const current = readAttemptTerminal(port, terminal.binding)
  if (current) {
    if (!equal(current, terminal)) throw new TypeError('Conflicting attempt terminal outcome')
    return current
  }
  port.execute('INSERT INTO st_terminals (operation_key, record) VALUES (?, ?)', [
    attemptTerminalKey(terminal.binding),
    canonical(terminal),
  ])
  return terminal
}
