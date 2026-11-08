import { readJsonBytes, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Reply, ToolBodyPage } from '@omne-harness/tool-contract'
import { invalid } from './boundary.ts'
import {
  bodyUnavailable,
  readBodyBytes,
  type BodyReadInput,
  type StoredBody,
} from './ledger-body-page.ts'

export async function readBodyRecords<P>(
  input: BodyReadInput<P>,
  body: StoredBody,
  position: Readonly<{ offset: string; scope: string }>,
  ports: Parameters<typeof readBodyBytes<P>>[3],
): Reply<ToolBodyPage> {
  const { representation } = body.description
  if (representation.kind !== 'json-lines') return invalid('body', 'JSON Lines required')
  const start = BigInt(position.offset)
  const total = BigInt(body.seal.bytes)
  if (start > 0n) {
    const preceding = await readBodyBytes(
      input,
      body,
      { ...position, offset: String(start - 1n) },
      { ...ports, maxBytes: 1 },
    )
    if ('failure' in preceding) return preceding
    if (preceding.ok.bytes[0] !== 10)
      return fail({ kind: 'invalid-cursor', reason: 'not-a-record-boundary' })
  }
  const chunks: Uint8Array[] = []
  let scanned = 0
  while (start + BigInt(scanned) < total && scanned < ports.maxBytes) {
    const page = await readBodyBytes(
      input,
      body,
      { ...position, offset: String(start + BigInt(scanned)) },
      { ...ports, maxBytes: ports.maxBytes - scanned },
    )
    if ('failure' in page) return page
    chunks.push(page.ok.bytes)
    scanned += page.ok.bytes.length
  }
  const bytes = Buffer.concat(chunks, scanned)
  const consumed = bytes.lastIndexOf(10) + 1
  if (start + BigInt(scanned) === total && consumed !== scanned)
    return bodyUnavailable('sealed JSON Lines body has an incomplete final record')
  if (consumed === 0 && total !== 0n)
    return invalid('maxBytes', `first-record-does-not-fit:${position.offset}`)
  const records: JsonValue[] = []
  const budget = ports.maxBytes
  const limits = {
    maxBytes: budget,
    maxDepth: budget,
    maxItems: budget,
    maxMembers: budget,
    maxStringLength: budget,
    maxNumberLength: budget,
  }
  for (let offset = 0; offset < consumed;) {
    const end = bytes.indexOf(10, offset)
    const read = readJsonBytes(bytes.subarray(offset, end), limits)
    if (read.kind !== 'ok') return bodyUnavailable(`sealed JSON Lines record is ${read.kind}`)
    records.push(read.value)
    offset = end + 1
  }
  const end = start + BigInt(consumed)
  return succeed({
    kind: 'json-lines',
    representation,
    records,
    result: input.result,
    bodyId: input.bodyId,
    bodyBytes: body.description.bodyBytes,
    expiresAt: body.description.retention.expiresAt,
    position: position.offset,
    next:
      end === total
        ? null
        : JSON.stringify({ version: 1, scope: position.scope, offset: String(end) }),
  })
}
