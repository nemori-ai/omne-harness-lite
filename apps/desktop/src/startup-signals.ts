// What the main process tells whoever started it; the scripts that start it read the same constants.
// Dependency-free, so plain Node imports it from scripts/.

export const REMOTE_DEBUGGING_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe'] as const
export type RemoteDebuggingSwitch = (typeof REMOTE_DEBUGGING_SWITCHES)[number]

export const REMOTE_DEBUGGING_EXIT_CODE = 97
export const REMOTE_DEBUGGING_REFUSED_MESSAGE = 'remote debugging refused'

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

export const COOKIE_KEY_WRITER_SWITCH = 'omne-cookie-key-writer'
export const COOKIE_KEY_WRITER_FAILED_FILE = 'cookie-key-writer-failed.json'
export const COOKIE_KEY_STORED_MESSAGE = 'cookie key stored before start'
export const COOKIE_KEY_CHECKED_MESSAGE = 'cookie key checked: this launch uses the stored key'
export const COOKIE_KEY_MISMATCH_MESSAGE =
  'this launch does not use the cookie key its key writer stored'
export const COOKIE_KEY_NOT_STORED_MESSAGE = 'the cookie key writer did not store the cookie key'
export const COOKIE_KEY_UNKNOWN_MESSAGE =
  'could not tell whether the cookie key writer stored the cookie key'
export const COOKIE_KEY_SKIPPED_MESSAGE =
  'cookie key writer skipped: a run of this version failed within a day'
export const COOKIE_KEY_NO_PROBE_MESSAGE =
  'the cookie key writer printed no probe; the key in use is not checked'
export const COOKIE_KEY_WRITER_WARNINGS = [
  COOKIE_KEY_NOT_STORED_MESSAGE,
  COOKIE_KEY_UNKNOWN_MESSAGE,
  COOKIE_KEY_SKIPPED_MESSAGE,
  COOKIE_KEY_NO_PROBE_MESSAGE,
] as const
