// 夹具项目上真起 Stryker，static 变异体与超时复核（#649）：类型测试缺席的读数、只因负载超时的复核按真实判定计分、复核上限为 0。
// 真的挂起的那条单放在 mutation-stryker-hang.spec.ts。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mutate, staticFixture } from './fixtures/mutation.ts'

// 真起 Stryker：一次约十几到几十秒，归慢层。
describe('夹具项目上真起 Stryker', { tags: ['slow'] }, () => {
  // Vitest 只在一个实例第一次运行时报告类型测试；上游 runner 在同一工作进程里复用实例，初跑之后的 static 运行就少了它们。
  // 类型测试不随变异体改变结果，读数单列缺席的次数，不改判定（#649）。
  it('static 变异体的运行没跑类型测试时读数写明缺席；没有断言守着的照样记为存活（#649）', () => {
    const { root, memberDir } = staticFixture()
    writeFileSync(
      join(memberDir, 'vitest.config.ts'),
      [
        "import { testTiers } from '../../../vitest.tiers.mts'",
        'export default ({ mode }) => ({',
        '  test: {',
        "    ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'],",
        "    typecheck: { ...testTiers(mode).typecheck, enabled: true, include: ['tests/**/*.spec-d.ts'], tsconfig: './tsconfig.test.json' },",
        '  },',
        '})',
      ].join('\n'),
    )
    writeFileSync(
      join(memberDir, 'tsconfig.test.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'nodenext',
          target: 'es2022',
          noEmit: true,
          allowImportingTsExtensions: true,
          skipLibCheck: true,
        },
        include: ['src', 'tests/**/*.spec-d.ts'],
      }),
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\nimport { isPositive } from '../src/sign.ts'\ntest('returns boolean', () => { expectTypeOf(isPositive).returns.toEqualTypeOf<boolean>() })\n",
    )
    // 一个工作进程：static 变异体落在跑过初跑的那个进程里，类型测试必然缺席。
    const ran = mutate(root, join(root, 'out'), '1')
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member?.survived.map(finding => finding.line)).toEqual([2])
    expect(member?.typeTests).toEqual({
      status: 'measured',
      dryRun: 1,
      staticRuns: 1,
      withoutTypeTests: 1,
    })
    expect(ran.ran.stdout).toContain('其中 1 次没有跑类型测试')
  })

  it('static 运行只因负载超过时限时，单独复核后按真实判定计分：存活不被记成测出（#649）', () => {
    const { root, memberDir } = staticFixture()
    // 可控的耗时注入：不导入源码，只有跑全部测试的 static 运行会跑它；只在有变异体激活时等待，初跑不受影响，
    // 时限就按快的初跑估出，第一遍必然超过。复核的时限另加 mutation.testTimeoutSeconds，20 秒跑得完。
    writeFileSync(
      join(memberDir, 'tests/delay.spec.ts'),
      [
        "test('slow only under an active mutant', async () => {",
        '  if ((globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__?.activeMutant !== undefined)',
        '    await new Promise(resolve => setTimeout(resolve, 20_000))',
        '}, 120_000)',
      ].join('\n'),
    )
    const out = join(root, 'out')
    const ran = mutate(root, out)
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member).toMatchObject({ valid: true, invalid: [] })
    expect(member?.rechecked).toEqual([
      expect.objectContaining({ line: 2, static: true, verdict: 'Survived' }),
    ])
    expect(member?.counts['Timeout']).toBe(0)
    expect(member?.survived.map(finding => finding.line)).toEqual([2])
    // 非 static 的变异体照常计分。
    expect(member?.counts['Killed']).toBeGreaterThan(0)
    const first = JSON.parse(readFileSync(join(out, 'packages__core__sign.mutation.json'), 'utf8'))
    expect(first).toMatchObject({
      files: {
        'src/sign.ts': {
          mutants: expect.arrayContaining([
            expect.objectContaining({ status: 'Timeout', static: true }),
          ]),
        },
      },
    })
  })

  it('复核上限为 0 时不复核：超时记超时未复核，成员测量无效，退出 1，信息写明怎么调（#649）', () => {
    const { root, memberDir } = staticFixture()
    writeFileSync(
      join(memberDir, 'tests/delay.spec.ts'),
      [
        "test('slow only under an active mutant', async () => {",
        '  if ((globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__?.activeMutant !== undefined)',
        '    await new Promise(resolve => setTimeout(resolve, 20_000))',
        '}, 120_000)',
      ].join('\n'),
    )
    const out = join(root, 'out')
    const ran = mutate(root, out, '2', { OMNE_MUTATION_RECHECK_MAX: '0' })
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    const [member] = ran.summary?.members ?? []
    expect(member).toMatchObject({
      valid: false,
      score: null,
      recheck: { limit: 0, targets: 1, skipped: 1, mutants: 0, allMutants: 1 },
    })
    expect(member?.invalid).toEqual([
      expect.objectContaining({ line: 2, reason: 'timeoutUnchecked' }),
    ])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('OMNE_MUTATION_RECHECK_MAX')])
    expect(existsSync(join(out, 'packages__core__sign.recheck.mutation.json'))).toBe(false)
  })
})
