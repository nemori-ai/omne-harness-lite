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
export type { ScreenWindow, WindowBackend, WindowCapture, WindowShot } from './windows.ts'
export type { LibraryWindow, WindowLibrary } from './window-library.ts'
export { windowBackendFor } from './window-platforms.ts'
export type { WindowSources } from './window-platforms.ts'
