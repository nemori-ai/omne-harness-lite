import { z } from 'zod'
import { OperationRefSchema } from '@omne-harness/human-intervention'

export const TERMINAL_PARTICIPANT = 'hitl.terminal'
export const TERMINAL_PROTOCOL = 'hitl-terminal/1'
export const TERMINAL_HANDLER = 'hitl.terminal-read'
export const TERMINAL_FACT = { key: 'hitl.operation-open', protocol: TERMINAL_PROTOCOL }
export const TERMINAL_MIGRATION = { owner: TERMINAL_PARTICIPANT, id: 'hitl-terminal-1' }
export const TERMINAL_TABLE = 'hi_terminals'
export const HitlSqlBindingSchema = z
  .strictObject({
    operationRef: OperationRefSchema,
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .readonly()
export const terminalSchema = z
  .strictObject({
    binding: HitlSqlBindingSchema,
    state: z.enum(['committed', 'aborted']),
  })
  .readonly()
export const terminalCommandSchema = z.strictObject({
  kind: z.enum(['consume', 'seal']),
  binding: HitlSqlBindingSchema,
})
export type HitlSqlBinding = z.infer<typeof HitlSqlBindingSchema>
export type HitlSqlTerminal = z.infer<typeof terminalSchema>
