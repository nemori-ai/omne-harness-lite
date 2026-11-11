import { stringCell, readStringCell } from './string-cell.ts'
import { z } from 'zod'
import {
  DecisionSchema,
  ReplySchema,
  type Decision,
  type Reply,
  type RequestRef,
} from '@omne-harness/human-intervention'
import type { QueryRows, SqlCell } from '@omne-harness/sql-contract/worker'

export const countSchema = z.bigint().min(0n).max(64n).transform(Number)
export const ordinalSchema = z.number().int().min(0).max(63)
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
export function parseJson(cell: unknown): unknown {
  return JSON.parse(z.string().parse(cell))
}
export function changedOne(result: QueryRows) {
  if (result.changes !== 1n) throw new TypeError('Expected one relational state transition')
}
export function insertedSequence(result: QueryRows): string {
  changedOne(result)
  if (result.lastInsertRowid === null || result.lastInsertRowid < 1n)
    throw new TypeError('Missing relational sequence')
  return result.lastInsertRowid.toString()
}
export function replyColumns(reply: Reply) {
  return [
    reply.kind,
    reply.kind === 'selection' ? stringCell(reply.optionId) : null,
    reply.kind === 'text' ? stringCell(reply.text) : null,
  ] as const
}
export function decisionColumns(decision: Decision) {
  return [
    stringCell(decision.ref.decisionId),
    stringCell(decision.ref.submission.actorRef),
    stringCell(decision.ref.submission.operationId),
    ...replyColumns(decision.reply),
    stringCell(decision.basisRef),
    stringCell(decision.commitReceipt),
  ] as const
}
export function decodeReply(cells: readonly SqlCell[]) {
  const [kind, optionId, text] = cells
  switch (kind) {
    case 'selection':
      if (text !== null) throw new TypeError('Selection with reply text')
      return ReplySchema.parse({ kind, optionId: readStringCell(optionId) })
    case 'text':
      if (optionId !== null) throw new TypeError('Text with option')
      return ReplySchema.parse({ kind, text: readStringCell(text) })
    case 'decline':
      if (optionId !== null || text !== null) throw new TypeError('Decline with payload')
      return ReplySchema.parse({ kind })
    default:
      throw new TypeError('Invalid reply kind')
  }
}
export function decodeDecision(request: RequestRef, cardId: string, cells: readonly SqlCell[]) {
  return DecisionSchema.parse({
    ref: {
      card: { request, cardId },
      decisionId: readStringCell(cells[0]),
      submission: {
        tenantRef: request.tenantRef,
        actorRef: readStringCell(cells[1]),
        operationId: readStringCell(cells[2]),
      },
    },
    reply: decodeReply(cells.slice(3, 6)),
    basisRef: readStringCell(cells[6]),
    commitReceipt: readStringCell(cells[7]),
  })
}
