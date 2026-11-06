import type { CommittedV2 } from '@omne-harness/sql-contract'
import type {
  OperationInspection,
  RecoveryOperationInspection,
} from '@omne-harness/human-intervention'
import { equal, operationKey } from './encoding.ts'
import { StoredOperationSchema } from './operation-schema.ts'
import { REQUEST_WRITER } from './request-schema.ts'
import { WAIT_WRITER } from './wait-schema.ts'
import { WAIT_CONTROL } from './independent-schema.ts'
import { HitlSqlBindingSchema, type HitlSqlBinding } from './terminal-schema.ts'
import { createHitlSqlTerminals, type HitlSqlTerminalOptions } from './terminals.ts'

export type HitlSqlOperationInspection = OperationInspection | RecoveryOperationInspection

function originalResult(stored: CommittedV2, binding: HitlSqlBinding): HitlSqlOperationInspection {
  const operationRef = binding.operationRef
  const candidates = stored.responses
    .filter(
      item =>
        item.participant === REQUEST_WRITER ||
        item.participant === WAIT_CONTROL ||
        item.participant === WAIT_WRITER,
    )
    .map(item => StoredOperationSchema.safeParse(item.reply.response))
    .filter(item => item.success)
  const candidate = candidates.length === 1 ? candidates[0] : undefined
  if (!candidate?.success) return { kind: 'unavailable', reason: 'operation-result' }
  const result = candidate.data
  if (!equal(result.operationRef, operationRef) || result.inputDigest !== binding.inputDigest)
    return { kind: 'conflict', operationRef, reason: 'operation-binding' }
  return result
}

/** Trusted assembly capability; callers must check current Identity and audience before disclosure. */
export function createHitlSqlOperations(options: HitlSqlTerminalOptions) {
  const terminals = createHitlSqlTerminals(options)
  async function inspect(input: HitlSqlBinding): Promise<HitlSqlOperationInspection> {
    const parsed = HitlSqlBindingSchema.safeParse(input)
    if (!parsed.success) return { kind: 'invalid-input', reason: 'operation-binding' }
    const binding = parsed.data
    const operationRef = binding.operationRef
    const terminal = await terminals.inspect(binding)
    switch (terminal.kind) {
      case 'conflict':
        return { kind: 'conflict', operationRef, reason: 'operation-binding' }
      case 'absent':
        return { kind: 'unknown', operationRef }
      case 'unavailable':
        return { kind: 'unavailable', reason: 'operation-terminal' }
      case 'terminal':
        break
    }
    if (terminal.terminal.state === 'aborted')
      return {
        kind: 'not-committed',
        operationRef,
        sealReceipt: `hitl-seal-${operationKey(operationRef)}`,
      }
    try {
      const stored = await options.storage.query({
        ...options.domain,
        operation: 'hitl.command',
        protocolVersion: '2',
        operationKey: operationKey(operationRef),
      })
      if (stored.kind !== 'committed') return { kind: 'unknown', operationRef }
      return originalResult(stored, binding)
    } catch {
      return { kind: 'unavailable', reason: 'operation-read' }
    }
  }
  return {
    inspect,
    async seal(input: HitlSqlBinding): Promise<HitlSqlOperationInspection> {
      await terminals.seal(input)
      return inspect(input)
    },
  }
}
