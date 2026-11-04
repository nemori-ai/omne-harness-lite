// Journal 测量设施的快层测试：WAL 读取器对真实 SQLite 的 WAL 文件；增长判据对合成曲线和现状实测曲线（负控）；
// `scripts/check-journal-facts.mjs` 对构造的违规库判红。世界里的测量与增长用例在 `journal-bytes.spec.ts`（慢层）。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BOUNDED_PUBLICATION,
  judgeBoundedPublication,
  judgeLinearOwnBytes,
  LINEAR_OWN_BYTES,
  ownToEntryRatio,
  participantOfTable,
  readWalDelta,
  stepTable,
  summarizeSteps,
  tableOfBtree,
  type CommitReading,
  type StepSummary,
} from './fixtures/journal-measure.ts'

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url))
const script = join(repoRoot, 'scripts', 'check-journal-facts.mjs')
const scratch: string[] = []
afterEach(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})
const tempDir = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'journal-bytes-spec-')))
  scratch.push(dir)
  return dir
}

// --- 1a. WAL 读取器 ----------------------------------------------------------------------------

describe('the WAL reader', () => {
  it('counts the pages and the commit frames each transaction adds, on a real WAL file', () => {
    const dir = tempDir()
    const file = join(dir, 'w.sqlite')
    const db = new DatabaseSync(file)
    try {
      db.exec('pragma journal_mode = wal; pragma synchronous = full; pragma wal_autocheckpoint = 0')
      db.exec('create table t (id integer primary key, v text not null)')
      let cursor = readWalDelta(`${file}-wal`, null).cursor
      db.exec('begin')
      db.exec("insert into t (v) values ('a'), ('b')")
      db.exec('commit')
      const one = readWalDelta(`${file}-wal`, cursor)
      cursor = one.cursor
      expect(one.delta.pageSize).toBe(4096)
      expect(one.delta.frames.filter(frame => frame.commit)).toHaveLength(1)
      expect(one.delta.frames.length).toBeGreaterThanOrEqual(1)
      // 两次事务提交，两个提交帧；没有新写入时没有新帧。
      db.exec("insert into t (v) values ('c')")
      db.exec("insert into t (v) values ('d')")
      const two = readWalDelta(`${file}-wal`, cursor)
      expect(two.delta.frames.filter(frame => frame.commit)).toHaveLength(2)
      expect(readWalDelta(`${file}-wal`, two.cursor).delta.frames).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('reports a reset when a checkpoint restarts the WAL, and then counts from the first frame', () => {
    const dir = tempDir()
    const file = join(dir, 'w.sqlite')
    const db = new DatabaseSync(file)
    try {
      db.exec('pragma journal_mode = wal; pragma wal_autocheckpoint = 0')
      db.exec('create table t (id integer primary key, v text not null)')
      db.exec("insert into t (v) values ('a')")
      const before = readWalDelta(`${file}-wal`, null)
      db.exec('pragma wal_checkpoint(truncate)')
      db.exec("insert into t (v) values ('b')")
      const after = readWalDelta(`${file}-wal`, before.cursor)
      expect(after.delta.reset).toBe(true)
      expect(after.delta.frames.filter(frame => frame.commit)).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('answers no frames for a file that does not exist', () => {
    expect(readWalDelta(join(tempDir(), 'none-wal'), null).delta.frames).toEqual([])
  })

  it('maps an index btree to its table and a table to its participant', () => {
    expect(tableOfBtree('sqlite_autoindex_er_operation_1')).toBe('er_operation')
    expect(tableOfBtree('sl_state')).toBe('sl_state')
    expect(participantOfTable('er_state_part')).toBe('execution-record')
    expect(participantOfTable('sl_kind_idx')).toBe('session')
    expect(participantOfTable('_sql_receipt')).toBe('other')
  })
})

// --- 1b. 增长判据 ------------------------------------------------------------------------------

const reading = (step: number, journalBytes: number, entryBytes = 0): CommitReading => ({
  seq: 1,
  step,
  outcome: 'committed',
  commands: [
    { participant: 'execution-record', bytes: journalBytes },
    { participant: 'session', bytes: 100 },
  ],
  requestBytes: journalBytes + 100,
  pages: 3,
  fsyncs: 1,
  walReset: false,
  file: 'x',
  pageNumbers: [],
  entryRows: 1,
  entryBytes,
  stateBytes: 500,
  tablePages: {},
})

/** 每步一次发布，字节由 `bytesOf(step)` 给。 */
const series = (steps: number, bytesOf: (step: number) => number): StepSummary[] =>
  summarizeSteps(
    Array.from({ length: steps }, (_, index) => reading(index + 1, bytesOf(index + 1))),
  )

/**
 * 现状（WIRE 4d5a7e0bc 的存储）在 release 的 command 上限下的实测：第 1 到第 5 步每步最大一次发布的字节数，
 * 小消息档。第 6 步被存储拒绝（`command_limit`），运行停止。见 `docs/engineering/perf-baseline.md`。
 */
const BASELINE_MAX_PUBLICATION = [231_217, 405_558, 579_926, 754_600, 929_352] as const

describe('the growth judgements', () => {
  it('accepts a flat series and a series that stays within the 2 KiB slack', () => {
    expect(judgeBoundedPublication(series(20, () => 8_000)).ok).toBe(true)
    expect(judgeBoundedPublication(series(20, step => 8_000 + (step > 5 ? 2_048 : 0))).ok).toBe(
      true,
    )
  })

  it('negative control: refuses a series that grows 1 KiB per step', () => {
    const judged = judgeBoundedPublication(series(20, step => 8_000 + step * 1_024))
    expect(judged.ok).toBe(false)
    expect(judged.late).toBe(8_000 + 20 * 1_024)
  })

  it('negative control: refuses the measured curve of the present store (steps 1 to 5)', () => {
    const measured = series(5, step => BASELINE_MAX_PUBLICATION[step - 1]!)
    const judged = judgeBoundedPublication(measured, { from: 1, to: 5, slackBytes: 2_048 })
    expect(judged.ok).toBe(false)
    expect(judged.late! - judged.early!).toBeGreaterThan(600_000)
  })

  it('refuses a run that did not reach step 20: a missing reading is not a pass', () => {
    expect(judgeBoundedPublication(series(5, () => 8_000)).ok).toBe(false)
  })

  it('accepts cumulative own bytes within J0 + W × steps and refuses a run above it', () => {
    const w = LINEAR_OWN_BYTES.wBytesPerStep
    expect(
      judgeLinearOwnBytes(
        series(200, () => w - 1_000),
        200,
      ).ok,
    ).toBe(true)
    const over = judgeLinearOwnBytes(
      series(200, () => w + 1_000),
      200,
    )
    expect(over.ok).toBe(false)
    expect(over.total).toBeGreaterThan(over.limit)
  })

  it('negative control: refuses a series whose publication grows with the step number, though its first steps are small', () => {
    expect(
      judgeLinearOwnBytes(
        series(200, step => 1_000 * step),
        200,
      ).ok,
    ).toBe(false)
  })

  it('negative control: the present store, which stopped at step 6, does not pass the linear bound', () => {
    expect(
      judgeLinearOwnBytes(
        series(5, step => BASELINE_MAX_PUBLICATION[step - 1]!),
        200,
      ).ok,
    ).toBe(false)
  })

  it('reports the ratio of Journal bytes to sl_entry bytes, and null without entries', () => {
    expect(ownToEntryRatio([reading(1, 3_000, 1_000), reading(2, 3_000, 2_000)])).toBe(3)
    expect(ownToEntryRatio([reading(1, 3_000, 0)])).toBeNull()
  })

  it('summarizes per step: commits, publications, own bytes, the largest publication', () => {
    const [one] = summarizeSteps([reading(1, 400), reading(1, 900), reading(1, 50)])
    expect(one).toMatchObject({
      step: 1,
      commits: 3,
      rejected: 0,
      publications: 3,
      ownBytes: 1_350,
      maxPublicationBytes: 900,
      sessionBytes: 300,
      stateBytes: 1_500,
      stateRowBytes: 500,
      pages: 9,
      fsyncs: 3,
    })
    expect(stepTable([one!])).toContain('| 1 | 3 | 0 | 3 |')
  })

  it('leaves a rejected commit out of the bytes and pages, and counts it apart', () => {
    const refused = {
      ...reading(2, 900_000),
      outcome: 'rejected_before_accept',
      pages: 0,
      fsyncs: 0,
    }
    const [step] = summarizeSteps([reading(2, 400), refused])
    expect(step).toMatchObject({
      commits: 2,
      rejected: 1,
      rejectedOwnBytes: 900_000,
      ownBytes: 400,
      maxPublicationBytes: 400,
    })
  })

  it('names the bound the guard uses', () => {
    expect(BOUNDED_PUBLICATION).toEqual({ from: 5, to: 20, slackBytes: 2_048 })
  })
})

// --- 1c. check-journal-facts 的负控 ------------------------------------------------------------

function factsDatabase(rows: readonly (readonly [number, number, string, string])[]): string {
  const file = join(tempDir(), 'world.sqlite')
  const db = new DatabaseSync(file)
  db.exec(
    'create table er_fact (tenant text not null, session text not null, pub integer not null, ord integer not null, execution text not null, kind text not null, body text not null, primary key (tenant, session, pub, ord))',
  )
  const insert = db.prepare(
    "insert into er_fact (tenant, session, pub, ord, execution, kind, body) values ('t', 's', ?, ?, 'x', ?, ?)",
  )
  for (const [pub, ord, kind, body] of rows) insert.run(pub, ord, kind, body)
  db.close()
  return file
}

const runCheck = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

describe('scripts/check-journal-facts.mjs', () => {
  const clean = '{"digest":"d1","ref":{"owner":"model","record":"r","revision":"1"},"count":3}'

  it('passes a database whose fact bodies hold references and small values only', () => {
    const run = runCheck(factsDatabase([[1, 0, 'call.intended', clean]]))
    expect(run.status, run.stdout).toBe(0)
    expect(run.stdout).toContain('ok')
  })

  it.each(['role', 'content', 'messages', 'system'])(
    'negative control: one row with the key %s turns it red, at any depth',
    key => {
      const body = `{"digest":"d","nested":[{"${key}":"user"}]}`
      const run = runCheck(
        factsDatabase([
          [1, 0, 'call.intended', clean],
          [2, 1, 'reply.judged', body],
        ]),
      )
      expect(run.status, run.stdout).toBe(1)
      expect(run.stdout).toContain('RED')
      expect(run.stdout).toContain(
        `pub=2 ord=1 kind=reply.judged: content key at $.nested[0].${key}`,
      )
    },
  )

  it('negative control: a body that is not JSON is not clean', () => {
    const run = runCheck(factsDatabase([[1, 0, 'call.intended', 'not json']]))
    expect(run.status, run.stdout).toBe(1)
    expect(run.stdout).toContain('body is not JSON')
  })

  it('does not take a longer key such as contentDigest for a content key', () => {
    const run = runCheck(factsDatabase([[1, 0, 'k', '{"contentDigest":"d","roleName":"r"}']]))
    expect(run.status, run.stdout).toBe(0)
  })

  it('skips, and says why, when the database has no er_fact table', () => {
    const file = join(tempDir(), 'old.sqlite')
    const db = new DatabaseSync(file)
    db.exec('create table er_state_part (name text)')
    db.close()
    const run = runCheck(file)
    expect(run.status, run.stdout).toBe(0)
    expect(run.stdout).toContain('skipped')
    expect(run.stdout).toContain('no er_fact table')
  })

  it('skips, and says why, when the directory holds no world database', () => {
    const run = runCheck(tempDir())
    expect(run.status, run.stdout).toBe(0)
    expect(run.stdout).toContain('skipped, no world database')
  })

  it('fails with 2 when a named path does not exist', () => {
    expect(runCheck(join(tempDir(), 'missing.sqlite')).status).toBe(2)
  })
})
