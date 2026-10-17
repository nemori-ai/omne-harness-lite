// 趋势快照：干净才写、同一提交不重复写、坏行跳过并报出、上一次与基线快照按祖先关系找。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendSnapshot,
  baselineSnapshot,
  parseSnapshot,
  previousSnapshot,
  readTrend,
  snapshotDecision,
  type Ancestry,
  type Snapshot,
} from '../src/loop/trend.ts'

const snapshot = (commit: string, value = 1): Snapshot => ({
  schema: 1,
  commit,
  committedAt: '2026-10-01T00:00:00+08:00',
  recordedAt: `2026-10-01T00:00:0${value}Z`,
  branch: 'main',
  indicators: { duplicationPercent: { value, band: 'normal' } },
  members: {
    'packages/core/a': {
      overAlert: 1,
      risk: 3,
      duplication: null,
      testsWithoutAssertions: 0,
      band: 'normal',
    },
  },
})

/** 一条直线历史 c5 → c4 → … → c1（c5 最新）；`ancestry('c3')` 是 c3 及其祖先。 */
const ancestry = (tip: string): Ancestry => {
  const line = ['c5', 'c4', 'c3', 'c2', 'c1']
  return new Map(line.slice(line.indexOf(tip)).map((sha, index) => [sha, index]))
}

describe('趋势：写不写', () => {
  const decide = (overrides: Partial<Parameters<typeof snapshotDecision>[0]>) =>
    snapshotDecision({
      requested: true,
      dirty: false,
      headIsPrimary: false,
      primaryBranch: 'main',
      alreadyRecorded: false,
      ...overrides,
    })

  it('干净且要求了，或干净且 HEAD 正是主线的头：写', () => {
    expect(decide({})).toEqual({ write: true })
    expect(decide({ requested: false, headIsPrimary: true })).toEqual({ write: true })
  })

  it('工作树不干净：不写，哪怕要求了', () => {
    expect(decide({ dirty: true })).toEqual({ write: false, reason: '工作树不干净，不写快照' })
  })

  it('没要求、又不在主线头上：不写', () => {
    expect(decide({ requested: false }).write).toBe(false)
  })

  it('同一个提交已有快照：不重复写', () => {
    expect(decide({ alreadyRecorded: true })).toEqual({
      write: false,
      reason: '这个提交已有快照，不重复写',
    })
  })
})

describe('趋势：读写文件', () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })

  it('写一行、读回来一样；坏行跳过并报出行号，不崩', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-trend-'))
    made.push(dir)
    const path = join(dir, 'nested', 'trend.jsonl')
    appendSnapshot(path, snapshot('c1'))
    writeFileSync(path, `${readFileSync(path, 'utf8')}{not json\n\n{"schema":2}\n`)
    appendSnapshot(path, snapshot('c2'))
    const read = readTrend(path)
    expect(read.snapshots.map(entry => entry.commit)).toEqual(['c1', 'c2'])
    expect(read.snapshots[0]).toEqual(snapshot('c1'))
    expect(read.badLines).toEqual([2, 4])
  })

  it('文件不存在：当作空的', () => {
    expect(readTrend(join(tmpdir(), 'no-such-dir-loop', 'trend.jsonl'))).toEqual({
      snapshots: [],
      badLines: [],
    })
  })

  it('字段类型不对的行不收', () => {
    const bad = { ...snapshot('c1'), indicators: { x: { value: 'high', band: 'normal' } } }
    expect(parseSnapshot(JSON.stringify(bad))).toBeUndefined()
    const badBand = { ...snapshot('c1'), members: { m: { band: 'red' } } }
    expect(parseSnapshot(JSON.stringify(badBand))).toBeUndefined()
  })
})

describe('趋势：按祖先关系找', () => {
  const all = [snapshot('c1', 1), snapshot('c2', 2), snapshot('c4', 4), snapshot('other', 9)]

  it('上一次：最近一条是当前提交祖先（或就是它）的快照，不看文件里的顺序', () => {
    expect(previousSnapshot([...all].reverse(), ancestry('c3'))?.commit).toBe('c2')
    expect(previousSnapshot(all, ancestry('c4'))?.commit).toBe('c4')
    expect(previousSnapshot(all, new Map([['x', 0]]))).toBeUndefined()
  })

  it('基线快照之一：合并点那个提交就有快照', () => {
    expect(baselineSnapshot(all, 'c2', ancestry('c2'), 'c5')).toEqual({
      kind: 'exact',
      snapshot: snapshot('c2', 2),
    })
  })

  it('基线快照之二：合并点上没有，取最近一条是合并点祖先的', () => {
    expect(baselineSnapshot(all, 'c3', ancestry('c3'), 'c5')).toEqual({
      kind: 'ancestor',
      snapshot: snapshot('c2', 2),
    })
  })

  it('基线快照之三：合并点及其祖先上都没有，就是无；当前提交自己的快照不算', () => {
    expect(baselineSnapshot([snapshot('c4')], 'c3', ancestry('c3'), 'c5')).toEqual({
      kind: 'none',
    })
    expect(baselineSnapshot([snapshot('c4')], 'c4', ancestry('c4'), 'c4')).toEqual({
      kind: 'none',
    })
  })
})
