import type { SessionId } from './identity.ts'

/** Where a history read of the memory double stands; `inherited` counts the pages of the prefix given. */
export type Cursor = Readonly<{
  tenant: string
  session: SessionId
  kinds: readonly string[]
  direction: 'forward' | 'backward'
  upper: number
  scanned: number
  pageBytes: number
  inherited?: number
}>

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(text: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const cursor = parsed as Record<string, unknown>
    if (typeof cursor['tenant'] !== 'string' || typeof cursor['session'] !== 'string') return null
    if (!Array.isArray(cursor['kinds']) || typeof cursor['upper'] !== 'number') return null
    if (typeof cursor['scanned'] !== 'number' || typeof cursor['pageBytes'] !== 'number')
      return null
    if (cursor['direction'] !== 'forward' && cursor['direction'] !== 'backward') return null
    return cursor as Cursor
  } catch {
    return null
  }
}
