// The native binaries the packaged app carries next to its bundles, for the system it is built on.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const ABI: Readonly<Partial<Record<NodeJS.Platform, string>>> = { win32: '-msvc', linux: '-gnu' }

/** The screenshot library's binary for this system, as napi-rs names its platform packages; it throws where none is installed. */
export function screenshotsBinary(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const target = `${platform}-${arch}${ABI[platform] ?? ''}`
  const library = createRequire(import.meta.url).resolve('node-screenshots/package.json')
  const binding = createRequire(library).resolve(`node-screenshots-${target}/package.json`)
  return join(dirname(binding), `node-screenshots.${target}.node`)
}
