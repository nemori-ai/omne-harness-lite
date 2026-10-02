// @module-tag slow
// 归慢层：子进程：在临时 git 仓库里起回路入口 CLI 子进程（严格模式）。
// 严格模式（make check 用的那一档）：另判「开着的传感器都有数据」，要求基线与产物目录，回路目录一个字节都不动。
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readLoopConfig } from '../src/loop/config.ts'
import { runLoopStatus } from '../src/loop/run.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const cli = fileURLToPath(new URL('../src/loop/cli.ts', import.meta.url))
const run = (root: string, home: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--experimental-strip-types', cli, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, OMNE_METRICS_HOME: home },
  })

/**
 * 每个传感器都能有数据的仓库：两个不同组的成员一起提交过、成员里有带断言的测试、有一个产品 topic。
 * 返回基线（成员都在的那个提交）。
 */
function complete(): { root: string; home: string; out: string; base: string } {
  const root = repository()
  write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
  write(root, 'packages/infra/b/src/index.ts', 'export const b = 2\n')
  write(root, 'packages/core/a/tests/a.spec.ts', "it('断言', () => { expect(1).toBe(1) })\n")
  write(root, '.meta_harness/design/product/PF-001-x/README.md', '---\nrevision: 1\n---\n')
  const base = commit(root, 'members')
  return {
    root,
    base,
    home: temporaryDirectory('loop-home-'),
    out: join(temporaryDirectory('loop-out-'), 'status'),
  }
}

const tangled = Array.from(
  { length: 8 },
  (_, n) =>
    `export function tangled${n}(x: number) {\n${Array.from({ length: 14 }, (__, i) => `  if (x === ${i}) return ${i}`).join('\n')}\n  return -1\n}\n`,
).join('\n')

// 每条用例都起 git 与 node 子进程；全量检查满载时单条会超过默认的 5 秒。
describe('严格模式', { timeout: 60_000 }, () => {
  it('全有数据、硬线没破：退出 0；超预算的草稿写进产物目录，回路目录里什么都不写', () => {
    const { root, home, out, base } = complete()
    write(root, 'packages/core/a/src/tangled.ts', tangled)
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('  传感器有数据 是\n')
    expect(result.stdout).toContain('严格模式只读趋势，不写快照')
    expect(existsSync(join(out, 'status.json'))).toBe(true)
    expect(existsSync(join(out, 'proposals', 'packages-core-a.md'))).toBe(true)
    expect(readdirSync(home)).toEqual([])
  })

  it('一个开着的传感器没数据：退出 1，硬线一段点名它和原因', () => {
    const { root, home, out, base } = complete()
    git(root, 'rm', '-q', 'packages/core/a/tests/a.spec.ts')
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(
      '  ✗ 传感器没数据 1 个：sensors.assertions（成员里没有测试文件）',
    )
    expect(result.stdout).toContain('  方向违规 0')
  })

  it('有成员有验收、这个提交却没有验收的耗时记录：验收耗时没数据，退出 1', () => {
    const { root, home, out, base } = complete()
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n  - 'apps/*'\n")
    write(
      root,
      'apps/cli/package.json',
      '{"name":"@x/cli","scripts":{"acceptance":"vitest run --config acceptance/vitest.config.ts"}}\n',
    )
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, '--root', root, '--strict', '--base', base, '--out', out],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          OMNE_METRICS_HOME: home,
          OMNE_ACCEPTANCE_LEDGER_HOME: temporaryDirectory('loop-ledgers-'),
        },
      },
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(
      /✗ 传感器没数据 1 个：sensors\.acceptance（有 1 个成员有验收，这个提交（\w{9}，工作树不干净）却没有跑全它们的耗时记录/u,
    )
    expect(result.stdout).toContain('  验收总耗时（秒） · 没数据：')
  })

  it('没有成员有验收：验收耗时读数是 0 份，算有数据', () => {
    const { root, home, out, base } = complete()
    const result = run(root, home, '--strict', '--base', base, '--out', out)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '  验收总耗时（秒） 0 · 正常 · 不与基线比；0 份：没有成员有 acceptance 脚本',
    )
  })

  it('不是严格模式时这一条不判：同样没数据也退出 0', () => {
    const { root, home, out, base } = complete()
    git(root, 'rm', '-q', 'packages/core/a/tests/a.spec.ts')
    const result = run(root, home, '--base', base, '--out', out)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('  传感器有数据 未判：只在严格模式（STRICT=1）下判')
  })

  it('配置里关掉的传感器不算，照旧写明是关掉的', async () => {
    const { root, home, out, base } = complete()
    rmSync(join(root, 'packages/core/a/tests'), { recursive: true })
    const config = readLoopConfig()
    const result = await runLoopStatus(
      { root, base, out, strict: true, snapshot: false },
      { OMNE_METRICS_HOME: home },
      {
        ...config,
        sensors: {
          ...config.sensors,
          assertions: { ...config.sensors.assertions, enabled: false },
        },
      },
    )
    expect(result.code).toBe(0)
    expect(result.lines).toContain('  传感器有数据 是；配置里关了、不算：sensors.assertions')
  })

  it('没给基线、没给产物目录、要写快照：都是用法错，退出 2，什么都不写', () => {
    const { root, home, out, base } = complete()
    const noBase = run(root, home, '--strict', '--out', out)
    expect(noBase.status).toBe(2)
    expect(noBase.stderr).toContain('严格模式要给基线')
    const noOut = run(root, home, '--strict', '--base', base)
    expect(noOut.status).toBe(2)
    expect(noOut.stderr).toContain('严格模式要给产物目录')
    const snapshot = run(root, home, '--strict', '--base', base, '--out', out, '--snapshot')
    expect(snapshot.status).toBe(2)
    expect(existsSync(out)).toBe(false)
    expect(readdirSync(home)).toEqual([])
  })
})
