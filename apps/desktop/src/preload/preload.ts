import { contextBridge, ipcRenderer } from 'electron'
import {
  VISUAL_IPC,
  type OmneDesktopBridge,
  type VisualMirrorSnapshot,
} from '../shared/desktop-bridge.ts'

// Sandboxed: bundled as one CommonJS file, with only Electron required at runtime.
if (process.isMainFrame) installDesktopBridge()

function installDesktopBridge(): void {
  let seed: VisualMirrorSnapshot | null = null
  try {
    seed = readVisual()
  } catch {
    // A live read can recover after document start.
  }
  const bridge: OmneDesktopBridge = {
    visual: {
      seed,
      read: readVisual,
      async push(raw) {
        try {
          const result: unknown = await ipcRenderer.invoke(VISUAL_IPC.push, raw)
          return result === 'ok' || result === 'failed' ? result : 'unavailable'
        } catch {
          return 'unavailable'
        }
      },
    },
  }
  contextBridge.exposeInMainWorld('omneDesktop', bridge)
}

function readVisual(): VisualMirrorSnapshot {
  const value: unknown = ipcRenderer.sendSync(VISUAL_IPC.read)
  if (
    typeof value !== 'object' ||
    !value ||
    !('record' in value) ||
    (value.record !== null && typeof value.record !== 'string') ||
    !('pending' in value) ||
    typeof value.pending !== 'boolean'
  )
    throw new Error('visual mirror unavailable')
  return { record: value.record, pending: value.pending }
}
