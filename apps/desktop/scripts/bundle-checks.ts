// What a profile's bundles must and must not hold, checked two ways: from the bundler's module
// records (scripts/bundle-build.ts), and from the bundle text, which sees what a module list cannot.
import { REMOTE_DEBUGGING_REFUSED_MESSAGE } from '../src/startup-signals.ts'
import {
  BUNDLES,
  type Bundle,
  type BuildProfile,
  bundleDir,
  PROFILE_ENTRIES,
  type ProfileEntry,
} from './build-profile.ts'

export type BundleCheck = Readonly<{
  /** What is wrong, one sentence each; empty when it is as the profile requires. */
  problems: string[]
  /** What the check established. */
  findings: string[]
}>

/**
 * Checks one bundle's module lists against PROFILE_ENTRIES. For an entry the profile leaves out, the
 * real module is in no bundle's module graph, tree-shaken modules included, and the bundles that
 * import the entry hold its empty implementation instead. For an entry the profile bundles, those
 * bundles render code from the real module and do not hold the empty one: the positive control that
 * the check does see such modules where they exist.
 */
export function checkBundleModules(
  profile: BuildProfile,
  bundle: Bundle,
  modules: readonly string[],
  renderedModules: readonly string[],
  entries: readonly ProfileEntry[] = PROFILE_ENTRIES,
): BundleCheck {
  const problems: string[] = []
  const findings: string[] = []
  const where = `${bundleDir(profile)}/${bundle}`
  for (const entry of entries) {
    const enabled = entry.profiles.includes(profile)
    const real = (enabled ? renderedModules : modules).includes(entry.module)
    const imports = entry.bundles.includes(bundle)
    const empty = modules.includes(entry.empty)
    if (!enabled) {
      if (real)
        problems.push(
          `${where} contains ${entry.module}, which the ${profile} profile must not bundle`,
        )
      if (imports && !empty) problems.push(`${where} does not contain ${entry.empty}`)
      if (!real && (empty || !imports))
        findings.push(`no ${entry.module}${imports ? `; ${entry.empty} instead` : ''}`)
      continue
    }
    if (!imports) continue
    if (!real)
      problems.push(
        `${where} does not contain ${entry.module}: the check cannot see what it looks for`,
      )
    if (empty)
      problems.push(
        `${where} contains ${entry.empty}, which the ${profile} profile must not bundle`,
      )
    if (real && !empty) findings.push(`found ${entry.module}`)
  }
  return { problems, findings }
}

/** Text that says a capability is in a build; `profiles` names the profiles whose bundles hold it. */
export type BundleMarker = Readonly<{
  text: string
  /** What the marker is, for messages. */
  kind: string
  profiles: readonly BuildProfile[]
  /** Match the whole name only: `devTools` is not found in `openDevTools`. */
  name: boolean
}>

export const BUNDLE_MARKERS: readonly BundleMarker[] = [
  {
    text: REMOTE_DEBUGGING_REFUSED_MESSAGE,
    kind: 'remote debugging refusal',
    profiles: ['release'],
    name: false,
  },
  // The window's `webPreferences.devTools: false`; the other profiles leave DevTools on.
  { text: 'devTools', kind: 'DevTools switch', profiles: ['release'], name: true },
  // What src/main/main.ts leaves on `globalThis` for the Playwright fixtures.
  {
    text: 'desktopBuildProfile',
    kind: 'build profile global',
    profiles: ['dev', 'test'],
    name: true,
  },
  { text: 'userDataSuffix', kind: 'development host', profiles: ['dev'], name: true },
]

/** Text no test or release bundle may hold: an unreplaced profile or a runtime NODE_ENV branch. */
const NEVER_IN_BUILT = ['OMNE_BUILD_PROFILE', 'process.env.NODE_ENV']

/** The `OMNE_*` environment variables a release build reads. */
export const RELEASE_OMNE_ENV: readonly string[] = ['OMNE_PAGE_ROOT', 'OMNE_SERVER']

const NAME_CHARACTER = '[A-Za-z0-9_$]'
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether `code` contains the marker. */
export function hasMarker(code: string, marker: Pick<BundleMarker, 'text' | 'name'>): boolean {
  if (!marker.name) return code.includes(marker.text)
  return new RegExp(`(?<!${NAME_CHARACTER})${escaped(marker.text)}(?!${NAME_CHARACTER})`).test(code)
}

/** Every `OMNE_*` name in `code` on its own, not the tail of a longer name; sorted, without duplicates. */
export function omneNames(code: string): string[] {
  const names = code.matchAll(new RegExp(`(?<!${NAME_CHARACTER})OMNE_[A-Z0-9_]+`, 'g'))
  return [...new Set(Array.from(names, match => match[0]))].toSorted()
}

/**
 * Checks the text of one profile's bundles.
 * - No bundle holds a marker of another profile.
 * - Every marker of this profile is in at least one bundle. On the test bundles this is the positive
 *   control: a marker the check cannot find there proves nothing by being absent from release.
 * - No test or release bundle holds an unreplaced profile name or a runtime NODE_ENV branch.
 * - Release only: every `OMNE_*` name left is one a release build reads (RELEASE_OMNE_ENV), which
 *   also catches a debug variable nobody added to the list.
 */
export function checkBundleTexts(
  profile: BuildProfile,
  code: Readonly<Record<Bundle, string>>,
): BundleCheck {
  const problems: string[] = []
  const findings: string[] = []
  const where = (bundle: Bundle) => `${bundleDir(profile)}/${bundle}`
  const foreign = BUNDLE_MARKERS.filter(marker => !marker.profiles.includes(profile))
  const own = BUNDLE_MARKERS.filter(marker => marker.profiles.includes(profile))
  for (const bundle of BUNDLES) {
    for (const marker of foreign)
      if (hasMarker(code[bundle], marker))
        problems.push(
          `${where(bundle)} contains the ${marker.kind} ${marker.text}, which the ${profile} profile must not`,
        )
    if (profile !== 'dev')
      for (const text of NEVER_IN_BUILT)
        if (code[bundle].includes(text)) problems.push(`${where(bundle)} contains ${text}`)
    if (profile === 'release') {
      const unknown = omneNames(code[bundle]).filter(name => !RELEASE_OMNE_ENV.includes(name))
      if (unknown.length > 0)
        problems.push(
          `${where(bundle)} contains ${unknown.join(', ')}: a release build reads no OMNE_* variable but ${RELEASE_OMNE_ENV.join(', ')}`,
        )
    }
  }
  if (foreign.length > 0 && problems.length === 0)
    findings.push(`none of ${foreign.length} markers of other profiles in ${BUNDLES.join(', ')}`)
  const missing = own.filter(marker => !BUNDLES.some(bundle => hasMarker(code[bundle], marker)))
  for (const marker of missing)
    problems.push(
      `no ${profile} bundle contains the ${marker.kind} ${marker.text}: the check cannot see what it looks for`,
    )
  if (own.length > 0 && missing.length === 0)
    findings.push(
      `all ${own.length} markers of the ${profile} profile found: ${own.map(marker => marker.text).join(', ')}`,
    )
  return { problems, findings }
}
