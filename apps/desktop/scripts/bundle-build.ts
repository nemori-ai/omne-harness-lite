import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { InlineConfig, Plugin } from 'vite'
import {
  BUILD_COMMANDS,
  BUNDLE_ENTRIES,
  type Bundle,
  type BuildProfile,
  bundleDir,
  emptyEntries,
  isBuildProfile,
} from './build-profile.ts'

export const desktopDir = resolve(import.meta.dirname, '..')

// The screenshot library loads its binary by path at run time (src/main/screen-host.ts); it is never bundled.
const EXTERNAL = [
  'electron',
  'node-screenshots',
  ...builtinModules.flatMap(name => [name, `node:${name}`]),
]

export const modulesRecordName = (bundle: string): string => `${bundle}.modules.json`

export type BundleModules = Readonly<{
  profile: BuildProfile
  bundle: string
  /** SHA-256 of the bundle file this record was written for. */
  sha256: string
  /** The whole module graph, tree-shaken modules included: what proves a module absent. */
  modules: string[]
  /** The modules that rendered code into the bundle: what proves a module present. */
  renderedModules: string[]
}>

export const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex')

/** A module id as records hold it: a file's path from `directory` without its query, anything else as is. */
export function moduleName(id: string, directory: string): string {
  const file = id.split('?')[0]!
  if (id.startsWith('\0') || !isAbsolute(file)) return id
  return relative(directory, file).split(sep).join('/')
}

/** Writes each bundle's module lists and hash beside it, for scripts/verify-build.ts. */
function recordModules(profile: BuildProfile, outDir: string): Plugin {
  // Module ids are real paths: a checkout reached through a link would otherwise name none of them.
  const root = realpathSync(desktopDir)
  let modules: string[] = []
  return {
    name: 'omne-record-bundle-modules',
    generateBundle() {
      modules = Array.from(this.getModuleIds(), id => moduleName(id, root)).toSorted()
    },
    writeBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        const file = join(outDir, chunk.fileName)
        const record: BundleModules = {
          profile,
          bundle: chunk.fileName,
          sha256: sha256(readFileSync(file)),
          modules,
          renderedModules: Object.entries(chunk.modules)
            .filter(([, module]) => module.renderedLength > 0)
            .map(([id]) => moduleName(id, root))
            .toSorted(),
        }
        writeFileSync(modulesRecordName(file), `${JSON.stringify(record, null, 2)}\n`)
      }
    },
  }
}

/** Puts each module the profile leaves out by its empty implementation, decided at resolution. */
function replaceExcluded(profile: BuildProfile): Plugin {
  const root = realpathSync(desktopDir)
  const swaps = new Map(
    emptyEntries(profile).map(entry => [resolve(root, entry.module), resolve(root, entry.empty)]),
  )
  return {
    name: 'omne-profile-entries',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      const swap =
        resolved === null
          ? undefined
          : swaps.get(existsSync(resolved.id) ? realpathSync(resolved.id) : resolved.id)
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
    plugins: [replaceExcluded(profile), recordModules(profile, outDir)],
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

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

/**
 * Reads the record of one bundle of one profile. Throws, naming the build to run, when the bundle or
 * its record is missing, or when the record was written for another profile, another bundle, or other
 * contents than the file on disk (a stale or foreign bundle).
 */
export function readBundleModules(
  profile: BuildProfile,
  bundle: Bundle,
  directory = resolve(desktopDir, bundleDir(profile)),
): BundleModules {
  const file = resolve(directory, bundle)
  const recordFile = resolve(directory, modulesRecordName(bundle))
  const rebuild = `run \`${BUILD_COMMANDS[profile]}\` first`
  for (const path of [file, recordFile])
    if (!existsSync(path)) throw new Error(`${path} is missing: ${rebuild}`)
  let record: unknown
  try {
    record = JSON.parse(readFileSync(recordFile, 'utf8'))
  } catch {
    throw new Error(`${recordFile} is not a bundle module record: ${rebuild}`)
  }
  const field = (name: string): unknown =>
    typeof record === 'object' && record !== null ? Reflect.get(record, name) : undefined
  const [recorded, recordedBundle, digest, modules, renderedModules] = [
    field('profile'),
    field('bundle'),
    field('sha256'),
    field('modules'),
    field('renderedModules'),
  ]
  if (
    !isBuildProfile(recorded) ||
    typeof recordedBundle !== 'string' ||
    typeof digest !== 'string' ||
    !strings(modules) ||
    !strings(renderedModules)
  )
    throw new Error(`${recordFile} is not a bundle module record: ${rebuild}`)
  if (recorded !== profile || recordedBundle !== bundle)
    throw new Error(
      `${recordFile} describes ${recordedBundle} of the ${recorded} profile: ${rebuild}`,
    )
  if (digest !== sha256(readFileSync(file)))
    throw new Error(
      `${recordFile} is stale: it was not written for the ${file} on disk; ${rebuild}`,
    )
  return { profile, bundle, sha256: digest, modules, renderedModules }
}
