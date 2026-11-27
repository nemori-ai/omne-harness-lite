import type { VisualRecord } from './visual-record.ts'

/** The main process's mirror of the visual record: its canonical JSON, and whether it is not yet on disk. */
export interface VisualMirrorSnapshot {
  readonly record: string | null
  readonly pending: boolean
}

export type VisualPushResult = 'ok' | 'failed' | 'unavailable'

export const VISUAL_IPC = { read: 'omne:visual:read', push: 'omne:visual:push' } as const

/** What the preload script puts on the main window's page, and nothing else. */
export interface OmneDesktopBridge {
  readonly visual: {
    readonly seed: VisualMirrorSnapshot | null
    read(this: void): VisualMirrorSnapshot
    push(this: void, raw: string): Promise<VisualPushResult>
  }
}

/** What theme-boot.js leaves for the page: the record it painted the first frame with. */
export interface VisualBootstrap {
  readonly storageKey: string
  readonly record?: VisualRecord | undefined
}

declare global {
  interface Window {
    omneDesktop?: OmneDesktopBridge
    omneVisualBootstrap?: VisualBootstrap
  }
}
