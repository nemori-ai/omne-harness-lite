// @module-tag slow
// 归慢层：每条用例在临时 git 仓库里建提交，并对 BASE 跑一次实际架构抽取（建 TypeScript 程序）。
// 收工钩子 BASE 一侧架构观测的缓存：命中给同样的读数、不重算；换提交、换配置段、换检查器代码各自重算；
// 坏文件按未命中；读出来的坐标换成当前的根。
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CONSTRAINT_PATH } from '../src/arch/constraints.ts'
import {
  BASELINE_DIRECTORY,
  baselineKey,
  cachedBaselineReader,
  toolDigest,
} from '../src/loop/baseline-cache.ts'
import { timeoutMessage } from '../src/loop/hook-process.ts'
import {
  observeBaselineAt,
  readArchitectureSensors,
  type BaselineReader,
} from '../src/loop/sensors/conformance.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const member = 'packages/core/example'
const source = `${member}/src/plugin.ts`
const prefix = "import {Context} from '@deepseek-ai/cordis';\n"
const ON = { enabled: true }

/** 一个成员、一份架构预期的仓库，提交一次作 BASE；之后在工作树里改。 */
function workspace() {
  const root = repository()
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
  write(
    root,
    `${member}/package.json`,
    JSON.stringify({ name: '@example/example', exports: { '.': './dist/index.js' } }),
  )
  write(
    root,
    CONSTRAINT_PATH,
    JSON.stringify({ schemaVersion: 1, domains: [], roles: [], rules: [] }),
  )
  write(
    root,
    source,
    `${prefix}export const p={name:'p',apply(ctx:Context){ctx.provide('svc',{})}}`,
  )
  const base = commit(root, 'base')
  write(root, source, `${prefix}export const p={name:'p',inject:['dep'],apply(ctx:Context){}}`)
  return { root, base, home: temporaryDirectory('loop-baseline-home-') }
}

/** 数重算次数的 BASE 读取器。 */
function counting() {
  const computed: string[] = []
  const compute: BaselineReader = (root, base) => {
    computed.push(base)
    return observeBaselineAt(root, base)
  }
  return { computed, compute }
}

describe('BASE 一侧架构观测的缓存', { timeout: 60_000 }, () => {
  it('命中：不重算，读数与不缓存时相同；只在没命中、存下之后报一次「已备好」', () => {
    const { root, base, home } = workspace()
    const { computed, compute } = counting()
    const prepared: string[] = []
    const options = { tool: 't1', compute, onPrepared: (at: string) => prepared.push(at) }
    const first = readArchitectureSensors(
      root,
      ON,
      base,
      undefined,
      cachedBaselineReader(home, ON, options),
    )
    const second = readArchitectureSensors(
      root,
      ON,
      base,
      undefined,
      cachedBaselineReader(home, ON, options),
    )
    expect(computed).toEqual([base])
    expect(prepared).toEqual([base])
    const direct = readArchitectureSensors(root, ON, base)
    expect(second).toEqual(direct)
    expect(first).toEqual(direct)
    expect(direct.assemblyDelta.status).toBe('data')
  })

  it('同一个读取器里同一提交只读一次；给的是分支名也按它指向的提交存', () => {
    const { root, base, home } = workspace()
    const { computed, compute } = counting()
    const read = cachedBaselineReader(home, ON, { tool: 't1', compute })
    git(root, 'branch', 'at-base', base)
    expect(read(root, 'at-base')).toEqual(read(root, base))
    expect(computed).toEqual([base])
    expect(readdirSync(join(home, BASELINE_DIRECTORY))).toEqual([
      `${baselineKey({ commit: base, architecture: ON, tool: 't1' })}.json`,
    ])
  })

  it('换提交：重算', () => {
    const { root, base, home } = workspace()
    const { computed, compute } = counting()
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, base)
    const next = commit(root, 'next')
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, next)
    expect(computed).toEqual([base, next])
  })

  it('换配置里 sensors.architecture 那一段：重算', () => {
    const { root, base, home } = workspace()
    const { computed, compute } = counting()
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, base)
    cachedBaselineReader(home, { enabled: true, extra: 1 }, { tool: 't1', compute })(root, base)
    expect(computed).toEqual([base, base])
  })

  it('换检查器代码：重算', () => {
    const { root, base, home } = workspace()
    const { computed, compute } = counting()
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, base)
    cachedBaselineReader(home, ON, { tool: 't2', compute })(root, base)
    expect(computed).toEqual([base, base])
  })

  it('缓存文件坏了或键对不上：按未命中重算并覆盖', () => {
    const { root, base, home } = workspace()
    const { computed, compute } = counting()
    const key = baselineKey({ commit: base, architecture: ON, tool: 't1' })
    mkdirSync(join(home, BASELINE_DIRECTORY), { recursive: true })
    const path = join(home, BASELINE_DIRECTORY, `${key}.json`)
    writeFileSync(path, '{not json')
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, base)
    // 形状完整、只是记的键不是这一个（例如哈希撞了或被手工拷过来）：同样不认。
    const stored = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    writeFileSync(path, JSON.stringify({ ...stored, key: 'other' }))
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, base)
    // 重算后覆盖了那份：再读就命中。
    cachedBaselineReader(home, ON, { tool: 't1', compute })(root, base)
    expect(computed).toEqual([base, base])
  })

  it('另一棵工作树读同一份：BASE 坐标的根换成读它的那棵', () => {
    const { root, base, home } = workspace()
    cachedBaselineReader(home, ON, { tool: 't1' })(root, base)
    const other = join(temporaryDirectory('loop-baseline-tree-'), 'tree')
    git(root, 'worktree', 'add', '-q', other, base)
    const { computed, compute } = counting()
    const read = cachedBaselineReader(home, ON, { tool: 't1', compute })(other, base)
    expect(computed).toEqual([])
    expect(read?.constraints.source.root).toBe(other)
    expect(read).toEqual(observeBaselineAt(other, base))
  })

  it('BASE 里没有 workspace：没有观测，也不存', () => {
    const root = repository()
    write(root, 'README.md', 'bare\n')
    const base = commit(root, 'bare')
    const home = temporaryDirectory('loop-baseline-home-')
    expect(cachedBaselineReader(home, ON, { tool: 't1' })(root, base)).toBeUndefined()
    expect(readdirSync(home)).toEqual([])
  })
})

describe('检查器代码的摘要', () => {
  it('代码目录里任何一个文件的内容或路径变了，摘要就变', () => {
    const code = temporaryDirectory('loop-baseline-code-')
    write(code, 'arch/a.ts', 'export const a = 1\n')
    const before = toolDigest(code)
    expect(toolDigest(code)).toBe(before)
    write(code, 'arch/a.ts', 'export const a = 2\n')
    const edited = toolDigest(code)
    expect(edited).not.toBe(before)
    write(code, 'loop/b.ts', '\n')
    expect(toolDigest(code)).not.toBe(edited)
  })
})

describe('超时的说明', () => {
  it('这次备好了基线就说下次不再重算；没备就只说放弃', () => {
    expect(timeoutMessage(40_000, undefined)).toBe('量读数超过 40 秒，已放弃')
    expect(timeoutMessage(40_000, '0123456789abcdef')).toBe(
      '量读数超过 40 秒，已放弃；基线 012345678 的架构读数这次已备好存下，下次收工不再重算',
    )
  })
})
