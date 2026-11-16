import { decodeProviderName, type ProviderName } from '@omne-harness/model-contract'

export function providerName(text: string): ProviderName {
  const decoded = decodeProviderName(text)
  if (!('ok' in decoded)) throw new Error(`invalid provider fixture ${text}`)
  return decoded.ok
}
