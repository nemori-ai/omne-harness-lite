export type LocalTransportOptions = Readonly<{
  clientInfo: Readonly<{ name: string; version: string }>
  probeTimeoutMs: number
  fetch?: typeof fetch
}>

export function checkOptions(options: LocalTransportOptions): void {
  const { name, version } = options.clientInfo
  if (typeof name !== 'string' || name === '')
    throw new RangeError('clientInfo.name must be a non-empty text')
  if (typeof version !== 'string' || version === '')
    throw new RangeError('clientInfo.version must be a non-empty text')
  const probe = options.probeTimeoutMs
  if (!Number.isSafeInteger(probe) || probe <= 0)
    throw new RangeError('probeTimeoutMs must be a positive integer of milliseconds')
}
