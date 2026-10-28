// @module-tag slow
// omne-deps 的具名组环例外：runner 与被检树分开的临时仓库上真实跑 dependency-cruiser（起子进程），所以归慢层。
// 覆盖完全匹配放行并写说明行、分量更大照常失败、没命中的例外失败、成员环不受影响、被检树自带的例外不生效。
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const CLI = fileURLToPath(new URL('../src/deps/cli.ts', import.meta.url))
const CONSTRAINTS = 'docs/architecture/constraints.json'
const PRESET = `module.exports = require(${JSON.stringify(join(REPOSITORY_ROOT, 'node_modules/@omne-harness/repo-config/dependency-cruiser.cjs'))})\n`
const RULING = 'https://github.com/nemori-ai/omne-harness-lite/issues/675#issuecomment-6480475331'

const policy = (exceptions: readonly { id: string; groups: readonly string[] }[]) =>
  JSON.stringify({
    schemaVersion: 3,
    domains: [],
    roles: [],
    rules: [],
    groupCycleExceptions: exceptions.map(row => ({
      ...row,
      ruling: RULING,
      reason: '上下文组装感知工具',
    })),
  })

/** 可信 runner：本仓库安装的预设、最小解析配置；`exceptions` 为 null 时没有 constraints.json。 */
function runner(exceptions: readonly { id: string; groups: readonly string[] }[] | null): string {
  const root = temporaryDirectory('omne-group-cycle-runner-')
  write(root, '.dependency-cruiser.cjs', PRESET)
  // TypeScript 不接受没有输入文件的配置，所以列一个空文件。
  write(root, 'stub.ts', 'export {}\n')
  write(root, 'tsconfig.base.json', JSON.stringify({ files: ['stub.ts'] }))
  if (exceptions !== null) write(root, CONSTRAINTS, policy(exceptions))
  return root
}

const source = (imports: readonly string[]) =>
  `${imports.map((path, index) => `import { v as v${index} } from '${path}'`).join('\n')}\nexport const v = ${imports.length === 0 ? '1' : imports.map((_, index) => `v${index}`).join(' + ')}\n`

/**
 * 被检树：组 context 的 x → 组 tool 的 y → 组 context 的 z，组成环、成员不成环。
 * `wider` 再让 y → 组 agent 的 w → z，分量变成三个组；`memberCycle` 让 y 改为导入 x 的另一个文件，
 * 成员也成环，文件不成环。
 */
function tree(options: { wider?: boolean; memberCycle?: boolean } = {}): string {
  const root = repository()
  write(root, 'tsconfig.base.json', '{}\n')
  write(root, 'packages/context/x/src/index.ts', source(['../../../tool/y/src/index.ts']))
  write(
    root,
    'packages/tool/y/src/index.ts',
    source([
      options.memberCycle === true
        ? '../../../context/x/src/leaf.ts'
        : '../../../context/z/src/index.ts',
      ...(options.wider === true ? ['../../../agent/w/src/index.ts'] : []),
    ]),
  )
  write(root, 'packages/context/z/src/index.ts', source([]))
  write(root, 'packages/context/x/src/leaf.ts', source([]))
  if (options.wider === true)
    write(root, 'packages/agent/w/src/index.ts', source(['../../../context/z/src/index.ts']))
  return root
}

function deps(root: string, runnerRoot: string) {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: runnerRoot, NO_COLOR: '1' },
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}
const errors = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('  error '))
const CONTEXT_TOOL = { id: 'GCX-CONTEXT-TOOL', groups: ['packages/tool', 'packages/context'] }

describe('omne-deps 的具名组环例外', { timeout: 120_000 }, () => {
  it('对照：没有例外时组环失败', () => {
    const run = deps(tree(), runner(null))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('组之间成环：packages/context、packages/tool'),
    ])
  })

  it('组集合完全相同的组环不失败，写一行说明命中的例外与裁定链接', () => {
    const run = deps(tree(), runner([CONTEXT_TOOL]))
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(errors(run.stdout)).toEqual([])
    expect(run.stdout).toContain(
      `  excepted 组环 packages/context、packages/tool 按例外 GCX-CONTEXT-TOOL 放行（裁定 ${RULING}）`,
    )
    expect(run.stdout).toContain('1 个组环按具名例外放行')
  })

  it('分量比例外大时照常失败，例外也算没命中', () => {
    const run = deps(tree({ wider: true }), runner([CONTEXT_TOOL]))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('组之间成环：packages/agent、packages/context、packages/tool'),
      expect.stringContaining('组环例外 GCX-CONTEXT-TOOL 没有命中任何组环'),
    ])
    expect(run.stdout).not.toContain('excepted')
  })

  it('登记了却没有命中任何组环的例外失败，命中的那条照常放行', () => {
    const stale = { id: 'GCX-STALE', groups: ['packages/context', 'packages/session'] }
    const run = deps(tree(), runner([CONTEXT_TOOL, stale]))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining(
        `组环例外 GCX-STALE 没有命中任何组环：packages/context、packages/session（裁定 ${RULING}）`,
      ),
    ])
    expect(run.stdout).toContain('按例外 GCX-CONTEXT-TOOL 放行')
  })

  it('成员之间的环不受例外影响，组环本身仍按例外放行', () => {
    const run = deps(tree({ memberCycle: true }), runner([CONTEXT_TOOL]))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('成员之间成环：packages/context/x、packages/tool/y'),
    ])
    expect(run.stdout).toContain('按例外 GCX-CONTEXT-TOOL 放行')
  })

  it('例外只从 runner 读：被检树自己的 constraints.json 登记例外不生效', () => {
    const checked = tree()
    write(checked, CONSTRAINTS, policy([CONTEXT_TOOL]))
    for (const trusted of [runner(null), runner([])]) {
      const run = deps(checked, trusted)
      expect(run.status).toBe(1)
      expect(errors(run.stdout)).toEqual([
        expect.stringContaining('组之间成环：packages/context、packages/tool'),
      ])
    }
  })

  it('runner 的例外坏了时退出 2', () => {
    const trusted = runner(null)
    write(
      trusted,
      CONSTRAINTS,
      JSON.stringify({
        schemaVersion: 3,
        domains: [],
        roles: [],
        rules: [],
        groupCycleExceptions: [{ ...CONTEXT_TOOL, ruling: 'not a link', reason: 'x' }],
      }),
    )
    const run = deps(tree(), trusted)
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('https ruling link')
  })
})
