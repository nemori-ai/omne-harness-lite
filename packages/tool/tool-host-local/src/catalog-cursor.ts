import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeCursor, type SearchCursor } from '@omne-harness/text-search'
import type { ToolFailure } from '@omne-harness/tool-contract'

export function catalogWindow(
  limit: number,
  after: string | null,
): Outcome<SearchCursor | null, ToolFailure> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    return fail({ kind: 'invalid', field: 'limit', reason: 'not-a-positive-integer' })
  if (after === null) return succeed(null)
  const cursor = decodeCursor(after)
  return cursor === null
    ? fail({ kind: 'invalid-cursor', reason: 'not-a-catalog-cursor' })
    : succeed(cursor)
}
