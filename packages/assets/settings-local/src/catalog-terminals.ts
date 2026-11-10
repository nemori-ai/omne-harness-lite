import { equal, json } from './encoding.ts'
import { operationBindingSchema, type OperationBinding } from './schema.ts'
import { terminalKey } from './terminal-record.ts'
import type { SettingsSqlTerminalOptions, SettingsSqlTerminalResult } from './terminals.ts'
import { CATALOG_TERMINAL, catalogTerminalSchema } from './catalog-terminal-schema.ts'

export function createCatalogTerminals(options: SettingsSqlTerminalOptions) {
  return {
    async seal(input: OperationBinding): Promise<SettingsSqlTerminalResult> {
      const parsed = operationBindingSchema.safeParse(input)
      if (
        !parsed.success ||
        !equal(parsed.data.domain, options.domain) ||
        parsed.data.target.policyId !== 'catalog'
      )
        return { kind: 'conflict' }
      const binding = parsed.data
      try {
        const result = await options.storage.commit({
          identity: {
            ...options.domain,
            operation: 'settings.catalog-seal',
            protocolVersion: '2',
            operationKey: terminalKey(binding),
          },
          combinationVersion: options.combinationVersion,
          manifestDigest: options.manifestDigest,
          commands: [
            {
              participant: CATALOG_TERMINAL.participant,
              facts: { kind: 'seal', binding: json(binding) },
            },
          ],
        })
        if (result.kind === 'identity_conflict') return { kind: 'conflict' }
        if (result.kind !== 'committed') return { kind: 'unavailable' }
        const terminal = catalogTerminalSchema.safeParse(
          result.responses.find(r => r.participant === CATALOG_TERMINAL.participant)?.reply
            .response,
        )
        if (!terminal.success) return { kind: 'unavailable' }
        return equal(terminal.data.binding, binding)
          ? { kind: 'terminal', terminal: terminal.data }
          : { kind: 'conflict' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}
