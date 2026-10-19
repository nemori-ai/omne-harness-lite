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
import { rawProblems, resolvedProblems } from '../src/testing/member-turbo.ts'

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

interface FixtureMember {
  /** 报告里写的测试文件（相对成员目录）。 */
  readonly file: string
  readonly code: number
  /** 成员所在的目录，缺省 `members`。 */
  readonly dir?: 'members' | 'apps' | 'packages'
  /** 有 `build` 脚本时它的退出码。 */
  readonly build?: number
}

/** 一个 workspace：每个成员的 `test:fast` 调上面的脚本，写哪个文件、退出码几由参数定。 */
function workspace(members: Readonly<Record<string, FixtureMember>>): {
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
  put(root, 'pnpm-workspace.yaml', 'packages:\n  - members/*\n  - apps/*\n  - packages/*\n')
  put(root, 'fake-vitest.mjs', FAKE_VITEST)
  const targets = Object.entries(members).map(([name, member]) => {
    const path = `${member.dir ?? 'members'}/${name}`
    const script = `node ../../fake-vitest.mjs ${path.replace('/', '__')} ${member.file} ${member.code}`
    const scripts: Record<string, string> = { 'test:fast': script }
    if (member.build !== undefined)
      scripts['build'] = `node -e "console.log('built ${name}'); process.exit(${member.build})"`
    put(root, `${path}/package.json`, JSON.stringify({ name: `@fixture/${name}`, scripts }))
    return { path, name: `@fixture/${name}`, script, dependencies: [] }
  })
  return { root, targets }
}

const ONCE = { memberConcurrency: 1, vitestMaxWorkers: 1 }
const NO_BUILD = { build: false, admission: false }

async function run(
  root: string,
  targets: readonly TestMember[],
  build: { build: boolean; admission: boolean } = NO_BUILD,
) {
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  return { runDir, runs: await runTurboTests(root, targets, runDir, ONCE, 'fast', build, () => {}) }
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
      { build: false, admission: false },
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
    expect(runs.every(run => run.wallSeconds > 0 && run.problem === undefined)).toBe(true)
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
      { build: false, admission: false },
      () => {},
    )
    expect(run?.exitCode).toBe(1)
    expect(run?.problem).toContain('src/archive.legacy/x.spec.ts')
    expect(readFileSync(join(runDir, 'members__old.log'), 'utf8')).toContain('嵌套归档目录')
  })
})

describe('看不出跑了什么就判失败', { timeout: 60_000 }, () => {
  it('成员没有这一层的脚本：没有执行记录，记为 -1 并点名缺的脚本', async () => {
    const { root, targets } = workspace({ none: { file: 'tests/a.spec.ts', code: 0 } })
    put(root, 'members/none/package.json', JSON.stringify({ name: '@fixture/none', scripts: {} }))
    const { runs } = await run(root, targets)
    expect(runs[0]?.exitCode).toBe(-1)
    expect(runs[0]?.problem).toContain('没有 `test:fast` 脚本')
  })

  it('退出码 0 却没有写出报告：判失败', async () => {
    const { root, targets } = workspace({ silent: { file: 'tests/a.spec.ts', code: 0 } })
    put(
      root,
      'members/silent/package.json',
      JSON.stringify({ name: '@fixture/silent', scripts: { 'test:fast': 'node -e ""' } }),
    )
    const { runs } = await run(root, targets)
    expect(runs[0]?.exitCode).toBe(1)
    expect(runs[0]?.problem).toContain('没有写出报告 members__silent.json')
  })
})

describe('要构建时由 turbo 先构建', { timeout: 60_000 }, () => {
  it('不带 --only：构建与测试在同一次运行里；构建失败的成员不跑测试，并点名失败的构建', async () => {
    const { root, targets } = workspace({
      built: { file: 'tests/a.spec.ts', code: 0, build: 0 },
      broken: { file: 'tests/b.spec.ts', code: 0, build: 4 },
    })
    const { runDir, runs } = await run(root, targets, { build: true, admission: false })
    const turboLog = readFileSync(join(runDir, 'turbo.log'), 'utf8')
    expect(turboLog).toContain('built built')
    expect(runs[0]?.exitCode, turboLog).toBe(0)
    expect(runs[1]?.exitCode).toBe(-1)
    expect(runs[1]?.problem).toContain('构建失败（@fixture/broken）')
  })

  it('带 --only 时不构建', async () => {
    const { root, targets } = workspace({ built: { file: 'tests/a.spec.ts', code: 0, build: 4 } })
    const { runDir, runs } = await run(root, targets)
    expect(readFileSync(join(runDir, 'turbo.log'), 'utf8')).not.toContain('built built')
    expect(runs[0]?.exitCode).toBe(0)
  })
})

describe('成员目录下的 turbo.json', { timeout: 60_000 }, () => {
  it('apps/* 之外的拒绝：不经计划的运行也核对', async () => {
    const { root, targets } = workspace({
      cached: { file: 'tests/a.spec.ts', code: 0, dir: 'packages' },
    })
    put(root, 'packages/cached/turbo.json', '{ "extends": ["//"], "tasks": {} }\n')
    await expect(run(root, targets)).rejects.toThrow(
      'packages/cached/turbo.json：只有 apps/* 下的成员可以有 turbo.json',
    )
  })

  it('apps/* 的按合成后的定义核对：测试开缓存、去掉根的依赖被拒绝，只增不减的通过', async () => {
    const { root, targets } = workspace({ app: { file: 'tests/a.spec.ts', code: 0, dir: 'apps' } })
    put(
      root,
      'apps/app/turbo.json',
      JSON.stringify({
        extends: ['//'],
        tasks: {
          'test:fast': { cache: true, outputs: ['../shared/**'] },
          build: { dependsOn: [] },
        },
      }),
    )
    const rejected = run(root, targets)
    await expect(rejected).rejects.toThrow('规则 4：test:fast 不能设 cache: true')
    await expect(rejected).rejects.toThrow(
      '规则 5：test:fast 的 outputs／inputs 指到成员目录外：../shared/**',
    )
    await expect(rejected).rejects.toThrow('规则 3：build 的 dependsOn 少了根定义的 ^build')
    put(
      root,
      'apps/app/turbo.json',
      JSON.stringify({
        extends: ['//'],
        tasks: {
          build: {
            dependsOn: ['$TURBO_EXTENDS$', 'typecheck'],
            outputs: ['$TURBO_EXTENDS$', 'out/**'],
          },
        },
      }),
    )
    const { runs } = await run(root, targets)
    expect(runs[0]?.exitCode).toBe(0)
  })

  it('合成定义与比对基准都取检查器仓库的根配置：被检查检出里的根 turbo.json 不参与', async () => {
    const { root, targets } = workspace({ app: { file: 'tests/a.spec.ts', code: 0, dir: 'apps' } })
    // 检出自带的根配置放宽了测试任务；若 dry run 读它，成员原样继承的定义会开缓存、少了根的依赖。
    put(
      root,
      'turbo.json',
      JSON.stringify({
        tasks: {
          build: {},
          typecheck: {},
          'test:fast': { dependsOn: [], cache: true },
          'test:slow': {},
          test: {},
        },
      }),
    )
    put(root, 'apps/app/turbo.json', JSON.stringify({ extends: ['//'], tasks: {} }))
    const { runs } = await run(root, targets)
    expect(runs[0]?.exitCode).toBe(0)
    // 比对基准若取检出自带的根配置，test:fast 的 dependsOn 本就为空，这里不会被拒。
    put(
      root,
      'apps/app/turbo.json',
      JSON.stringify({ extends: ['//'], tasks: { 'test:fast': { dependsOn: [] } } }),
    )
    await expect(run(root, targets)).rejects.toThrow(
      /^apps\/app\/turbo\.json：规则 3：test:fast 的 dependsOn 少了根定义的 build、\^build$/u,
    )
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

describe('成员 turbo.json 的规则', () => {
  const rootTasks = {
    build: { dependsOn: ['^build'] },
    'test:fast': { dependsOn: ['build', '^build'] },
  }
  const resolved = {
    dependsOn: ['^build', 'build'],
    cache: false,
    outputs: [],
    inputs: [],
    env: [],
    persistent: false,
  }

  it('原文：extends 只能是 ["//"]，只覆盖根已定义的任务，不设 persistent', () => {
    expect(rawProblems({ extends: ['//'], tasks: { build: {} } }, rootTasks)).toEqual([])
    expect(
      rawProblems({ extends: ['//', 'other'], tasks: { dev: { persistent: true } } }, rootTasks),
    ).toEqual([
      '规则 1：extends 只能是 ["//"]',
      '规则 2：任务 dev 不在根 turbo.json 里',
      '规则 7：任务 dev 不能设 persistent: true',
    ])
    expect(rawProblems([], rootTasks)).toEqual(['不是 JSON 对象'])
  })

  it('合成后的定义：成员目录内的路径与取反模式通过，越出成员目录的、persistent 的被拒', () => {
    expect(
      resolvedProblems(
        'build',
        { ...resolved, outputs: ['dist/**', '!dist/tmp/**'] },
        rootTasks.build,
        [],
      ),
    ).toEqual([])
    expect(
      resolvedProblems(
        'build',
        { ...resolved, inputs: ['!../x/**', '$TURBO_ROOT$/a', '/abs'], persistent: true },
        rootTasks.build,
        [],
      ),
    ).toEqual([
      '规则 5：build 的 outputs／inputs 指到成员目录外：!../x/**、$TURBO_ROOT$/a、/abs',
      '规则 7：build 不能是 persistent',
    ])
    expect(resolvedProblems('build', resolved, { dependsOn: ['^build'], env: ['CI'] }, [])).toEqual(
      ['规则 6：build 的 env 少了根定义的 CI'],
    )
  })
})
