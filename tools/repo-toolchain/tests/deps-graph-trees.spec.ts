// 基线图的临时树：被强行结束的运行留下的旧树在下一次开始时清掉，活着的进程的树与缓存文件不动。
// 真起 dependency-cruiser 的那一段（revisionGraph 跑完不留树、开始时清旧树）在 deps-graph.spec.ts（慢层）。
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { STALE_TREE_GRACE_MS, processAlive, sweepStaleTrees } from '../src/deps/graph.ts'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})

const COMMIT = '4774fe755c49392d1f5a859f8e980ae7ca287d28'
const NOW = Date.parse('2026-10-30T12:00:00Z')
const OLD = (NOW - STALE_TREE_GRACE_MS - 60_000) / 1000
const FRESH = (NOW - 60_000) / 1000

/** git 公共目录下的 omne-dep-graph；旁边的 `outside` 是树外的东西。 */
function cache(): string {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-dep-graph-')))
  made.push(home)
  mkdirSync(join(home, 'outside'))
  writeFileSync(join(home, 'outside', 'keep.txt'), 'keep')
  const directory = join(home, 'omne-dep-graph')
  mkdirSync(directory)
  return directory
}

/**
 * 一棵像 linkWorkspace 建的树：成员源码，加 node_modules 下指向成员的目录链接；另有一条链接指到树外的
 * `outside`，删树时只能删链接，不能顺着它删到外面。目录时间设成 `seconds`。
 */
function tree(directory: string, name: string, seconds: number): void {
  const root = join(directory, name)
  mkdirSync(join(root, 'packages/model/a/src'), { recursive: true })
  writeFileSync(join(root, 'packages/model/a/src/index.ts'), 'export const a = 1')
  mkdirSync(join(root, 'node_modules/@omne-harness'), { recursive: true })
  symlinkSync(join(root, 'packages/model/a'), join(root, 'node_modules/@omne-harness/a'), 'dir')
  symlinkSync(join(directory, '..', 'outside'), join(root, 'node_modules/outside'), 'dir')
  utimesSync(root, seconds, seconds)
}

describe('旧的基线图临时树', () => {
  it('进程已不在且过了宽限期的才删；活着的、刚建的、别的文件都不动，链接指到的树外内容也不动', () => {
    const directory = cache()
    const alive = new Set([200])
    tree(directory, `tree-${COMMIT}-100`, OLD)
    tree(directory, `tree-${COMMIT}-200`, OLD)
    tree(directory, `tree-${COMMIT}-300`, FRESH)
    writeFileSync(join(directory, `${COMMIT}-1b8183ce9c01-v5.json`), '{}')
    writeFileSync(join(directory, `${COMMIT}-1b8183ce9c01-v5.json.100`), '{}')
    mkdirSync(join(directory, 'tree-not-ours'))
    utimesSync(join(directory, 'tree-not-ours'), OLD, OLD)
    const removed = sweepStaleTrees(directory, pid => alive.has(pid), NOW)
    expect(removed).toEqual([`tree-${COMMIT}-100`])
    expect(readdirSync(directory).sort()).toEqual(
      [
        `${COMMIT}-1b8183ce9c01-v5.json`,
        `${COMMIT}-1b8183ce9c01-v5.json.100`,
        `tree-${COMMIT}-200`,
        `tree-${COMMIT}-300`,
        'tree-not-ours',
      ].sort(),
    )
    expect(existsSync(join(directory, '..', 'outside', 'keep.txt'))).toBe(true)
  })

  it('真实进程：活着的进程的树不删，它结束后下一次清掉', async () => {
    const directory = cache()
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {
      stdio: 'ignore',
    })
    const pid = child.pid
    if (pid === undefined) throw new Error('子进程没起来')
    try {
      tree(directory, `tree-${COMMIT}-${pid}`, OLD)
      expect(processAlive(pid)).toBe(true)
      expect(sweepStaleTrees(directory, processAlive, NOW)).toEqual([])
      expect(readdirSync(directory)).toEqual([`tree-${COMMIT}-${pid}`])
    } finally {
      child.kill()
      await new Promise(resolve => child.once('exit', resolve))
    }
    expect(processAlive(pid)).toBe(false)
    expect(sweepStaleTrees(directory, processAlive, NOW)).toEqual([`tree-${COMMIT}-${pid}`])
    expect(readdirSync(directory)).toEqual([])
    expect(existsSync(join(directory, '..', 'outside', 'keep.txt'))).toBe(true)
  })

  it('目录不在：什么也不做', () => {
    expect(sweepStaleTrees(join(cache(), 'missing'), () => false, NOW)).toEqual([])
  })
})
