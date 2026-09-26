export {
  openClientLocalState,
  type OpenClientLocalStateOptions,
  type ClientLocalStateInstance,
} from './open.ts'
export { clientLocalStatePlugin } from './plugin.ts'
export {
  CLIENT_LOCAL_STATE_SERVICE,
  ClientStateUsageDefect,
  ClientStateOpenFailure,
  type ClientLocalState,
  type LocalRecord,
  type CachedRead,
  type LocalSnapshot,
  type SnapshotToken,
  type ReadOutcome,
  type ReadFailure,
  type ReplaceOutcome,
} from './surface.ts'
