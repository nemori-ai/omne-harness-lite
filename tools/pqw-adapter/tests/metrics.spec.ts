import { mkdirSync, writeFileSync } from 'node:fs'
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
