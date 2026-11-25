import type { Region, ScreenBackend, Shot } from './backend.ts'

/** One window on the screen now: its place is on the whole desktop, in logical points. */
export type ScreenWindow = Readonly<{
  id: string
  pid: number
  app: string
  /** Empty when the system gives no permission to read the screen. */
  title: string
  bounds: Region
}>

/** A picture of one window alone; `scale` is physical pixels per logical point, `bounds` the window when it was taken. */
export type WindowShot = Shot & Readonly<{ scale: number; bounds: Region }>

export type WindowCapture = WindowShot | 'not-found' | 'not-authorized'

/** What every system's window backend does: the same case maps to the same answer on each. */
export interface WindowBackend {
  readonly name: string
  readonly verification: ScreenBackend['verification']
  /** The visible windows of the normal layer, front to back. Asks no permission. */
  list(): Promise<readonly ScreenWindow[]>
  capture(id: string): Promise<WindowCapture>
}

export type WindowLook = Readonly<{ layer: number; opacity: number; onScreen: boolean }>

export const listable = ({ layer, opacity, onScreen }: WindowLook): boolean =>
  layer === 0 && opacity > 0.05 && onScreen
