// @module-tag slow
// omne-deps 的具名组环例外：runner 与被检树分开的临时仓库上真实跑 dependency-cruiser（起子进程），所以归慢层。
// 覆盖完全匹配放行并写说明行、分量更大照常失败、没命中的例外失败、成员环不受影响、被检树自带的例外不生效。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { removeTemporaries, write } from './fixtures/loop-canary/repository.ts'
import { CONSTRAINTS, CONTEXT_TOOL, RULING, policy, runner, tree } from './fixtures/group-cycle.ts'

afterEach(removeTemporaries)

const CLI = fileURLToPath(new URL('../src/deps/cli.ts', import.meta.url))

function deps(root: string, runnerRoot: string) {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: runnerRoot, NO_COLOR: '1' },
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}
const errors = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('  error '))

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
