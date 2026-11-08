import { randomUUID } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type HistoricalSourceReader } from '@omne-harness/tool'
import type { SqlToolStorageOptions } from './options.ts'
import { createSqlToolHistoryCopies } from './history-copies.ts'
import { resolveTenant } from './tenant.ts'
import { CHUNK_READ_HANDLER, PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'historical-source',
    diagnostic: 'historical source is unavailable or inconsistent',
  })
const badCursor = () =>
  fail({ kind: 'invalid-cursor' as const, reason: 'not-this-historical-source' })

/** Reads only a sealed source proved by this provider's historical manifest. */
export function createSqlToolHistorySourceReader<P>(
  options: SqlToolStorageOptions,
): HistoricalSourceReader<P> {
  const copies = createSqlToolHistoryCopies<P>(options)
  return {
    read: async input => {
      if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0 || input.maxBytes > 1048576)
        return fail({ kind: 'invalid', field: 'maxBytes', reason: 'historical-page-limit' })
      try {
        const resolved = await resolveTenant(options, input.tenant)
        if (resolved.kind !== 'ready') return unavailable()
        const inventory = await copies.inventory(input)
        if ('failure' in inventory) return inventory
        const copy = inventory.ok.copies.find(
          item =>
            item.kind === 'raw' &&
            canonicalDigest(item.source) === canonicalDigest(input.attachment),
        )
        if (copy === undefined) return unavailable()
        const total = Number(copy.bytes),
          count = Number(copy.chunks)
        if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(count) || count < 0)
          return unavailable()
        const scope = canonicalDigest({
          tenant: input.tenant,
          call: input.call,
          result: input.result,
          copy,
        })
        let index = 0,
          within = 0,
          offset = 0
        if (input.after !== null) {
          let cursor: JsonValue
          try {
            cursor = JSON.parse(input.after)
          } catch {
            return badCursor()
          }
          if (
            !isObject(cursor) ||
            Object.keys(cursor).length !== 4 ||
            cursor.scope !== scope ||
            ![cursor.index, cursor.within, cursor.offset].every(
              value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
            )
          )
            return badCursor()
          index = Number(cursor.index)
          within = Number(cursor.within)
          offset = Number(cursor.offset)
          if (offset <= 0 || offset >= total || index >= count) return badCursor()
        }
        const readChunk = async (index: number) => {
          const answer = await options.storage.read({
            domain: resolved.at.domain,
            handler: CHUNK_READ_HANDLER,
            protocol: PROTOCOL,
            requestKey: randomUUID(),
            input: {
              tenant: resolved.at.tenant,
              call: input.call,
              operation: copy.operation,
              index,
            },
          })
          if (
            answer.kind !== 'read' ||
            !isObject(answer.output) ||
            typeof answer.output.data !== 'string'
          )
            return unavailable()
          const chunk = Buffer.from(answer.output.data, 'base64')
          if (chunk.toString('base64') !== answer.output.data || chunk.length === 0)
            return unavailable()
          return succeed(chunk)
        }
        const first = count === 0 ? succeed(Buffer.alloc(0)) : await readChunk(0)
        if ('failure' in first) return first
        const chunkBytes = first.ok.length
        if (
          (total === 0) !== (count === 0) ||
          (count > 0 && Math.ceil(total / chunkBytes) !== count)
        )
          return unavailable()
        if (
          input.after !== null &&
          (within >= chunkBytes || index * chunkBytes + within !== offset)
        )
          return badCursor()
        const parts: Uint8Array[] = []
        let length = 0
        while (index < count && length < input.maxBytes) {
          const read = index === 0 ? first : await readChunk(index)
          if ('failure' in read) return read
          const chunk = read.ok
          const expected = index === count - 1 ? total - index * chunkBytes : chunkBytes
          if (chunk.length !== expected || within >= chunk.length) return unavailable()
          const take = Math.min(chunk.length - within, input.maxBytes - length)
          parts.push(chunk.subarray(within, within + take))
          length += take
          within += take
          if (within === chunk.length) {
            index += 1
            within = 0
          }
        }
        const end = offset + length
        if (end > total || (index === count) !== (end === total) || (length === 0 && total !== 0))
          return unavailable()
        const verified = await copies.inventory(input)
        if (
          'failure' in verified ||
          !verified.ok.copies.some(item => canonicalDigest(item) === canonicalDigest(copy))
        )
          return unavailable()
        return succeed({
          result: input.result,
          attachment: { ...input.attachment },
          offset: String(offset),
          bytes: Buffer.concat(parts, length),
          next: end === total ? null : JSON.stringify({ scope, index, within, offset: end }),
        })
      } catch {
        return unavailable()
      }
    },
  }
}
