import { z } from 'zod'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { operationBindingSchema } from './schema.ts'

export const TERMINAL_PARTICIPANT = 'settings.terminal'
export const TERMINAL_PROTOCOL = 'settings-terminal/1'
export const TERMINAL_MIGRATION = { owner: TERMINAL_PARTICIPANT, id: 'settings-terminal-1' }
export const TERMINAL_TABLE = 'st_terminals'
export const terminalSchema = z.strictObject({
  binding: operationBindingSchema,
  state: z.enum(['committed', 'aborted']),
})
export const terminalLookupSchema = operationBindingSchema.omit({ commandDigest: true })
export type SettingsSqlTerminalLookup = z.infer<typeof terminalLookupSchema>
export const terminalCommandSchema = z.strictObject({
  kind: z.enum(['consume', 'seal']),
  binding: operationBindingSchema,
})
export type SettingsSqlTerminal = z.infer<typeof terminalSchema>
export type SettingsSqlTerminalResult =
  | Readonly<{ kind: 'terminal'; terminal: SettingsSqlTerminal }>
  | Readonly<{ kind: 'absent' | 'unavailable' | 'conflict' }>
/** The storage, the domain and the registered combination that a Settings client commits with. */
export type SettingsSqlTerminalOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combinationVersion: string
  manifestDigest: string
}>
