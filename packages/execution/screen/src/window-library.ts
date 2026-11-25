import type { ScreenPermission } from './backend.ts'
import type { LibraryImage } from './library.ts'
import type { ScreenWindow, WindowBackend } from './windows.ts'

/** The calls of the screenshot library a window backend makes, and nothing else of it. */
export type LibraryWindow = Readonly<{
  id(): number
  x(): number
  y(): number
  width(): number
  height(): number
  currentMonitor(): Readonly<{ scaleFactor(): number }>
  captureImage(): Promise<Pick<LibraryImage, 'width' | 'height' | 'toPng'>>
}>
export type WindowLibrary = Readonly<{ windows(): readonly LibraryWindow[] }>

export type WindowLibraryBackendInput = Readonly<{
  name: string
  verification: WindowBackend['verification']
  list(): Promise<readonly ScreenWindow[]>
  library(): WindowLibrary
  permission(): Promise<ScreenPermission>
}>

export function windowLibraryBackend(input: WindowLibraryBackendInput): WindowBackend {
  return {
    name: input.name,
    verification: input.verification,
    list: input.list,
    async capture(id) {
      if ((await input.permission()) !== 'satisfied') return 'not-authorized'
      if (!(await input.list()).some(window => window.id === id)) return 'not-found'
      const raw = input
        .library()
        .windows()
        .find(each => String(each.id()) === id)
      if (raw === undefined) return 'not-found'
      const image = await raw.captureImage()
      return {
        png: await image.toPng(),
        width: image.width,
        height: image.height,
        scale: raw.currentMonitor().scaleFactor(),
        bounds: { x: raw.x(), y: raw.y(), width: raw.width(), height: raw.height() },
      }
    },
  }
}
