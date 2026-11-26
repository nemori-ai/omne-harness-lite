import type { HistoryEntry } from './content.ts'
import { isRecord, listOf } from './plain.ts'

type Position = Readonly<{ message: string; block: string }>

const KINDS: Readonly<Record<string, string>> = { image: '张图片', voice: '段语音', file: '个文件' }
const OTHER = '块内容'

function kindOf(entries: readonly HistoryEntry[], { message, block }: Position): string {
  for (const { payload } of entries) {
    const read = isRecord(payload) ? payload['message'] : undefined
    if (!isRecord(read) || read['id'] !== message) continue
    const found = listOf(read['blocks']).find(each => isRecord(each) && each['id'] === block)
    return isRecord(found) ? (KINDS[String(found['kind'])] ?? OTHER) : OTHER
  }
  return OTHER
}

/** The blocks that stopped a model, said by kind and count; one not in the history read so far is content. */
export function blockedText(entries: readonly HistoryEntry[], blocks: readonly Position[]): string {
  const counts = new Map<string, number>()
  for (const position of blocks) {
    const kind = kindOf(entries, position)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...Object.values(KINDS), OTHER]
    .filter(kind => counts.has(kind))
    .map(kind => `${String(counts.get(kind))} ${kind}`)
    .join('、')
}
