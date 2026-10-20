import { describe, expect, it } from 'vitest'
import { REPOSITORY_RULES } from '../src/repository.ts'
import { testTempPhysicalPath } from '../src/rules/test-temp-physical-path.ts'

const SPEC = 'tools/sample/tests/sample.spec.ts'
const check = (text: string, path = SPEC) => testTempPhysicalPath.check([{ path, text }])

describe('test-temp-physical-path', () => {
  it('runs with the repository rules of lint:rules', () => {
    expect(REPOSITORY_RULES).toContain(testTempPhysicalPath)
  })

  it.each([
    "import { mkdtempSync } from 'node:fs'\nconst dir = mkdtempSync(join(tmpdir(), 'x-'))",
    "import * as fs from 'node:fs'\nimport os from 'node:os'\nconst dir = fs.mkdtempSync(join(os.tmpdir(), 'x-'))",
    "import { mkdtemp } from 'node:fs/promises'\nconst dir = await mkdtemp(join(tmpdir(), 'x-'))",
    "import { mkdtempSync as make } from 'node:fs'\nimport { tmpdir as temp } from 'node:os'\nconst dir = make(join(temp(), 'x-'))",
    "const base = tmpdir()\nconst dir = mkdtempSync(join(base, 'x-'))",
    'const dir = mkdtempSync(`${tmpdir()}/x-`)',
    "const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'x-'))",
    "const dir = mkdtempSync(join(process.env['TMPDIR'], 'x-'))",
    // 两段式不算：建出来的原路径仍在作用域里，可能被直接比较。
    "const dir = mkdtempSync(join(tmpdir(), 'x-'))\nconst real = realpathSync(dir)",
  ])('rejects a temporary directory that keeps the symlinked path: %s', text => {
    const violations = check(text)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ rule: 'test-temp-physical-path', path: SPEC })
    expect(violations[0]?.message).toContain('物理路径')
  })

  it('reports the line of each offending call', () => {
    const text = [
      "import { mkdtempSync, realpathSync } from 'node:fs'",
      "const good = realpathSync(mkdtempSync(join(tmpdir(), 'a-')))",
      "const bad = mkdtempSync(join(tmpdir(), 'b-'))",
      '',
      "const worse = mkdtempSync(join(tmpdir(), 'c-'))",
    ].join('\n')
    expect(check(text).map(item => item.line)).toEqual([3, 5])
  })

  it.each([
    "const dir = realpathSync(mkdtempSync(join(tmpdir(), 'x-')))",
    "const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'x-')))",
    "const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'x-')))",
    "import { realpathSync as real } from 'node:fs'\nconst dir = real(mkdtempSync(join(tmpdir(), 'x-')))",
    "const dir = mkdtempSync(join(realpathSync(tmpdir()), 'x-'))",
    "const base = realpathSync(tmpdir())\nconst dir = mkdtempSync(join(base, 'x-'))",
    "const dir = await realpath(await mkdtemp(join(tmpdir(), 'x-')))",
    "const dir = await fsp.realpath(await fsp.mkdtemp(join(tmpdir(), 'x-')))",
    // 不在系统临时目录下：仓库 tmp/ 或调用方给的目录，本规则不管。
    "const dir = mkdtempSync(join(root, 'tmp', 'x-'))",
    'function make(base: string) { return mkdtempSync(join(base, "x-")) }',
  ])('accepts a physical path or a base outside the system temporary directory: %s', text => {
    expect(check(text)).toEqual([])
  })

  it.each([
    'tools/sample/tests/fixtures/repository.ts',
    'apps/cli/tests/support/process.ts',
    'packages/group/member/verification/process.test.ts',
    'packages/group/member/src/clock.spec.ts',
    'tools/sample/tests/sample.spec.mts',
  ])('scans test code and fixtures at %s', path => {
    expect(check("const dir = mkdtempSync(join(tmpdir(), 'x-'))", path)).toHaveLength(1)
  })

  it.each([
    'tools/sample/src/index.ts',
    'apps/cli/tools/package.ts',
    'tools/sample/tests/sample.test.mjs',
    'scripts/sample/tests/sample.spec.ts',
    'examples/demo/tests/sample.spec.ts',
    'docs/verification.md',
  ])('does not scan %s', path => {
    expect(check("const dir = mkdtempSync(join(tmpdir(), 'x-'))", path)).toEqual([])
  })
})
