/**
 * @module-tag slow
 * 归慢层：每条用例真起一次 turbo，跑一个小 workspace 里几个成员的测试任务。
 */
// 成员测试交给 turbo：退出码与耗时取自运行摘要，输出按成员拆开，报告里有嵌套归档目录的文件就判失败。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import { archivedReportFiles, runTurboTests } from '../src/testing/run.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

// 成员的测试脚本：打一行输出，按第一个参数往报告目录写一份 vitest 形状的报告，再按第二个参数退出。
const FAKE_VITEST = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const [slug, file, code] = process.argv.slice(2)
console.log('ran ' + slug)
const name = join(process.cwd(), file)
writeFileSync(
  join(process.env.OMNE_TEST_REPORT_DIR, slug + '.json'),
  JSON.stringify({ testResults: [{ name, status: 'passed', startTime: 0, endTime: 1, assertionResults: [] }] }),
)
process.exit(Number(code))
`

/** 一个 workspace：每个成员的 `test:fast` 调上面的脚本，写哪个文件、退出码几由参数定。 */
function workspace(members: Readonly<Record<string, { file: string; code: number }>>): {
  root: string
  targets: TestMember[]
} {
  const root = mkdtempSync(join(tmpdir(), 'omne-turbo-tests-'))
  roots.push(root)
  put(
    root,
    'package.json',
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  put(root, 'pnpm-workspace.yaml', 'packages:\n  - members/*\n')
  put(root, 'fake-vitest.mjs', FAKE_VITEST)
  const targets = Object.entries(members).map(([name, { file, code }]) => {
    const path = `members/${name}`
    const script = `node ../../fake-vitest.mjs members__${name} ${file} ${code}`
    put(
      root,
      `${path}/package.json`,
      JSON.stringify({ name: `@fixture/${name}`, scripts: { 'test:fast': script } }),
    )
    return { path, name: `@fixture/${name}`, script, dependencies: [] }
  })
  return { root, targets }
}

describe('用 turbo 跑成员测试', { timeout: 60_000 }, () => {
  it('各成员的退出码与日志分开；一个失败不拦其余的，摘要挪进运行目录', async () => {
    const { root, targets } = workspace({
      good: { file: 'tests/a.spec.ts', code: 0 },
      bad: { file: 'tests/b.spec.ts', code: 3 },
    })
    const runDir = join(root, 'run')
    mkdirSync(runDir)
    const done: string[] = []
    const runs = await runTurboTests(
      root,
      targets,
      runDir,
      { memberConcurrency: 2, vitestMaxWorkers: 1 },
      'fast',
      run => done.push(run.member),
    )
    const turboLog = readFileSync(join(runDir, 'turbo.log'), 'utf8')
    expect(
      runs.map(run => [run.member, run.exitCode]),
      turboLog,
    ).toEqual([
      ['members/good', 0],
      ['members/bad', 3],
    ])
    expect(done).toEqual(['members/good', 'members/bad'])
    expect(runs[0]?.report?.testResults[0]?.name).toBe(join(root, 'members/good/tests/a.spec.ts'))
    expect(runs.every(run => run.wallSeconds >= 0 && run.problem === undefined)).toBe(true)
    const goodLog = readFileSync(join(runDir, 'members__good.log'), 'utf8')
    expect(goodLog).toContain('ran members__good')
    expect(goodLog).not.toContain('members__bad')
    expect(readFileSync(join(runDir, 'members__bad.log'), 'utf8')).toContain('ran members__bad')
    expect(existsSync(join(runDir, 'turbo-summary.json'))).toBe(true)
    expect(
      existsSync(join(root, '.turbo/runs')) ? readdirSync(join(root, '.turbo/runs')) : [],
    ).toEqual([])
  })

  it('报告里有嵌套归档目录的文件：退出码 0 也判失败，并说明是哪些文件', async () => {
    const { root, targets } = workspace({ old: { file: 'src/archive.legacy/x.spec.ts', code: 0 } })
    const runDir = join(root, 'run')
    mkdirSync(runDir)
    const [run] = await runTurboTests(
      root,
      targets,
      runDir,
      { memberConcurrency: 1, vitestMaxWorkers: 1 },
      'fast',
      () => {},
    )
    expect(run?.exitCode).toBe(1)
    expect(run?.problem).toContain('src/archive.legacy/x.spec.ts')
    expect(readFileSync(join(runDir, 'members__old.log'), 'utf8')).toContain('嵌套归档目录')
  })
})

describe('成员目录下的 turbo.json', () => {
  it('不经计划的运行也拒绝它：它能给测试任务开缓存，回放上一次的结果', async () => {
    const { root, targets } = workspace({ cached: { file: 'tests/a.spec.ts', code: 0 } })
    put(
      root,
      'members/cached/turbo.json',
      '{ "extends": ["//"], "tasks": { "test:fast": { "cache": true } } }\n',
    )
    await expect(
      runTurboTests(
        root,
        targets,
        join(root, 'run'),
        { memberConcurrency: 1, vitestMaxWorkers: 1 },
        'fast',
        () => {},
      ),
    ).rejects.toThrow('members/cached/turbo.json')
  })
})

describe('报告里的归档文件', () => {
  const report = (...names: string[]) => ({
    testResults: names.map(name => ({
      name,
      status: 'passed',
      startTime: 0,
      endTime: 0,
      assertionResults: [],
    })),
  })

  it('只认名字以 .legacy 结尾的目录，成员目录外的也算', () => {
    expect(
      archivedReportFiles(
        '/repo/m',
        report(
          '/repo/m/tests/a.spec.ts',
          '/repo/m/x.legacy/b.spec.ts',
          '/repo/shared.legacy/c.spec.ts',
          '/repo/m/old.legacy-not/d.spec.ts',
        ),
      ),
    ).toEqual(['x.legacy/b.spec.ts', '../shared.legacy/c.spec.ts'])
    expect(archivedReportFiles('/repo/m', undefined)).toEqual([])
  })
})
