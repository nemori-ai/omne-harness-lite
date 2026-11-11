import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'

type Cursor = Readonly<{ binding: string; offset: number }>

export function encodeCatalogCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([2, cursor.binding, cursor.offset]), 'utf8').toString(
    'base64url',
  )
}

function parseCursor(value: unknown): Cursor | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value[0] !== 2 ||
    typeof value[1] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value[1]) ||
    !Number.isSafeInteger(value[2]) ||
    value[2] < 1
  )
    return null
  const cursor = { binding: value[1], offset: Number(value[2]) }
  return cursor
}

export function decodeCatalogCursor(text: string): Cursor | null {
  if (text.length > 192 || !/^[A-Za-z0-9_-]+$/u.test(text)) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    const cursor = parseCursor(value)
    if (cursor === null) return null
    return encodeCatalogCursor(cursor) === text ? cursor : null
  } catch {
    return null
  }
}

export function catalogWindow(
  limit: number,
  after: string | null,
): Outcome<Cursor | null, ToolFailure> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    return fail({ kind: 'invalid', field: 'limit', reason: 'not-a-positive-integer' })
  if (after === null) return succeed(null)
  const cursor = decodeCatalogCursor(after)
  return cursor === null
    ? fail({ kind: 'invalid-cursor', reason: 'not-a-catalog-cursor' })
    : succeed(cursor)
}
