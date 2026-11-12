// The options of the local transport factory, and their check.

export type LocalTransportOptions = Readonly<{
  /** What this side says of itself in every request (contract T3). Both texts are non-empty. */
  clientInfo: Readonly<{ name: string; version: string }>
  /** The `fetch` the Streamable HTTP line uses. Default: the global one. */
  fetch?: typeof fetch
}>

/** Throws `RangeError` on an option outside its range. */
export function checkOptions(options: LocalTransportOptions): void {
  const { name, version } = options.clientInfo
  if (typeof name !== 'string' || name === '')
    throw new RangeError('clientInfo.name must be a non-empty text')
  if (typeof version !== 'string' || version === '')
    throw new RangeError('clientInfo.version must be a non-empty text')
}
