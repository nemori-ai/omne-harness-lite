import { decodeToolInstant, type ToolInstant } from '@omne-harness/tool-contract/provider'

export function instantAfter(now: ToolInstant, ms: number): ToolInstant {
  const decoded = decodeToolInstant(new Date(Date.parse(now) + ms).toISOString())
  if ('failure' in decoded) throw new Error('ledger minted an illegal instant')
  return decoded.ok
}
