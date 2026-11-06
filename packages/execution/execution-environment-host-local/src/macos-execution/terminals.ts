import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { TerminalPlatform } from '../host-terminal.ts'
import { gateEnvironment, readerMissing, type MacosPrerequisite } from './commands.ts'
import type { SessionReader } from './compile.ts'
import { domainReference, type DomainIndex } from './domain-index.ts'
import {
  positive,
  readBootId,
  readIdentity,
  stopRecordedDomain,
  type RecordedSession,
  type SessionCoordinate,
  type StopStatus,
} from './session.ts'

const gateScript = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './terminal-gate.ts' : './terminal-gate.js',
    import.meta.url,
  ),
)

/**
 * node-pty's spawn-helper, found as node-pty finds it: next to the native module it loads.
 * Undefined when node-pty or its native module cannot be loaded.
 */
export function spawnHelperPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const lib = dirname(require.resolve('node-pty'))
    const utils: unknown = require(join(lib, 'utils.js'))
    const load: unknown =
      typeof utils === 'object' && utils !== null
        ? Reflect.get(utils, 'loadNativeModule')
        : undefined
    if (typeof load !== 'function') return undefined
    const native: unknown = Reflect.apply(load, utils, ['pty'])
    const dir: unknown =
      typeof native === 'object' && native !== null ? Reflect.get(native, 'dir') : undefined
    return typeof dir === 'string' ? resolve(lib, `${dir}/spawn-helper`) : undefined
  } catch {
    return undefined
  }
}

const executable = (path: string) =>
  access(path, constants.X_OK).then(
    () => true,
    () => false,
  )

export type TerminalTools = Readonly<{ reader: string; helper: string }>

/** What a macOS terminal needs: the session reader, Bash, node-pty and its executable helper. */
export async function macosTerminalAdmission(
  reader: () => Promise<SessionReader>,
): Promise<TerminalTools | readonly MacosPrerequisite[]> {
  const missing: MacosPrerequisite[] = []
  const reading = await reader()
  if (reading.kind !== 'ready') missing.push(readerMissing(reading))
  if (!(await executable('/bin/bash'))) missing.push('bash')
  const helper = spawnHelperPath()
  if (helper === undefined) missing.push('node-pty')
  else if (!(await executable(helper))) missing.push('spawn-helper')
  if (missing.length > 0 || reading.kind !== 'ready' || helper === undefined) return missing
  return { reader: reading.path, helper }
}

/** The live children of a process; undefined when they cannot be read. */
function readChildren(reader: string, pid: number, boundMs: number): Promise<number[] | undefined> {
  return new Promise(done => {
    execFile(reader, ['children', String(pid)], { timeout: boundMs, env: {} }, (error, stdout) => {
      if (error !== null) return done(undefined)
      const pids = stdout
        .split('\n')
        .filter(line => line !== '')
        .map(positive)
      done(pids.every(pid => pid !== undefined) ? (pids as number[]) : undefined)
    })
  })
}

/** The session the gate's shell leads: the gate's child that leads its own session. */
async function shellSession(
  reader: string,
  gate: number,
  boundMs: number,
): Promise<RecordedSession | undefined> {
  for (const child of (await readChildren(reader, gate, boundMs)) ?? []) {
    const identity = await readIdentity({ reader, pid: child, boundMs })
    if (identity?.kind === 'alive' && identity.sid === child)
      return { sid: child, start: identity.start }
  }
  return undefined
}

/**
 * The macOS terminal domain: the gate's session and the shell's. The sessions are recorded in the
 * cold index before GO (the gate's) and once the shell opened (the shell's). A stop covers both and
 * is confirmed only when both are empty; the FIFO directory goes after a confirmed stop.
 */
export function macosTerminalPlatform(input: {
  scope: ScopeRef
  stopBoundMs: number
  startBoundMs: number
  reader(): Promise<SessionReader>
  domains: DomainIndex | undefined
}): TerminalPlatform {
  let tools: TerminalTools | undefined
  const coordinates = new Map<string, SessionCoordinate>()
  const directoryOf = (unit: string) => join(tmpdir(), `${unit}.terminal`)

  const record = async (resource: ManagedResource, coordinate: SessionCoordinate) => {
    coordinates.set(resource.key, coordinate)
    return (
      input.domains === undefined || (await input.domains.record(resource, input.scope, coordinate))
    )
  }

  return {
    async admit() {
      const admitted = await macosTerminalAdmission(input.reader)
      if (!('reader' in admitted)) return admitted
      tools = admitted
      return 'ready'
    },
    bootId: readBootId,
    allocate(bootId) {
      const key = randomUUID()
      return {
        key,
        coordinate: { unit: `omne-terminal-${key}`, bootId },
        reference: domainReference(key, bootId, input.scope),
      }
    },
    launch(coordinate): ChildProcess {
      if (tools === undefined) throw new Error('a terminal launch before admission')
      return spawn(
        process.execPath,
        [gateScript, coordinate.unit, tools.reader, tools.helper, directoryOf(coordinate.unit)],
        {
          detached: true,
          cwd: '/',
          env: { ...gateEnvironment },
          stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        },
      )
    },
    async ready(coordinate, resource, gate) {
      if (tools === undefined || gate.pid === undefined) return false
      const identity = await readIdentity({
        reader: tools.reader,
        pid: gate.pid,
        boundMs: input.startBoundMs,
      })
      if (identity?.kind !== 'alive' || identity.sid !== gate.pid) return false
      return record(resource, {
        bootId: coordinate.bootId,
        sessions: [{ sid: gate.pid, start: identity.start }],
      })
    },
    async opened(_coordinate, resource, gate) {
      const known = coordinates.get(resource.key)
      if (tools === undefined || gate.pid === undefined || known === undefined) return false
      const shell = await shellSession(tools.reader, gate.pid, input.startBoundMs)
      if (shell === undefined) return false
      return record(resource, { ...known, sessions: [...known.sessions, shell] })
    },
    async stop(coordinate, resource, gate, gateExited): Promise<StopStatus> {
      let known = coordinates.get(resource.key)
      let status: StopStatus = 'unconfirmed'
      if (known === undefined) {
        // No session was recorded: no GO went out, so no shell ran. The gate alone is stopped.
        gate.kill('SIGKILL')
        status = await Promise.race([
          gateExited.then((): StopStatus => 'confirmed'),
          new Promise<StopStatus>(done => setTimeout(done, input.stopBoundMs, 'unconfirmed')),
        ])
      } else {
        const reading = await input.reader()
        if (reading.kind === 'ready') {
          // A shell started after GO but not yet recorded is found through the gate that started it.
          if (known.sessions.length === 1 && gate.pid !== undefined && gate.exitCode === null) {
            const shell = await shellSession(reading.path, gate.pid, input.stopBoundMs)
            if (shell !== undefined) known = { ...known, sessions: [...known.sessions, shell] }
          }
          status = await stopRecordedDomain({
            reader: reading.path,
            coordinate: known,
            bootId: await readBootId(),
            boundMs: input.stopBoundMs,
          })
        }
      }
      if (status === 'confirmed') {
        await rm(directoryOf(coordinate.unit), { recursive: true, force: true }).catch(
          () => undefined,
        )
        await input.domains?.forget(resource.key)
        coordinates.delete(resource.key)
      }
      return status
    },
  }
}
