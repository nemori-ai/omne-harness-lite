import { randomUUID } from 'node:crypto'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { equal, json } from './encoding.ts'
import { operationBindingSchema, type OperationBinding } from './schema.ts'
import { terminalKey } from './terminal-record.ts'
import {
  TERMINAL_HANDLER,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
  terminalSchema,
  type SettingsSqlTerminal,
  terminalLookupSchema,
  type SettingsSqlTerminalLookup,
} from './terminal-schema.ts'

export type SettingsSqlTerminalResult =
  | Readonly<{ kind: 'terminal'; terminal: SettingsSqlTerminal }>
  | Readonly<{ kind: 'absent' | 'unavailable' | 'conflict' }>
export type SettingsSqlTerminalOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combinationVersion: string
  manifestDigest: string
}>
/** Trusted assembly capability. Public clients use the authorized Settings application. */
export function createSettingsSqlTerminals(options: SettingsSqlTerminalOptions) {
  function lookup(binding: SettingsSqlTerminalLookup & { commandDigest?: string | undefined }) {
    const { commandDigest: _digest, ...key } = binding
    return key
  }
  function parse(input: OperationBinding) {
    const parsed = operationBindingSchema.safeParse(input)
    return parsed.success && equal(parsed.data.domain, options.domain) ? parsed.data : undefined
  }
  function terminal(
    value: unknown,
    binding: SettingsSqlTerminalLookup & { commandDigest?: string | undefined },
  ): SettingsSqlTerminalResult {
    const parsed = terminalSchema.safeParse(value)
    if (!parsed.success) return { kind: 'unavailable' }
    return equal(lookup(parsed.data.binding), lookup(binding)) &&
      (binding.commandDigest === undefined ||
        binding.commandDigest === parsed.data.binding.commandDigest)
      ? { kind: 'terminal', terminal: parsed.data }
      : { kind: 'conflict' }
  }
  return {
    async inspect(
      input: SettingsSqlTerminalLookup & { commandDigest?: string | undefined },
    ): Promise<SettingsSqlTerminalResult> {
      const parsed = terminalLookupSchema
        .extend({ commandDigest: operationBindingSchema.shape.commandDigest.optional() })
        .safeParse(input)
      if (!parsed.success || !equal(parsed.data.domain, options.domain)) return { kind: 'conflict' }
      const binding = parsed.data
      try {
        const read = await options.storage.read({
          domain: options.domain,
          handler: TERMINAL_HANDLER,
          protocol: TERMINAL_PROTOCOL,
          requestKey: randomUUID(),
          input: json(lookup(binding)),
        })
        if (read.kind !== 'read') return { kind: 'unavailable' }
        return read.output === null ? { kind: 'absent' } : terminal(read.output, binding)
      } catch {
        return { kind: 'unavailable' }
      }
    },
    async seal(input: OperationBinding): Promise<SettingsSqlTerminalResult> {
      const binding = parse(input)
      if (!binding) return { kind: 'conflict' }
      try {
        const result = await options.storage.commit({
          identity: {
            ...options.domain,
            operation: 'settings.seal',
            protocolVersion: '2',
            operationKey: terminalKey(binding),
          },
          combinationVersion: options.combinationVersion,
          manifestDigest: options.manifestDigest,
          commands: [
            { participant: TERMINAL_PARTICIPANT, facts: { kind: 'seal', binding: json(binding) } },
          ],
        })
        if (result.kind === 'committed')
          return terminal(
            result.responses.find(r => r.participant === TERMINAL_PARTICIPANT)?.reply.response,
            binding,
          )
        if (result.kind === 'identity_conflict') return { kind: 'conflict' }
        return { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}
