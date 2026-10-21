// The node vocabulary of the Loop and the transitions between nodes, as the node table of
// docs/architecture/loop-algorithm.md "节点表" writes them in its column 如何返回. Pure data and one
// pure lookup; nothing here runs an effect.
//
// The table below is the one readable source of the transitions. Each row comes from the row of its
// `from` node in the node table, normally from the column 如何返回; the three rows whose words come
// from elsewhere say so. tests/loop-transitions.spec.ts checks every row against the node table.
// It holds the normal path only (#502 1.2). The cards that add failure branches, waits and the
// other subgraphs add rows; they do not change a row that is here.
//
// At E4 and I8 the label is the kind of the evaluator's `Next`. A row there may also key on the
// `Next` payload: #502 1.4 adds payload-aware rows for prepare-request, admit-model, consume and
// reconcile, each of which goes to one of two nodes depending on what the `Next` carries. That is
// an added way to match a row, not a change to the rows below.
import type { Next } from '@omne-harness/agent-contract'

/** Every node of the node table. `AgentCheckpoint.position` holds one of them as text. */
export const LOOP_NODES = [
  'E0',
  'E1',
  'E2',
  'E3',
  'E4',
  'E9',
  'I0',
  'I1',
  'P0',
  'P1',
  'I2',
  'I3',
  'I4',
  'I8',
  'C0',
  'C1',
  'C2',
  'C3',
  'C4',
  'A0',
  'A1',
  'A3',
  'A2',
  'T0',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'M0',
  'M6',
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'U0',
  'Q1',
  'Q2',
  'Q4',
  'Q5',
  'X0',
  'X1',
  'X2',
  'X3',
  'X4',
  'X5',
  'F0',
  'F1',
  'F2',
  'F3',
  'F4',
  'O0',
  'H0',
  'R0',
  'W0',
] as const

export type LoopNode = (typeof LOOP_NODES)[number]

/**
 * Why a node goes where it goes: one name per outcome of the column 如何返回. At the two decision
 * segments E4 and I8 the outcome is the kind of the evaluator's `Next`, so a `Next` kind is a label
 * too. `return-U0` and `return-I3` are the fixed call positions that Q4 and M5 go back to.
 */
export type Label =
  | Next['kind']
  | 'candidate'
  | 'valid'
  | 'accepted'
  | 'return-U0'
  | 'return-I3'
  | 'admit'
  | 'admitted'
  | 'authority'
  | 'allowed'
  | 'reconciled'
  | 'passage-pending'
  | 'passed'
  | 'taken'
  | 'prepared'
  | 'proceed'
  | 'ready'
  | 'call'
  | 'recorded'
  | 'settled'
  | 'kept'
  | 'empty'
  | 'fixed'
  | 'ended'
  | 'observed'
  | 'delivered'
  | 'idle'

/** One transition: from a node, on an outcome, to a node; `null` ends the Loop. */
export type Transition = Readonly<{ from: LoopNode; on: Label; to: LoopNode | null }>

/**
 * The normal path of #502 1.2: one input, one main call, its reply admitted, no action, the
 * execution ended. The order is the order of the path.
 *
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'U0', on: 'candidate', to: 'Q1' },
  { from: 'Q1', on: 'valid', to: 'Q2' },
  { from: 'Q2', on: 'accepted', to: 'Q4' },
  { from: 'Q4', on: 'return-U0', to: 'U0' },
  // From the column 终止或进展条件 of U0: 接纳才进入可承接输入.
  { from: 'U0', on: 'admitted', to: 'E0' },
  { from: 'E0', on: 'authority', to: 'E1' },
  { from: 'E1', on: 'allowed', to: 'E2' },
  { from: 'E2', on: 'reconciled', to: 'E4' },
  { from: 'E4', on: 'passage-pending', to: 'E3' },
  { from: 'E3', on: 'passed', to: 'E4' },
  { from: 'E4', on: 'take-inputs', to: 'I0' },
  { from: 'I0', on: 'taken', to: 'I1' },
  // 如何返回 of I1 says "assembled 转 P0"; a ready answer of `prepare` goes there too, as the
  // pseudocode prepareRequest calls P0 after every prepare that needs no compaction.
  { from: 'I1', on: 'prepared', to: 'P0' },
  { from: 'P0', on: 'proceed', to: 'P1' },
  { from: 'P1', on: 'ready', to: 'I2' },
  { from: 'I2', on: 'call', to: 'M0' },
  { from: 'M0', on: 'recorded', to: 'M6' },
  { from: 'M6', on: 'admitted', to: 'M1' },
  { from: 'M1', on: 'settled', to: 'M3' },
  { from: 'M3', on: 'kept', to: 'M4' },
  { from: 'M4', on: 'proceed', to: 'M5' },
  { from: 'M5', on: 'return-I3', to: 'I3' },
  // From the column 写什么 of I3 (Q2 提交 ModelReplyAdmission) and the pseudocode runIter
  // (admitMessage(model-reply, reply)).
  { from: 'I3', on: 'admit', to: 'Q1' },
  { from: 'Q4', on: 'return-I3', to: 'I3' },
  { from: 'I3', on: 'admitted', to: 'I4' },
  { from: 'I4', on: 'empty', to: 'I8' },
  { from: 'I8', on: 'take-inputs', to: 'I0' },
  { from: 'I8', on: 'try-finish', to: 'F1' },
  { from: 'F1', on: 'fixed', to: 'F2' },
  { from: 'F2', on: 'proceed', to: 'F3' },
  { from: 'F3', on: 'ended', to: 'F4' },
  { from: 'F4', on: 'observed', to: 'O0' },
  { from: 'O0', on: 'delivered', to: 'E9' },
  { from: 'E9', on: 'idle', to: null },
]

/**
 * Where `from` goes on `on`: a node, `null` when the Loop ends there, or `undefined` when the table
 * has no such row. A missing row is an outcome that this card does not handle; the caller stops on
 * it and never picks a node of its own.
 */
export function successor(from: LoopNode, on: Label): LoopNode | null | undefined {
  return TRANSITIONS.find(row => row.from === from && row.on === on)?.to
}
