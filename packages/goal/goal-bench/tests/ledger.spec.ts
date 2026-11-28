import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadLedger, renderLedger } from '../src/ledger.ts'
import type { Report } from '../src/report.ts'

const rate = (errors: number, n: number) => ({ errors, n, rate: errors / n })
const report = (split: string, loss: number) =>
  ({
    split,
    gates: { falseHolds: rate(1, 88), falseSettles: rate(0, 125) },
    ranking: { missed: rate(65, 260), missedViolations: rate(0, 15), loss },
    cost: { costPerCase: 0.00026 },
  }) as unknown as Report

describe('the ledger of experiments as a table', () => {
  const entries = [
    { name: 'a-first', axis: '打包', changed: '带摘录', conclusion: '采用' },
    { name: 'b-compared', axis: '对照', changed: '两份方案', conclusion: '见对照' },
  ]

  it('sets what was written about each experiment beside the numbers of its own report, in the order written', () => {
    const reports = new Map([['a-first', report('tune', 0.111)]])
    expect(renderLedger(entries, reports).split('\n')).toEqual([
      '| 实验 | 轴 | 改了什么 | 数据 | 误判成立 | 误收场 | 漏放 | 守则漏报 | 加权损失 | 每次判定（美元） | 结论 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| `a-first` | 打包 | 带摘录 | tune | 1/88 | 0/125 | 65/260 | 0/15 | 0.111 | 0.00026 | 采用 |',
      '| `b-compared` | 对照 | 两份方案 | — | — | — | — | — | — | — | 见对照 |',
      '',
    ])
  })

  it('lists an experiment that was run and not written down last, by name, as not written down', () => {
    const reports = new Map([
      ['z-stray', report('verify', 0.2)],
      ['a-first', report('tune', 0.111)],
      ['c-stray', report('tune', 0.3)],
    ])
    const rows = renderLedger(entries, reports).split('\n').slice(4, 6)
    expect(rows).toEqual([
      '| `c-stray` | — | — | tune | 1/88 | 0/125 | 65/260 | 0/15 | 0.300 | 0.00026 | 没有记 |',
      '| `z-stray` | — | — | verify | 1/88 | 0/125 | 65/260 | 0/15 | 0.200 | 0.00026 | 没有记 |',
    ])
  })
})

describe('the kept ledger', () => {
  it('writes down every kept experiment once, and nothing that is not kept', () => {
    const experiments = join(import.meta.dirname, '..', 'experiments')
    const kept = readdirSync(experiments, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
    const written = loadLedger(join(experiments, 'ledger.json')).map(entry => entry.name)
    expect(written.toSorted()).toEqual(kept.toSorted())
  })
})
