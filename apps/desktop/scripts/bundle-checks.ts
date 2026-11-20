import { REMOTE_DEBUGGING_REFUSED_MESSAGE } from '../src/startup-signals.ts'
import { type Bundle, type BuildProfile, emptyEntries, PROFILE_ENTRIES } from './build-profile.ts'
import type { BundleModules } from './bundle-build.ts'

/** Text that says a capability is in a bundle; `in` names the profiles whose bundle must carry it. */
export type BundleMarker = Readonly<{
  name: string
  text: string
  bundle: Bundle
  in: readonly BuildProfile[]
}>

export const BUNDLE_MARKERS: readonly BundleMarker[] = [
  {
    name: 'remote debugging refusal',
    text: REMOTE_DEBUGGING_REFUSED_MESSAGE,
    bundle: 'main/main.js',
    in: ['release'],
  },
  { name: 'DevTools turned off', text: 'devTools', bundle: 'main/main.js', in: ['release'] },
  {
    name: 'build profile for drivers',
    text: 'desktopBuildProfile',
    bundle: 'main/main.js',
    in: ['dev', 'test'],
  },
  { name: 'development host', text: 'userDataSuffix', bundle: 'main/main.js', in: ['dev'] },
]

/** Text no test or release bundle may carry: an unreplaced profile or a runtime NODE_ENV branch. */
const NEVER_IN_BUILT = ['OMNE_BUILD_PROFILE', 'process.env.NODE_ENV']

/** What is wrong with one bundle of one profile, from its module record, its file hash and its text. */
export function bundleProblems(
  profile: BuildProfile,
  bundle: Bundle,
  record: BundleModules,
  code: string,
  sha256: string,
): string[] {
  const where = `${profile} ${bundle}`
  const problems: string[] = []
  if (record.sha256 !== sha256)
    problems.push(`${where}: the file is not the one its module record describes`)
  for (const entry of emptyEntries(profile))
    if (entry.bundles.includes(bundle) && record.modules.includes(entry.module))
      problems.push(`${where}: bundles ${entry.module}, which this profile leaves out`)
  for (const entry of PROFILE_ENTRIES)
    if (
      entry.profiles.includes(profile) &&
      entry.bundles.includes(bundle) &&
      !record.modules.includes(entry.module)
    )
      problems.push(`${where}: misses ${entry.module}, which this profile bundles`)
  for (const marker of BUNDLE_MARKERS) {
    if (marker.bundle !== bundle) continue
    const found = code.includes(marker.text)
    if (marker.in.includes(profile) && !found) problems.push(`${where}: misses the ${marker.name}`)
    if (!marker.in.includes(profile) && found) problems.push(`${where}: carries the ${marker.name}`)
  }
  if (profile !== 'dev')
    for (const text of NEVER_IN_BUILT)
      if (code.includes(text)) problems.push(`${where}: carries ${text}`)
  return problems
}
