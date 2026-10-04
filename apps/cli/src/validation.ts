import { createRequire } from 'node:module'
import type { ActionIntent, ActionReport } from '@omne-harness-lite/governance-client-operations'
const require = createRequire(new URL('../package.json', import.meta.url))
function fixedSchemas() {
  return require('./generated/ordinary.cjs') as Record<
    'Intent' | 'Output',
    (value: unknown) => boolean
  >
}
export function validIntent(value: unknown): value is ActionIntent {
  return fixedSchemas().Intent(value)
}
export function validReport(value: unknown): value is ActionReport {
  return fixedSchemas().Output(value)
}
