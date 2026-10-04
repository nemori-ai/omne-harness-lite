// 传感器的纯计算部分：稳定依赖不稳定、一起改却分属两组、没有断言的测试、相对基线新增的边、工作树清单。
// 读 git 的那几层在 loop-repository.spec.ts 用临时仓库测。
import { describe, expect, it } from 'vitest'
import { memberGraph } from '../src/metrics/graph.ts'
import type { SourceFile } from '../src/rule.ts'
import { casesWithoutAssertions } from '../src/loop/sensors/assertions.ts'
import { cochange, parseCommitMembers } from '../src/loop/sensors/cochange.ts'
import { edgeDelta } from '../src/loop/sensors/new-edges.ts'
import { stableOnUnstable } from '../src/loop/sensors/stability.ts'
import { parseWorktrees, sharedMembers } from '../src/loop/sensors/worktrees.ts'

const site = (path: string) => ({ path, line: 1, specifier: '@omne-harness-lite/x' })

describe('稳定的成员依赖了不稳定的成员', () => {
  const members = [
    { path: 'packages/core/a', instability: 0.1 },
    { path: 'packages/core/b', instability: 0.5 },
    { path: 'packages/core/c', instability: 0.3 },
  ]

  it('I(to) − I(from) 超过 margin 的边列出，带两端的 I 与第一个导入处', () => {
    const found = stableOnUnstable(
      members,
      [
        {
          from: 'packages/core/a',
          to: 'packages/core/b',
          sites: [site('packages/core/a/src/x.ts')],
        },
        { from: 'packages/core/a', to: 'packages/core/c', sites: [] },
        { from: 'packages/core/b', to: 'packages/core/a', sites: [] },
      ],
      0.2,
    )
    expect(found).toEqual([
      {
        from: 'packages/core/a',
        fromInstability: 0.1,
        to: 'packages/core/b',
        toInstability: 0.5,
        site: site('packages/core/a/src/x.ts'),
      },
    ])
  })

  it('恰好等于 margin 的不算', () => {
    expect(
      stableOnUnstable(
        [
          { path: 'm/a', instability: 0.25 },
          { path: 'm/b', instability: 0.5 },
        ],
        [{ from: 'm/a', to: 'm/b', sites: [] }],
        0.25,
      ),
    ).toEqual([])
  })
})

describe('总是一起改却分属两组的成员', () => {
  const options = { maxMembersPerCommit: 3, minTogether: 2, minRatio: 0.6 }
  const A = 'packages/core/a'
  const B = 'packages/infra/b'
  const C = 'packages/core/c'

  it('解析 git log：每个提交碰过的成员，只看 packages/ 与 apps/', () => {
    const log =
      '\u0000\n\npackages/core/a/src/x.ts\npackages/core/a/README.md\nexamples/demo/src/y.ts\ndocs/z.md\n' +
      '\u0000\n\napps/cli/src/main.ts\n\u0000\n\ntools/ts-checks/src/x.ts\n'
    expect(parseCommitMembers(log)).toEqual([['packages/core/a'], ['apps/cli'], []])
  })

  it('分属两组、同改次数与比例都过线的成员对列出', () => {
    const result = cochange([[A, B], [A, B], [A, B, C], [A], [C]], options)
    expect(result.pairs).toEqual([{ a: A, b: B, together: 3, ratio: 1 }])
    expect(result.counted).toBe(5)
  })

  it('同一组的成员对不列；比例不够的不列', () => {
    expect(
      cochange(
        [
          [A, C],
          [A, C],
          [A, C],
        ],
        options,
      ).pairs,
    ).toEqual([])
    expect(cochange([[A, B], [A, B], [B], [B], [B], [A], [A], [A]], options).pairs).toEqual([])
  })

  it('一次碰了太多成员的提交不计', () => {
    const many = [A, B, C, 'packages/x/d']
    const result = cochange([many, many, many], options)
    expect(result).toEqual({ counted: 0, skipped: 3, pairs: [] })
  })
})

describe('没有断言的测试', () => {
  const patterns = {
    assertionPattern: /^(expect|assert|expectTypeOf|assertType)/u,
    helperPattern: undefined,
    typeTestPattern: /\.(test|spec)-d\.[cm]?[jt]sx?$/u,
  }
  const scan = (text: string, helperPattern?: RegExp, path = 'packages/core/a/tests/a.spec.ts') =>
    casesWithoutAssertions(
      { path, text },
      helperPattern === undefined ? patterns : { ...patterns, helperPattern },
    ).map(found => `${found.line} ${found.name}`)
  const scanTypeTest = (text: string) =>
    scan(text, undefined, 'packages/core/a/tests/public.spec-d.ts')

  it('有 expect、assert 或 expectTypeOf 的不列；什么都没断言的列出，带行号与用例名', () => {
    const text = [
      "it('有断言', () => { expect(f()).toBe(1) })",
      "test('assert 也算', async () => { assert.equal(await g(), 2) })",
      "it('类型断言', () => { expectTypeOf(f).toBeFunction() })",
      "it('只调用不断言', () => { f() })",
      "it('回调里的断言也算', async () => { await run(() => expect(1).toBe(1)) })",
    ].join('\n')
    expect(scan(text)).toEqual(['4 只调用不断言'])
  })

  it('断言在同一文件的辅助函数里：算有断言；辅助函数自己没断言的不算（只解一层）', () => {
    const text = [
      'function check(x: number) { expect(x).toBe(1) }',
      'const relay = (x: number) => check(x)',
      "it('经辅助函数断言', () => { check(1) })",
      "it('经两层转手', () => { relay(1) })",
    ].join('\n')
    expect(scan(text)).toEqual(['4 经两层转手'])
  })

  it('it.todo、it.skip 不算用例；it.each、.concurrent、.only 照样判', () => {
    const text = [
      "it.todo('以后再写')",
      "it.skip('先跳过', () => { f() })",
      "it.each([1, 2])('表驱动 %i', n => { f(n) })",
      "it.concurrent('并发', () => { f() })",
      "test.only('只跑这条', () => { expect(1).toBe(1) })",
      "describe('分组', () => { it('嵌套', () => { f() }) })",
    ].join('\n')
    expect(scan(text)).toEqual(['3 表驱动 %i', '4 并发', '6 嵌套'])
  })

  it('helperPattern：匹配到的调用也算断言，用来消掉断言藏在导入的辅助函数里的误报', () => {
    const text =
      "import { verifyShape } from './helpers'\nit('导入的校验', () => { verifyShape(f()) })"
    expect(scan(text)).toEqual(['2 导入的校验'])
    expect(scan(text, /^verify/u)).toEqual([])
  })

  it('外层 describe.skip／describe.todo 里的用例整组不跑，不列；describe.skipIf 照样判', () => {
    const text = [
      "if (url === undefined) describe.skip('缺环境', () => { it('占位', () => {}) })",
      "suite.skip('也是一组', () => { describe('里层', () => { test('深处', () => { f() }) }) })",
      "describe.skipIf(ci)('条件跳过', () => { it('有时跑', () => { f() }) })",
    ].join('\n')
    expect(scan(text)).toEqual(['3 有时跑'])
  })

  it('类型测试文件：@ts-expect-error 指令与「应当编译得过」的调用、注解声明、satisfies 都算断言', () => {
    const text = [
      "it('指令', () => {\n  // @ts-expect-error 宽度是数字\n  const bad = width\n  void bad\n})",
      "it('块注释指令', () => { /* @ts-expect-error */ const bad = width; void bad })",
      "it('编译得过的调用', () => { evaluate({ root }) })",
      "it('注解声明', () => { const ok: Width = 1; void ok })",
      "it('satisfies', () => { void (1 satisfies Width) })",
      "it('什么都没有', () => { void 0 })",
      "it('字符串里的指令不算', () => { const note = '// @ts-expect-error'; void note })",
    ].join('\n')
    expect(scanTypeTest(text)).toEqual(['10 什么都没有', '11 字符串里的指令不算'])
  })

  it('运行时测试文件里 @ts-expect-error 与调用不算断言；不给 typeTestPattern 时类型测试也按运行时判', () => {
    const text = "it('指令', () => {\n  // @ts-expect-error 宽度是数字\n  f(width)\n})"
    expect(scan(text)).toEqual(['1 指令'])
    expect(
      casesWithoutAssertions(
        { path: 'packages/core/a/tests/public.spec-d.ts', text },
        { ...patterns, typeTestPattern: undefined },
      ).map(found => found.name),
    ).toEqual(['指令'])
  })
})

describe('相对基线新增的跨成员依赖', () => {
  const file = (path: string, text: string): SourceFile => ({ path, text })
  const A = 'packages/core/a/src/index.ts'
  const B = 'packages/core/b/src/index.ts'
  const C = 'packages/core/c/src/index.ts'
  const imports = (...names: string[]) =>
    names.map(name => `import { x } from '@omne-harness-lite/${name}'`).join('\n') + '\n'

  it('改动文件里新加的导入是新增；没改动的文件里的边不算；删掉的导入是消失', () => {
    const head = [file(A, imports('b')), file(B, imports('c')), file(C, '')]
    const graph = memberGraph(head)
    const delta = edgeDelta({
      headEdges: graph.edges,
      members: graph.members,
      changedPaths: new Set([A]),
      baseFiles: [file(A, imports('c'))],
    })
    expect(delta.added.map(edge => `${edge.from} → ${edge.to} ${edge.site?.path}`)).toEqual([
      `packages/core/a → packages/core/b ${A}`,
    ])
    expect(delta.removed.map(edge => `${edge.from} → ${edge.to}`)).toEqual([
      'packages/core/a → packages/core/c',
    ])
  })

  it('同一条边在没改动的文件里也有导入：不算新增', () => {
    const other = 'packages/core/a/src/other.ts'
    const head = [file(A, imports('b')), file(other, imports('b')), file(B, '')]
    const graph = memberGraph(head)
    const delta = edgeDelta({
      headEdges: graph.edges,
      members: graph.members,
      changedPaths: new Set([A]),
      baseFiles: [file(A, '')],
    })
    expect(delta.added).toEqual([])
  })

  it('基线上还没有的文件贡献空集；基线上有、现在删了的文件里的边算作消失', () => {
    const gone = 'packages/core/a/src/gone.ts'
    const head = [file(A, imports('b')), file(B, ''), file(C, '')]
    const graph = memberGraph(head)
    const delta = edgeDelta({
      headEdges: graph.edges,
      members: graph.members,
      changedPaths: new Set([A, gone]),
      baseFiles: [file(gone, imports('c'))],
    })
    expect(delta.added.map(edge => edge.to)).toEqual(['packages/core/b'])
    expect(delta.removed.map(edge => edge.to)).toEqual(['packages/core/c'])
  })
})

describe('并行工作树', () => {
  it('解析 porcelain：主检出在第一条，分离头指针没有分支', () => {
    const text = [
      'worktree /repo',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/.worktrees/x',
      'HEAD bbb',
      'branch refs/heads/someone/x',
      '',
      'worktree /repo/.worktrees/y',
      'HEAD ccc',
      'detached',
      '',
    ].join('\n')
    expect(parseWorktrees(text)).toEqual([
      { path: '/repo', head: 'aaa', branch: 'main' },
      { path: '/repo/.worktrees/x', head: 'bbb', branch: 'someone/x' },
      { path: '/repo/.worktrees/y', head: 'ccc', branch: undefined },
    ])
  })

  it('被两棵以上同时改的成员列出，带是哪几棵；只被一棵改的不列', () => {
    expect(
      sharedMembers([
        { path: '/x', branch: 'x', members: ['packages/core/a', 'apps/cli'] },
        { path: '/y', branch: 'y', members: ['packages/core/a'] },
        { path: '/z', branch: 'z', problem: '目录不在了' },
      ]),
    ).toEqual([{ member: 'packages/core/a', worktrees: ['x', 'y'] }])
  })
})
