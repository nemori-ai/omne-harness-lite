import { randomUUID } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CommitResultV2, JsonValue } from '@omne-harness/sql-contract'
import type { ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import { TOOL_STORAGE_OWNER, type SqlToolOutputCustodyOptions } from './options.ts'
import { requestOf, type TenantDomain } from './tenant.ts'
import type { MaterialFacts } from './worker/material-facts.ts'
import { MATERIAL_READ_HANDLER } from './worker/read-material.ts'
import { PROTOCOL } from './worker/schema.ts'
import { isObject, type JsonObject } from './worker/support.ts'

export const materialUnavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: TOOL_STORAGE_OWNER, diagnostic })
export const materialConflict = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
  fail({ kind: 'conflict', operation })

function commitAnswer(
  answer: CommitResultV2,
  operation: ToolOperationId,
): Outcome<JsonObject, ToolFailure> {
  switch (answer.kind) {
    case 'committed': {
      const value = answer.responses[0].reply.response
      return isObject(value)
        ? succeed(value)
        : materialUnavailable('invalid material commit answer')
    }
    case 'unknown':
      return fail({ kind: 'commit-unknown', operation })
    case 'rolled_back': {
      const reply = answer.responses.at(-1)?.reply
      return reply?.kind === 'conflict' &&
        isObject(reply.basis) &&
        reply.basis['reason'] === 'material'
        ? materialConflict(operation)
        : materialUnavailable('material transaction rolled back')
    }
    case 'identity_conflict':
      return materialUnavailable('material SQL operation identity conflict')
    case 'rejected_before_accept':
      return materialUnavailable(`material commit rejected: ${answer.reason}`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

export function materialIO(options: SqlToolOutputCustodyOptions) {
  return {
    async commit(
      at: TenantDomain,
      operation: ToolOperationId,
      facts: MaterialFacts,
    ): Promise<Outcome<JsonObject, ToolFailure>> {
      const request = requestOf(options, at, facts)
      if (Buffer.byteLength(JSON.stringify(request.commands[0]), 'utf8') > options.maxCommandBytes)
        return materialUnavailable('material command exceeds configured byte limit')
      try {
        const answer = await options.storage.commit(request)
        return commitAnswer(answer, operation)
      } catch {
        return fail({ kind: 'commit-unknown', operation })
      }
    },
    async read(at: TenantDomain, input: JsonValue): Promise<Outcome<JsonObject, ToolFailure>> {
      try {
        const answer = await options.storage.read({
          domain: at.domain,
          handler: MATERIAL_READ_HANDLER,
          protocol: PROTOCOL,
          requestKey: randomUUID(),
          input,
        })
        return answer.kind === 'read' && isObject(answer.output)
          ? succeed(answer.output)
          : materialUnavailable('material read unavailable')
      } catch {
        return materialUnavailable('material read threw')
      }
    },
  }
}
