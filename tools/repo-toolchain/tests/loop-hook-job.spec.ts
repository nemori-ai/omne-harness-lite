// 量读数子进程收到的任务参数与收工钩子入口的「是不是本检出」判断，进程内直接调用：
// 入口脚本只经子进程跑，覆盖率读不到它们里面的分支（子进程的端到端在 loop-stop-hook.spec.ts）。
import { afterEach, describe, expect, it } from 'vitest'
import { jobOf } from '../src/loop/hook-process.ts'
import { toolRoot } from '../src/loop/tool-root.ts'
import {
  removeTemporaries,
  repository,
  temporaryDirectory,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

describe('jobOf：子进程的命令行参数', () => {
  const full = { root: '/r', primaryBranch: 'main', home: '/h' }

  it('三个字段都是字符串：原样解出，多余的字段不带', () => {
    expect(jobOf(JSON.stringify({ ...full, extra: 1 }))).toEqual(full)
  })

  it.each([
    ['没给参数', undefined],
    ['JSON null', 'null'],
    ['JSON 数字', '7'],
    ['JSON 字符串', '"root"'],
    ['缺 root', JSON.stringify({ primaryBranch: 'main', home: '/h' })],
    ['root 不是字符串', JSON.stringify({ ...full, root: 1 })],
    ['缺 primaryBranch', JSON.stringify({ root: '/r', home: '/h' })],
    ['primaryBranch 不是字符串', JSON.stringify({ ...full, primaryBranch: null })],
    ['缺 home', JSON.stringify({ root: '/r', primaryBranch: 'main' })],
    ['home 不是字符串', JSON.stringify({ ...full, home: [] })],
  ])('形状不对（%s）：抛说明要什么的错', (_name, text) => {
    expect(() => jobOf(text)).toThrow('量读数的子进程要 {root, primaryBranch, home}')
  })

  it('不是 JSON：抛 JSON 的解析错，不吞', () => {
    expect(() => jobOf('{not json')).toThrow(SyntaxError)
  })
})

describe('toolRoot：这份脚本所在的检出', () => {
  it('在一个 git 仓库里：返回它的顶层目录', () => {
    const root = repository()
    expect(toolRoot({}, root)).toBe(root)
  })

  it('OMNE_RUNNER_ROOT 给了非空值：有意分开检查器与被检仓库，不比', () => {
    const root = repository()
    expect(toolRoot({ OMNE_RUNNER_ROOT: '/elsewhere' }, root)).toBeUndefined()
  })

  it('OMNE_RUNNER_ROOT 是空串：当作没给', () => {
    const root = repository()
    expect(toolRoot({ OMNE_RUNNER_ROOT: '' }, root)).toBe(root)
  })

  it('脚本目录不在 git 仓库里（或根本不存在）：取不到，不比', () => {
    expect(toolRoot({}, temporaryDirectory('loop-no-repo-'))).toBeUndefined()
    expect(toolRoot({}, '/nonexistent-omne-dir')).toBeUndefined()
  })
})
