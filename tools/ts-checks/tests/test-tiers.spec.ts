// 测试分层：仓库根的分层定义、运行器传给成员的参数，以及真起 vitest 时三种层各跑了什么、导入了什么。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  SLOW_TEST_TIMEOUT_MS,
  TEST_TIER_ENV as ROOT_TIER_ENV,
  TEST_TIERS,
  testTiers,
} from '../../../vitest.tiers.mts'
import { RUN_TIERS, TEST_TIER_ENV } from '../src/testing/config.ts'
import { vitestArgs } from '../src/testing/run.ts'

const ROOT_DEFINITION = fileURLToPath(new URL('../../../vitest.tiers.mts', import.meta.url))
const VITEST = fileURLToPath(new URL('../node_modules/.bin/vitest', import.meta.url))
const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

describe('根上的分层定义', () => {
  it('运行器重抄的环境变量名与层名与根定义一致', () => {
    expect(TEST_TIER_ENV).toBe(ROOT_TIER_ENV)
    expect(RUN_TIERS.filter(tier => tier !== 'all')).toEqual([...TEST_TIERS])
  })

  it('不设层：只声明 slow 标签及其时限，不过滤', () => {
    expect(testTiers({})).toEqual({
      tags: [expect.objectContaining({ name: 'slow', timeout: SLOW_TEST_TIMEOUT_MS })],
    })
    expect(testTiers({ [ROOT_TIER_ENV]: '' })).not.toHaveProperty('tagsFilter')
  })

  it('快层滤掉 slow，慢层只留 slow；两层都允许一个测试也不剩、都开 preParse', () => {
    expect(testTiers({ [ROOT_TIER_ENV]: 'fast' })).toMatchObject({
      tagsFilter: ['!slow'],
      passWithNoTests: true,
      experimental: { preParse: true },
    })
    expect(testTiers({ [ROOT_TIER_ENV]: 'slow' })).toMatchObject({ tagsFilter: ['slow'] })
  })

  it('认不出的层报错，不悄悄全跑', () => {
    expect(() => testTiers({ [ROOT_TIER_ENV]: 'medium' })).toThrow(ROOT_TIER_ENV)
  })
})

describe('运行器加给 vitest 的参数', () => {
  it('慢层另关掉类型测试；快层与两层不关', () => {
    expect(vitestArgs('/r.json', 'slow')).toContain('--typecheck.enabled=false')
    expect(vitestArgs('/r.json', 'fast')).not.toContain('--typecheck.enabled=false')
    expect(vitestArgs('/r.json', 'all')).not.toContain('--typecheck.enabled=false')
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
      "export default { test: { ...testTiers(), globals: true, include: ['tests/**/*.spec.ts'] } }",
    ].join('\n'),
  )
  mkdirSync(join(root, 'tests'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'tests', name), text)
  return root
}

function vitest(root: string, tier: string) {
  const report = join(root, `report-${tier || 'all'}.json`)
  const marker = join(root, `imported-${tier || 'all'}.txt`)
  const ran = spawnSync(VITEST, ['run', '--reporter=json', `--outputFile.json=${report}`], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, [ROOT_TIER_ENV]: tier, MARKER: marker },
  })
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
    'packages:\n  - tools/*\n  - packages.0.0.1.legacy/core/*\n',
  )
  for (const path of [
    'tools/ts-checks',
    'tools/core-verification',
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
