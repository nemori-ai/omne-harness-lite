import { randomUUID } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  encodeToolMaterial,
  type ToolHistoryCopies,
  type HistoricalOwnedCopy,
} from '@omne-harness/tool'
import {
  decodeToolOperationId,
  type Attachment,
  type DurableEvidence,
} from '@omne-harness/tool-contract'
import type { SqlToolStorageOptions } from './options.ts'
import { toJson } from './json.ts'
import { resolveTenant, requestOf, tenantText } from './tenant.ts'
import { HISTORY_READ_HANDLER } from './worker/read-history.ts'
import { PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-history-copies', diagnostic })
export function createSqlToolHistoryCopies<P>(
  options: SqlToolStorageOptions,
): ToolHistoryCopies<P> {
  return {
    inventory: async input => {
      const resolved = await resolveTenant(options, input.tenant)
      if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
      const answer = await options.storage.read({
        domain: resolved.at.domain,
        handler: HISTORY_READ_HANDLER,
        protocol: PROTOCOL,
        requestKey: randomUUID(),
        input: { tenant: resolved.at.tenant, call: input.call },
      })
      if (
        answer.kind !== 'read' ||
        !isObject(answer.output) ||
        !Array.isArray(answer.output.copies) ||
        !Array.isArray(answer.output.unsealed)
      )
        return unavailable('historical inventory unavailable')
      const copies: HistoricalOwnedCopy[] = []
      for (const item of answer.output.copies) {
        if (
          !isObject(item) ||
          (item.kind !== 'raw' && item.kind !== 'retain') ||
          !['digest', 'bytes', 'chunks', 'sha256', 'seal', 'answer'].every(
            key => typeof item[key] === 'string',
          )
        )
          return unavailable('invalid historical manifest')
        const operation = decodeToolOperationId(item.operation)
        if ('failure' in operation) return unavailable('invalid historical operation')
        let original
        try {
          original = JSON.parse(String(item.answer)) as unknown
        } catch {
          return unavailable('invalid historical answer')
        }
        const encoded = encodeToolMaterial(original)
        if ('failure' in encoded || typeof original !== 'object' || original === null)
          return unavailable('invalid historical answer')
        const value = original as Record<string, unknown>
        const custody = item.kind === 'raw' ? value.custody : value
        if (
          typeof custody !== 'object' ||
          custody === null ||
          Reflect.get(custody, 'digest') !== item.seal ||
          Reflect.get(custody, 'owner') !== '@omne-harness/tool-storage-sql' ||
          Reflect.get(custody, 'revision') !== '1' ||
          Reflect.get(custody, 'record') !== `${item.kind}/${input.call}/${operation.ok}`
        )
          return unavailable('historical custody does not match its manifest')
        const source = item.kind === 'raw' ? value.content : null
        if (
          source !== null &&
          (typeof source !== 'object' ||
            Reflect.get(source, 'storage') !== '@omne-harness/tool-storage-sql' ||
            Reflect.get(source, 'key') !== JSON.stringify([input.call, operation.ok]) ||
            Reflect.get(source, 'bytes') !== item.bytes ||
            Reflect.get(source, 'digest') !== `sha256:${item.sha256}`)
        )
          return unavailable('historical source does not match its manifest')
        copies.push({
          tenant: input.tenant,
          call: input.call,
          operation: operation.ok,
          kind: item.kind,
          inputDigest: String(item.digest),
          bytes: String(item.bytes),
          chunks: String(item.chunks),
          sha256: String(item.sha256),
          seal: String(item.seal),
          answer: encoded.ok.fingerprint,
          source: source as Attachment | null,
          custody: custody as DurableEvidence,
        })
      }
      const unsealed = []
      for (const text of answer.output.unsealed) {
        const operation = decodeToolOperationId(text)
        if ('failure' in operation) return unavailable('invalid unsealed operation')
        unsealed.push(operation.ok)
      }
      return succeed({ copies, unsealed })
    },
    cleanup: async input => {
      const resolved = await resolveTenant(options, input.tenant)
      if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
      if (tenantText(input.copy.tenant) !== resolved.at.tenant || input.copy.call !== input.call)
        return fail({ kind: 'conflict', operation: input.operation })
      const receipt: DurableEvidence = {
        owner: '@omne-harness/tool-storage-sql',
        record: `history-cleanup/${input.call}/${input.operation}/${input.copy.operation}`,
        revision: '1',
        digest: canonicalDigest({
          operation: input.operation,
          copy: input.copy,
          publication: input.publication,
        }),
      }
      const copy = toJson(input.copy),
        publication = toJson(input.publication),
        proof = toJson(receipt)
      if (!isObject(copy) || !isObject(publication) || !isObject(proof))
        return unavailable('invalid historical cleanup input')
      try {
        const answer = await options.storage.commit(
          requestOf(options, resolved.at, {
            intent: 'history-cleanup',
            tenant: resolved.at.tenant,
            call: input.call,
            operation: input.operation,
            expected: input.expected,
            copy,
            publication,
            receipt: proof,
          }),
        )
        if (answer.kind === 'unknown')
          return fail({ kind: 'commit-unknown', operation: input.operation })
        if (answer.kind === 'rolled_back')
          return fail({ kind: 'conflict', operation: input.operation })
        if (answer.kind !== 'committed') return unavailable('historical cleanup was not committed')
        const response = answer.responses[0].reply.response
        if (isObject(response) && response.kind === 'pending') return succeed({ kind: 'pending' })
        if (
          isObject(response) &&
          response.kind === 'deleted' &&
          isObject(response.receipt) &&
          canonicalDigest(response.receipt) === canonicalDigest(receipt)
        )
          return succeed({ kind: 'deleted', receipt })
        return unavailable('invalid historical cleanup receipt')
      } catch {
        return fail({ kind: 'commit-unknown', operation: input.operation })
      }
    },
  }
}
