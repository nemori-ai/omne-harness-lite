import { randomUUID } from 'node:crypto'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { equal, json, operationKey } from './encoding.ts'
import {
  HitlSqlBindingSchema,
  TERMINAL_HANDLER,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
  terminalSchema,
  type HitlSqlBinding,
  type HitlSqlTerminal,
} from './terminal-schema.ts'

export type HitlSqlTerminalResult =
  | Readonly<{ kind: 'terminal'; terminal: HitlSqlTerminal }>
  | Readonly<{ kind: 'absent' | 'unavailable' | 'conflict' }>
export type HitlSqlTerminalOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combinationVersion: string
  manifestDigest: string
}>

/** Trusted assembly capability; application services must authenticate their caller first. */
export function createHitlSqlTerminals(options: HitlSqlTerminalOptions) {
  if (options.domain.scope.kind !== 'tenant') throw new TypeError('HITL requires a tenant domain')
  const tenant = options.domain.scope.tenant
  function binding(input: HitlSqlBinding) {
    const parsed = HitlSqlBindingSchema.safeParse(input)
    return parsed.success && parsed.data.operationRef.tenantRef === tenant ? parsed.data : undefined
  }
  function result(value: unknown, expected: HitlSqlBinding): HitlSqlTerminalResult {
    const parsed = terminalSchema.safeParse(value)
    if (!parsed.success) return { kind: 'unavailable' }
    return equal(parsed.data.binding, expected)
      ? { kind: 'terminal', terminal: parsed.data }
      : { kind: 'conflict' }
  }
  return {
    async inspect(input: HitlSqlBinding): Promise<HitlSqlTerminalResult> {
      const parsed = binding(input)
      if (!parsed) return { kind: 'conflict' }
      try {
        const read = await options.storage.read({
          domain: options.domain,
          handler: TERMINAL_HANDLER,
          protocol: TERMINAL_PROTOCOL,
          requestKey: randomUUID(),
          input: json(parsed.operationRef),
        })
        if (read.kind !== 'read') return { kind: 'unavailable' }
        return read.output === null ? { kind: 'absent' } : result(read.output, parsed)
      } catch {
        return { kind: 'unavailable' }
      }
    },
    async seal(input: HitlSqlBinding): Promise<HitlSqlTerminalResult> {
      const parsed = binding(input)
      if (!parsed) return { kind: 'conflict' }
      try {
        const committed = await options.storage.commit({
          identity: {
            ...options.domain,
            operation: 'hitl.seal',
            protocolVersion: '2',
            operationKey: operationKey(parsed.operationRef),
          },
          combinationVersion: options.combinationVersion,
          manifestDigest: options.manifestDigest,
          commands: [
            { participant: TERMINAL_PARTICIPANT, facts: { kind: 'seal', binding: json(parsed) } },
          ],
        })
        if (committed.kind === 'committed')
          return result(
            committed.responses.find(reply => reply.participant === TERMINAL_PARTICIPANT)?.reply
              .response,
            parsed,
          )
        if (committed.kind === 'identity_conflict') return { kind: 'conflict' }
        return { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}
