import { judgeMessage, type CoveredEntry, type Message } from '@omne-harness/message'
import type { SummaryMaterial } from '@omne-harness/request-context-contract'

type Trimmed = SummaryMaterial['trimmed'][number]

function prefixWithin(text: string, limit: number): string {
  let bytes = 0
  let end = 0
  for (const char of text) {
    const size = Buffer.byteLength(char)
    if (bytes + size > limit) break
    bytes += size
    end += char.length
  }
  return text.slice(0, end)
}

function trimMessage(message: Message, limit: number): { message: Message; cut: Trimmed[] } {
  if (message.role !== 'tool') return { message, cut: [] }
  const cut: Trimmed[] = []
  const blocks = message.blocks.map(part => {
    if (part.kind !== 'text') return part
    const original = Buffer.byteLength(part.text)
    if (original <= limit) return part
    const kept = prefixWithin(part.text, limit)
    if (kept === '') return part
    cut.push({
      message: message.id,
      block: part.id,
      originalBytes: String(original),
      keptBytes: String(Buffer.byteLength(kept)),
    })
    return { ...part, text: kept }
  })
  if (cut.length === 0) return { message, cut }
  const judged = judgeMessage({ ...message, blocks })
  return 'ok' in judged ? { message: judged.ok, cut } : { message, cut: [] }
}

export function trimMaterial(material: SummaryMaterial, limit: bigint): SummaryMaterial {
  const bound = limit > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(limit)
  const trimmed: Trimmed[] = [...material.trimmed]
  const covered = material.covered.map((entry): CoveredEntry => {
    if (entry.message === null) return entry
    const result = trimMessage(entry.message, bound)
    if (result.cut.length === 0) return entry
    trimmed.push(...result.cut)
    return { ref: entry.ref, message: result.message }
  })
  return trimmed.length === material.trimmed.length ? material : { ...material, covered, trimmed }
}
