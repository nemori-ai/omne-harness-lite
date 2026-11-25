import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { ScreenLibrary, WindowLibrary } from '@omne-harness/screen'

/** The packaged app carries the screenshot library's binary for its system here (electron-builder.base.mjs). */
export const SCREEN_BINARY = join('native', 'node-screenshots.node')
export const SCREEN_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

type Binding = Readonly<{
  Monitor: Readonly<{ all(): ReturnType<ScreenLibrary['monitors']> }>
  Window: Readonly<{ all(): ReturnType<WindowLibrary['windows']> }>
}>

/** The same library agent screenshots use: the binary inside the packaged app, the installed package otherwise. */
function loadBinding(packaged: boolean): Binding {
  const require = createRequire(import.meta.url)
  return (
    packaged ? require(join(process.resourcesPath, SCREEN_BINARY)) : require('node-screenshots')
  ) as Binding
}

export async function loadScreenLibrary(packaged: boolean): Promise<ScreenLibrary> {
  const binding = loadBinding(packaged)
  return { monitors: () => binding.Monitor.all() }
}

/** The windows of that same library, for the window backend. */
export async function loadWindowLibrary(packaged: boolean): Promise<WindowLibrary> {
  const binding = loadBinding(packaged)
  return { windows: () => binding.Window.all() }
}
