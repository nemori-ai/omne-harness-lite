import type { ProtocolContract } from '@omne-harness/public-contract'

/** The file of a page bundle that lists the protocols its page speaks. */
export const BUNDLE_PROTOCOLS_FILE = 'protocols.json'

type Key = Readonly<{ name: string; major: number }>

const isKey = (value: unknown): value is Key =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Key).name === 'string' &&
  Number.isInteger((value as Key).major)

export function bundleProtocolsText(contracts: readonly ProtocolContract[]): string {
  return `${JSON.stringify(contracts.map(({ name, major }) => ({ name, major })))}\n`
}

/** The contracts served for a page bundle: the ones it lists among the known. No list: all. An unreadable list: none. */
export function bundleContracts(
  known: readonly ProtocolContract[],
  listed: string | undefined,
): readonly ProtocolContract[] {
  if (listed === undefined) return known
  let keys: unknown
  try {
    keys = JSON.parse(listed)
  } catch {
    return []
  }
  if (!Array.isArray(keys) || !keys.every(isKey)) return []
  return known.filter(contract =>
    keys.some(key => key.name === contract.name && key.major === contract.major),
  )
}
