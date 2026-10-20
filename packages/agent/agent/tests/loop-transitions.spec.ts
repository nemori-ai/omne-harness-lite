// C1 of #510: every transition of the normal path goes where the column 如何返回 of the node table
// says. The expectation below is written from loop-algorithm.md, independently of src/loop/nodes.ts,
// and each row names the node-table line it reads; the test checks that the line is that node's row.
// The table is internal, so this test imports the module source directly (tests/README.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOOP_NODES, TRANSITIONS, successor, type Label, type LoopNode } from '../src/loop/nodes.ts'
import { memberPath } from './module-graph.ts'

type Row = readonly [from: LoopNode, on: Label, to: LoopNode | null, line: number, says: string]

/** The normal path of #502 1.2 in path order, with the words of the node table that decide it. */
const NORMAL_PATH: readonly Row[] = [
  ['U0', 'candidate', 'Q1', 226, '转 Q1'],
  ['Q1', 'valid', 'Q2', 227, '合法转 Q2'],
  ['Q2', 'accepted', 'Q4', 228, 'accepted 转 Q4'],
  ['Q4', 'return-U0', 'U0', 229, '回固定调用位置：… U0'],
  ['U0', 'admitted', 'E0', 226, '接纳才进入可承接输入'],
  ['E0', 'authority', 'E1', 190, '取得 Authority 转 E1'],
  ['E1', 'allowed', 'E2', 191, '允许转 E2'],
  ['E2', 'reconciled', 'E4', 192, '转 E4'],
  ['E4', 'passage-pending', 'E3', 194, '为 E3（该位置的经过尚未结束）转 E3'],
  ['E3', 'passed', 'E4', 193, '效果采纳或单独提交后转 E4'],
  ['E4', 'take-inputs', 'I0', 194, '新 iter 或原输入边界转 I0'],
  ['I0', 'taken', 'I1', 196, '转 I1'],
  // The node table writes "assembled 转 P0"; what prepare returns as ready also goes to P0, as the
  // pseudocode prepareRequest does. Reading of #510, see tests/README.md.
  ['I1', 'prepared', 'P0', 197, 'assembled 转 P0'],
  ['P0', 'proceed', 'P1', 198, 'proceed 转 P1'],
  ['P1', 'ready', 'I2', 199, 'ready 且再选择一致转 I2'],
  ['I2', 'call', 'M0', 200, '调用 M'],
  ['M0', 'recorded', 'M6', 219, '转 M6'],
  ['M6', 'admitted', 'M1', 220, '转 M1'],
  ['M1', 'settled', 'M3', 221, '整调用真实收场转 M3'],
  ['M3', 'kept', 'M4', 223, '转 M4'],
  ['M4', 'proceed', 'M5', 224, '转 M5'],
  ['M5', 'return-I3', 'I3', 225, '主请求回 I3'],
  // I3 hands the reply to Q (pseudocode runIter: admitMessage(model-reply, reply)).
  ['I3', 'admit', 'Q1', 201, 'Q2 提交 ModelReplyAdmission 与接续'],
  ['Q4', 'return-I3', 'I3', 229, '回固定调用位置：I3'],
  ['I3', 'admitted', 'I4', 201, '准入成功转 I4'],
  ['I4', 'empty', 'I8', 202, '空转 I8'],
  ['I8', 'take-inputs', 'I0', 203, '有合法继续依据转 I0'],
  ['I8', 'try-finish', 'F1', 203, '完成候选或失败候选转 F1'],
  ['F1', 'fixed', 'F2', 238, '转 F2'],
  ['F2', 'proceed', 'F3', 239, 'proceed 转 F3'],
  ['F3', 'ended', 'F4', 240, 'ended 转 F4'],
  ['F4', 'observed', 'O0', 241, '转 O0'],
  ['O0', 'delivered', 'E9', 242, '转 E9'],
  ['E9', 'idle', null, 195, 'runtime 回 idle 并保持登记'],
]

const algorithm = readFileSync(memberPath('docs/architecture/loop-algorithm.md'), 'utf8').split(
  '\n',
)

describe('C1 the transition table follows the node table on the normal path', () => {
  it.each(NORMAL_PATH)('%s on %s goes to %s (line %i: %s)', (from, on, to, line, says) => {
    expect(successor(from, on)).toBe(to)
    const row = algorithm[line - 1] ?? ''
    expect(row.startsWith(`| ${from} |`), `line ${line} is the row of ${from}`).toBe(true)
    // The decisive words, up to an ellipsis, are on that row.
    for (const words of says.split('…'))
      expect(row, `line ${line}`).toContain(words.trim().replace(/：$/u, ''))
  })

  it('has exactly these rows, each with the line of its own node', () => {
    expect(TRANSITIONS.map(row => [row.from, row.on, row.to, row.line])).toEqual(
      NORMAL_PATH.map(([from, on, to, line]) => [from, on, to, line]),
    )
  })

  it('has one successor per node and outcome', () => {
    const keys = TRANSITIONS.map(row => `${row.from} ${row.on}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('an outcome without a row has no successor, so the coordinator stops on it', () => {
    expect(successor('E4', 'stop')).toBeUndefined()
    expect(successor('Q2', 'wait')).toBeUndefined()
  })

  it('names every node of the node table and no other', () => {
    // The node table runs from its heading to the next heading.
    const start = algorithm.indexOf('## 节点表')
    const end = algorithm.findIndex((line, at) => at > start && line.startsWith('## '))
    const rows = algorithm
      .slice(start, end)
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
