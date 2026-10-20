// The node vocabulary of the Loop and the transitions between nodes, as the node table of
// docs/architecture/loop-algorithm.md "节点表" writes them in its column 如何返回. Pure data and one
// pure lookup; nothing here runs an effect.
//
// The table below is the one readable source of the transitions. Each row names the node-table
// line that it comes from, so a row can be checked against the design. It holds the normal path
// only (#502 1.2). The cards that add failure branches, waits and the other subgraphs add rows;
// they do not change a row that is here.
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
export type Transition = Readonly<{
  from: LoopNode
  on: Label
  to: LoopNode | null
  /** The line of loop-algorithm.md that holds the row of `from` in the node table. */
  line: number
}>

/**
 * The normal path of #502 1.2: one input, one main call, its reply admitted, no action, the
 * execution ended. The order is the order of the path.
 *
 * Two readings are this card's (see tests/README.md): I1 sends what `prepare` returns, assembled or
 * ready, to P0, as the pseudocode `prepareRequest` does (the node table names `ready` only for
 * `resume`); and I3 enters Q1 with the reply candidate (pseudocode `runIter`, `admitMessage`).
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'U0', on: 'candidate', to: 'Q1', line: 226 },
  { from: 'Q1', on: 'valid', to: 'Q2', line: 227 },
  { from: 'Q2', on: 'accepted', to: 'Q4', line: 228 },
  { from: 'Q4', on: 'return-U0', to: 'U0', line: 229 },
  { from: 'U0', on: 'admitted', to: 'E0', line: 226 },
  { from: 'E0', on: 'authority', to: 'E1', line: 190 },
  { from: 'E1', on: 'allowed', to: 'E2', line: 191 },
  { from: 'E2', on: 'reconciled', to: 'E4', line: 192 },
  { from: 'E4', on: 'passage-pending', to: 'E3', line: 194 },
  { from: 'E3', on: 'passed', to: 'E4', line: 193 },
  { from: 'E4', on: 'take-inputs', to: 'I0', line: 194 },
  { from: 'I0', on: 'taken', to: 'I1', line: 196 },
  { from: 'I1', on: 'prepared', to: 'P0', line: 197 },
  { from: 'P0', on: 'proceed', to: 'P1', line: 198 },
  { from: 'P1', on: 'ready', to: 'I2', line: 199 },
  { from: 'I2', on: 'call', to: 'M0', line: 200 },
  { from: 'M0', on: 'recorded', to: 'M6', line: 219 },
  { from: 'M6', on: 'admitted', to: 'M1', line: 220 },
  { from: 'M1', on: 'settled', to: 'M3', line: 221 },
  { from: 'M3', on: 'kept', to: 'M4', line: 223 },
  { from: 'M4', on: 'proceed', to: 'M5', line: 224 },
  { from: 'M5', on: 'return-I3', to: 'I3', line: 225 },
  { from: 'I3', on: 'admit', to: 'Q1', line: 201 },
  { from: 'Q4', on: 'return-I3', to: 'I3', line: 229 },
  { from: 'I3', on: 'admitted', to: 'I4', line: 201 },
  { from: 'I4', on: 'empty', to: 'I8', line: 202 },
  { from: 'I8', on: 'take-inputs', to: 'I0', line: 203 },
  { from: 'I8', on: 'try-finish', to: 'F1', line: 203 },
  { from: 'F1', on: 'fixed', to: 'F2', line: 238 },
  { from: 'F2', on: 'proceed', to: 'F3', line: 239 },
  { from: 'F3', on: 'ended', to: 'F4', line: 240 },
  { from: 'F4', on: 'observed', to: 'O0', line: 241 },
  { from: 'O0', on: 'delivered', to: 'E9', line: 242 },
  { from: 'E9', on: 'idle', to: null, line: 195 },
]

/** Whether a text names a node of the node table. */
export function isLoopNode(text: string): text is LoopNode {
  return LOOP_NODES.some(node => node === text)
}

/**
 * Where `from` goes on `on`: a node, `null` when the Loop ends there, or `undefined` when the table
 * has no such row. A missing row is an outcome that this card does not handle; the caller stops on
 * it and never picks a node of its own.
 */
export function successor(from: LoopNode, on: Label): LoopNode | null | undefined {
  return TRANSITIONS.find(row => row.from === from && row.on === on)?.to
}
