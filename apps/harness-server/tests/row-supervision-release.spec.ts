import type { Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { until } from './support/listening.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from './support/release-tree.ts'

/** The top fiber of a row of the running tree, by the id of the row. */
function rowFiber(tree: ReleaseTree, row: string): Fiber {
  for (const runtime of tree.scope.root.registry.values())
    if (runtime.name === row) for (const fiber of runtime.fibers) return fiber
  throw new Error(`no fiber of the row ${row}`)
}

const of = (tree: ReleaseTree, kind: string) => tree.records.filter(record => record.kind === kind)

describe('发行树：运行中一行没了（C21）', () => {
  it('撤掉一个没有关闭阶段的行：它进入等依赖，期限到了进程以 4 退出，记录与关闭报告都在', async () => {
    let records: ReleaseTree['records'] = []
    const exitCode = await onReleaseTree(
      { script: toolCallsThenText(() => []), dependencyDeadlineMs: 400 },
      async tree => {
        records = tree.records
        expect(of(tree, 'row-supervision')).toEqual([])
        await rowFiber(tree, 'usage-access').dispose()
        await until(() => of(tree, 'shutdown-result').length > 0, 'the shutdown report', 20_000)
      },
    )
    const kinds = (kind: string) => records.filter(record => record.kind === kind)
    expect(kinds('row-supervision')).toEqual([
      { kind: 'row-supervision', row: 'usage-access', standing: 'waiting' },
    ])
    expect(kinds('supervision-exit')).toEqual([
      { kind: 'supervision-exit', row: 'usage-access', reason: 'dependency-deadline', code: 4 },
    ])
    expect(exitCode).toBe(4)
    // No row needed the one that left, so every other row is stopped in order and the close settles.
    expect(kinds('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
  })
})
