export type Address = Readonly<{
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

export function pathOf(target: string): string {
  const query = target.indexOf('?')
  return query === -1 ? target : target.slice(0, query)
}
