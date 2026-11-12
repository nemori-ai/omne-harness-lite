// Step 1 of the new address: `/api/<protocol>/v<major>/<name>` and nothing else (#1233 spec 已定 2).
// Protocol and name are one or more lower-case letters, digits or hyphens; the major version is a
// positive integer without a leading zero. A `?` anywhere, even an empty query, is off the grammar.

export type Address = Readonly<{
  /** The request path, which equals the request target because it has no query. */
  path: string
  protocol: string
  major: number
  name: string
}>

const ADDRESS = /^\/api\/([a-z0-9-]+)\/v([1-9][0-9]*)\/([a-z0-9-]+)$/

export function parseAddress(target: string): Address | undefined {
  const match = ADDRESS.exec(target)
  if (match === null) return undefined
  const [, protocol, digits, name] = match
  const major = Number(digits)
  if (protocol === undefined || name === undefined || !Number.isSafeInteger(major)) return undefined
  return { path: target, protocol, major, name }
}

/** The path part of a request target, so a diagnostic never records the query. */
export function pathOf(target: string): string {
  const query = target.indexOf('?')
  return query === -1 ? target : target.slice(0, query)
}
