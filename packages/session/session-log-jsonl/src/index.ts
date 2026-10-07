export type * from './types.ts'

export { emptyLogState, foldCommit, judgeAppend } from './state.ts'
export { commitFormatVersion, indexFoldVersion, encodeCommitLine, decodeLogBytes } from './codec.ts'
export { openJsonlSessionLog } from './open.ts'
export {
  defaultSessionLogPolicy,
  isProcessOwnership,
  type SessionLogPolicy,
  type SessionLogOptions,
  type SessionLogDiagnostic,
  type ProcessOwnership,
  type ProcessExit,
} from './policy.ts'
