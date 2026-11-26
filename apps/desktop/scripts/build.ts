// node scripts/build.ts [test | release]: one profile's page, bundles and manifest in dist/<profile>.
// The dev profile is built only by scripts/dev.ts, in watch mode.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import {
  BUNDLES,
  type BuildProfile,
  bundleDir,
  parseBuildArgs,
  profileManifest,
} from './build-profile.ts'
import { BUNDLE_PROTOCOLS_FILE, bundleProtocolsText } from '../src/shared/bundle-protocols.ts'
import { domainProtocols } from '../src/shared/protocols.ts'
import { bundleConfig, desktopDir, pageConfig } from './bundle-build.ts'

/** Writes the manifest Electron starts `dist/<profile>` with. */
export function writeManifest(profile: BuildProfile): void {
  const read = (file: string) => JSON.parse(readFileSync(resolve(desktopDir, file), 'utf8'))
  const directory = resolve(desktopDir, bundleDir(profile))
  mkdirSync(directory, { recursive: true })
  const manifest = profileManifest(read('package.json'), read('product.json'))
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function buildProfile(profile: BuildProfile): Promise<void> {
  rmSync(resolve(desktopDir, bundleDir(profile)), { recursive: true, force: true })
  await build(pageConfig(profile))
  // A page bundle carries the list of the protocols its page speaks; the forwarding layer reads it from the bundle.
  writeFileSync(
    resolve(desktopDir, bundleDir(profile), 'page', BUNDLE_PROTOCOLS_FILE),
    bundleProtocolsText(domainProtocols),
  )
  for (const bundle of BUNDLES) await build(bundleConfig(profile, bundle))
  writeManifest(profile)
}

if (import.meta.main) {
  try {
    const profile = parseBuildArgs(process.argv.slice(2))
    await buildProfile(profile)
    process.stdout.write(`build: ${bundleDir(profile)} is the ${profile} profile\n`)
  } catch (failure) {
    process.stderr.write(`build: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exit(1)
  }
}
