// @module-tag slow
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { BASELINE_DIRECTORY } from '../src/loop/baseline-cache.ts'
import { resultOf } from '../src/loop/hook-job.ts'
import { measureInChild, measureInProcess } from '../src/loop/hook-process.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const script = fileURLToPath(new URL('../src/loop/stop-hook.ts', import.meta.url))
const runner = fileURLToPath(new URL('../../../', import.meta.url))
const hook = (cwd: string, home: string, input: string) =>
  spawnSync(process.execPath, ['--experimental-strip-types', script], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, OMNE_METRICS_HOME: home, OMNE_RUNNER_ROOT: runner },
  })

const tangled = `export function tangled(x: number): number {\n${Array.from(
  { length: 14 },
  (_, i) => `  if (x === ${i}) return ${i}`,
).join('\n')}\n  return -1\n}\n`

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

  it(
    '种一个超 alert 的函数：恰好一个只有 decision、reason 的 JSON 对象；再跑一次为空；续跑中为空',
    { tags: ['slow'] },
    () => {
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
      expect(JSON.parse(readFileSync(join(home, 'hook-readings.json'), 'utf8'))).toMatchObject({
        readings: [{ branch: 'someone/work', findings: [{ amount: 15 }] }],
      })
    },
  )

  it(
    '存量超线的函数：改一行不加分支不反馈；加一个分支才反馈，带「原 N」',
    { tags: ['slow'] },
    () => {
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
    },
  )

  it('没给 OMNE_RUNNER_ROOT、跑的脚本又不在被量的仓库里：不量，退出 0，只给用户一句「量不了」', () => {
    const { root, home } = work()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const env: NodeJS.ProcessEnv = { ...process.env, OMNE_METRICS_HOME: home }
    delete env['OMNE_RUNNER_ROOT']
    const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
      cwd: root,
      input: input(root),
      encoding: 'utf8',
      env,
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['systemMessage'])
    expect(parsed['systemMessage']).toContain('量不了')
    expect(parsed['systemMessage']).not.toContain('tangled')
    expect(existsSync(join(home, 'hook-readings.json'))).toBe(false)
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

  it('linked worktree sync advances the baseline and keeps its own new findings', () => {
    const main = repository()
    write(main, 'packages/core/a/src/index.ts', 'export const a = 1\n')
    commit(main, 'member')
    const root = temporaryDirectory('loop-hook-worktree-')
    git(main, 'worktree', 'add', '-q', '-b', 'someone/sync', root)
    const home = temporaryDirectory('loop-hook-home-')
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    commit(root, 'own change')
    write(main, 'packages/core/a/src/from-main.ts', tangled.replaceAll('tangled', 'fromMain'))
    const updated = commit(main, 'main advances')
    git(root, 'merge', '--no-edit', 'main')
    expect(git(root, 'merge-base', 'main', 'HEAD')).toBe(updated)
    const result = hook(main, home, input(root))
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout) as { decision: string; reason: string }
    expect(output.decision).toBe('block')
    expect(output.reason).toContain('tangled')
    expect(output.reason).not.toContain('fromMain')
    expect(hook(main, home, input(root)).stdout).toBe('')
    expect(hook(main, home, input(root, true)).stdout).toBe('')
  })

  it('度量自己坏了（成员源码里一个指向不存在文件的链接）：退出 0、只给用户一句警告、日志多一行', () => {
    const { root, home } = work()
    symlinkSync(join(root, 'missing.ts'), join(root, 'packages/core/a/src/broken.ts'))
    const before = logLines(home).length
    const result = hook(root, home, input(root))
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['systemMessage'])
    expect(parsed['systemMessage']).toContain('收工钩子没能量出这次变更的结构读数')
    expect(parsed['systemMessage']).toContain(`${home}/hook.log`)
    const lines = logLines(home)
    expect(lines).toHaveLength(before + 1)
    expect(lines[0]).toContain(git(root, 'rev-parse', '--show-toplevel'))
  })
})

describe('量读数的子进程', { tags: ['slow'] }, () => {
  it('没碰产品源码给 undefined；碰了给读数；超过时限以超时拒绝', async () => {
    const { root, home } = work()
    expect(await measureInChild(root, 'main', 30_000, home)).toBeUndefined()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const readings = await measureInChild(root, 'main', 30_000, home)
    expect(readings?.explain.functions.map(row => [row.name, row.level])).toEqual([
      ['tangled', 'alert'],
    ])
    await expect(measureInChild(root, 'main', 1, home)).rejects.toThrow(
      '量读数超过 0.001 秒，已放弃',
    )
  })

  it('resultOf：没碰产品源码不报；碰了给读数，基线读数这次现算才报「已备好」，第二次读缓存不报', () => {
    const { root, home } = work()
    const job = { root, primaryBranch: 'main', home }
    const prepared: string[] = []
    expect(resultOf(job, commit => prepared.push(commit))).toEqual({
      kind: 'result',
      touched: false,
    })
    expect(prepared).toEqual([])
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const first = resultOf(job, commit => prepared.push(commit))
    if (!first.touched) throw new Error('应当量了读数')
    expect(first.readings.explain.functions.map(row => [row.name, row.level])).toEqual([
      ['tangled', 'alert'],
    ])
    expect(prepared).toEqual([git(root, 'rev-parse', 'main')])
    prepared.length = 0
    const second = resultOf(job, commit => prepared.push(commit))
    expect(second.touched).toBe(true)
    expect(prepared).toEqual([])
  })

  it('resultOf：只有架构观测的基线这次现算（依赖图的基线仍在缓存里）也报「已备好」', () => {
    const root = repository()
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n")
    write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
    commit(root, 'member')
    spawnSync('git', ['checkout', '-q', '-b', 'someone/work'], { cwd: root })
    const home = temporaryDirectory('loop-hook-home-')
    const job = { root, primaryBranch: 'main', home }
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const prepared: string[] = []
    resultOf(job, commit => prepared.push(commit))
    expect(prepared).toEqual([git(root, 'rev-parse', 'main')])
    prepared.length = 0
    resultOf(job, commit => prepared.push(commit))
    expect(prepared).toEqual([])
    rmSync(join(home, BASELINE_DIRECTORY), { recursive: true, force: true })
    resultOf(job, commit => prepared.push(commit))
    expect(prepared).toEqual([git(root, 'rev-parse', 'main')])
  })

  it.skipIf(process.platform === 'win32')(
    '卡在同步子进程里也按时限拒绝，它起的进程一起结束；先报过「已备好」的写进超时说明',
    async () => {
      const dir = temporaryDirectory('loop-hook-child-')
      const pidFile = join(dir, 'pid')
      const stand = join(dir, 'stand-in.mjs')
      writeFileSync(
        stand,
        [
          "import { spawn, spawnSync } from 'node:child_process'",
          "import { writeFileSync } from 'node:fs'",
          "process.send({ kind: 'prepared', commit: '0123456789abcdef' })",
          "const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' })",
          `writeFileSync(${JSON.stringify(pidFile)}, String(sleeper.pid))`,
          "spawnSync('sleep', ['30'])",
        ].join('\n'),
      )
      const started = Date.now()
      await expect(measureInProcess(stand, {}, 1500)).rejects.toThrow(
        '量读数超过 1.5 秒，已放弃；基线 012345678 的读数这次已备好存下，下次收工不再重算',
      )
      expect(Date.now() - started).toBeLessThan(10_000)
      const sleeper = Number(readFileSync(pidFile, 'utf8'))
      await expect
        .poll(() => {
          try {
            process.kill(sleeper, 0)
            return 'alive'
          } catch {
            return 'gone'
          }
        })
        .toBe('gone')
    },
  )

  it('子进程没给结果就退出：拒绝，原因带它的错误输出', async () => {
    const dir = temporaryDirectory('loop-hook-child-')
    const stand = join(dir, 'crash.mjs')
    writeFileSync(stand, "process.stderr.write('boom from child\\n'); process.exit(3)\n")
    await expect(measureInProcess(stand, {}, 30_000)).rejects.toThrow(
      '量读数的子进程没给结果就退出了（3）：boom from child',
    )
  })
})
