// @module-tag slow
// 环的判定：成员之间成环让 `omne-deps` 退出 1；只在组的层面成环、成员之间不成环，不是发现，退出 0。
// 约束文件 schema 3 不认识登记组层面例外的字段。归慢层：临时仓库上起子进程真跑 dependency-cruiser。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseConstraints } from '../src/arch/constraints.ts'
import { removeTemporaries, repository, write } from './fixtures/loop-canary/repository.ts'
import { runner } from './fixtures/runner.ts'

afterEach(removeTemporaries)

const CLI = fileURLToPath(new URL('../src/deps/cli.ts', import.meta.url))

const source = (imports: readonly string[]) =>
  `${imports.map((path, index) => `import { v as v${index} } from '${path}'`).join('\n')}\nexport const v = ${imports.length === 0 ? '1' : imports.map((_, index) => `v${index}`).join(' + ')}\n`

/** 组 context 的 x → 组 tool 的 y → `yImports`；z 与 w 在组 context，不导入别人。 */
function subject(yImports: readonly string[]): string {
  const root = repository()
  write(root, '.gitignore', 'node_modules/\n')
  write(root, 'tsconfig.base.json', '{}\n')
  write(root, 'packages/context/x/src/index.ts', source(['../../../tool/y/src/index.ts']))
  write(root, 'packages/tool/y/src/index.ts', source(yImports))
  write(root, 'packages/context/z/src/index.ts', source([]))
  write(root, 'packages/context/x/src/leaf.ts', source([]))
  return root
}

function deps(root: string) {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--root', root], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OMNE_SUBJECT_ROOT: root,
      OMNE_RUNNER_ROOT: runner(),
      OMNE_DEP_GRAPH_CACHE: '0',
    },
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

describe('omne-deps 只把成员之间成环当失败', { timeout: 120_000 }, () => {
  it('两个成员互相依赖：报成员环，退出 1', () => {
    const run = deps(subject(['../../../context/x/src/leaf.ts']))
    expect(run.stderr).toBe('')
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('成员之间成环：packages/context/x、packages/tool/y')
  })

  it('组 context 与组 tool 成环、成员之间不成环：没有发现，退出 0', () => {
    const run = deps(subject(['../../../context/z/src/index.ts']))
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).not.toContain('成环')
    expect(run.stdout).toContain(
      '✔ 没有依赖违规、方向命中，也没有成员之间的环（3 个成员、2 条成员边）',
    )
  })
})

describe('约束文件', () => {
  it('schema 3 带 groupCycleExceptions：按不认识的字段拒绝', () => {
    const text = JSON.stringify({
      schemaVersion: 3,
      domains: [],
      roles: [],
      rules: [],
      groupCycleExceptions: [],
    })
    expect(() => parseConstraints(text)).toThrow('unknown fields: groupCycleExceptions')
  })
})
