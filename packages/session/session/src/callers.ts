// Which caller classes each face operation admits (session-contract SPEC「四个面与公开操作」tables,
// 「控制与模型选择」). This is a consistency check of the assembly fact, not access control: the
// access boundary is the current access decision of each operation (contract VC-O05).
import type {
  MutationName,
  SessionCallerClass,
  SessionCommand,
  SessionReadAccessOperation,
} from '@omne-harness/session-contract'

export type FaceOperation =
  | MutationName
  | SessionReadAccessOperation
  | 'pending'
  | 'references'
  | 'releasedScopes'

const I = 'intake'
const C = 'coordinator'
const M = 'maintainer'
const R = 'reader'

const ADMITTED: Readonly<Record<FaceOperation, readonly SessionCallerClass[]>> = {
  accept: [I],
  readWork: [C, M],
  readInput: [C, M],
  startRun: [C, M],
  claim: [C, M],
  reload: [C],
  recordMessage: [C],
  preserveResult: [C, M],
  completeConsumption: [C],
  completeExternalConsumption: [C],
  bindExternalCall: [C],
  commitDerived: [C],
  release: [C, M],
  control: [I, M],
  finishRun: [C, M],
  queryOperation: [I, C, M],
  loadRecovery: [C, M],
  readModelSelection: [I, M],
  cancelRun: [I, M],
  stopCall: [I, M],
  queryControlOperation: [I, M],
  inspectIdle: [M],
  recordIdle: [M],
  create: [I],
  completeInitialization: [I],
  change: [I],
  setRelation: [I],
  configureAutoArchive: [I],
  considerAutoArchive: [M],
  interrupt: [I],
  freeze: [C],
  receive: [C, M],
  pending: [M],
  references: [M],
  releasedScopes: [M],
  'history.begin': [R],
  'history.next': [R],
  'history.since': [R],
  'history.readModelView': [R],
}

export function admits(caller: SessionCallerClass, operation: FaceOperation): boolean {
  return ADMITTED[operation].includes(caller)
}

/** `accept` admits `coordinator` too, for the business-input branch only. */
export function admitsCommand(caller: SessionCallerClass, command: SessionCommand): boolean {
  if (command.kind === 'accept' && command.input.value.kind === 'business' && caller === C)
    return true
  return admits(caller, command.kind)
}
