// node scripts/fuses.ts [test | release] [--app <executable>]: reads a packaged app's fuses back.
import { join } from 'node:path'
import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  flipFuses,
  getCurrentFuseWire,
} from '@electron/fuses'
import type { AfterPackContext } from 'electron-builder'
import { type PackagedProfile, bundleDir } from './build-profile.ts'
import { writeNsisFileList } from './nsis-files.ts'
import { packagedBinary } from './packaged-path.ts'

export const FUSE_NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
  'WasmTrapHandlers',
] as const
export type FuseName = (typeof FUSE_NAMES)[number]

const release: Readonly<Record<FuseName, boolean>> = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: false,
  WasmTrapHandlers: true,
}

/** The test package is the release package but for the Node inspector Playwright's driver needs. */
export const FUSES: Readonly<Record<PackagedProfile, Readonly<Record<FuseName, boolean>>>> = {
  release,
  test: { ...release, EnableNodeCliInspectArguments: true },
}

export type FuseReading = boolean | 'removed' | 'missing' | 'unknown'
export type FuseReadings = Readonly<Record<FuseName, FuseReading>>

export function fuseReadings(
  wire: Readonly<Record<number, unknown>>,
): Record<FuseName, FuseReading> {
  const read = (name: FuseName): FuseReading => {
    const state = wire[FuseV1Options[name]]
    if (state === undefined) return 'missing'
    if (state === FuseState.ENABLE) return true
    if (state === FuseState.DISABLE) return false
    return state === FuseState.REMOVED ? 'removed' : 'unknown'
  }
  return Object.fromEntries(FUSE_NAMES.map(name => [name, read(name)])) as Record<
    FuseName,
    FuseReading
  >
}

export function fuseMismatches(readings: FuseReadings, profile: PackagedProfile): string[] {
  return FUSE_NAMES.filter(name => readings[name] !== FUSES[profile][name]).map(
    name => `${name} is ${String(readings[name])}, expected ${String(FUSES[profile][name])}`,
  )
}

export const describeFuses = (readings: FuseReadings): string =>
  FUSE_NAMES.map(name => `${name}=${String(readings[name])}`).join(' ')

/** Throws, naming each difference, unless the binary's fuses are `profile`'s column. */
export async function checkPackagedFuses(
  executable: string,
  profile: PackagedProfile,
): Promise<FuseReadings> {
  const readings = fuseReadings(await getCurrentFuseWire(executable))
  const mismatches = fuseMismatches(readings, profile)
  if (mismatches.length > 0)
    throw new Error(
      `the fuses of ${executable} are not the ${profile} profile's: ${mismatches.join('; ')}; repackage it`,
    )
  return readings
}

/** The packaged profile a configuration packs, from its app directory. */
export function packagedProfileOf(appDirectory: unknown): PackagedProfile {
  for (const profile of ['test', 'release'] as const)
    if (appDirectory === bundleDir(profile)) return profile
  throw new Error(`no packaged profile packs ${JSON.stringify(appDirectory)}`)
}

/** The packed executable, by electron-builder's default names. */
function packedExecutable({ appOutDir, electronPlatformName, packager }: AfterPackContext): string {
  const name = packager.appInfo.productFilename
  if (electronPlatformName === 'darwin')
    return join(appOutDir, `${name}.app`, 'Contents', 'MacOS', name)
  if (electronPlatformName === 'win32') return join(appOutDir, `${name}.exe`)
  const linux: unknown = Reflect.get(packager, 'executableName')
  return join(appOutDir, typeof linux === 'string' ? linux : name)
}

/** electron-builder's afterPack: flips the profile's fuses, before any signing, and reads them back. */
export default async function afterPack(context: AfterPackContext): Promise<void> {
  const profile = packagedProfileOf(context.packager.config.directories?.app)
  const binary = packedExecutable(context)
  const fuses = FUSES[profile]
  const { Arch } = await import('electron-builder')
  // A universal build calls this for each temporary slice too; signing a slice stops them merging.
  const temporarySlice = context.appOutDir.endsWith(`-universal-${Arch[context.arch]}-temp`)
  await flipFuses(binary, {
    version: FuseVersion.V1,
    // Flipping breaks the ad-hoc signature an arm64 Mac binary needs to start at all.
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin' && !temporarySlice,
    strictlyRequireAllFuses: true,
    ...Object.fromEntries(FUSE_NAMES.map(name => [FuseV1Options[name], fuses[name]])),
  } as Parameters<typeof flipFuses>[1])
  await checkPackagedFuses(binary, profile)
  if (context.electronPlatformName === 'win32' && profile === 'release')
    writeNsisFileList(context.appOutDir, context.packager.projectDir, Arch[context.arch])
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  let profile: PackagedProfile = 'test'
  let executable: string | undefined
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === 'test' || arg === 'release') profile = arg
    else if (arg === '--app' && args.length > 0) executable = args.shift()
    else {
      process.stderr.write('usage: fuses.ts [test | release] [--app <executable>]\n')
      process.exit(2)
    }
  }
  const binary = executable ?? packagedBinary(profile)
  try {
    const readings = await checkPackagedFuses(binary, profile)
    process.stdout.write(`fuses: ${binary} is the ${profile} profile: ${describeFuses(readings)}\n`)
  } catch (failure) {
    process.stderr.write(`fuses: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exit(1)
  }
}
