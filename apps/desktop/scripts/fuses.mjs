// electron-builder's afterPack hook: flips Electron's fuses on the packed binary, before any
// signing. The packaged app then runs only its own asar and takes no Node switches from outside.
import { join } from 'node:path'
import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  flipFuses,
  getCurrentFuseWire,
} from '@electron/fuses'

/** The packed executable, by electron-builder's default names. */
function executable({ appOutDir, electronPlatformName, packager }) {
  const name = packager.appInfo.productFilename
  if (electronPlatformName === 'darwin')
    return join(appOutDir, `${name}.app`, 'Contents', 'MacOS', name)
  if (electronPlatformName === 'win32') return join(appOutDir, `${name}.exe`)
  return join(appOutDir, packager.executableName)
}

const FUSES = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
}

export default async function afterPack(context) {
  const binary = executable(context)
  await flipFuses(binary, {
    version: FuseVersion.V1,
    // Flipping fuses breaks the ad-hoc signature an arm64 Mac binary needs to start at all.
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin',
    strictlyRequireAllFuses: true,
    ...FUSES,
  })
  const wire = await getCurrentFuseWire(binary)
  for (const [option, wanted] of Object.entries(FUSES))
    if ((wire[option] === FuseState.ENABLE) !== wanted)
      // Read back: a fuse that did not take leaves a release that only looks hardened.
      throw new Error(`fuse ${FuseV1Options[option]} did not take on ${binary}`)
}
