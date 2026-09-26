import { connect } from 'node:net'
import { isAbsolute, join } from 'node:path'
import {
  createOfflineMaintenance,
  maintenanceFailureResult,
  OPS_SOCKET_NAME,
  readOpsReplyBody,
  validMaintenanceLocation,
} from '@omne-harness-lite/governance-center-entry'
import { openSnapshotInspection } from '@omne-harness-lite/storage-sql'
import { hostSnapshotChecks } from './snapshot-checks.ts'
import { composedMigrationNames, hostMigrationFragments } from './migrations.ts'

export type MaintenanceCommand =
  | {
      readonly kind: 'ops'
      readonly socketDirectory: string
      readonly operation: 'full-health' | 'backup' | 'backup-status'
      readonly onlyIfDue: boolean
    }
  | { readonly kind: 'verify'; readonly sourceLocation: string; readonly workDirectory: string }
  | {
      readonly kind: 'restore-isolated'
      readonly sourceLocation: string
      readonly workDirectory: string
      readonly targetLocation: string
    }

export function parseMaintenanceCommand(argv: readonly string[]): MaintenanceCommand | undefined {
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
      if (!validMaintenanceLocation(value) || !isAbsolute(value)) return undefined
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

/** One request, no retries. Disconnect only abandons the client's wait. */
export function callOps(
  command: Extract<MaintenanceCommand, { kind: 'ops' }>,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = connect(join(command.socketDirectory, OPS_SOCKET_NAME))
    let done = false
    let bytes = Buffer.alloc(0)
    const finish = (error?: Error, value?: unknown) => {
      if (done) return
      done = true
      signal.removeEventListener('abort', abort)
      socket.destroy()
      if (error !== undefined) reject(error)
      else resolve(value)
    }
    const abort = () => finish(new Error('ops-result-unconfirmed'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    socket.on('error', abort)
    socket.on('close', () => {
      if (!done) abort()
    })
    socket.on('connect', () => {
      if (done) return
      const body = JSON.stringify({
        opsVersion: '1',
        operation: command.operation,
        payload: command.operation === 'backup' ? { onlyIfDue: command.onlyIfDue } : {},
      })
      socket.end(`POST / HTTP/1.1\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
    })
    socket.on('data', (chunk: Buffer) => {
      if (done) return
      if (bytes.length + chunk.length > 8192 + 65_536) {
        abort()
        return
      }
      bytes = Buffer.concat([bytes, chunk])
    })
    socket.on('end', () => {
      if (done) return
      const boundary = bytes.indexOf('\r\n\r\n')
      const header = bytes.subarray(0, boundary + 4).toString('latin1')
      const match =
        /^HTTP\/1\.1 200 OK\r\nContent-Type: application\/json\r\nCache-Control: no-store\r\nContent-Length: (0|[1-9][0-9]*)\r\nConnection: close\r\n\r\n$/.exec(
          header,
        )
      if (boundary < 0 || match === null || Number(match[1]) !== bytes.length - boundary - 4) {
        abort()
        return
      }
      try {
        finish(undefined, readOpsReplyBody(command.operation, bytes.subarray(boundary + 4)))
      } catch {
        abort()
      }
    })
  })
}

export interface MaintenanceCommandIo {
  stdout(text: string): void | Promise<void>
  stderr(text: string): void | Promise<void>
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
): Promise<number> {
  const diagnostics: string[] = []
  let closingFailed = false
  try {
    let result: unknown
    if (command.kind === 'ops') result = await callOps(command, signal)
    else {
      let inspection
      try {
        inspection = await openSnapshotInspection(command.workDirectory)
        const offline = createOfflineMaintenance({
          inspection,
          workDirectory: command.workDirectory,
          snapshotChecks: hostSnapshotChecks,
          migrationNames: composedMigrationNames(hostMigrationFragments),
          // Buffer local diagnostics so every output write is awaited outside the callback.
          report: diagnostic => diagnostics.push(JSON.stringify(diagnostic) + '\n'),
        })
        result =
          command.kind === 'verify'
            ? await offline.verify({ sourceLocation: command.sourceLocation }, signal)
            : await offline.restoreIsolated(
                { sourceLocation: command.sourceLocation, targetLocation: command.targetLocation },
                signal,
              )
      } catch (error) {
        result = maintenanceFailureResult(error)
      } finally {
        try {
          await inspection?.close()
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
