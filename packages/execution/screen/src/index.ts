export { monitorsProblem, regionWithin, selfCheck } from './backend.ts'
export type {
  Monitor,
  Region,
  ScreenBackend,
  ScreenPermission,
  SelfCheck,
  Shot,
  Size,
} from './backend.ts'
export { libraryBackend } from './library.ts'
export type {
  LibraryBackendInput,
  LibraryImage,
  LibraryMonitor,
  LibraryUnits,
  ScreenLibrary,
} from './library.ts'
export {
  diagnoseScreen,
  macosRequestScreenAccess,
  macosScreenPermission,
  screenBackendFor,
} from './platforms.ts'
export type { BackendSources, ScreenDiagnosis } from './platforms.ts'
