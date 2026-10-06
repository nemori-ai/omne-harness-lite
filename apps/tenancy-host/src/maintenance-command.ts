import { isAbsolute } from 'node:path'
import type { MaintenanceCommand, MaintenanceCommandIo } from './command-data.ts'
import type { MaintenanceCommandEffects } from './maintenance-ports.ts'

export function parseMaintenanceCommand(
  argv: readonly string[],
  validLocation: MaintenanceCommandEffects['validLocation'],
): MaintenanceCommand | undefined {
  const [kind, ...rest] = argv
  if (kind !== 'ops' && kind !== 'verify' && kind !== 'restore-isolated') return undefined
  const flags = new Map<string, string>()
  let operation: 'full-health' | 'backup' | 'backup-status' | undefined
  let onlyIfDue = false
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i]!
    if (
      kind === 'ops' &&
      (word === 'full-health' || word === 'backup' || word === 'backup-status')
    ) {
      if (operation !== undefined) return undefined
      operation = word
    } else if (kind === 'ops' && word === '--only-if-due') {
      if (onlyIfDue) return undefined
      onlyIfDue = true
    } else {
      const allowed =
        kind === 'ops'
          ? ['--socket-dir']
          : kind === 'verify'
            ? ['--source', '--work-dir']
            : ['--source', '--target', '--work-dir']
      if (!allowed.includes(word) || flags.has(word)) return undefined
      const value = rest[++i]
      if (!validLocation(value) || !isAbsolute(value)) return undefined
      flags.set(word, value)
    }
  }
  if (kind === 'ops') {
    const socketDirectory = flags.get('--socket-dir')
    if (
      socketDirectory === undefined ||
      operation === undefined ||
      (onlyIfDue && operation !== 'backup')
    )
      return undefined
    return { kind, socketDirectory, operation, onlyIfDue }
  }
  const sourceLocation = flags.get('--source')
  const workDirectory = flags.get('--work-dir')
  if (sourceLocation === undefined || workDirectory === undefined) return undefined
  if (kind === 'verify') return { kind, sourceLocation, workDirectory }
  const targetLocation = flags.get('--target')
  return targetLocation === undefined
    ? undefined
    : { kind, sourceLocation, workDirectory, targetLocation }
}

export function maintenanceExit(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('status' in value)) return 0 // validated full-health
  if (value.status === 'outcome-unknown' || value.status === 'unavailable') return 1
  if (value.status === 'observed') return 'health' in value && value.health === 'current' ? 0 : 2
  return ['completed', 'not-due', 'verified', 'restored-isolated'].includes(String(value.status))
    ? 0
    : 2
}

export async function runMaintenanceCommand(
  command: MaintenanceCommand,
  io: MaintenanceCommandIo,
  signal: AbortSignal,
  effects: MaintenanceCommandEffects,
): Promise<number> {
  const diagnostics: string[] = []
  let closingFailed = false
  try {
    let result: unknown
    if (command.kind === 'ops') result = await effects.callOps(command, signal)
    else {
      let lease
      try {
        lease = await effects.openOffline(command.workDirectory)
        const offline = lease.create(diagnostic =>
          diagnostics.push(JSON.stringify(diagnostic) + '\n'),
        )
        result =
          command.kind === 'verify'
            ? await offline.verify({ sourceLocation: command.sourceLocation }, signal)
            : await offline.restoreIsolated(
                { sourceLocation: command.sourceLocation, targetLocation: command.targetLocation },
                signal,
              )
      } catch (error) {
        result = effects.failureResult(error)
      } finally {
        try {
          await lease?.close()
        } catch {
          closingFailed = true
          diagnostics.push('tenancy-host: maintenance cleanup incomplete\n')
        }
      }
    }
    if (
      closingFailed &&
      typeof result === 'object' &&
      result !== null &&
      'status' in result &&
      ['completed', 'not-due', 'verified', 'restored-isolated', 'observed'].includes(
        String(result.status),
      )
    )
      throw new Error('maintenance cleanup incomplete')
    for (const line of diagnostics.splice(0)) await io.stderr(line)
    await io.stdout(JSON.stringify(result) + '\n')
    return closingFailed ? 1 : maintenanceExit(result)
  } catch {
    try {
      for (const line of diagnostics) await io.stderr(line)
      await io.stderr(
        command.kind === 'ops'
          ? 'tenancy-host: ops result unconfirmed\n'
          : 'tenancy-host: maintenance failed\n',
      )
    } catch {
      /* Diagnostic output failure cannot turn this operation into success. */
    }
    return 1
  }
}
