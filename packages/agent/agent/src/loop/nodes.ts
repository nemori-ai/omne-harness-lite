import type { Next } from '@omne-harness/agent-contract'

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

export type Label =
  | Next['kind']
  | `resume-${LoopNode}`
  | 'reconcile'
  | 'terminal'
  | 'superseded'
  | 'saved-wait'
  | 'unsaved-wait'
  | 'candidate'
  | 'prepared'
  | 'rejected'
  | 'resolved'
  | 'disposed'
  | 'return-U0'
  | 'return-I3'
  | 'admit'
  | 'admitted'
  | 'authority'
  | 'allowed'
  | 'found-existing'
  | 'reconciled'
  | 'passage-pending'
  | 'passed'
  | 'taken'
  | 'prepared'
  | 'proceed'
  | 'ready'
  | 'call'
  | 'recorded'
  | 'voided'
  | 'settled'
  | 'kept'
  | 'partial'
  | 'retry'
  | 'empty'
  | 'fixed'
  | 'cancel'
  | 'cancelled'
  | 'tools'
  | 'judged'
  | 'open'
  | 'denied'
  | 'dispatched'
  | 'judge'
  | 'carded'
  | 'slotted'
  | 'received'
  | 'batch'
  | 'dispatch'
  | 'ended'
  | 'observed'
  | 'delivered'
  | 'idle'

export type Transition = Readonly<{ from: LoopNode; on: Label; to: LoopNode | null }>

export const TRANSITIONS: readonly Transition[] = [
  { from: 'U0', on: 'candidate', to: 'Q1' },
  { from: 'Q1', on: 'prepared', to: 'Q2' },
  { from: 'Q1', on: 'rejected', to: 'Q5' },
  { from: 'Q5', on: 'disposed', to: 'Q4' },
  { from: 'Q2', on: 'resolved', to: 'Q4' },
  { from: 'Q4', on: 'return-U0', to: 'U0' },
  { from: 'U0', on: 'admitted', to: 'E0' },
  { from: 'E0', on: 'authority', to: 'E1' },
  { from: 'E1', on: 'allowed', to: 'E2' },
  { from: 'E1', on: 'terminal', to: 'F4' },
  { from: 'E1', on: 'superseded', to: 'E9' },
  { from: 'E1', on: 'wait', to: 'W0' },
  { from: 'E1', on: 'found-existing', to: null },
  { from: 'E2', on: 'reconciled', to: 'E4' },
  { from: 'E2', on: 'wait', to: 'W0' },
  { from: 'E4', on: 'passage-pending', to: 'E3' },
  { from: 'E3', on: 'passed', to: 'E4' },
  { from: 'E4', on: 'take-inputs', to: 'I0' },
  { from: 'E4', on: 'resume-R0', to: 'R0' },
  { from: 'E4', on: 'resume-I0', to: 'I0' },
  { from: 'E4', on: 'resume-I8', to: 'I8' },
  { from: 'E4', on: 'resume-Q2', to: 'Q2' },
  { from: 'E4', on: 'resume-Q4', to: 'Q4' },
  { from: 'E4', on: 'resume-I1', to: 'I1' },
  { from: 'E4', on: 'resume-P0', to: 'P0' },
  { from: 'E4', on: 'resume-P1', to: 'P1' },
  { from: 'E4', on: 'resume-I2', to: 'I2' },
  { from: 'E4', on: 'resume-M0', to: 'M0' },
  { from: 'E4', on: 'resume-M6', to: 'M6' },
  { from: 'E4', on: 'resume-M1', to: 'M1' },
  { from: 'E4', on: 'resume-M3', to: 'M3' },
  { from: 'E4', on: 'resume-M4', to: 'M4' },
  { from: 'E4', on: 'resume-M5', to: 'M5' },
  { from: 'E4', on: 'resume-I3', to: 'I3' },
  { from: 'E4', on: 'resume-I4', to: 'I4' },
  { from: 'E4', on: 'resume-A0', to: 'A0' },
  { from: 'E4', on: 'resume-A1', to: 'A1' },
  { from: 'E4', on: 'resume-A2', to: 'A2' },
  { from: 'E4', on: 'resume-A3', to: 'A3' },
  { from: 'E4', on: 'resume-T0', to: 'T0' },
  { from: 'E4', on: 'resume-T1', to: 'T1' },
  { from: 'E4', on: 'resume-T2', to: 'T2' },
  { from: 'E4', on: 'resume-T3', to: 'T3' },
  { from: 'E4', on: 'resume-T4', to: 'T4' },
  { from: 'E4', on: 'resume-T5', to: 'T5' },
  { from: 'E4', on: 'resume-F1', to: 'F1' },
  { from: 'E4', on: 'resume-F2', to: 'F2' },
  { from: 'E4', on: 'resume-F3', to: 'F3' },
  { from: 'E4', on: 'resume-F4', to: 'F4' },
  { from: 'E4', on: 'resume-O0', to: 'O0' },
  { from: 'E4', on: 'resume-E9', to: 'E9' },
  { from: 'E4', on: 'try-finish', to: 'F1' },
  { from: 'R0', on: 'reconciled', to: 'E4' },
  { from: 'R0', on: 'wait', to: 'W0' },
  { from: 'W0', on: 'saved-wait', to: 'E1' },
  { from: 'W0', on: 'unsaved-wait', to: 'E1' },
  { from: 'W0', on: 'reconciled', to: 'E1' },
  { from: 'I0', on: 'taken', to: 'I1' },
  { from: 'I1', on: 'prepared', to: 'P0' },
  { from: 'I1', on: 'wait', to: 'W0' },
  { from: 'I1', on: 'try-finish', to: 'F1' },
  { from: 'P0', on: 'proceed', to: 'P1' },
  { from: 'P1', on: 'ready', to: 'I2' },
  { from: 'P1', on: 'wait', to: 'W0' },
  { from: 'I2', on: 'call', to: 'M0' },
  { from: 'M0', on: 'recorded', to: 'M6' },
  { from: 'M6', on: 'admitted', to: 'M1' },
  { from: 'M6', on: 'wait', to: 'W0' },
  { from: 'M6', on: 'try-finish', to: 'F1' },
  { from: 'M6', on: 'voided', to: 'I1' },
  { from: 'M1', on: 'wait', to: 'W0' },
  { from: 'M1', on: 'settled', to: 'M3' },
  { from: 'M3', on: 'kept', to: 'M4' },
  { from: 'M4', on: 'proceed', to: 'M5' },
  { from: 'M5', on: 'return-I3', to: 'I3' },
  { from: 'I3', on: 'admit', to: 'Q1' },
  { from: 'Q4', on: 'return-I3', to: 'I3' },
  { from: 'I3', on: 'admitted', to: 'I4' },
  { from: 'I3', on: 'rejected', to: 'I8' },
  { from: 'I3', on: 'partial', to: 'I8' },
  { from: 'I3', on: 'retry', to: 'I8' },
  { from: 'I3', on: 'try-finish', to: 'F1' },
  { from: 'I4', on: 'empty', to: 'I8' },
  { from: 'I4', on: 'tools', to: 'A0' },
  { from: 'A0', on: 'judged', to: 'A1' },
  { from: 'A1', on: 'judge', to: 'A0' },
  { from: 'A1', on: 'carded', to: 'A1' },
  { from: 'A1', on: 'wait', to: 'W0' },
  { from: 'A1', on: 'open', to: 'A2' },
  { from: 'A1', on: 'denied', to: 'A3' },
  { from: 'A2', on: 'dispatched', to: 'T0' },
  { from: 'A2', on: 'wait', to: 'W0' },
  { from: 'A3', on: 'slotted', to: 'T2' },
  { from: 'T0', on: 'wait', to: 'W0' },
  { from: 'T0', on: 'received', to: 'T1' },
  { from: 'T1', on: 'kept', to: 'T2' },
  { from: 'T2', on: 'passed', to: 'T3' },
  { from: 'T3', on: 'wait', to: 'W0' },
  { from: 'T3', on: 'batch', to: 'T4' },
  { from: 'T3', on: 'admit', to: 'T5' },
  { from: 'T3', on: 'dispatch', to: 'A2' },
  { from: 'T4', on: 'proceed', to: 'T5' },
  { from: 'T5', on: 'admitted', to: 'I8' },
  { from: 'T5', on: 'rejected', to: 'H0' },
  { from: 'T5', on: 'wait', to: 'W0' },
  { from: 'H0', on: 'try-finish', to: 'F1' },
  { from: 'I8', on: 'take-inputs', to: 'I0' },
  { from: 'I8', on: 'try-finish', to: 'F1' },
  { from: 'I8', on: 'wait', to: 'W0' },
  { from: 'F1', on: 'fixed', to: 'F2' },
  { from: 'E1', on: 'cancel', to: 'F0' },
  { from: 'E4', on: 'cancel', to: 'F0' },
  { from: 'F0', on: 'cancelled', to: 'F1' },
  { from: 'F0', on: 'terminal', to: 'F4' },
  { from: 'F1', on: 'reconcile', to: 'R0' },
  { from: 'F2', on: 'proceed', to: 'F3' },
  { from: 'F2', on: 'reconcile', to: 'R0' },
  { from: 'F3', on: 'ended', to: 'F4' },
  { from: 'F3', on: 'reconcile', to: 'R0' },
  { from: 'F4', on: 'observed', to: 'O0' },
  { from: 'O0', on: 'delivered', to: 'E9' },
  { from: 'E9', on: 'idle', to: null },
]

export function successor(from: LoopNode, on: Label): LoopNode | null | undefined {
  return TRANSITIONS.find(row => row.from === from && row.on === on)?.to
}
