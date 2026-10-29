// 夹具项目上真起 Stryker，测量无效与 sandbox 预检：静态变异使文件或深层 suite 自身出错、同 out 重跑不复用错误；
// 测试文件只在 sandbox 或 threads 池里加载失败时预检报错（#481）；快层没有用例时预检通过、由 Stryker 报错。
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixture, mutate } from './fixtures/mutation.ts'

// 真起 Stryker：一次约十几到几十秒，归慢层。
describe('夹具项目上真起 Stryker', { tags: ['slow'] }, () => {
  it.each(['module', 'suite'] as const)(
    '静态变异使文件或深层 suite 自身出错时成员无效，原始报告保留；同 out 重跑不复用错误（%s）',
    container => {
      const { root, memberDir } = fixture()
      writeFileSync(
        join(memberDir, 'src/sign.ts'),
        "export const zero = 0\nexport function names(): string[] { return ['alpha', 'beta'] }\n",
      )
      // describe 收集异常归模块；内层 beforeAll 才产生 suite 自身错误，顶层调用保留静态变异。
      writeFileSync(
        join(memberDir, 'tests/collection.spec.ts'),
        [
          "import { names } from '../src/sign.ts'",
          ...(container === 'suite'
            ? [
                'const collectedNames = names()',
                "describe('collection outer', () => {",
                "describe('collection inner', () => {",
                'beforeAll(() => { Array.from(collectedNames) })',
                "test('registered', () => { expect(collectedNames).toBeDefined() })",
                '})',
                '})',
              ]
            : [
                'for (const name of names()) test(name, () => { expect(name.length).toBeGreaterThan(0) })',
              ]),
        ].join('\n'),
      )
      const out = join(root, 'out')
      const invalid = mutate(root, out)
      const evidence = process.env['OMNE_MUTATION_FIXTURE_EVIDENCE']
      if (evidence !== undefined) {
        mkdirSync(evidence, { recursive: true })
        cpSync(out, join(evidence, `static-collection-${container}`), { recursive: true })
        writeFileSync(
          join(evidence, `static-cli-${container}.txt`),
          invalid.ran.stdout + invalid.ran.stderr,
        )
      }
      expect(invalid.ran.status, invalid.ran.stdout + invalid.ran.stderr).toBe(1)
      // 测量无效的成员照样留在读数里，不给分数（#649）。
      expect(invalid.summary?.members).toEqual([
        expect.objectContaining({ valid: false, score: null }),
      ])
      expect(invalid.summary?.errors).toEqual([expect.stringContaining('RuntimeError')])
      const raw = readFileSync(join(out, 'packages__core__sign.mutation.json'), 'utf8')
      expect(raw).toContain('RuntimeError')
      expect(raw).toContain('collection.spec.ts')
      expect(raw).toContain('文件或 suite 收集错误')
      if (container === 'suite') {
        const report: unknown = JSON.parse(raw)
        expect(report).toMatchObject({
          files: {
            'src/sign.ts': {
              mutants: expect.arrayContaining([
                expect.objectContaining({
                  status: 'RuntimeError',
                  static: true,
                  statusReason: expect.stringContaining(
                    '"suite":"collection outer > collection inner"',
                  ),
                }),
              ]),
            },
          },
        })
      }
      rmSync(join(memberDir, 'tests/collection.spec.ts'))
      const rerun = mutate(root, out)
      expect(rerun.ran.status, rerun.ran.stdout + rerun.ran.stderr).toBe(0)
      expect(rerun.summary?.errors).toEqual([])
      expect(rerun.summary?.members).toHaveLength(1)
      const history = readdirSync(out).filter(name => name.includes('.history-'))
      expect(history).toHaveLength(1)
      expect(
        readFileSync(join(out, history[0] ?? '', 'packages__core__sign.mutation.json'), 'utf8'),
      ).toBe(raw)
      writeFileSync(
        join(memberDir, 'tests/broken.spec.ts'),
        "throw new Error('fresh preflight failure')",
      )
      const failedRerun = mutate(root, out)
      expect(failedRerun.ran.status, failedRerun.ran.stdout + failedRerun.ran.stderr).toBe(1)
      expect(failedRerun.summary?.members).toEqual([])
      expect(failedRerun.summary?.errors).toEqual([expect.stringContaining('sandbox 预检没通过')])
      expect(existsSync(join(out, 'packages__core__sign.mutation.json'))).toBe(false)
      expect(readdirSync(out).filter(name => name.includes('.history-'))).toHaveLength(2)
    },
  )

  it('有测试文件在 sandbox 里加载失败就报错、不出读数，别的文件里的用例全过也一样（#481）', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false) })",
      ].join('\n'),
    )
    // 相对路径的 alias 在原目录解析回成员自己，在 sandbox 里指向容器下不存在的 sign 目录：
    // 这份文件只在 sandbox 里加载失败，Stryker 的 vitest runner 不看文件级结果，初跑仍算成功。
    writeFileSync(
      join(memberDir, 'vitest.config.ts'),
      [
        "import { fileURLToPath } from 'node:url'",
        "import { testTiers } from '../../../vitest.tiers.mts'",
        'export default ({ mode }) => ({',
        "  resolve: { alias: [{ find: /^#sign$/, replacement: fileURLToPath(new URL('../sign/src/sign.ts', import.meta.url)) }] },",
        '  test: {',
        "    ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'],",
        "    typecheck: { ...testTiers(mode).typecheck, enabled: true, include: ['tests/**/*.spec-d.ts'], tsconfig: './tsconfig.test.json' },",
        '  },',
        '})',
      ].join('\n'),
    )
    // #481 的原始形态：类型断言照常通过，运行时的文件加载失败。没有 tsconfig 时 tsc 只打印帮助，类型断言不会真跑；
    // 与仓库成员一样叫 tsconfig.test.json：成员根有 tsconfig.json 时，构建脚本的 `tsc src/sign.ts` 会拒绝运行。
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
    writeFileSync(
      join(memberDir, 'tests/alias.spec.ts'),
      "import { isPositive } from '#sign'\ntest('via alias', () => { expect(isPositive(2)).toBe(true) })\n",
    )
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    expect(ran.summary?.members).toEqual([])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('sandbox 预检没通过')])
    const log = readFileSync(join(root, 'out/packages__core__sign.log'), 'utf8')
    expect(log).toMatch(/FAIL\s+tests\/alias\.spec\.ts/u)
    // sign.spec.ts 的两条与 sign.spec-d.ts 的一条类型断言都通过，类型检查没有报错。
    expect(log).toMatch(/Tests\s+3 passed/u)
    expect(log).toMatch(/Type Errors\s+no errors/u)
  })

  it('只在 Stryker 用的 threads 池里加载失败的测试文件，预检同样拦下', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isNegative(n: number): boolean {\n  return n < 0\n}\n',
    )
    // 顶层 process.chdir 在 forks 池里能加载，在 worker_threads 里抛错；Stryker 初跑固定用 threads。
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        'process.chdir(process.cwd())',
        "import { isNegative } from '../src/sign.ts'",
        "test('sign', () => { expect(isNegative(-1)).toBe(true); expect(isNegative(0)).toBe(false) })",
      ].join('\n'),
    )
    writeFileSync(
      join(memberDir, 'tests/zero.spec.ts'),
      "import { zero } from '../src/sign.ts'\ntest('zero', () => { expect(zero).toBe(0) })\n",
    )
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    expect(ran.summary?.members).toEqual([])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('sandbox 预检没通过')])
  })

  it('快层一条用例都没有时预检通过，由 Stryker 自己报没有用例，不算成加载失败', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    // 只剩慢层那条：快层的 passWithNoTests 让预检退出 0。
    rmSync(join(memberDir, 'tests/sign.spec.ts'))
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    expect(ran.summary?.members).toEqual([])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('Stryker 退出码 1')])
    expect(readFileSync(join(root, 'out/packages__core__sign.log'), 'utf8')).toContain(
      'No tests were executed',
    )
  })
})
