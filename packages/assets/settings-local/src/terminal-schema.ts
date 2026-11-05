import { z } from 'zod'
import { operationBindingSchema } from './schema.ts'

export const TERMINAL_PARTICIPANT = 'settings.terminal'
export const TERMINAL_PROTOCOL = 'settings-terminal/1'
export const TERMINAL_HANDLER = 'settings.terminal-read'
export const TERMINAL_FACT = { key: 'settings.operation-open', protocol: TERMINAL_PROTOCOL }
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
