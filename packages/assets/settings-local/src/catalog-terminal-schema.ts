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
  value => value.binding.target.policyId === 'catalog',
)
export const catalogTerminalCommandSchema = terminalCommandSchema.refine(
  value => value.binding.target.policyId === 'catalog',
)
