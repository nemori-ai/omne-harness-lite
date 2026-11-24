import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { ScreenLibrary } from '@omne-harness/screen'

/** The packaged app carries the screenshot library's binary for its system here (electron-builder.base.mjs). */
export const SCREEN_BINARY = join('native', 'node-screenshots.node')
export const SCREEN_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

type Binding = Readonly<{ Monitor: Readonly<{ all(): ReturnType<ScreenLibrary['monitors']> }> }>

/** The same library agent screenshots use: the binary inside the packaged app, the installed package otherwise. */
export async function loadScreenLibrary(packaged: boolean): Promise<ScreenLibrary> {
  const require = createRequire(import.meta.url)
  const binding = (
    packaged ? require(join(process.resourcesPath, SCREEN_BINARY)) : require('node-screenshots')
  ) as Binding
  return { monitors: () => binding.Monitor.all() }
}
