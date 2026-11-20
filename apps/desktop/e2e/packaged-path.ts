import { join } from 'node:path'

export type ProductNames = Readonly<{ name: string; productName: string }>

/** Names electron-builder uses as they are, so its filename sanitizing cannot move the path. */
function portable(value: string): string {
  if (
    !/^[A-Za-z][A-Za-z0-9 ._-]*$/.test(value) ||
    /[ .]$/.test(value) ||
    /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)
  )
    throw new Error(`not a portable desktop filename: ${JSON.stringify(value)}`)
  return value
}

/** The executable `electron-builder --dir` writes, by its default names for each platform. */
export function packagedExecutable(
  out: string,
  names: ProductNames,
  platform: NodeJS.Platform,
  arch: string,
): string {
  const product = portable(names.productName)
  const arm = arch === 'arm64'
  if (platform === 'darwin')
    return join(out, arm ? 'mac-arm64' : 'mac', `${product}.app`, 'Contents', 'MacOS', product)
  if (platform === 'win32') return join(out, arm ? 'win-arm64-unpacked' : 'win-unpacked', `${product}.exe`)
  // Linux names the executable after the package name, lowercased, not the product name.
  if (platform === 'linux')
    return join(out, arm ? 'linux-arm64-unpacked' : 'linux-unpacked', portable(names.name).toLowerCase())
  throw new Error(`no desktop package for ${platform}`)
}
