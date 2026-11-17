export type SearchCursor = Readonly<{ binding: string; offset: number }>

const VERSION = 2
const MAX_TEXT = 192

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify([VERSION, cursor.binding, cursor.offset]), 'utf8').toString(
    'base64url',
  )
}

function cursorOf(value: unknown): SearchCursor | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value[0] !== VERSION ||
    typeof value[1] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value[1]) ||
    !Number.isSafeInteger(value[2]) ||
    value[2] < 1
  )
    return null
  return { binding: value[1], offset: Number(value[2]) }
}

export function decodeCursor(text: string): SearchCursor | null {
  if (text.length > MAX_TEXT || !/^[A-Za-z0-9_-]+$/u.test(text)) return null
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const cursor = cursorOf(value)
  return cursor !== null && encodeCursor(cursor) === text ? cursor : null
}
