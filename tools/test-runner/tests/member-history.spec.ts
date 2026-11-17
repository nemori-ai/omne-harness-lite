import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { longestFirst, memberHistory } from '../src/testing/member-history.ts'
import { READING_VERSION } from '../src/testing/parallelism.ts'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

type Row = { member: string; wallSeconds: number; files: number; exitCode: number }

function home(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'member-history-')))
  homes.push(dir)
  return dir
}

function write(root: string, run: string, age: number, body: unknown): void {
  const dir = join(root, 'abc123def', run)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'ledger.json')
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body))
  const at = new Date(Date.now() - age * 1000)
  utimesSync(path, at, at)
}

function ledger(root: string, run: string, age: number, members: Row[] | string): void {
  write(root, run, age, typeof members === 'string' ? members : { members })
}

describe('成员上一次的读数', () => {
  it('取这一层最近一份有报告的运行里的用时与文件数，失败的运行也算；别的层不算', () => {
    const root = home()
    ledger(root, '20261116-100000-fast', 300, [
      { member: 'packages/a', wallSeconds: 40, files: 9, exitCode: 0 },
      { member: 'packages/b', wallSeconds: 5, files: 2, exitCode: 0 },
    ])
    ledger(root, '20261116-110000-fast', 100, [
      { member: 'packages/a', wallSeconds: 55, files: 11, exitCode: 0 },
      { member: 'packages/b', wallSeconds: 99, files: 3, exitCode: 1 },
    ])
    ledger(root, '20261116-120000-slow', 10, [
      { member: 'packages/a', wallSeconds: 900, files: 1, exitCode: 0 },
    ])
    ledger(root, '20261116-130000', 5, [
      { member: 'packages/a', wallSeconds: 7, files: 1, exitCode: 0 },
    ])
    expect(Object.fromEntries(memberHistory(root, 'fast'))).toEqual({
      'packages/a': { seconds: 55, files: 11, fileTimes: [], weights: [] },
      'packages/b': { seconds: 99, files: 3, fileTimes: [], weights: [] },
    })
    expect(Object.fromEntries(memberHistory(root, 'slow'))).toEqual({
      'packages/a': { seconds: 900, files: 1, fileTimes: [], weights: [] },
    })
    expect(Object.fromEntries(memberHistory(root, 'all'))).toEqual({
      'packages/a': { seconds: 7, files: 1, fileTimes: [], weights: [] },
    })
  })

  it('读不出的账本、没有账本的运行目录、不认得的目录名都跳过；账本目录不在时是空表', () => {
    const root = home()
    ledger(root, '20261116-100000-fast', 50, '{ not json')
    ledger(root, 'scratch', 40, [{ member: 'packages/x', wallSeconds: 1, files: 1, exitCode: 0 }])
    for (const name of ['old-20261116-100000-fast', '20261116-100000-fast-copy'])
      ledger(root, name, 30, [{ member: 'packages/x', wallSeconds: 1, files: 1, exitCode: 0 }])
    mkdirSync(join(root, 'abc123def', '20261116-110000-fast'), { recursive: true })
    ledger(root, '20261116-090000-fast', 500, [
      { member: 'packages/a', wallSeconds: 3, files: 1, exitCode: 0 },
    ])
    expect(Object.fromEntries(memberHistory(root, 'fast'))).toEqual({
      'packages/a': { seconds: 3, files: 1, fileTimes: [], weights: [] },
    })
    expect(memberHistory(join(root, 'missing'), 'fast').size).toBe(0)
  })

  it('启动开销：取最近一份有读数的账本里这个成员各批的平均；没有读数时不带这一项', () => {
    const root = home()
    const jobsOf = (run: string, age: number, jobs: unknown[]) =>
      write(root, run, age, {
        members: [{ member: 'apps/s', wallSeconds: 10, files: 2, exitCode: 0 }],
        meta: { tokens: { jobs } },
      })
    jobsOf('20261116-100000-slow', 300, [{ member: 'apps/s', startupSeconds: 20 }])
    jobsOf('20261116-110000-slow', 200, [
      { member: 'apps/s', startupSeconds: 6 },
      { member: 'apps/s', startupSeconds: 9 },
      { member: 'apps/other', startupSeconds: 99 },
    ])
    jobsOf('20261116-120000-slow', 100, [{ member: 'apps/s' }])
    expect(memberHistory(root, 'slow').get('apps/s')?.startupSeconds).toBe(7.5)
    jobsOf('20261116-130000-fast', 50, [{ member: 'apps/s' }])
    expect(memberHistory(root, 'fast').get('apps/s')).not.toHaveProperty('startupSeconds')
  })

  it('实测读数：一份账本里这个成员各件活（各批）的 CPU 秒与进程秒（墙钟 × 进程数）相加，新的在前，失败的运行也算；没量到 CPU 的、读数版本旧的不算', () => {
    const root = home()
    const row = (member: string, exitCode = 0) => ({
      member,
      wallSeconds: 10,
      files: 2,
      exitCode,
      fileSeconds: 9,
    })
    const job = (member: string, cpuSeconds: number, seconds: number, workers: number) => ({
      member,
      cpuSeconds,
      workers,
      start: 0,
      end: seconds,
      readingVersion: READING_VERSION,
    })
    write(root, '20261116-100000-fast', 300, {
      members: [row('packages/a'), row('packages/b')],
      meta: { tokens: { jobs: [job('packages/a', 70, 50, 2), job('packages/b', 20, 40, 1)] } },
    })
    write(root, '20261116-110000-fast', 200, {
      members: [row('packages/a'), row('packages/b', 1)],
      meta: {
        tokens: {
          jobs: [
            job('packages/a', 60, 30, 2),
            job('packages/a', 30, 20, 1),
            job('packages/b', 90, 40, 1),
          ],
        },
      },
    })
    write(root, '20261116-120000-fast', 100, {
      members: [row('packages/a')],
      meta: {
        tokens: { jobs: [{ member: 'packages/a', cpuSeconds: 5, workers: 1, start: 0, end: 9 }] },
      },
    })
    write(root, '20261116-130000-fast', 50, {
      members: [row('packages/a')],
      meta: {
        tokens: {
          jobs: [
            { member: 'packages/a', workers: 1, start: 0, end: 9, readingVersion: READING_VERSION },
          ],
        },
      },
    })
    write(root, '20261116-140000-fast', 40, {
      members: [row('packages/c')],
      meta: {
        tokens: {
          jobs: [
            {
              member: 'packages/c',
              cpuSeconds: 50,
              workers: 2,
              start: 100,
              end: 140,
              readingVersion: READING_VERSION,
            },
          ],
        },
      },
    })
    const history = memberHistory(root, 'fast')
    expect(history.get('packages/c')?.weights, '墙钟是起止之差').toEqual([
      { cpuSeconds: 50, processSeconds: 80 },
    ])
    expect(history.get('packages/a')?.weights).toEqual([
      { cpuSeconds: 90, processSeconds: 80 },
      { cpuSeconds: 70, processSeconds: 100 },
    ])
    expect(history.get('packages/b')?.weights).toEqual([
      { cpuSeconds: 90, processSeconds: 40 },
      { cpuSeconds: 20, processSeconds: 40 },
    ])
  })

  it('各文件的耗时取自这个成员最近一份有报告的账本，路径改成相对成员目录；别的成员的文件不混进来', () => {
    const root = home()
    const dir = join(root, 'abc123def', '20261116-100000-slow')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'ledger.json'),
      JSON.stringify({
        members: [
          { member: 'apps/server', wallSeconds: 10, files: 2, exitCode: 0, fileSeconds: 9 },
        ],
        files: [
          { member: 'apps/server', file: 'apps/server/tests/a.spec.ts', seconds: 400 },
          { member: 'apps/server', file: 'apps/server/tests/b.spec.ts', seconds: 5 },
          { member: 'apps/other', file: 'apps/other/tests/c.spec.ts', seconds: 7 },
        ],
      }),
    )
    expect(memberHistory(root, 'slow').get('apps/server')?.fileTimes).toEqual([
      { file: 'tests/a.spec.ts', seconds: 400 },
      { file: 'tests/b.spec.ts', seconds: 5 },
    ])
  })

  it('没有报告的运行（退出非 0、零个文件）不给用时、文件数与文件耗时，只给权重与启动读数；只有这种运行的成员不出现；失败但有报告的运行照给，失败的文件也算；退出 0、零个文件的成员照算；账本的 meta 里没有令牌一节也照读', () => {
    const root = home()
    const server = 'apps/server'
    write(root, '20261116-100000-slow', 300, {
      members: [{ member: server, wallSeconds: 10, files: 2, exitCode: 0 }],
      files: [
        { member: server, file: `${server}/tests/a.spec.ts`, seconds: 180 },
        { member: server, file: `${server}/tests/b.spec.ts`, seconds: 5 },
      ],
    })
    write(root, '20261116-110000-slow', 200, {
      members: [{ member: server, wallSeconds: 40, files: 2, exitCode: 1 }],
      files: [
        { member: server, file: `${server}/tests/a.spec.ts`, seconds: 320 },
        { member: server, file: `${server}/tests/b.spec.ts`, seconds: 6 },
      ],
      failures: [{ member: server, file: `${server}/tests/a.spec.ts`, test: 'W3-A', message: 'x' }],
    })
    write(root, '20261116-120000-slow', 100, {
      members: [
        { member: server, wallSeconds: 3, files: 0, exitCode: 1 },
        { member: 'packages/empty', wallSeconds: 2, files: 0, exitCode: 0 },
      ],
      failures: [{ member: server, message: '退出码 1，没有产出报告' }],
      meta: {
        tokens: {
          jobs: [
            {
              member: server,
              cpuSeconds: 6,
              workers: 1,
              start: 0,
              end: 3,
              readingVersion: READING_VERSION,
              startupSeconds: 25,
            },
          ],
        },
      },
    })
    write(root, '20261116-130000-slow', 50, {
      members: [{ member: 'packages/crashed', wallSeconds: 1, files: 0, exitCode: 1 }],
      meta: {},
    })
    expect(Object.fromEntries(memberHistory(root, 'slow'))).toEqual({
      [server]: {
        seconds: 40,
        files: 2,
        fileTimes: [
          { file: 'tests/a.spec.ts', seconds: 320 },
          { file: 'tests/b.spec.ts', seconds: 6 },
        ],
        weights: [{ cpuSeconds: 6, processSeconds: 3 }],
        startupSeconds: 25,
      },
      'packages/empty': { seconds: 2, files: 0, fileTimes: [], weights: [] },
    })
  })

  it('只翻最近的二十份账本', () => {
    const root = home()
    ledger(root, '20261101-000000-fast', 10_000, [
      { member: 'packages/old', wallSeconds: 1, files: 1, exitCode: 0 },
    ])
    for (let index = 0; index < 20; index += 1)
      ledger(root, `202611${String(index + 2).padStart(2, '0')}-000000-fast`, 100 - index, [
        { member: 'packages/new', wallSeconds: index, files: 1, exitCode: 0 },
      ])
    expect([...memberHistory(root, 'fast').keys()]).toEqual(['packages/new'])
  })

  it('排队次序：上一次用时长的在前，没有读数的排最前，同样长的保持原次序', () => {
    const history = new Map([
      ['packages/short', { seconds: 2, files: 1, fileTimes: [], weights: [] }],
      ['packages/long', { seconds: 90, files: 1, fileTimes: [], weights: [] }],
      ['packages/same', { seconds: 2, files: 1, fileTimes: [], weights: [] }],
    ])
    const members = ['packages/short', 'packages/same', 'packages/new', 'packages/long'].map(
      path => ({ path }),
    )
    expect(longestFirst(members, history).map(member => member.path)).toEqual([
      'packages/new',
      'packages/long',
      'packages/short',
      'packages/same',
    ])
  })
})
