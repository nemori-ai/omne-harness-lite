import { homedir } from 'node:os'
import { join } from 'node:path'

export interface TokenUse {
  readonly pool: string
  readonly command: string
  readonly pid: number
  readonly capacity: number
  readonly tokens: number
  readonly acquiredMs: number
  readonly endedMs: number
}

export interface Oversold {
  readonly pool: string
  readonly atMs: number
  readonly held: number
  readonly capacity: number
  readonly holders: readonly TokenUse[]
}

export interface LedgerAudit {
  readonly uses: number
  readonly pools: number
  readonly peak: number
  readonly oversold: readonly Oversold[]
}

export function tokenLedgerPath(env: Readonly<Record<string, string | undefined>>): string {
  return (
    env['OMNE_TEST_SLOT_LEDGER'] ||
    join(
      env['XDG_STATE_HOME'] || join(env['HOME'] || homedir(), '.local', 'state'),
      'omne-test-slots',
      'ledger.jsonl',
    )
  )
}

const wholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function useOf(line: string): TokenUse | undefined {
  let row: Record<string, unknown>
  try {
    row = JSON.parse(line) as Record<string, unknown>
  } catch {
    return undefined
  }
  const { event, pool, command, pid, capacity, tokens, acquiredMs, endedMs } = row
  if (event !== 'ran' || typeof pool !== 'string') return undefined
  if (![pid, capacity, tokens, acquiredMs, endedMs].every(wholeNumber)) return undefined
  return { pool, command: String(command), pid, capacity, tokens, acquiredMs, endedMs } as TokenUse
}

export function tokenUses(text: string, sinceMs = 0): TokenUse[] {
  return text
    .split('\n')
    .flatMap(line => useOf(line) ?? [])
    .filter(use => use.endedMs > use.acquiredMs && use.endedMs > sinceMs)
}

function auditPool(uses: readonly TokenUse[]): { peak: number; oversold: Oversold[] } {
  const events = uses
    .flatMap(use => [
      { atMs: use.acquiredMs, takes: true, use },
      { atMs: use.endedMs, takes: false, use },
    ])
    .sort((a, b) => a.atMs - b.atMs || Number(a.takes) - Number(b.takes))
  const holders = new Set<TokenUse>()
  const oversold: Oversold[] = []
  let held = 0
  let peak = 0
  for (const { atMs, takes, use } of events) {
    if (!takes) {
      holders.delete(use)
      held -= use.tokens
      continue
    }
    holders.add(use)
    held += use.tokens
    peak = Math.max(peak, held)
    if (held > use.capacity)
      oversold.push({ pool: use.pool, atMs, held, capacity: use.capacity, holders: [...holders] })
  }
  return { peak, oversold }
}

export function auditTokenUses(uses: readonly TokenUse[]): LedgerAudit {
  const byPool = Map.groupBy(uses, use => use.pool)
  const audits = [...byPool.values()].map(auditPool)
  return {
    uses: uses.length,
    pools: byPool.size,
    peak: Math.max(0, ...audits.map(audit => audit.peak)),
    oversold: audits.flatMap(audit => audit.oversold),
  }
}

export function describeAudit(audit: LedgerAudit): string[] {
  const head = `令牌账本：${audit.pools} 个池，${audit.uses} 次持有，一个池里同时持有的令牌数最高 ${audit.peak} 个`
  if (audit.oversold.length === 0) return [`${head}；没有超过容量的时刻`]
  return [
    `${head}；有 ${audit.oversold.length} 个时刻超过容量`,
    ...audit.oversold.map(
      moment =>
        `- ${new Date(moment.atMs).toISOString()} 池 ${moment.pool} 持有 ${moment.held} 个，容量 ${moment.capacity} 个：` +
        moment.holders
          .map(use => `进程 ${use.pid} 拿 ${use.tokens} 个「${use.command.slice(0, 80)}」`)
          .join('；'),
    ),
  ]
}
