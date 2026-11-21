export type SearchCursor = Readonly<{ binding: string; offset: number }>

const VERSION = 2
const MAX_TEXT = 192
const BINDING = /^[a-f0-9]{64}$/u

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify([VERSION, cursor.binding, cursor.offset])).toString('base64url')
}

function read(text: string): unknown {
  try {
    return JSON.parse(Buffer.from(text, 'base64url').toString())
  } catch {
    return undefined
  }
}

/** Only text this member wrote decodes: anything else, re-encoded, differs from the text. */
export function decodeCursor(text: string): SearchCursor | null {
  if (text.length > MAX_TEXT) return null
  const value = read(text)
  if (!Array.isArray(value)) return null
  const [, binding, offset] = value as unknown[]
  if (typeof binding !== 'string' || !BINDING.test(binding)) return null
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 1) return null
  const cursor = { binding, offset }
  return encodeCursor(cursor) === text ? cursor : null
}
