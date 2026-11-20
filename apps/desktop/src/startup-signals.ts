// What the main process tells whoever started it; the scripts that start it read the same constants.
// Dependency-free, so plain Node imports it from scripts/.

export const REMOTE_DEBUGGING_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe'] as const
export type RemoteDebuggingSwitch = (typeof REMOTE_DEBUGGING_SWITCHES)[number]

/** A release build started with a remote debugging switch exits with this, and nothing else does. */
export const REMOTE_DEBUGGING_EXIT_CODE = 97
export const REMOTE_DEBUGGING_REFUSED_MESSAGE = 'remote debugging refused'

/** The first main-process line of every launch, with the profile as `buildProfile`. */
export const BUILD_PROFILE_MESSAGE = 'build profile'

/** Once per process, when the main window holds a document answered 2xx and is shown. */
export const MAIN_WINDOW_READY_MESSAGE = 'main window loaded and shown'

/** The remote debugging switch in Chromium's view or in `argv`, in every spelling Chromium takes. */
export function remoteDebuggingSwitch(
  hasSwitch: (name: RemoteDebuggingSwitch) => boolean,
  argv: readonly string[],
  platform: string,
): RemoteDebuggingSwitch | undefined {
  const windows = platform === 'win32'
  for (const name of REMOTE_DEBUGGING_SWITCHES) {
    if (hasSwitch(name)) return name
    for (const raw of argv) {
      const arg = windows ? raw.toLowerCase() : raw
      const prefix = arg.startsWith('--')
        ? 2
        : arg.startsWith('-') || (windows && arg.startsWith('/'))
          ? 1
          : 0
      if (prefix === 0) continue
      const end = arg.indexOf('=')
      if (arg.slice(prefix, end < 0 ? undefined : end) === name) return name
    }
  }
  return undefined
}

/** The build profile a main-process log line reports, if it is the line that carries one. */
export function reportedBuildProfile(line: string): string | undefined {
  if (!line.startsWith('{')) return undefined
  try {
    const record: unknown = JSON.parse(line)
    if (typeof record !== 'object' || record === null) return undefined
    const { process, buildProfile } = record as Record<string, unknown>
    return process === 'main' && typeof buildProfile === 'string' ? buildProfile : undefined
  } catch {
    return undefined
  }
}
