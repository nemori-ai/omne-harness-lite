// JSON as plain data: what a transport composes a request from, and what a script carries to a
// fixture in another process. The lossless tree of `@omne-harness/json-text` is for what the peer
// wrote; plain data is for what this side writes.

export type PlainJson =
  | string
  | number
  | boolean
  | null
  | readonly PlainJson[]
  | Readonly<{ [key: string]: PlainJson }>

export type PlainRecord = Readonly<{ [key: string]: PlainJson }>

export function isPlainJson(value: unknown): value is PlainJson {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isPlainJson)
  return typeof value === 'object' && Object.values(value).every(isPlainJson)
}

export function isPlainRecord(value: PlainJson | undefined): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
