// 夹具项目上真起 Stryker：同一任务里重跑复用上次被杀的变异体、读数不变；改一处被变异的行只重跑那里；关掉增量与以前一样；
// 两个成员并行与逐个跑读数相同。
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixture, git, mutate, temporary } from './fixtures/mutation.ts'

/** 改动行：`isPositive` 与 `double` 由断言守着（被杀），`label` 只被调用、没有断言（存活）。 */
function guardedFixture() {
  const made = fixture()
  writeFileSync(
    join(made.memberDir, 'src/sign.ts'),
    [
      'export const zero = 0',
      'export function isPositive(n: number): boolean {',
      '  return n > 0',
      '}',
      'export function label(n: number): string {',
      "  return n > 10 ? 'big' : 'small'",
      '}',
      'export function double(n: number): number {',
      '  return n * 2',
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(made.memberDir, 'tests/sign.spec.ts'),
    [
      "import { double, isPositive, label, zero } from '../src/sign.ts'",
      "test('zero', () => { expect(zero).toBe(0) })",
      "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false) })",
      "test('label is only called', () => { label(1) })",
      "test('double', () => { expect(double(3)).toBe(6) })",
    ].join('\n'),
  )
  return made
}

type Ran = ReturnType<typeof mutate>
const members = (ran: Ran) => ran.summary?.members
const reused = (ran: Ran) => ran.summary?.incremental?.members.map(member => member.reused)
const ok = (ran: Ran) => expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)

// 真起 Stryker：每次约十几秒，归慢层。
describe('夹具项目上真起 Stryker：增量与并行', { tags: ['slow'] }, () => {
  it(
    '第二次运行复用上次被杀的变异体，读数不变；改一处被变异的行，只有那里的重跑；关掉增量时不读不写快照',
    { timeout: 300_000 },
    () => {
      const { root, memberDir } = guardedFixture()
      const store = temporary('mutation-store-')
      const env = { OMNE_MUTATION_INCREMENTAL_HOME: store }
      const first = mutate(root, join(root, 'out-1'), '2', env)
      ok(first)
      const [before] = members(first) ?? []
      expect(before?.counts['Killed']).toBeGreaterThan(0)
      expect(before?.counts['Survived']).toBeGreaterThan(0)
      // 第一次没有快照，什么都没复用；跑完按分支写下快照。
      expect(reused(first)).toEqual([0])
      const branch = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
      expect(existsSync(join(store, encodeURIComponent(branch), 'packages__core__sign.json'))).toBe(
        true,
      )

      const second = mutate(root, join(root, 'out-2'), '2', env)
      ok(second)
      // 被杀的全部复用，存活的照样重跑；读数（含存活的明细与顺序）与第一次相同。
      expect(reused(second)).toEqual([before?.counts['Killed']])
      expect(members(second)).toEqual(members(first))
      expect(readFileSync(join(root, 'out-2/summary.md'), 'utf8')).toContain(
        `增量：复用上次被杀的变异体（不重跑）——packages/core/sign ${before?.counts['Killed']}`,
      )
      expect(second.ran.stdout).toMatch(/\[1\/1\] packages\/core\/sign .*、复用 \d+/u)

      // 关掉增量：Stryker 的配置与以前一样，摘要里没有增量一节，不留 incremental 文件，快照不动。
      writeFileSync(
        join(memberDir, 'src/sign.ts'),
        readFileSync(join(memberDir, 'src/sign.ts'), 'utf8').replace('n > 0', '0 < n'),
      )
      const snapshot = join(store, encodeURIComponent(branch), 'packages__core__sign.json')
      const kept = readFileSync(snapshot, 'utf8')
      const fresh = mutate(root, join(root, 'out-fresh'), '2', {
        ...env,
        OMNE_MUTATION_INCREMENTAL: '0',
      })
      ok(fresh)
      expect(readFileSync(snapshot, 'utf8')).toBe(kept)
      expect(fresh.summary).not.toHaveProperty('incremental')
      expect(readFileSync(join(root, 'out-fresh/summary.md'), 'utf8')).not.toContain('增量')
      expect(fresh.ran.stdout).not.toContain('增量')
      expect(
        JSON.parse(readFileSync(join(root, 'out-fresh/packages__core__sign.stryker.json'), 'utf8')),
      ).toMatchObject({ incremental: false })
      expect(existsSync(join(root, 'out-fresh/packages__core__sign.incremental.json'))).toBe(false)

      // 上面改写了 `isPositive` 那一行（语义不变）：只有它上面的变异体重跑，别处的照样复用，读数与不复用时相同。
      const edited = mutate(root, join(root, 'out-3'), '2', env)
      ok(edited)
      expect(members(edited)).toEqual(members(fresh))
      const editedReuse = reused(edited)?.[0] ?? 0
      expect(editedReuse).toBeGreaterThan(0)
      expect(editedReuse).toBeLessThan(members(fresh)?.[0]?.counts['Killed'] ?? 0)

      // 范围缩小：提交之后只改 `double`。快照里 `isPositive` 上被杀的变异体落在这次的范围外，
      // Stryker 会把它们原样带回报告；读数不算它们，与不复用时相同。
      git(root, 'add', '.')
      git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'edit')
      writeFileSync(
        join(memberDir, 'src/sign.ts'),
        readFileSync(join(memberDir, 'src/sign.ts'), 'utf8').replace('n * 2', '2 * n'),
      )
      const narrowed = mutate(root, join(root, 'out-4'), '2', env)
      ok(narrowed)
      const narrowedFresh = mutate(root, join(root, 'out-fresh-4'), '2', {
        OMNE_MUTATION_INCREMENTAL: '0',
      })
      ok(narrowedFresh)
      expect(members(narrowed)).toEqual(members(narrowedFresh))
      expect(members(narrowed)?.[0]?.outside).toBe(0)

      // --force：全部重跑、什么都不复用，读数照旧。
      const forced = mutate(root, join(root, 'out-force'), '2', env, undefined, ['--force'])
      ok(forced)
      expect(reused(forced)).toEqual([0])
      expect(members(forced)).toEqual(members(narrowedFresh))
    },
  )

  it('两个成员在预算内同时跑，读数与逐个跑相同', { timeout: 300_000 }, () => {
    const { root, memberDir } = guardedFixture()
    const second = join(root, 'packages/core/sign2')
    cpSync(memberDir, second, { recursive: true, verbatimSymlinks: true })
    const manifest = JSON.parse(readFileSync(join(second, 'package.json'), 'utf8')) as {
      name: string
    }
    writeFileSync(
      join(second, 'package.json'),
      JSON.stringify({ ...manifest, name: '@fixture/sign2' }),
    )
    git(root, 'add', 'packages/core/sign2/package.json', 'packages/core/sign2/vitest.config.ts')
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'sign2')
    const both = ['packages/core/sign', 'packages/core/sign2']
    const off = { OMNE_MUTATION_INCREMENTAL: '0' }
    const serial = mutate(
      root,
      join(root, 'out-serial'),
      '2',
      { ...off, OMNE_MUTATION_PARALLEL: '0' },
      both,
    )
    ok(serial)
    const parallel = mutate(root, join(root, 'out-parallel'), '2', off, both)
    ok(parallel)
    expect(members(serial)?.map(member => member.member)).toEqual(both)
    expect(members(parallel)).toEqual(members(serial))
    expect(parallel.summary?.errors).toEqual(serial.summary?.errors)
    // 两个工作进程的预算：两个成员同时开始，各一个。
    expect(parallel.ran.stdout).toContain('2 个成员并行，合起来不超过 2 个工作进程')
    expect(parallel.ran.stdout).toContain('开始 [1/2] packages/core/sign：1 个工作进程')
    expect(parallel.ran.stdout).toContain('开始 [2/2] packages/core/sign2：1 个工作进程')
    expect(serial.ran.stdout).not.toContain('成员并行')
    const summary = (out: string) =>
      readFileSync(join(root, out, 'summary.md'), 'utf8').replaceAll(join(root, out), '<RUN>')
    expect(summary('out-parallel')).toBe(summary('out-serial'))
  })
})
