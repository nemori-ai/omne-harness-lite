import type { TenantId } from '@omne-harness/public-contract'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import type { RawEntry } from './history-render.ts'
import type { Link } from './link.ts'

export type BlockReads = ReadonlyMap<string, string>

const PAGES = 16
const PAGE_BYTES = '65536'
const MEDIA = new Set(['image', 'voice', 'file'])

export const readKey = (message: string, block: string): string => `${message}\n${block}`

type Run = Readonly<{
  started: Readonly<{ position: string }>
  modelCalls: readonly Readonly<{
    reads: readonly Readonly<{ message: string; block: string; read: string }>[]
  }>[]
}>

/** Whether any message of the entries has a block that is not words. */
export function holdsMedia(entries: readonly RawEntry[]): boolean {
  return entries.some(entry => {
    const message = (entry['payload'] as { message?: { blocks?: unknown } } | undefined)?.message
    const blocks = Array.isArray(message?.blocks) ? (message.blocks as unknown[]) : []
    return blocks.some(block => MEDIA.has(String((block as { kind?: unknown } | null)?.kind)))
  })
}

/** The form of each block the model read, as the session diagnostics say; none when they cannot be read. */
export async function readsOfSession(
  link: Link,
  input: Readonly<{ tenant: TenantId; session: string; newId: () => string }>,
): Promise<BlockReads> {
  const { tenant, session } = input
  const reads = new Map<string, string>()
  let cursor: string | null = null
  for (let page = 0; page < PAGES; page += 1) {
    const body =
      cursor === null
        ? { tenant, session, cursor: null, run: null, pageBytes: PAGE_BYTES }
        : { tenant, session, cursor }
    const result = await link.call(
      sessionDiagnosticsProtocol,
      'read-session-diagnostics',
      body as never,
      input.newId(),
    )
    if (result?.kind !== 'response' || result.outcome !== 'succeeded') return new Map()
    const answered = result.body as { runs: readonly Run[]; next: string | null }
    const runs = [...answered.runs].sort((left, right) =>
      Number(BigInt(left.started.position) - BigInt(right.started.position)),
    )
    for (const run of runs)
      for (const call of run.modelCalls)
        for (const each of call.reads) reads.set(readKey(each.message, each.block), each.read)
    if (answered.next === null) return reads
    cursor = answered.next
  }
  return reads
}
