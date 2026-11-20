import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import type { InlineConfig, Plugin } from 'vite'
import {
  BUNDLE_ENTRIES,
  type Bundle,
  type BuildProfile,
  bundleDir,
  emptyEntries,
} from './build-profile.ts'

export const desktopDir = resolve(import.meta.dirname, '..')

const EXTERNAL = ['electron', ...builtinModules.flatMap(name => [name, `node:${name}`])]

export const modulesRecordName = (bundle: string): string => `${bundle}.modules.json`

export type BundleModules = Readonly<{ bundle: string; sha256: string; modules: string[] }>

export const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex')

/** A module id as apps/desktop-relative POSIX path; ids outside the checkout keep their package path. */
export function moduleName(id: string, directory: string = desktopDir): string {
  const clean = id.replace(/^\0/, '').split('?')[0]!
  const inside = relative(directory, clean)
  return inside.split(sep).join('/')
}

/** Writes each bundle's module list and hash beside it, for scripts/verify-build.ts. */
function recordModules(outDir: string): Plugin {
  return {
    name: 'omne-record-bundle-modules',
    writeBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        const file = join(outDir, chunk.fileName)
        const record: BundleModules = {
          bundle: chunk.fileName,
          sha256: sha256(readFileSync(file)),
          modules: chunk.moduleIds.map(id => moduleName(id)).sort(),
        }
        writeFileSync(modulesRecordName(file), `${JSON.stringify(record, null, 2)}\n`)
      }
    },
  }
}

/** Puts each module the profile leaves out by its empty implementation, decided at resolution. */
function replaceExcluded(profile: BuildProfile): Plugin {
  const swaps = new Map(
    emptyEntries(profile).map(entry => [
      resolve(desktopDir, entry.module),
      resolve(desktopDir, entry.empty),
    ]),
  )
  return {
    name: 'omne-profile-entries',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      const swap = resolved === null ? undefined : swaps.get(resolved.id)
      return swap === undefined ? resolved : { id: swap }
    },
  }
}

/** One bundle of one profile: everything bundled but Electron and Node's own modules. */
export function bundleConfig(
  profile: BuildProfile,
  bundle: Bundle,
  watch = false,
  outDir = resolve(desktopDir, bundleDir(profile)),
): InlineConfig {
  const name = bundle.replace(/\.js$/, '')
  const production = profile !== 'dev'
  return {
    configFile: false,
    root: desktopDir,
    logLevel: 'warn',
    publicDir: false,
    define: {
      OMNE_BUILD_PROFILE: JSON.stringify(profile),
      ...(production ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
    },
    plugins: [replaceExcluded(profile), recordModules(outDir)],
    ssr: { noExternal: true },
    build: {
      ssr: true,
      outDir,
      emptyOutDir: false,
      minify: production,
      sourcemap: true,
      watch: watch ? {} : null,
      rolldownOptions: {
        input: { [name]: resolve(desktopDir, BUNDLE_ENTRIES[bundle]) },
        external: EXTERNAL,
        output: { format: 'es', entryFileNames: '[name].js', codeSplitting: false },
      },
    },
  }
}

/** The page of one profile, from the page's own Vite configuration. */
export function pageConfig(profile: BuildProfile, watch = false): InlineConfig {
  return {
    configFile: resolve(desktopDir, 'vite.config.ts'),
    logLevel: 'warn',
    build: {
      outDir: resolve(desktopDir, bundleDir(profile), 'page'),
      emptyOutDir: true,
      watch: watch ? {} : null,
    },
  }
}

/** Reads a bundle's module record; throws, naming the build to run, when it is missing. */
export function readBundleModules(
  profile: BuildProfile,
  bundle: Bundle,
  directory = resolve(desktopDir, bundleDir(profile)),
): BundleModules {
  const file = resolve(directory, modulesRecordName(bundle))
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BundleModules
  } catch {
    throw new Error(`${file} is missing: run \`pnpm run build ${profile}\` first`)
  }
}
