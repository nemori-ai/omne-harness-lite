import { z } from 'zod'
import { terminalSchema, terminalCommandSchema } from './terminal-schema.ts'

export const CATALOG_TERMINAL = {
  participant: 'settings.catalog-terminal',
  protocol: 'settings-catalog-terminal/1',
  table: 'st_catalog_terminals',
}
export const CATALOG_TERMINAL_FACT = {
  key: 'settings.catalog-capture-open',
  protocol: CATALOG_TERMINAL.protocol,
}
export const CATALOG_TERMINAL_MIGRATION = {
  owner: CATALOG_TERMINAL.participant,
  id: 'settings-catalog-terminal-1',
}
export const catalogTerminalSchema = terminalSchema.refine(
  value => value.binding.subject.kind === 'catalog-capture',
)
export const catalogTerminalCommandSchema = terminalCommandSchema
  .extend({ kind: z.enum(['consume', 'seal', 'release']) })
  .refine(value => value.binding.subject.kind === 'catalog-capture')
export const CATALOG_CAPTURES = {
  handler: 'settings.catalog-captures',
  protocol: 'settings-catalog-captures/1',
}
export const CATALOG_CAPTURE_PAGE = 32
export const catalogCapturesRequestSchema = z.strictObject({ after: z.string().nullable() })
export const catalogCapturesPageSchema = z.strictObject({
  items: z
    .array(z.strictObject({ key: z.string(), record: catalogTerminalSchema }))
    .max(CATALOG_CAPTURE_PAGE),
  next: z.string().nullable(),
})
