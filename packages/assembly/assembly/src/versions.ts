/** The pointer file: the version to start, the last one that settled, and whether the current one has. */
export type VersionPointer = Readonly<{
  current: string
  previous: string | null
  settled: boolean
}>

/** What an install root holds: a version with no entry here is not installed. */
export type Versions = Readonly<{
  installed: Readonly<Record<string, 'partial' | 'complete'>>
  pointer: VersionPointer | null
}>

export type VersionStanding = 'absent' | 'partial' | 'complete' | 'trial' | 'settled'

/** The last three are about the version the pointer names: they come from whoever supervises it. */
export type VersionEvent =
  | Readonly<{ kind: 'begin' | 'finish' | 'interrupted' | 'switch'; version: string }>
  | Readonly<{ kind: 'settled' | 'fell' | 'fell-to-limit' }>

export type VersionOutcome =
  | 'moved'
  | 'same'
  | 'not-complete'
  | 'in-use'
  | 'rolled-back'
  | 'no-fallback'
  | 'unreachable'

export type VersionStep = Readonly<{ versions: Versions; outcome: VersionOutcome }>

export const noVersions: Versions = { installed: {}, pointer: null }

export function standingOfVersion(versions: Versions, version: string): VersionStanding {
  const { pointer, installed } = versions
  if (pointer?.current === version) return pointer.settled ? 'settled' : 'trial'
  if (pointer?.previous === version) return 'settled'
  return installed[version] ?? 'absent'
}

function ofInstall(
  versions: Versions,
  standing: VersionStanding,
  event: Extract<VersionEvent, { version: string }>,
): VersionStep {
  const still = (outcome: VersionOutcome): VersionStep => ({ versions, outcome })
  const { version } = event
  const installedAs = (state: 'partial' | 'complete'): VersionStep => ({
    versions: { ...versions, installed: { ...versions.installed, [version]: state } },
    outcome: 'moved',
  })
  if (event.kind === 'begin') {
    if (standing === 'absent') return installedAs('partial')
    return still(standing === 'trial' || standing === 'settled' ? 'in-use' : 'same')
  }
  if (event.kind === 'finish') {
    if (standing === 'absent') return still('unreachable')
    return standing === 'partial' ? installedAs('complete') : still('same')
  }
  if (event.kind === 'interrupted') return still(standing === 'partial' ? 'same' : 'unreachable')
  if (standing === 'absent' || standing === 'partial') return still('not-complete')
  const previous = versions.pointer?.previous ?? null
  if (versions.pointer?.current === version) return still('same')
  const pointer = { current: version, previous, settled: previous === version }
  return { versions: { ...versions, pointer }, outcome: 'moved' }
}

function ofRunning(versions: Versions, kind: 'settled' | 'fell' | 'fell-to-limit'): VersionStep {
  const still = (outcome: VersionOutcome): VersionStep => ({ versions, outcome })
  const { pointer } = versions
  if (pointer === null) return still('unreachable')
  if (kind === 'fell') return still('same')
  const { current, previous } = pointer
  if (kind === 'settled') {
    if (pointer.settled) return still('same')
    return {
      versions: { ...versions, pointer: { current, previous: current, settled: true } },
      outcome: 'moved',
    }
  }
  if (pointer.settled || previous === null) return still('no-fallback')
  return {
    versions: { ...versions, pointer: { current: previous, previous, settled: true } },
    outcome: 'rolled-back',
  }
}

/** One step of the table of a version: the next state, and what came of the operation. A refusal changes nothing. */
export function stepVersions(versions: Versions, event: VersionEvent): VersionStep {
  return 'version' in event
    ? ofInstall(versions, standingOfVersion(versions, event.version), event)
    : ofRunning(versions, event.kind)
}

export function parsePointer(text: string): VersionPointer | undefined {
  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof read !== 'object' || read === null || Array.isArray(read)) return undefined
  const { current, previous, settled } = read as Record<string, unknown>
  if (typeof current !== 'string' || current === '') return undefined
  if (previous !== null && (typeof previous !== 'string' || previous === '')) return undefined
  if (typeof settled !== 'boolean' || (settled && previous !== current)) return undefined
  return { current, previous, settled }
}
