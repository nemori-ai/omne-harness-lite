// @module-tag slow
// omne-deps 的具名组环例外：runner 与被检树分开的临时仓库上真实跑 dependency-cruiser（起子进程），所以归慢层。
// 覆盖按成员边放行并写说明行、登记不全照常失败、登记的边没用上失败、成员环不受影响、被检树自带的例外不生效。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { removeTemporaries, write } from './fixtures/loop-canary/repository.ts'
import {
  CONSTRAINTS,
  CONTEXT_TOOL,
  Q,
  RULING,
  S,
  W,
  X,
  X_TO_Y,
  Y,
  Z,
  policy,
  runner,
  tree,
} from './fixtures/group-cycle.ts'

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
const only = (...edges: readonly { from: string; to: string }[]) => [{ id: 'GCX-ONE', edges }]

describe('omne-deps 的具名组环例外', { timeout: 120_000 }, () => {
  it('对照：没有例外时组环失败', () => {
    const run = deps(tree(), runner(null))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('组之间成环：packages/context、packages/tool'),
    ])
  })

  it('登记了 context ↔ tool 的两条成员边：去掉后不再成环就放行，写一行说明例外、裁定与边', () => {
    const run = deps(tree(), runner([CONTEXT_TOOL]))
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(errors(run.stdout)).toEqual([])
    expect(run.stdout).toContain(
      `  excepted 组环 packages/context、packages/tool 按例外 GCX-CONTEXT-TOOL（裁定 ${RULING}）放行 ${X} → ${Y}、${Y} → ${Z}`,
    )
    expect(run.stdout).toContain('1 个组环按具名例外放行')
  })

  it('只登记 context → tool 这一条边：去掉后 context 到 tool 没有别的边，组环断开，放行', () => {
    const run = deps(tree(), runner(only(X_TO_Y)))
    expect(run.status).toBe(0)
    expect(errors(run.stdout)).toEqual([])
    expect(run.stdout).toContain(`放行 ${X} → ${Y}：`)
  })

  it('context → tool 另有一条成员边而只登记一条：照常失败，以后新增的边不被放过', () => {
    const run = deps(tree({ twoEdges: true }), runner(only(X_TO_Y)))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('组之间成环：packages/context、packages/tool'),
    ])
    expect(run.stdout).not.toContain('excepted')
    // 两条都登记才放行。
    expect(deps(tree({ twoEdges: true }), runner(only(X_TO_Y, { from: Q, to: Y }))).status).toBe(0)
  })

  it('三个组 context → tool → agent → context：登记 agent → context 一条边即放行', () => {
    const edge = { from: W, to: Z }
    const run = deps(tree({ ring: true }), runner(only(edge)))
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('组环 packages/agent、packages/context、packages/tool')
    expect(run.stdout).toContain(`放行 ${W} → ${Z}`)
  })

  it('登记的边不在图里：例外失败，写明这条边与裁定链接，组环照常失败', () => {
    const ghost = { from: 'packages/context/ghost', to: Y }
    const run = deps(tree(), runner(only(ghost)))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('组之间成环：packages/context、packages/tool'),
      expect.stringContaining(
        `组环例外 GCX-ONE 登记的边没有出现在任何组环里：packages/context/ghost → ${Y}（裁定 ${RULING}）`,
      ),
    ])
  })

  it('登记的边在图里但不在任何组环里：失败；组环消失后残留的例外也失败', () => {
    const off = deps(tree({ extraEdge: true }), runner([CONTEXT_TOOL, ...only({ from: S, to: Y })]))
    expect(off.status).toBe(1)
    expect(errors(off.stdout)).toEqual([
      expect.stringContaining(`登记的边没有出现在任何组环里：${S} → ${Y}`),
    ])
    expect(off.stdout).toContain('按例外 GCX-CONTEXT-TOOL')
    const gone = deps(tree({ broken: true }), runner([CONTEXT_TOOL]))
    expect(gone.status).toBe(1)
    expect(errors(gone.stdout)).toEqual([
      expect.stringContaining('组环例外 GCX-CONTEXT-TOOL 登记的边没有出现在任何组环里'),
    ])
  })

  it('成员之间的环不受例外影响，组环本身仍按例外放行', () => {
    const run = deps(tree({ memberCycle: true }), runner(only(X_TO_Y)))
    expect(run.status).toBe(1)
    expect(errors(run.stdout)).toEqual([
      expect.stringContaining('成员之间成环：packages/context/x、packages/tool/y'),
    ])
    expect(run.stdout).toContain('按例外 GCX-ONE')
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
