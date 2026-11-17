import { describe, expect, it } from 'vitest'
import {
  UNKNOWN_FIRST,
  batchArgs,
  batchLabel,
  batchQueue,
  memberBatches,
  type Batch,
} from '../src/testing/batches.ts'
import { mergeBatchRuns } from '../src/testing/run.ts'

const at = (file: string, seconds: number) => ({ file, seconds })

const runFiles = (batches: readonly Batch[]) =>
  batches.flatMap(batch => (batch.kind === 'files' ? batch.files : []))

describe('一个成员的一层切成几批', () => {
  it('没有读数的成员整个跑，排在最前', () => {
    expect(memberBatches('apps/new', [], 90)).toEqual([
      { member: 'apps/new', kind: 'whole', seconds: UNKNOWN_FIRST },
    ])
  })

  it('运行时的文件合计不超过一批，或只有一份：整个跑，不切', () => {
    expect(memberBatches('a', [at('tests/x.spec.ts', 40), at('tests/y.spec.ts', 30)], 90)).toEqual([
      { member: 'a', kind: 'whole', seconds: 70 },
    ])
    expect(memberBatches('a', [at('tests/x.spec.ts', 400)], 90)).toEqual([
      { member: 'a', kind: 'whole', seconds: 400 },
    ])
  })

  it('切开时按耗时从长到短装箱，每批不超过目标时长；比目标还长的文件自己一批', () => {
    const known = [
      at('tests/m.spec.ts', 400),
      at('tests/a.spec.ts', 60),
      at('tests/b.spec.ts', 50),
      at('tests/c.spec.ts', 40),
      at('tests/d.spec.ts', 30),
    ]
    const batches = memberBatches('apps/server', known, 90)
    const files = batches.filter(batch => batch.kind === 'files')
    expect(files.map(batch => [batch.files, batch.seconds])).toEqual([
      [['tests/m.spec.ts'], 400],
      [['tests/a.spec.ts', 'tests/d.spec.ts'], 90],
      [['tests/b.spec.ts', 'tests/c.spec.ts'], 90],
    ])
  })

  it('每份运行时的文件恰好落在一批里；剩下那一批排除全部列出的文件，新文件与类型检查都归它', () => {
    const known = [
      at('tests/a.spec.ts', 80),
      at('tests/b.spec.ts', 70),
      at('tests/c.spec.ts', 60),
      at('tests/d.spec.ts', 20),
      at('tests/types.spec-d.ts', 15),
    ]
    const batches = memberBatches('m', known, 90)
    const listed = runFiles(batches)
    expect([...listed].sort()).toEqual([
      'tests/a.spec.ts',
      'tests/b.spec.ts',
      'tests/c.spec.ts',
      'tests/d.spec.ts',
    ])
    expect(new Set(listed).size).toBe(listed.length)
    expect(batches.at(-1)).toEqual({
      member: 'm',
      kind: 'rest',
      exclude: ['tests/a.spec.ts', 'tests/b.spec.ts', 'tests/c.spec.ts', 'tests/d.spec.ts'],
      seconds: 15,
    })
    for (const batch of batches)
      if (batch.kind === 'files') expect(batch.seconds).toBeLessThanOrEqual(90)
  })

  it('一个文件名是另一个的一部分（会被同一个过滤词选中）时放进同一批', () => {
    const known = [at('tests/a.spec.ts', 80), at('tests/a.spec.tsx', 80), at('tests/b.spec.ts', 80)]
    const batches = memberBatches('ui', known, 90)
    const together = batches.find(
      batch => batch.kind === 'files' && batch.files.includes('tests/a.spec.ts'),
    )
    expect(together?.kind === 'files' ? together.files : []).toContain('tests/a.spec.tsx')
  })
})

describe('所有成员的批排成一个队列', () => {
  it('按预计时长从长到短，等长的保持成员次序', () => {
    const known: Record<string, ReturnType<typeof at>[]> = {
      small: [at('tests/s.spec.ts', 10)],
      big: [at('tests/x.spec.ts', 200), at('tests/y.spec.ts', 150)],
      same: [at('tests/t.spec.ts', 10)],
    }
    const queue = batchQueue(['small', 'big', 'same', 'fresh'], member => known[member] ?? [], 90)
    expect(queue.map(batchLabel)).toEqual(['fresh', 'big#1', 'big#2', 'small', 'same', 'big#rest'])
  })
})

describe('一个成员各批的结果并成一份', () => {
  const result = (name: string, status: string) => ({
    name,
    status,
    startTime: 0,
    endTime: 1000,
    assertionResults: [],
  })
  const one: Batch = {
    member: 'm',
    kind: 'files',
    index: 1,
    files: ['tests/a.spec.ts'],
    seconds: 1,
  }
  const rest: Batch = { member: 'm', kind: 'rest', exclude: ['tests/a.spec.ts'], seconds: 0 }

  it('报告首尾相接，计时报告相接，墙钟与 CPU 秒相加；同一份文件出现两次时留失败的那份', () => {
    const merged = mergeBatchRuns('m', [
      {
        batch: one,
        run: {
          member: 'm',
          exitCode: 0,
          wallSeconds: 30,
          cpuSeconds: 20,
          report: { testResults: [result('/r/m/tests/a.spec.ts', 'passed')] },
          timing: { files: [{ file: 'a', collectSeconds: 1, tests: [] }] },
        },
      },
      {
        batch: rest,
        run: {
          member: 'm',
          exitCode: 1,
          wallSeconds: 10,
          cpuSeconds: 5,
          report: {
            testResults: [
              result('/r/m/tests/new.spec.ts', 'passed'),
              result('/r/m/tests/a.spec.ts', 'failed'),
            ],
          },
          timing: { files: [{ file: 'new', collectSeconds: 1, tests: [] }] },
        },
      },
    ])
    expect(merged.exitCode).toBe(1)
    expect(merged.wallSeconds).toBe(40)
    expect(merged.cpuSeconds).toBe(25)
    expect(merged.report?.testResults.map(item => [item.name, item.status])).toEqual([
      ['/r/m/tests/a.spec.ts', 'failed'],
      ['/r/m/tests/new.spec.ts', 'passed'],
    ])
    expect(merged.timing?.files.map(file => file.file)).toEqual(['a', 'new'])
  })

  it('有一批没量到 CPU 就不报 CPU；没有报告的空批不让整份没有报告；各批的问题带上批名', () => {
    const merged = mergeBatchRuns('m', [
      {
        batch: one,
        run: {
          member: 'm',
          exitCode: 0,
          wallSeconds: 5,
          report: { testResults: [result('/r/m/tests/a.spec.ts', 'passed')] },
        },
      },
      {
        batch: rest,
        run: { member: 'm', exitCode: 1, wallSeconds: 1, cpuSeconds: 1, problem: '坏了' },
      },
    ])
    expect(merged.cpuSeconds).toBeUndefined()
    expect(merged.report?.testResults).toHaveLength(1)
    expect(merged.problem).toBe('m#rest：坏了')
  })
})

describe('一批交给 vitest 的参数', () => {
  it('整个跑不带参数；列了文件的批给出文件；剩下的那批逐个排除', () => {
    expect(batchArgs({ member: 'a', kind: 'whole', seconds: 1 })).toEqual([])
    expect(
      batchArgs({ member: 'a', kind: 'files', index: 1, files: ['tests/x.spec.ts'], seconds: 1 }),
    ).toEqual(['tests/x.spec.ts'])
    expect(
      batchArgs({
        member: 'a',
        kind: 'rest',
        exclude: ['tests/x.spec.ts', 'tests/y.spec.ts'],
        seconds: 0,
      }),
    ).toEqual(['--exclude', 'tests/x.spec.ts', '--exclude', 'tests/y.spec.ts'])
  })
})
