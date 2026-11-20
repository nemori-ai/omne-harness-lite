// The desktop build profiles: fixed when the bundles are built, never chosen at run time.
// Dependency-free, so plain Node, the Vite configuration and the launchers all import it.

export const BUILD_PROFILES = ['dev', 'test', 'release'] as const
export type BuildProfile = (typeof BUILD_PROFILES)[number]
export type PackagedProfile = Exclude<BuildProfile, 'dev'>

/** How scripts/build.ts tells the bundle build which profile to build. */
export const PROFILE_ENV = 'OMNE_DESKTOP_PROFILE'

export const BUILD_USAGE = 'usage: build.ts [test | release]'

export function isBuildProfile(value: unknown): value is BuildProfile {
  return typeof value === 'string' && BUILD_PROFILES.some(profile => profile === value)
}

/** The packaged profile `args` name, `test` when none; anything else throws the usage. */
export function parseBuildArgs(args: readonly string[]): PackagedProfile {
  if (args.length === 0) return 'test'
  const [profile] = args
  if (args.length === 1 && (profile === 'test' || profile === 'release')) return profile
  throw new Error(BUILD_USAGE)
}

/** A profile's directory under apps/desktop: its bundles, its page and its package.json. */
export const bundleDir = (profile: BuildProfile): string => `dist/${profile}`

/** The bundles of a profile, relative to its directory. */
export const BUNDLES = ['main/main.js', 'utility/entry.js'] as const
export type Bundle = (typeof BUNDLES)[number]

/** Each bundle's entry module, relative to apps/desktop. */
export const BUNDLE_ENTRIES: Readonly<Record<Bundle, string>> = {
  'main/main.js': 'src/main/main.ts',
  'utility/entry.js': 'src/utility/entry.ts',
}

/** A module only some profiles bundle; the rest bundle `empty`, an implementation that does nothing. */
export type ProfileEntry = Readonly<{
  module: string
  empty: string
  profiles: readonly BuildProfile[]
  bundles: readonly Bundle[]
}>

export const PROFILE_ENTRIES: readonly ProfileEntry[] = [
  {
    module: 'src/main/dev-host.ts',
    empty: 'src/main/dev-host.empty.ts',
    profiles: ['dev'],
    bundles: ['main/main.js'],
  },
]

export function emptyEntries(profile: BuildProfile): ProfileEntry[] {
  return PROFILE_ENTRIES.filter(entry => !entry.profiles.includes(profile))
}

/** The manifest Electron starts a profile's directory with, and electron-builder packs. */
export function profileManifest(
  own: Readonly<{ version: string; description: string }>,
  product: Readonly<{ name: string; productName: string; homepage: string; author: unknown }>,
): Record<string, unknown> {
  return {
    name: product.name,
    productName: product.productName,
    version: own.version,
    description: own.description,
    homepage: product.homepage,
    author: product.author,
    type: 'module',
    main: BUNDLES[0],
  }
}
