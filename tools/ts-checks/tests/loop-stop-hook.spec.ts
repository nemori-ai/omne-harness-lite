// 收工钩子的入口与量读数的线程：临时 git 仓库，子进程跑脚本、喂标准输入。
// 钉住的是宿主看得到的东西：退出码永远是 0，标准输出要么空、要么恰好一个只有 decision 与 reason 的 JSON 对象。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { measureInWorker } from '../src/loop/hook-thread.ts'
import {
  commit,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const script = fileURLToPath(new URL('../src/loop/stop-hook.ts', import.meta.url))
const hook = (cwd: string, home: string, input: string) =>
  spawnSync(process.execPath, ['--experimental-strip-types', script], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, OMNE_METRICS_HOME: home },
  })

const tangled = `export function tangled(x: number): number {\n${Array.from(
  { length: 14 },
  (_, i) => `  if (x === ${i}) return ${i}`,
).join('\n')}\n  return -1\n}\n`

/** 主线上有一个成员；之后在工作分支上改。 */
function work(): { root: string; home: string } {
  const root = repository()
  write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
  commit(root, 'member')
  spawnSync('git', ['checkout', '-q', '-b', 'someone/work'], { cwd: root })
  return { root, home: temporaryDirectory('loop-hook-home-') }
}

const input = (cwd: string, active = false) =>
  JSON.stringify({ hook_event_name: 'SubagentStop', stop_hook_active: active, cwd })

const logLines = (home: string) =>
  existsSync(join(home, 'hook.log'))
    ? readFileSync(join(home, 'hook.log'), 'utf8').split('\n').filter(Boolean)
    : []

// 每条用例都起 node 与 git 子进程；全量检查满载时单条会超过默认的 5 秒。
describe('收工钩子的入口', { timeout: 60_000 }, () => {
  it('坏 JSON、输入的 cwd 不在 git 仓库里：退出 0，标准输出为空（进程所在的仓库明明有红项）', () => {
    const { root, home } = work()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const bad = hook(root, home, '{not json')
    expect(bad.status).toBe(0)
    expect(bad.stdout).toBe('')
    const outside = temporaryDirectory('loop-hook-outside-')
    const nowhere = hook(root, home, input(outside))
    expect(nowhere.status).toBe(0)
    expect(nowhere.stdout).toBe('')
    expect(hook(root, home, input(root)).stdout).not.toBe('')
  })

  it('种一个超 alert 的函数：恰好一个只有 decision、reason 的 JSON 对象；再跑一次为空；续跑中为空', () => {
    const { root, home } = work()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const first = hook(root, home, input(root))
    expect(first.status).toBe(0)
    const parsed = JSON.parse(first.stdout) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['decision', 'reason'])
    expect(parsed['decision']).toBe('block')
    expect(parsed['reason']).toContain(
      '- 超过 alert 的函数：packages/core/a/src/tangled.ts:1 tangled 圈复杂度 15（alert 12）',
    )
    const again = hook(root, home, input(root))
    expect(again.status).toBe(0)
    expect(again.stdout).toBe('')
    const active = hook(root, home, input(root, true))
    expect(active.stdout).toBe('')
    expect(JSON.parse(readFileSync(join(home, 'hook-state.json'), 'utf8'))).toMatchObject({
      reported: [{ branch: 'someone/work' }],
    })
  })

  it('存量超线的函数：改一行不加分支不反馈；加一个分支才反馈，带「原 N」', () => {
    const root = repository()
    const path = 'packages/core/a/src/tangled.ts'
    write(root, path, tangled)
    commit(root, 'member')
    spawnSync('git', ['checkout', '-q', '-b', 'someone/work'], { cwd: root })
    const home = temporaryDirectory('loop-hook-home-')
    write(root, path, tangled.replace('return -1', 'return -2'))
    const quiet = hook(root, home, input(root))
    expect(quiet.status).toBe(0)
    expect(quiet.stdout).toBe('')
    write(root, path, tangled.replace('  return -1', '  if (x === 99) return 99\n  return -1'))
    const loud = hook(root, home, input(root))
    expect(loud.status).toBe(0)
    expect((JSON.parse(loud.stdout) as { reason: string }).reason).toContain(
      `- 超过 alert 的函数：${path}:1 tangled 圈复杂度 16（alert 12），原 15\n`,
    )
  })

  it('改的不是产品源码（测试目录、examples、仓库根）：放行', () => {
    const { root, home } = work()
    write(root, 'packages/core/a/tests/tangled.spec.ts', tangled)
    write(root, 'examples/demo/src/tangled.ts', tangled)
    write(root, 'notes.ts', tangled)
    const result = hook(root, home, input(root))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('度量自己坏了（成员源码里一个指向不存在文件的链接）：退出 0、输出为空、日志多一行', () => {
    const { root, home } = work()
    symlinkSync(join(root, 'missing.ts'), join(root, 'packages/core/a/src/broken.ts'))
    const before = logLines(home).length
    const result = hook(root, home, input(root))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    const lines = logLines(home)
    expect(lines).toHaveLength(before + 1)
    expect(lines[0]).toContain(root)
  })
})

describe('量读数的线程', { timeout: 60_000 }, () => {
  it('没碰产品源码给 undefined；碰了给读数；超过时限以超时拒绝', async () => {
    const { root } = work()
    expect(await measureInWorker(root, 'main', 30_000)).toBeUndefined()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const readings = await measureInWorker(root, 'main', 30_000)
    expect(readings?.explain.functions.map(row => [row.name, row.level])).toEqual([
      ['tangled', 'alert'],
    ])
    await expect(measureInWorker(root, 'main', 1)).rejects.toThrow('量读数超过 0.001 秒，已放弃')
  })
})
