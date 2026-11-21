// Which processes a launch created, told apart from everything else on the machine: a listing taken
// just before the launch, start times, parents and process groups. Nothing else is counted or killed.

export type ProcessInfo = Readonly<{
  pid: number
  ppid: number
  pgid?: number
  command: string
  executable?: string
  startedAt?: number
  zombie?: boolean
}>

export type ProcessLocation = Readonly<{ command: string; processDir: string }>
/** `exitedAt` is set once the main process has exited: its PID may then be another's. */
export type LaunchRoot = {
  readonly pid: number
  readonly spawnedAt: number
  readonly userDataDir?: string
  exitedAt?: number
}

const PS_LINE =
  /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w{3} \w{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s+(.*)$/

/** `ps -A -o pid=,ppid=,pgid=,stat=,lstart=,args=` under `LC_ALL=C`. */
export function parsePsListing(output: string): ProcessInfo[] {
  return output.split('\n').flatMap(line => {
    const match = PS_LINE.exec(line)
    if (!match) return []
    const startedAt = Date.parse(match[5]!.replace(/\s+/g, ' '))
    return [
      {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        zombie: match[4]!.startsWith('Z'),
        command: match[6]!,
        ...(Number.isNaN(startedAt) ? {} : { startedAt }),
      },
    ]
  })
}

/** The JSON of `Get-CimInstance Win32_Process`: one object or an array. */
export function parseWindowsListing(output: string): ProcessInfo[] {
  let rows: unknown
  try {
    rows = JSON.parse(output.replace(/^﻿/, ''))
  } catch (failure) {
    throw new Error(
      `the Windows process listing is not JSON: ${JSON.stringify(output.slice(0, 200))}`,
      {
        cause: failure,
      },
    )
  }
  return (Array.isArray(rows) ? rows : [rows]).flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return []
    const get = (name: string): unknown => Reflect.get(row, name)
    const pid = Number(get('ProcessId'))
    if (!Number.isSafeInteger(pid)) return []
    const [executable, command, created] = [
      get('ExecutablePath'),
      get('CommandLine'),
      get('Created'),
    ]
    return [
      {
        pid,
        ppid: Number(get('ParentProcessId')),
        command: typeof command === 'string' ? command : '',
        ...(typeof executable === 'string' ? { executable } : {}),
        ...(typeof created === 'number' ? { startedAt: created } : {}),
      },
    ]
  })
}

export function runsFrom(
  process: ProcessInfo,
  location: ProcessLocation,
  platform: NodeJS.Platform,
): boolean {
  if (platform === 'win32')
    return process.executable?.toLowerCase() === location.command.toLowerCase()
  return process.command.startsWith(`${location.processDir}/`)
}

function createdByLaunch(
  process: ProcessInfo,
  root: LaunchRoot,
  preexisting: ReadonlySet<number>,
  platform: NodeJS.Platform,
): boolean {
  if (process.pid <= 0 || process.zombie === true || preexisting.has(process.pid)) return false
  if (process.startedAt === undefined) return platform !== 'win32'
  // ps reports whole seconds, and Linux may round the start a second down; CIM is exact, and Windows
  // reuses PIDs quickly.
  const earliest =
    platform === 'win32'
      ? root.spawnedAt
      : Math.floor(root.spawnedAt / 1000) * 1000 - (platform === 'linux' ? 1000 : 0)
  return process.startedAt >= earliest
}

/** Whether `command` runs on the launch's own user data: its switch, or Crashpad's database in it. */
function usesLaunchProfile(
  command: string,
  directory: string | undefined,
  platform: NodeJS.Platform,
): boolean {
  if (directory === undefined) return false
  // ps drops argv boundaries; include the whole known value and match the end of the switch.
  const path = directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const child = platform === 'win32' ? '\\\\' : '/'
  return new RegExp(
    `(?:^|\\s)"?--(?:user-data-dir="?${path}|database="?${path}${child}Crashpad)"?(?:\\s|$)`,
    platform === 'win32' ? 'i' : '',
  ).test(command)
}

/**
 * The processes the launch at `root` created: its descendants, its group, or its executable running
 * on the launch's own user data. The executable alone is not enough: another launcher's app (as
 * `pnpm run dev`) may run from the same Electron.
 */
export function launchProcesses(
  listing: readonly ProcessInfo[],
  root: LaunchRoot,
  preexisting: ReadonlySet<number>,
  location: ProcessLocation,
  platform: NodeJS.Platform,
): ProcessInfo[] {
  const created = listing.filter(process => createdByLaunch(process, root, preexisting, platform))
  // A process with the root's PID is a later one when its start is clearly after the spawn.
  const impostor = created.find(
    process =>
      process.pid === root.pid &&
      process.startedAt !== undefined &&
      process.startedAt > Math.min(root.exitedAt ?? Infinity, root.spawnedAt + 5_000),
  )
  const ours = new Set<number>([root.pid])
  for (let grew = true; grew;) {
    grew = false
    for (const process of created) {
      if (ours.has(process.pid) || !ours.has(process.ppid)) continue
      // Started under the root's PID after the root exited: another process's child.
      const afterExit =
        process.ppid === root.pid &&
        root.exitedAt !== undefined &&
        process.startedAt !== undefined &&
        process.startedAt > root.exitedAt
      if (afterExit) continue
      const reusedParent =
        impostor?.startedAt !== undefined &&
        process.ppid === root.pid &&
        (process.startedAt ?? Infinity) >= impostor.startedAt
      if (reusedParent) continue
      ours.add(process.pid)
      grew = true
    }
  }
  return created.filter(
    process =>
      process !== impostor &&
      (ours.has(process.pid) ||
        (impostor === undefined && process.pgid !== undefined && process.pgid === root.pid) ||
        (runsFrom(process, location, platform) &&
          usesLaunchProfile(process.command, root.userDataDir, platform))),
  )
}

/** The launch's processes still there: seen before as the same process, or attributable now. */
export function leftoverProcesses(
  after: readonly ProcessInfo[],
  launched: readonly ProcessInfo[],
  root: LaunchRoot,
  preexisting: ReadonlySet<number>,
  location: ProcessLocation,
  platform: NodeJS.Platform,
): ProcessInfo[] {
  const seen = new Map(launched.map(process => [process.pid, process]))
  const now = new Set(
    launchProcesses(after, root, preexisting, location, platform).map(process => process.pid),
  )
  return after.filter(process => {
    if (!createdByLaunch(process, root, preexisting, platform)) return false
    const earlier = seen.get(process.pid)
    const same = earlier?.command === process.command && earlier?.startedAt === process.startedAt
    return same || now.has(process.pid)
  })
}

export function processKind(process: ProcessInfo, rootPid: number): string {
  if (process.pid === rootPid) return 'main'
  if (/crashpad_handler|--type=crashpad-handler\b/i.test(process.command)) return 'crashpad-handler'
  const type = /--type=([\w-]+)/.exec(process.command)?.[1]
  if (type === undefined) return 'other'
  if (type !== 'utility') return type
  const subType = /--utility-sub-type=([\w.]+)/.exec(process.command)?.[1] ?? ''
  if (subType.startsWith('node.')) return 'utility (node)'
  if (subType.startsWith('network.')) return 'utility (network)'
  return subType ? `utility (${subType})` : 'utility'
}

export function describeProcesses(processes: readonly ProcessInfo[], rootPid: number): string {
  const counts = new Map<string, number>()
  for (const process of processes) {
    const kind = processKind(process, rootPid)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts]
    .toSorted(([a], [b]) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)))
    .map(([kind, count]) => (count > 1 ? `${kind} ×${count}` : kind))
    .join(', ')
}

/** The kinds a running app must have: its main process, a renderer and its own utility process. */
export function missingKinds(processes: readonly ProcessInfo[], rootPid: number): string[] {
  const kinds = new Set(processes.map(process => processKind(process, rootPid)))
  return ['main', 'renderer', 'utility (node)'].filter(kind => !kinds.has(kind))
}
