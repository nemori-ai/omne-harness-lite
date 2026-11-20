// Whether the macOS screen is locked: macOS then sends no `show`, so window readiness cannot be judged.
import { execFileSync } from 'node:child_process'

export type ScreenLock = Readonly<{ locked: boolean }> | Readonly<{ unknown: string }>

/** `IOConsoleUsers` from `ioreg`, as JSON through plutil. */
function consoleSessions(): unknown {
  const xml = execFileSync('ioreg', ['-n', 'Root', '-d1', '-a'], { maxBuffer: 16 << 20 })
  const json = execFileSync('plutil', ['-extract', 'IOConsoleUsers', 'json', '-o', '-', '-'], {
    input: xml,
    encoding: 'utf8',
  })
  return JSON.parse(json)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Only the session on the console decides: another user's locked session behind it does not. */
export function screenLock(
  platform: NodeJS.Platform = process.platform,
  sessions: () => unknown = consoleSessions,
): ScreenLock {
  if (platform !== 'darwin') return { locked: false }
  try {
    const listing = sessions()
    if (Array.isArray(listing))
      for (const entry of listing as unknown[])
        if (isRecord(entry) && entry['kCGSSessionOnConsoleKey'] === true)
          return { locked: entry['CGSSessionScreenIsLocked'] === true }
    return { unknown: 'ioreg listed no foreground console session' }
  } catch (failure) {
    return {
      unknown: `could not read IOConsoleUsers: ${failure instanceof Error ? failure.message : String(failure)}`,
    }
  }
}

export const SCREEN_LOCKED_REASON =
  'the macOS screen is locked (CGSSessionScreenIsLocked): macOS then reports no window as shown'
