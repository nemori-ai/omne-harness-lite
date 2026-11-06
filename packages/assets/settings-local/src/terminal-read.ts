import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { json } from './encoding.ts'
import { readTerminal } from './terminal-record.ts'
import { TERMINAL_HANDLER, TERMINAL_PROTOCOL, terminalLookupSchema } from './terminal-schema.ts'
export default {
  handler: TERMINAL_HANDLER,
  protocol: TERMINAL_PROTOCOL,
  read(input, port) {
    const parsed = terminalLookupSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'settings_terminal_input' }
    return { kind: 'read', output: json(readTerminal(port, parsed.data) ?? null) }
  },
} satisfies ReadHandlerModule
