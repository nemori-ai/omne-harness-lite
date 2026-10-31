// 夹具项目上真起 Stryker，计分的基本面：sandbox 里真跑类型检查；只改 `as const` 声明时不生成变异体、报未覆盖（#737）；
// 没断言的测试留下存活变异体，补上断言后被杀；只由参数化用例守着的改动行照样被杀（#405）。
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixture, git, mutate } from './fixtures/mutation.ts'

// 真起 Stryker：一次约十几到几十秒，归慢层。
describe('夹具项目上真起 Stryker', { tags: ['slow'] }, () => {
  it('搬移后的成员与 sandbox 真跑类型检查，错误类型断言仍失败', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'tsconfig.test.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'nodenext',
          target: 'es2022',
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['tests/**/*.spec-d.ts'],
      }),
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\ntest('number type', () => { expectTypeOf(1).toEqualTypeOf<number>() })\n",
    )
    const sandbox = join(root, 'packages/core/sandbox')
    cpSync(memberDir, sandbox, {
      recursive: true,
      filter: path => path !== join(memberDir, 'node_modules'),
    })
    symlinkSync(join(memberDir, 'node_modules'), join(sandbox, 'node_modules'), 'dir')
    const check = (cwd: string) =>
      spawnSync(
        process.execPath,
        [
          join(cwd, 'node_modules/vitest/vitest.mjs'),
          'run',
          '--mode',
          'fast',
          '--maxWorkers',
          '1',
          '--typecheck.enabled=true',
          '--typecheck.include',
          'tests/**/*.spec-d.ts',
          '--typecheck.tsconfig',
          'tsconfig.test.json',
        ],
        // turbo 的严格环境模式下子进程会上色，颜色码插进摘要行使正则失配：显式关掉颜色。
        {
          cwd,
          encoding: 'utf8',
          timeout: 30_000,
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
        },
      )
    for (const cwd of [memberDir, sandbox]) {
      const ran = check(cwd)
      expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
      expect(ran.stdout).toMatch(/Tests\s+2 passed/u)
      expect(ran.stdout).toMatch(/Type Errors\s+no errors/u)
      expect(`${ran.stdout}${ran.stderr}`).not.toContain('Unhandled Error')
    }
    writeFileSync(
      join(sandbox, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\ntest('wrong type', () => { expectTypeOf(1).toEqualTypeOf<string>() })\n",
    )
    const wrong = check(sandbox)
    expect(wrong.status, `${wrong.stdout}${wrong.stderr}`).toBe(1)
    expect(wrong.stderr).toContain('TypeCheckError')
    expect(wrong.stdout).toMatch(/Type Errors\s+1 failed/u)
  })

  it('改动只落在 as const 声明上：Stryker 不生成变异体，读数报未覆盖并列出改动行，不报分数（#737）', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      "export const zero = 0\nexport const NAMES = ['a', 'b'] as const\n",
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { NAMES, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('names', () => { expect(NAMES).toEqual(['a', 'b']) })",
      ].join('\n'),
    )
    const out = join(root, 'out-const')
    const result = mutate(root, out)
    const output = `${result.ran.stdout}${result.ran.stderr}`
    expect(result.ran.status, output).toBe(0)
    expect(result.summary?.errors).toEqual([])
    const [only] = result.summary?.members ?? []
    expect(only).toMatchObject({
      valid: true,
      score: null,
      unmutated: [{ file: 'packages/core/sign/src/sign.ts', start: 2, end: 2 }],
    })
    const summary = readFileSync(join(out, 'summary.md'), 'utf8')
    expect(summary).toContain('分数 —（未覆盖 1 段：改动上没有变异体）')
    expect(summary).toContain('  没有变异体 packages/core/sign/src/sign.ts:2')
    expect(summary).not.toContain('100%')
    // 逐成员的进度行同样报出段数。
    expect(result.ran.stdout).toMatch(/\[1\/1\] packages\/core\/sign .*、没有变异体的改动 1 段/u)
  })

  it('没断言的测试留下存活变异体，补上断言后被杀；只变异改动行，跑完不留 sandbox', () => {
    const { root, memberDir } = fixture()
    // 未提交的改动：新加一个函数，测试只调用不断言。
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('calls only', () => { isPositive(1) })",
      ].join('\n'),
    )
    const weak = mutate(root, join(root, 'out-weak'))
    expect(weak.ran.status, `${weak.ran.stdout}${weak.ran.stderr}`).toBe(0)
    // 读到的计划写进运行目录。
    expect(existsSync(join(root, 'out-weak', 'plan.json'))).toBe(true)
    expect(weak.summary?.errors).toEqual([])
    const [before] = weak.summary?.members ?? []
    expect(before?.counts['Survived']).toBeGreaterThan(0)
    // 第 1 行（没改的 `zero`）上的变异体不在范围内。
    expect(before?.survived.every(finding => finding.line >= 2 && finding.line <= 4)).toBe(true)
    expect(
      readdirSync(join(root, 'packages')).filter(name => name.startsWith('.stryker-tmp')),
    ).toEqual([])
    expect(readFileSync(join(root, 'out-weak/summary.md'), 'utf8')).toContain(
      '只跑快层（vitest 的 mode 为 fast）',
    )

    // 补上断言的那条放进只按包名导入的文件：只有它守着改动行，被杀就说明这份文件跑了、自引用走到了插过桩的代码。
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      "import { zero } from '../src/sign.ts'\ntest('zero', () => { expect(zero).toBe(0) })\n",
    )
    writeFileSync(
      join(memberDir, 'tests/public.spec.ts'),
      [
        "import { isPositive } from '@fixture/sign'",
        "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false); expect(isPositive(-1)).toBe(false) })",
      ].join('\n'),
    )
    // 同一个 `--out` 目录里留着上一次预检失败的标记，这一次预检通过就照常出读数。
    mkdirSync(join(root, 'out-strong'))
    writeFileSync(join(root, 'out-strong/packages__core__sign.preflight-failed'), '')
    const strong = mutate(root, join(root, 'out-strong'))
    expect(strong.ran.status, `${strong.ran.stdout}${strong.ran.stderr}`).toBe(0)
    const [after] = strong.summary?.members ?? []
    expect(after?.counts['Survived']).toBe(0)
    expect(after?.counts['NoCoverage']).toBe(0)
    expect(after?.counts['Killed']).toBeGreaterThan(0)
    // 只有工作树里改的、加的那几份文件，别的什么都没留下。
    expect(
      git(root, 'status', '--short')
        .split('\n')
        .filter(line => line !== '')
        .sort(),
    ).toEqual([
      ' M packages/core/sign/src/sign.ts',
      '?? out-strong/',
      '?? out-weak/',
      '?? packages/core/sign/tests/public.spec.ts',
    ])
  })

  it('只由参数化用例守着的改动行照样被杀：按用例名过滤时不因快层的 preParse 整份滤掉（#405）', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    // 用例名由 it.each 生成，preParse 静态匹配不到；Stryker 逐个变异体按用例名过滤。
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "it.each([[1, true], [0, false], [-1, false]])('isPositive(%i) is %s', (n, want) => { expect(isPositive(n)).toBe(want) })",
      ].join('\n'),
    )
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member?.counts['Survived']).toBe(0)
    expect(member?.counts['Killed']).toBeGreaterThan(0)
  })
})
