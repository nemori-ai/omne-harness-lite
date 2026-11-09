import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { release } from 'node:os'
import { join } from 'node:path'
import { deferred, startBridge, within } from './bridge.ts'
import { windowsBridgeExecutable } from './compile.ts'

/** A Windows prerequisite a start found missing (SPEC, Windows platform prerequisites). */
export type WindowsPrerequisite =
  | 'windows-version'
  | 'dotnet-csc'
  | 'job-round-trip'
  | 'powershell-assembly'

export type WindowsCommandReading =
  | Readonly<{ kind: 'satisfied' }>
  | Readonly<{ kind: 'unsatisfied'; missing: readonly WindowsPrerequisite[] }>
  /** The probe itself failed: nothing is known about the prerequisites. */
  | Readonly<{ kind: 'unknown' }>

const unsatisfied = (missing: WindowsPrerequisite): WindowsCommandReading => ({
  kind: 'unsatisfied',
  missing: [missing],
})

/** 64-bit Windows 10 1809, Windows Server 2019 or later. */
function supportedVersion(): boolean | undefined {
  if (process.platform !== 'win32' || process.arch !== 'x64') return false
  const [major, , build] = release().split('.').map(Number)
  if (major === undefined || build === undefined || !Number.isFinite(build)) return undefined
  return major > 10 || (major === 10 && build >= 17763)
}

/**
 * The command prerequisites, in order; a later item needs the earlier ones. The round trip runs an
 * anchored probe Job, opens it by name, reads its members, stops it and confirms the stop.
 */
export async function probeWindowsCommands(boundMs: number): Promise<WindowsCommandReading> {
  const version = supportedVersion()
  if (version === undefined) return { kind: 'unknown' }
  if (!version) return unsatisfied('windows-version')
  const framework = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'Microsoft.NET',
    'Framework64',
    'v4.0.30319',
  )
  try {
    await access(join(framework, 'csc.exe'))
    await windowsBridgeExecutable()
  } catch {
    return unsatisfied('dotnet-csc')
  }
  const answer = deferred<boolean | undefined>()
  const bridge = await startBridge({
    request: { mode: 'probe', name: `Local\\omne-probe-${randomUUID()}`, stopBoundMs: boundMs },
    maxChunkBytes: 1,
    onFrame: frame => {
      if (frame.t === 'probe') answer.resolve(frame.ok)
      if (frame.t === 'fault') answer.resolve(false)
    },
    onClosed: () => answer.resolve(undefined),
  })
  const ok = await within(answer.promise, 2 * boundMs)
  bridge.disconnect()
  if (
    (await within(
      bridge.closed.then(() => true),
      boundMs,
    )) !== true
  )
    bridge.terminate()
  if (ok === undefined) return { kind: 'unknown' }
  return ok ? { kind: 'satisfied' } : unsatisfied('job-round-trip')
}
