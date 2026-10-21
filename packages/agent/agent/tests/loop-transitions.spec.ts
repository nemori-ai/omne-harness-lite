// C1 of #510: every transition of the normal path goes where the node table says. The expectation
// below is written from loop-algorithm.md, independently of src/loop/nodes.ts. Each row names the
// node by its row (`| E0 |`), the column of that row that decides the edge (如何返回 unless stated)
// and the decisive words, which must stand in that column. Words that come from the pseudocode are
// looked up in its code block. The table is internal, so this test imports the module source
// directly (tests/README.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOOP_NODES, TRANSITIONS, successor, type Label, type LoopNode } from '../src/loop/nodes.ts'
import { memberPath } from './module-graph.ts'

/** The columns of the node table, in order, and the pseudocode as one more source. */
const COLUMNS = [
  '节点',
  '读什么',
  '写什么',
  '何时提交',
  '何时等待',
  '如何返回',
  '并发与次序',
  '终止或进展条件',
] as const
type Source = (typeof COLUMNS)[number] | '伪代码'

type Row = readonly [from: LoopNode, on: Label, to: LoopNode | null, source: Source, says: string]

/** The normal path of #502 1.2 in path order, with the words of the node table that decide it. */
const NORMAL_PATH: readonly Row[] = [
  ['U0', 'candidate', 'Q1', '如何返回', '转 Q1'],
  ['Q1', 'valid', 'Q2', '如何返回', '合法转 Q2'],
  ['Q2', 'accepted', 'Q4', '如何返回', 'accepted 转 Q4'],
  ['Q4', 'return-U0', 'U0', '如何返回', '回固定调用位置：…U0'],
  // The admission of the input leads into the acceptance of invoke.
  ['U0', 'admitted', 'E0', '终止或进展条件', '接纳才进入可承接输入'],
  ['E0', 'authority', 'E1', '如何返回', '取得 Authority 转 E1'],
  ['E1', 'allowed', 'E2', '如何返回', '允许转 E2'],
  ['E2', 'reconciled', 'E4', '如何返回', '转 E4'],
  ['E4', 'passage-pending', 'E3', '如何返回', '为 E3（该位置的经过尚未结束）转 E3'],
  ['E3', 'passed', 'E4', '如何返回', '效果采纳或单独提交后转 E4'],
  ['E4', 'take-inputs', 'I0', '如何返回', '新 iter 或原输入边界转 I0'],
  ['I0', 'taken', 'I1', '如何返回', '转 I1'],
  // #558 S-11: the first prepare returns assembled. P1's review produces ready.
  ['I1', 'prepared', 'P0', '如何返回', 'assembled 转 P0'],
  ['P0', 'proceed', 'P1', '如何返回', 'proceed 转 P1'],
  ['P1', 'ready', 'I2', '如何返回', 'ready 且再选择一致转 I2'],
  ['I2', 'call', 'M0', '如何返回', '调用 M'],
  ['M0', 'recorded', 'M6', '如何返回', '转 M6'],
  ['M6', 'admitted', 'M1', '如何返回', '转 M1'],
  ['M1', 'settled', 'M3', '如何返回', '整调用真实收场转 M3'],
  ['M3', 'kept', 'M4', '如何返回', '转 M4'],
  ['M4', 'proceed', 'M5', '如何返回', '转 M5'],
  ['M5', 'return-I3', 'I3', '如何返回', '主请求回 I3'],
  // I3 hands the reply to Q: the pseudocode runIter calls admitMessage on it.
  ['I3', 'admit', 'Q1', '伪代码', 'admission = admitMessage(model-reply, reply)'],
  ['Q4', 'return-I3', 'I3', '如何返回', '回固定调用位置：I3'],
  ['I3', 'admitted', 'I4', '如何返回', '准入成功转 I4'],
  ['I4', 'empty', 'I8', '如何返回', '空转 I8'],
  ['I8', 'take-inputs', 'I0', '如何返回', '有合法继续依据转 I0'],
  ['I8', 'try-finish', 'F1', '如何返回', '完成候选或失败候选转 F1'],
  ['F1', 'fixed', 'F2', '如何返回', '转 F2'],
  ['F2', 'proceed', 'F3', '如何返回', 'proceed 转 F3'],
  ['F3', 'ended', 'F4', '如何返回', 'ended 转 F4'],
  ['F4', 'observed', 'O0', '如何返回', '转 O0'],
  ['O0', 'delivered', 'E9', '如何返回', '转 E9'],
  ['E9', 'idle', null, '如何返回', 'runtime 回 idle 并保持登记'],
]

const algorithm = readFileSync(memberPath('docs/architecture/loop-algorithm.md'), 'utf8').split(
  '\n',
)

/** The lines of a section, from its heading to the next heading of the same level. */
function section(heading: string): readonly string[] {
  const start = algorithm.indexOf(heading)
  const end = algorithm.findIndex((line, at) => at > start && line.startsWith('## '))
  return algorithm.slice(start, end)
}

const nodeTable = section('## 节点表')
const pseudocode = section('## 正常路径伪代码').join('\n')

/** The cell of `column` in the row of `node` in the node table. */
function cell(node: LoopNode, column: (typeof COLUMNS)[number]): string {
  const row = nodeTable.find(line => line.startsWith(`| ${node} |`))
  if (row === undefined) throw new Error(`the node table has no row ${node}`)
  const parts = row
    .split('|')
    .slice(1, -1)
    .map(text => text.trim())
  expect(parts, `the row of ${node} has one cell per column`).toHaveLength(COLUMNS.length)
  return parts[COLUMNS.indexOf(column)] ?? ''
}

describe('C1 the transition table follows the node table on the normal path', () => {
  it.each(NORMAL_PATH)('%s on %s goes to %s (%s: %s)', (from, on, to, source, says) => {
    expect(successor(from, on)).toBe(to)
    const text = source === '伪代码' ? pseudocode : cell(from, source)
    // The decisive words, in parts around an ellipsis, stand in that column.
    for (const words of says.split('…')) expect(text, `${from} ${source}`).toContain(words)
  })

  it('has exactly these rows', () => {
    const expected = [
      ...NORMAL_PATH.map(([from, on, to]) => [from, on, to]),
      ['E1', 'found-existing', null],
      ['E1', 'terminal', 'F4'],
      ['E1', 'superseded', 'E9'],
      ['E1', 'wait', 'W0'],
      ['E2', 'wait', 'W0'],
      ['I1', 'wait', 'W0'],
      ['I1', 'try-finish', 'F1'],
      ['I3', 'try-finish', 'F1'],
      ['I3', 'partial', 'I8'],
      ['M6', 'wait', 'W0'],
      ['M1', 'wait', 'W0'],
      ...[
        'R0',
        'I0',
        'I8',
        'Q2',
        'Q4',
        'I1',
        'P0',
        'P1',
        'I2',
        'M0',
        'M6',
        'M1',
        'M3',
        'M4',
        'M5',
        'I3',
        'I4',
        'F1',
        'F2',
        'F3',
        'F4',
        'O0',
        'E9',
      ].map(node => ['E4', `resume-${node}`, node]),
      ['E4', 'try-finish', 'F1'],
      ['R0', 'reconciled', 'E4'],
      ['R0', 'wait', 'W0'],
      ['W0', 'saved-wait', null],
    ]
    expect(TRANSITIONS.map(row => [row.from, row.on, row.to]).sort()).toEqual(expected.sort())
  })

  it('has one successor per node and outcome', () => {
    const keys = TRANSITIONS.map(row => `${row.from} ${row.on}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('I1 waits on unavailable reads and takes a real cannot-fit to F1', () => {
    expect(successor('I1', 'wait')).toBe('W0')
    expect(cell('I1', '何时等待')).toContain('读取端口不可用时转 W0')
    expect(successor('I1', 'try-finish')).toBe('F1')
    expect(cell('I1', '如何返回')).toContain('cannot-fit 或已进入计划后再次 needs-compaction 转 F1')
  })

  it('an outcome without a row has no successor, so the coordinator stops on it', () => {
    expect(successor('E4', 'stop')).toBeUndefined()
    expect(successor('Q2', 'wait')).toBeUndefined()
  })

  it('names every node of the node table and no other', () => {
    const rows = nodeTable
      .map(line => /^\| ([A-Z][0-9]) \|/u.exec(line)?.[1])
      .filter(node => node !== undefined)
    expect([...LOOP_NODES].sort()).toEqual([...new Set(rows)].sort())
  })

  it('walks the path from U0 to the end through the table alone', () => {
    // The outcomes of the one normal run, in order; the table alone must give the nodes.
    const outcomes: readonly Label[] = [
      'candidate',
      'valid',
      'accepted',
      'return-U0',
      'admitted',
      'authority',
      'allowed',
      'reconciled',
      'passage-pending',
      'passed',
      'take-inputs',
      'taken',
      'prepared',
      'proceed',
      'ready',
      'call',
      'recorded',
      'admitted',
      'settled',
      'kept',
      'proceed',
      'return-I3',
      'admit',
      'valid',
      'accepted',
      'return-I3',
      'admitted',
      'empty',
      'try-finish',
      'fixed',
      'proceed',
      'ended',
      'observed',
      'delivered',
      'idle',
    ]
    const visited: (LoopNode | null)[] = ['U0']
    let node: LoopNode | null = 'U0'
    for (const on of outcomes) {
      if (node === null) break
      node = successor(node, on) ?? null
      visited.push(node)
    }
    expect(visited).toEqual([
      'U0',
      'Q1',
      'Q2',
      'Q4',
      'U0',
      'E0',
      'E1',
      'E2',
      'E4',
      'E3',
      'E4',
      'I0',
      'I1',
      'P0',
      'P1',
      'I2',
      'M0',
      'M6',
      'M1',
      'M3',
      'M4',
      'M5',
      'I3',
      'Q1',
      'Q2',
      'Q4',
      'I3',
      'I4',
      'I8',
      'F1',
      'F2',
      'F3',
      'F4',
      'O0',
      'E9',
      null,
    ])
  })
})
