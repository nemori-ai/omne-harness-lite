export type LocalTransportOptions = Readonly<{
  clientInfo: Readonly<{ name: string; version: string }>
  /** How many long requests one connection keeps open at most. */
  maxLongRequests: number
  fetch?: typeof fetch
}>

export function checkOptions(options: LocalTransportOptions): void {
  const { name, version } = options.clientInfo
  if (typeof name !== 'string' || name === '')
    throw new RangeError('clientInfo.name must be a non-empty text')
  if (typeof version !== 'string' || version === '')
    throw new RangeError('clientInfo.version must be a non-empty text')
  if (!Number.isSafeInteger(options.maxLongRequests) || options.maxLongRequests < 0)
    throw new RangeError('maxLongRequests must be a whole number, zero or more')
}
