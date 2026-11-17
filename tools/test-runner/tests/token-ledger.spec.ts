import { describe, expect, it } from 'vitest'
import {
  auditTokenUses,
  describeAudit,
  tokenLedgerPath,
  tokenUses,
  type TokenUse,
} from '../src/testing/token-ledger.ts'

const use = (
  pid: number,
  tokens: number,
  acquiredMs: number,
  endedMs: number,
  pool = '/tmp/pool',
): TokenUse => ({ pool, command: `job-${pid}`, pid, capacity: 6, tokens, acquiredMs, endedMs })

const row = (fields: Record<string, unknown>): string =>
  JSON.stringify({
    event: 'ran',
    pool: '/tmp/pool',
    command: 'job',
    pid: 1,
    capacity: 6,
    tokens: 2,
    acquiredMs: 1000,
    endedMs: 2000,
    ...fields,
  })

describe('令牌账本的核对', () => {
  it('同时持有的令牌数之和不超过容量：报最高值，没有超过的时刻', () => {
    const audit = auditTokenUses([use(1, 4, 0, 100), use(2, 2, 10, 50), use(3, 2, 50, 90)])
    expect(audit).toEqual({ uses: 3, pools: 1, peak: 6, oversold: [] })
    expect(describeAudit(audit)).toEqual([
      '令牌账本：1 个池，3 次持有，一个池里同时持有的令牌数最高 6 个；没有超过容量的时刻',
    ])
  })

  it('前一件归还与后一件拿到在同一毫秒：先算归还，不算超过', () => {
    expect(auditTokenUses([use(1, 6, 0, 100), use(2, 6, 100, 200)]).oversold).toEqual([])
  })

  it('超过容量的时刻逐个列出：何时、哪个池、持有几个、谁拿着', () => {
    const first = use(1, 4, 0, 100)
    const second = use(2, 3, 40, 60)
    const audit = auditTokenUses([first, second])
    expect(audit.peak).toBe(7)
    expect(audit.oversold).toEqual([
      { pool: '/tmp/pool', atMs: 40, held: 7, capacity: 6, holders: [first, second] },
    ])
    expect(describeAudit(audit)).toEqual([
      '令牌账本：1 个池，2 次持有，一个池里同时持有的令牌数最高 7 个；有 1 个时刻超过容量',
      '- 1970-01-01T00:00:00.040Z 池 /tmp/pool 持有 7 个，容量 6 个：进程 1 拿 4 个「job-1」；进程 2 拿 3 个「job-2」',
    ])
  })

  it('各个池分开算：两个池同时各持满，不算超过', () => {
    const audit = auditTokenUses([use(1, 6, 0, 100, '/tmp/a'), use(2, 6, 0, 100, '/tmp/b')])
    expect(audit).toEqual({ uses: 2, pools: 2, peak: 6, oversold: [] })
  })

  it('没有记录时最高值是 0', () => {
    expect(auditTokenUses([])).toEqual({ uses: 0, pools: 0, peak: 0, oversold: [] })
  })

  it('只取跑过的行：放弃的、读不出的、没记池或毫秒时刻的旧行、零长度的都不算', () => {
    const text = [
      row({ pid: 1 }),
      row({ pid: 2, event: 'gave-up', tokens: null, acquiredMs: null }),
      '{ not json',
      row({ pid: 3, acquiredMs: undefined }),
      row({ pid: 4, acquiredMs: 2000, endedMs: 2000 }),
      row({ pid: 5, pool: undefined }),
      '',
    ].join('\n')
    expect(tokenUses(text).map(found => found.pid)).toEqual([1])
  })

  it('--since：只看在这个时刻之后结束的持有', () => {
    const text = [row({ pid: 1, endedMs: 2000 }), row({ pid: 2, endedMs: 5000 })].join('\n')
    expect(tokenUses(text, 2000).map(found => found.pid)).toEqual([2])
  })

  it('账本的位置与令牌池脚本取的是同一个', () => {
    expect(tokenLedgerPath({ OMNE_TEST_SLOT_LEDGER: '/x/ledger.jsonl' })).toBe('/x/ledger.jsonl')
    expect(tokenLedgerPath({ XDG_STATE_HOME: '/state', HOME: '/home/u' })).toBe(
      '/state/omne-test-slots/ledger.jsonl',
    )
    expect(tokenLedgerPath({ HOME: '/home/u' })).toBe(
      '/home/u/.local/state/omne-test-slots/ledger.jsonl',
    )
  })
})
