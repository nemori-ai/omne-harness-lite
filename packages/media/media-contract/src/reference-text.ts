import type { ContentReference } from './values.ts'

const FIELDS = ['storage', 'key', 'mediaType', 'bytes', 'digest'] as const

/** A content reference as one text: its five fields in this order, as JSON with no white space. */
export function referenceText(ref: ContentReference): string {
  const { storage, key, mediaType, bytes, digest } = ref
  return JSON.stringify({ storage, key, mediaType, bytes, digest })
}

/** The reference a text writes, or null unless the text is exactly what `referenceText` writes for it. */
export function readReferenceText(text: string): ContentReference | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const fields = value as Record<string, unknown>
  const [storage, key, mediaType, bytes, digest] = FIELDS.map(name => fields[name])
  if (
    typeof storage !== 'string' ||
    typeof key !== 'string' ||
    typeof mediaType !== 'string' ||
    typeof bytes !== 'string' ||
    typeof digest !== 'string'
  )
    return null
  const ref: ContentReference = { storage, key, mediaType, bytes, digest }
  return referenceText(ref) === text ? ref : null
}
