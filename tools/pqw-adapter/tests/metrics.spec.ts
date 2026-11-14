import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  buildArgs,
  coverageArgs,
  measureMember,
  metricsArgs,
  metricsSummary,
  SUMMARY_LIMIT,
  tiersOf,
  type MemberReading,
  type PqwFunction,
} from '../src/metrics.ts'
import { CONFIG, changedMember, recorder, scratch, valueOf, writeJson } from './support.ts'

it('runs the fast tier by default and both tiers for the full-run scale', () => {
  expect(tiersOf(false)).toEqual(['fast'])
  expect(tiersOf(true)).toEqual(['fast', 'slow'])
})

it('uses the omne coverage flags with an lcov reporter', () => {
  expect(coverageArgs('slow', '/out/fast', 3)).toEqual([
    'exec',
    'vitest',
    'run',
    '--mode',
    'slow',
    '--exclude=**/*.legacy/**',
    '--coverage.enabled',
    '--coverage.provider=v8',
    '--coverage.reporter=lcovonly',
    '--coverage.include=src/**',
    '--coverage.include=dist/**/*.js',
    '--coverage.reportOnFailure',
    '--coverage.reportsDirectory=/out/fast',
    '--typecheck.enabled=false',
    '--testTimeout=120000',
    '--hookTimeout=120000',
    '--maxWorkers=3',
  ])
})

it('builds each changed member together with its dependencies', () => {
  expect(buildArgs(['@omne-harness/a', '@omne-harness/b'])).toEqual([
    'exec',
    'turbo',
    'run',
    'build',
    '--output-logs=errors-only',
    '--filter=@omne-harness/a...',
    '--filter=@omne-harness/b...',
  ])
})

it('passes the configured lines, assertion pattern, lcov files and scopes to metrics.mjs', () => {
  const args = metricsArgs({
    root: '/repo',
    base: 'b',
    lcovs: ['/o/fast/lcov.info', '/o/slow/lcov.info'],
    scopes: ['m/src/a.ts', 'm/src/b.ts'],
    config: { ...CONFIG, crap: { warn: 11, alert: 15 } },
    json: '/o/m.json',
  })
  expect(args[0]).toBe(
    '/repo/.meta_harness/agents/vendor/pqw-skills/skills/slice-closeout/scripts/metrics.mjs',
  )
  expect(valueOf(args, '--lcov')).toBe('/o/fast/lcov.info,/o/slow/lcov.info')
  expect(valueOf(args, '--scope')).toBe('m/src/a.ts,m/src/b.ts')
  expect(valueOf(args, '--cc')).toBe('10,12')
  expect(valueOf(args, '--crap')).toBe('11,15')
  expect(valueOf(args, '--assert-pattern')).toBe('^(expect|assert)')
  expect(valueOf(args, '--base')).toBe('b')
  expect(valueOf(args, '--json')).toBe('/o/m.json')
  expect(
    metricsArgs({ root: '/r', base: 'b', lcovs: [], scopes: ['m/'], config: CONFIG, json: 'j' }),
  ).not.toContain('--lcov')
})

const context = (outDir: string, exec: ReturnType<typeof recorder>['exec'], full = false) => ({
  root: '/repo',
  base: 'b',
  head: 'h',
  dirty: false,
  full,
  config: CONFIG,
  outDir,
  workers: 2,
  exec,
})

const pqwResult = { functions: [], uncovered: [], testsWithoutAssertions: [], summary: {} }

it('runs each tier in the member directory, hands every written lcov to one metrics.mjs call, and reads the JSON back', async () => {
  const out = scratch()
  const { calls, exec } = recorder(command => {
    if (command.command === 'pnpm') {
      const dir =
        (command.args.find(a => a.startsWith('--coverage.reportsDirectory=')) ?? '').split(
          '=',
        )[1] ?? ''
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'lcov.info'), 'SF:src/a.ts\nend_of_record\n')
      return { code: command.args.includes('slow') ? 1 : 0 }
    }
    writeJson(valueOf(command.args, '--json') ?? '', pqwResult)
    return {}
  })
  const reading = await measureMember(changedMember('tools/t'), context(out, exec, true))
  expect(calls.map(c => [c.command === 'pnpm' ? 'pnpm' : 'node', c.cwd])).toEqual([
    ['pnpm', '/repo/tools/t'],
    ['pnpm', '/repo/tools/t'],
    ['node', '/repo'],
  ])
  expect(valueOf(calls[2]?.args ?? [], '--lcov')).toBe(
    `${out}/tools__t/fast/lcov.info,${out}/tools__t/slow/lcov.info`,
  )
  expect(reading).toEqual({
    member: 'tools/t',
    json: `${out}/tools__t.metrics.json`,
    failedTiers: ['slow 退出 1'],
    untested: false,
    result: pqwResult,
  })
})

it('skips coverage for a member without tests and reports a failed metrics.mjs call instead of a reading', async () => {
  const { calls, exec } = recorder(() => ({ code: 2, stderr: 'typescript 找不到' }))
  const reading = await measureMember(
    changedMember('tools/c', { testable: false }),
    context(scratch(), exec),
  )
  expect(calls).toHaveLength(1)
  expect(reading.untested).toBe(true)
  expect(reading.result).toBeUndefined()
  expect(reading.error).toBe('metrics.mjs 退出 2：typescript 找不到')
})

const fn = (name: string, worse: boolean): PqwFunction => ({
  name,
  path: `m/src/${name}.ts`,
  startLine: 3,
  cyclomatic: 14,
  crap: worse ? 40 : null,
  worse,
  trend: worse ? 'new' : 'unsure',
})

it('stays within twelve lines when every optional line is present', () => {
  const readings: MemberReading[] = ['a', 'b', 'c'].map(m => ({
    member: `m/${m}`,
    json: `/o/${m}.json`,
    failedTiers: ['fast 退出 1'],
    untested: true,
    error: 'metrics.mjs 退出 2',
    result: {
      functions: [fn(`${m}1`, true), fn(`${m}2`, true), fn(`${m}3`, false)],
      uncovered: [{ path: 'x', reason: 'r' }],
      testsWithoutAssertions: [{}],
      warnings: ['w'],
      summary: { overLineNotWorse: 1 },
    },
  }))
  const lines = metricsSummary(
    readings,
    { members: [], outside: ['docs/a.md'] },
    { base: 'basebasebase', head: 'headheadhead', dirty: true, full: true, config: CONFIG },
  )
  expect(lines.length).toBeLessThanOrEqual(SUMMARY_LIMIT)
  expect(lines[0]).toBe(
    '结构读数 headheadh（工作树不干净） · 基线 basebaseb · 快慢两层 · 圈复杂度与 CRAP 线 warn 10／alert 12',
  )
  expect(lines[2]).toBe('变差 6 个（逐条交代）；过线没变差 3 个；拿不准的基线 3 个')
  expect(lines[3]).toBe('! a1 m/src/a1.ts:3 圈复杂度 14 CRAP 40.0')
  expect(lines[6]).toBe('另有 3 个变差，见各成员 JSON')
  expect(lines.at(-1)).toMatch(/^限制：/)
})

const clean = (functions: PqwFunction[]): MemberReading => ({
  member: 'm/a',
  json: '/o/a.json',
  failedTiers: [],
  untested: false,
  result: { functions, uncovered: [], testsWithoutAssertions: [], summary: {} },
})

it('writes only the fixed lines when nothing is wrong, outside the members is empty and the tree is clean', () => {
  const lines = metricsSummary(
    [clean([fn('a1', false)])],
    { members: [], outside: [] },
    { base: 'basebasebase', head: 'headheadhead', dirty: false, full: false, config: CONFIG },
  )
  expect(lines).toEqual([
    '结构读数 headheadh · 基线 basebaseb · 快层 · 圈复杂度与 CRAP 线 warn 10／alert 12',
    '范围：改动成员 0 个、改动函数 1 个',
    '变差 0 个（逐条交代）；过线没变差 0 个；拿不准的基线 1 个',
    '无断言用例 0 个；未覆盖的改动文件 0 个；覆盖率警告 0 条',
    '限制：依赖方向、环与新增边不在本读数，看 pnpm run lint:deps',
  ])
})

it('lists up to three worse functions with no count of the rest, and writes 无覆盖 for a missing CRAP', () => {
  const lines = metricsSummary(
    [clean([{ ...fn('a1', true), crap: null }, fn('a2', true), fn('a3', true)])],
    { members: [], outside: [] },
    { base: 'b', head: 'h', dirty: false, full: false, config: CONFIG },
  )
  expect(lines.slice(2, 6)).toEqual([
    '变差 3 个（逐条交代）；过线没变差 0 个；拿不准的基线 0 个',
    '! a1 m/src/a1.ts:3 圈复杂度 14 CRAP 无覆盖',
    '! a2 m/src/a2.ts:3 圈复杂度 14 CRAP 40.0',
    '! a3 m/src/a3.ts:3 圈复杂度 14 CRAP 40.0',
  ])
  expect(lines).toHaveLength(8)
})

it('names each kind of problem on its own line, in the order tests, no test script, failed reading', () => {
  const base = clean([])
  const lines = metricsSummary(
    [
      { ...base, member: 'm/t', failedTiers: ['fast 退出 1', 'slow 退出 2'] },
      { ...base, member: 'm/u', untested: true },
      { ...base, member: 'm/e', error: 'metrics.mjs 退出 2' },
    ],
    { members: [], outside: [] },
    { base: 'b', head: 'h', dirty: false, full: false, config: CONFIG },
  )
  expect(lines.slice(4, -1)).toEqual([
    '覆盖率那趟测试没通过：m/t（fast 退出 1，slow 退出 2）',
    '没有 test 脚本、CRAP 记无覆盖：m/u',
    '读数失败：m/e（metrics.mjs 退出 2）',
  ])
})

it('hands metrics.mjs exactly the repo, base, scopes, lines, pattern and JSON, and a lcov list only when there are lcov files', () => {
  expect(
    metricsArgs({ root: '/r', base: 'b', lcovs: [], scopes: ['m/'], config: CONFIG, json: 'j' }),
  ).toEqual([
    '/r/.meta_harness/agents/vendor/pqw-skills/skills/slice-closeout/scripts/metrics.mjs',
    '--repo',
    '/r',
    '--base',
    'b',
    '--scope',
    'm/',
    '--cc',
    '10,12',
    '--crap',
    '10,12',
    '--assert-pattern',
    '^(expect|assert)',
    '--json',
    'j',
  ])
})

it('keeps the output of each run in the member log files, with stderr after a marker only when there is some', async () => {
  const out = scratch()
  const { exec } = recorder(command => {
    if (command.command === 'pnpm') return { stdout: 'vitest out', stderr: 'vitest err' }
    writeJson(valueOf(command.args, '--json') ?? '', pqwResult)
    return { stdout: 'pqw out' }
  })
  await measureMember(changedMember('tools/t'), context(out, exec))
  expect(readFileSync(`${out}/tools__t/fast.vitest.log`, 'utf8')).toBe(
    'vitest out\n--- stderr ---\nvitest err',
  )
  expect(readFileSync(`${out}/tools__t/metrics.log`, 'utf8')).toBe('pqw out')
})

it('measures into an output directory that already exists, as when --out is reused', async () => {
  const out = scratch()
  const { exec } = recorder(command => {
    if (command.command !== 'pnpm') writeJson(valueOf(command.args, '--json') ?? '', pqwResult)
    return {}
  })
  await measureMember(changedMember('tools/t'), context(out, exec))
  await expect(measureMember(changedMember('tools/t'), context(out, exec))).resolves.toMatchObject({
    member: 'tools/t',
  })
})

it('passes no lcov to metrics.mjs when the coverage run wrote none, and names a signal that ended it', async () => {
  const { calls, exec } = recorder(command => {
    if (command.command === 'pnpm') {
      const reports = command.args.find(a => a.startsWith('--coverage.reportsDirectory='))
      mkdirSync(reports?.split('=')[1] ?? '', { recursive: true })
      return { code: null }
    }
    writeJson(valueOf(command.args, '--json') ?? '', pqwResult)
    return {}
  })
  const reading = await measureMember(changedMember('tools/t'), context(scratch(), exec))
  expect(calls[1]?.args).not.toContain('--lcov')
  expect(reading.failedTiers).toEqual(['fast 退出 信号'])
})

it('reports a failed metrics.mjs call even when an earlier JSON is still in the output directory', async () => {
  const out = scratch()
  writeJson(`${out}/tools__t.metrics.json`, pqwResult)
  const { exec } = recorder(command =>
    command.command === 'pnpm' ? {} : { code: 2, stderr: 'pqw 起不来' },
  )
  const reading = await measureMember(changedMember('tools/t'), context(out, exec))
  expect(reading.error).toBe('metrics.mjs 退出 2：pqw 起不来')
  expect(reading.result).toBeUndefined()
})

it('reports a metrics.mjs call that exits 0 without writing its JSON, and shows the last three lines of its output', async () => {
  const { exec } = recorder(command =>
    command.command === 'pnpm' ? {} : { stdout: 'l1\nl2\nl3\nl4\n', stderr: '  ' },
  )
  const reading = await measureMember(changedMember('tools/t'), context(scratch(), exec))
  expect(reading.error).toBe('metrics.mjs 退出 0：l2 ⏎ l3 ⏎ l4')
  const signalled = recorder(command =>
    command.command === 'pnpm' ? {} : { code: null, stderr: 'killed' },
  )
  const stopped = await measureMember(changedMember('tools/t'), context(scratch(), signalled.exec))
  expect(stopped.error).toBe('metrics.mjs 退出 信号：killed')
})

it('sums the counts over every member result', () => {
  const readings: MemberReading[] = ['a', 'b'].map((m, i) => ({
    member: `m/${m}`,
    json: `/o/${m}.json`,
    failedTiers: [],
    untested: false,
    result: {
      functions: [],
      uncovered: Array.from({ length: i + 1 }, () => ({ path: 'x', reason: 'r' })),
      testsWithoutAssertions: Array.from({ length: i + 2 }, () => ({})),
      warnings: Array.from({ length: i + 3 }, () => 'w'),
      summary: {},
    },
  }))
  const lines = metricsSummary(
    readings,
    { members: [], outside: [] },
    { base: 'b', head: 'h', dirty: false, full: false, config: CONFIG },
  )
  expect(lines[3]).toBe('无断言用例 5 个；未覆盖的改动文件 3 个；覆盖率警告 7 条')
})

it('counts a reading that has only an error as no functions and no counts, and lists each failing member', () => {
  const failed = (member: string, extra: Partial<MemberReading>): MemberReading => ({
    member,
    json: `/o/${member}.json`,
    failedTiers: [],
    untested: false,
    ...extra,
  })
  const lines = metricsSummary(
    [
      failed('m/a', { failedTiers: ['fast 退出 1'], error: 'x 退出 2', untested: true }),
      failed('m/b', { failedTiers: ['slow 退出 3'], error: 'y 退出 4', untested: true }),
    ],
    { members: [], outside: [] },
    { base: 'b', head: 'h', dirty: false, full: false, config: CONFIG },
  )
  expect(lines[1]).toBe('范围：改动成员 0 个、改动函数 0 个')
  expect(lines.slice(3)).toEqual([
    '无断言用例 0 个；未覆盖的改动文件 0 个；覆盖率警告 0 条',
    '覆盖率那趟测试没通过：m/a（fast 退出 1）、m/b（slow 退出 3）',
    '没有 test 脚本、CRAP 记无覆盖：m/a、m/b',
    '读数失败：m/a（x 退出 2）；m/b（y 退出 4）',
    expect.stringMatching(/^限制：/),
  ])
})
