// 测试分层：仓库根的分层定义、运行器交给 turbo 的任务，以及真起 vitest 时三种层各跑了什么、导入了什么。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { configDefaults } from 'vitest/config'
import {
  ARCHIVE_EXCLUDE,
  SLOW_TEST_TIMEOUT_MS,
  TEST_REPORT_DIR_ENV as ROOT_REPORT_DIR_ENV,
  TEST_TIERS,
  VITEST_DEFAULT_EXCLUDE,
  reportSlug,
  testTiers,
} from '../../../vitest.tiers.mts'
import { RUN_TIERS } from '../src/testing/config.ts'
import {
  TEST_REPORT_DIR_ENV,
  TIER_TASKS,
  turboTestCommand,
  typecheckArgs,
} from '../src/testing/turbo.ts'
import { slugOf } from '../src/testing/run.ts'
import { fileTree, listWorkspaceMembers } from '@omne-harness/repo-toolchain/core/workspace'

const ROOT_DEFINITION = fileURLToPath(new URL('../../../vitest.tiers.mts', import.meta.url))
const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url))
const VITEST = fileURLToPath(new URL('../node_modules/.bin/vitest', import.meta.url))
const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

describe('根上的分层定义', () => {
  it('运行器重抄的报告目录变量名与层名与根定义一致', () => {
    expect(TEST_REPORT_DIR_ENV).toBe(ROOT_REPORT_DIR_ENV)
    expect(RUN_TIERS.filter(tier => tier !== 'all')).toEqual([...TEST_TIERS])
  })

  it('重抄的 vitest 缺省 exclude 与 vitest 自己的一致', () => {
    expect([...VITEST_DEFAULT_EXCLUDE]).toEqual(configDefaults.exclude)
    expect([...VITEST_DEFAULT_EXCLUDE]).toEqual(configDefaults.typecheck.exclude)
  })

  it('不给 mode：声明 slow 标签及其时限、排除嵌套归档目录，不过滤', () => {
    const tiers = testTiers(undefined, {})
    expect(tiers).toEqual({
      tags: [expect.objectContaining({ name: 'slow', timeout: SLOW_TEST_TIMEOUT_MS })],
      exclude: [...VITEST_DEFAULT_EXCLUDE, ARCHIVE_EXCLUDE],
      typecheck: { exclude: [...VITEST_DEFAULT_EXCLUDE, ARCHIVE_EXCLUDE] },
    })
    expect(testTiers('test', {})).toEqual(tiers)
  })

  it('快层滤掉 slow，慢层只留 slow；两层都允许一个测试也不剩、都开 preParse', () => {
    expect(testTiers('fast', {})).toMatchObject({
      tagsFilter: ['!slow'],
      passWithNoTests: true,
      experimental: { preParse: true },
    })
    expect(testTiers('slow', {})).toMatchObject({ tagsFilter: ['slow'] })
  })

  it('认不出的 mode 报错，不悄悄全跑', () => {
    expect(() => testTiers('medium', {})).toThrow('medium')
  })

  it('设了报告目录：按成员路径写 JSON 报告与计时报告；没设或空串不挂报告器', () => {
    const member = join(REPOSITORY, 'packages/common/json-text')
    expect(reportSlug(member)).toBe('packages__common__json-text')
    const tiers = testTiers('fast', { [ROOT_REPORT_DIR_ENV]: '/runs/1' }, member)
    expect(tiers).toMatchObject({
      reporters: [
        'default',
        'json',
        [
          expect.stringMatching(/timing-reporter\.ts$/u),
          { outputFile: '/runs/1/packages__common__json-text.timing.json' },
        ],
      ],
      outputFile: { json: '/runs/1/packages__common__json-text.json' },
      env: { [ROOT_REPORT_DIR_ENV]: '' },
    })
    expect(testTiers('fast', { [ROOT_REPORT_DIR_ENV]: '' }, member)).not.toHaveProperty('reporters')
  })

  it('成员配置写报告用的文件名与运行器读报告用的一致：每个成员都对得上', () => {
    const members = listWorkspaceMembers(fileTree(REPOSITORY), [])
    expect(members.length).toBeGreaterThan(0)
    for (const { path } of members) expect(reportSlug(join(REPOSITORY, path))).toBe(slugOf(path))
  })
})

describe('运行器交给 turbo 的命令', () => {
  const parallel = { memberConcurrency: 3, vitestMaxWorkers: 2 }

  it('每层一个任务，与成员脚本同名', () => {
    expect(TIER_TASKS).toEqual({ fast: 'test:fast', slow: 'test:slow', all: 'test' })
  })

  it('不构建时只跑点名成员的这一层（--only），一个失败不拦其余的；报告目录与工作进程数经环境变量传下去', () => {
    const command = turboTestCommand(['@a/x', '@a/y'], 'slow', parallel, '/runs/2', {
      build: false,
      admission: false,
    })
    expect(command.args.slice(0, 4)).toEqual(['run', 'test:slow', '--filter=@a/x', '--filter=@a/y'])
    expect(command.args).toEqual(
      expect.arrayContaining([
        '--only',
        '--continue=dependencies-successful',
        '--concurrency=3',
        '--summarize',
      ]),
    )
    expect(command.env[TEST_REPORT_DIR_ENV]).toBe('/runs/2')
    expect(command.env['VITEST_MAX_WORKERS']).toBe('2')
  })

  it('要构建时不带 --only，由 turbo 按依赖构建；准入模式下构建缓存只写不读', () => {
    const args = (admission: boolean) =>
      turboTestCommand(['@a/x'], 'fast', parallel, '/runs/3', { build: true, admission }).args
    expect(args(false)).not.toContain('--only')
    expect(args(false)).toContain('--cache=local:rw')
    expect(args(true)).toContain('--cache=local:w')
  })

  it('类型检查按输入缓存：依赖上游的 typecheck，根分层定义在全局依赖里；准入模式下缓存只写不读', () => {
    const turbo = JSON.parse(readFileSync(join(REPOSITORY, 'turbo.json'), 'utf8')) as {
      globalDependencies?: string[]
      tasks: Record<string, { dependsOn?: string[]; cache?: boolean }>
    }
    const typecheck = turbo.tasks['typecheck']
    expect(typecheck?.cache).not.toBe(false)
    expect(typecheck?.dependsOn).toContain('^typecheck')
    expect(turbo.globalDependencies).toContain('vitest.tiers.mts')
    expect(typecheckArgs(['@a/x'], false)).toContain('--cache=local:rw')
    expect(typecheckArgs(['@a/x'], true)).toContain('--cache=local:w')
  })

  it('三个测试任务的 env 与 passThroughEnv 各是同一份', () => {
    const turbo = JSON.parse(readFileSync(join(REPOSITORY, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { env?: string[]; passThroughEnv?: string[] }>
    }
    for (const key of ['env', 'passThroughEnv'] as const) {
      const [first, ...rest] = Object.values(TIER_TASKS).map(task => turbo.tasks[task]?.[key])
      for (const list of rest) expect(list).toEqual(first)
    }
  })

  it('三个测试任务都把这两个变量列进 passThroughEnv：turbo 的 Strict Mode 会滤掉没声明的变量', () => {
    const turbo = JSON.parse(readFileSync(join(REPOSITORY, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { passThroughEnv?: string[]; cache?: boolean }>
    }
    for (const task of Object.values(TIER_TASKS)) {
      expect(turbo.tasks[task]?.passThroughEnv).toEqual(
        expect.arrayContaining([TEST_REPORT_DIR_ENV, 'VITEST_MAX_WORKERS']),
      )
      expect(turbo.tasks[task]?.cache).toBe(false)
    }
  })
})

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** 一个小 vitest 项目：配置展开根上的分层定义；不导入 vitest（用全局 API），所以放在系统临时目录也跑得起来。 */
function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'test-tiers-'))
  temporaries.push(root)
  writeFileSync(
    join(root, 'vitest.config.mjs'),
    [
      `import { testTiers } from ${JSON.stringify(ROOT_DEFINITION)}`,
      "export default ({ mode }) => ({ test: { ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'] } })",
    ].join('\n'),
  )
  mkdirSync(join(root, 'tests'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'tests', name), text)
  return root
}

function vitest(root: string, tier: string) {
  const report = join(root, `report-${tier || 'all'}.json`)
  const marker = join(root, `imported-${tier || 'all'}.txt`)
  // 不把运行器的报告目录传给夹具：它的报告不进这一轮的账本。
  const env: NodeJS.ProcessEnv = { ...process.env, MARKER: marker }
  delete env[ROOT_REPORT_DIR_ENV]
  const ran = spawnSync(
    VITEST,
    [
      'run',
      ...(tier === '' ? [] : ['--mode', tier]),
      '--reporter=json',
      `--outputFile.json=${report}`,
    ],
    { cwd: root, encoding: 'utf8', env },
  )
  const passed = existsSync(report)
    ? (
        JSON.parse(readFileSync(report, 'utf8')) as {
          testResults: { assertionResults: { title: string; status: string }[] }[]
        }
      ).testResults
        .flatMap(file => file.assertionResults)
        .filter(test => test.status === 'passed')
        .map(test => test.title)
        .sort()
    : []
  return {
    status: ran.status,
    output: `${ran.stdout}${ran.stderr}`,
    report: existsSync(report) ? readFileSync(report, 'utf8') : '',
    passed,
    imported: existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n') : [],
  }
}

/** 被导入时往 MARKER 文件里记一行自己的名字。 */
const MARK = (name: string) => [
  "import { appendFileSync } from 'node:fs'",
  `appendFileSync(process.env['MARKER'] ?? '/dev/null', ${JSON.stringify(`${name}\n`)})`,
]

describe('真起 vitest：各层跑了什么、导入了什么', { timeout: 60_000 }, () => {
  const root = project({
    'quick.spec.ts': [
      ...MARK('quick'),
      "test('快的', () => {})",
      "test('单条归慢', { tags: ['slow'] }, () => {})",
    ].join('\n'),
    'heavy.spec.ts': [
      '/**',
      // vitest 扫描整个文件找这条声明，字符串里的也算：拆开写，免得本文件自己被归进慢层。
      ` * @module-${'tag'} slow`,
      ' * 归慢层：夹具，整文件归慢。',
      ' */',
      ...MARK('heavy'),
      "describe('一组', () => { test('整文件归慢', () => {}) })",
    ].join('\n'),
  })

  it('不设层：两层全跑，两个文件都导入', () => {
    const result = vitest(root, '')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual(['单条归慢', '快的', '整文件归慢'])
    expect(result.imported.sort()).toEqual(['heavy', 'quick'])
  })

  it('快层：只跑没归慢的；整文件归慢的那份不导入', () => {
    const result = vitest(root, 'fast')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual(['快的'])
    expect(result.imported).toEqual(['quick'])
  })

  it('慢层：只跑归慢的，整文件的与单条的都在', () => {
    const result = vitest(root, 'slow')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual(['单条归慢', '整文件归慢'])
  })

  it('没有慢测试的项目在慢层下退出 0', () => {
    const quickOnly = project({ 'only.spec.ts': "test('只有快的', () => {})" })
    const result = vitest(quickOnly, 'slow')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual([])
  })

  it('用了没声明的标签：vitest 报错退出，不会静默当成快层', () => {
    const typo = project({ 'typo.spec.ts': "test('拼错了', { tags: ['slwo'] }, () => {})" })
    const result = vitest(typo, '')
    expect(result.status).not.toBe(0)
    expect(result.report).toContain('slwo')
  })
})

describe('入口的层参数', { timeout: 60_000 }, () => {
  const subject = mkdtempSync(join(tmpdir(), 'test-tier-cli-'))
  afterAll(() => rmSync(subject, { recursive: true, force: true }))
  writeFileSync(
    join(subject, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*/*\n  - tools/*\n  - packages.0.0.1.legacy/core/*\n',
  )
  // 计划经 turbo 选成员，turbo 要读被检查仓库根的 package.json 与 packageManager。
  writeFileSync(
    join(subject, 'package.json'),
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  // 影响面规则点名的成员都要在，否则计划报错；外加一个退役目录里的成员。
  for (const path of [
    'packages/common/legal-identity',
    'tools/repo-toolchain',
    'tools/dev-flow',
    'tools/product-checks',
    'tools/test-runner',
    'packages.0.0.1.legacy/core/identity-values',
  ]) {
    mkdirSync(join(subject, path), { recursive: true })
    writeFileSync(
      join(subject, path, 'package.json'),
      JSON.stringify({
        name: `@fixture/${path.split('/').at(-1)}`,
        scripts: { test: 'vitest run' },
      }),
    )
  }
  execFileSync('git', ['init', '-q'], { cwd: subject })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ],
    { cwd: subject },
  )
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, OMNE_SUBJECT_ROOT: subject },
    })

  it('受影响范围缺省快层，--tier 可改；--plan-only 打印层', () => {
    expect(cli('run', '--base', 'HEAD', '--plan-only').stdout).toContain('层：快层（fast）')
    expect(cli('run', '--base', 'HEAD', '--tier', 'slow', '--plan-only').stdout).toContain(
      '层：慢层（slow）',
    )
    expect(cli('run', '--all', '--plan-only').stdout).toContain('层：两层（all）')
  })

  it('构建缺省：受影响范围与全量验收先构建，全量测试不构建；--build、--no-build 改写，同给退出 2', () => {
    const built = '构建：先构建这些成员及其依赖'
    const notBuilt = '构建：不构建（调用方已构建）'
    expect(cli('run', '--base', 'HEAD', '--plan-only').stdout).toContain(built)
    expect(cli('run', '--base', 'HEAD', '--no-build', '--plan-only').stdout).toContain(notBuilt)
    expect(cli('run', '--all', '--plan-only').stdout).toContain(notBuilt)
    expect(cli('run', '--all', '--build', '--plan-only').stdout).toContain(built)
    expect(cli('run', '--all', '--script', 'acceptance', '--plan-only').stdout).toContain(built)
    expect(
      cli('run', '--all', '--script', 'acceptance', '--no-build', '--plan-only').stdout,
    ).toContain(notBuilt)
    expect(cli('run', '--all', '--build', '--no-build', '--plan-only').status).toBe(2)
  })

  it('不给 --base 与 --all：基线取 main（没有任务上下文时）', () => {
    execFileSync('git', ['update-ref', 'refs/heads/main', 'HEAD'], { cwd: subject })
    const ran = cli('run', '--plan-only')
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('影响面（基线 main')
  })

  it('认不出的层、给验收指定层：退出 2 并说明', () => {
    const bad = cli('run', '--all', '--tier', 'medium', '--plan-only')
    expect(bad.status).toBe(2)
    expect(bad.stderr).toContain('--tier 只能是')
    const acceptance = cli(
      'run',
      '--all',
      '--script',
      'acceptance',
      '--tier',
      'fast',
      '--plan-only',
    )
    expect(acceptance.status).toBe(2)
    expect(acceptance.stderr).toContain('可执行验收不分层')
  })
})
