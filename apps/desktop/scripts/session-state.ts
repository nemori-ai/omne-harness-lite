// Whether the macOS screen is locked: macOS then sends no `show`, so window readiness cannot be judged.
import { execFileSync } from 'node:child_process'

export type ScreenLock = Readonly<{ locked: boolean }> | Readonly<{ unknown: string }>

export const screenLockedFromIoreg = (xml: string): boolean =>
  /<key>CGSSessionScreenIsLocked<\/key>\s*<true\s*\/>/.test(xml)

export function screenLock(
  platform: NodeJS.Platform = process.platform,
  ioreg: () => string = () =>
    execFileSync('ioreg', ['-n', 'Root', '-d1', '-a'], { encoding: 'utf8', maxBuffer: 16 << 20 }),
): ScreenLock {
  if (platform !== 'darwin') return { locked: false }
  let xml: string
  try {
    xml = ioreg()
  } catch (failure) {
    return {
      unknown: `ioreg failed: ${failure instanceof Error ? failure.message : String(failure)}`,
    }
  }
  if (!xml.includes('IOConsoleUsers')) return { unknown: 'ioreg listed no IOConsoleUsers' }
  return { locked: screenLockedFromIoreg(xml) }
}

export const SCREEN_LOCKED_REASON =
  'the macOS screen is locked (CGSSessionScreenIsLocked): macOS then reports no window as shown'
