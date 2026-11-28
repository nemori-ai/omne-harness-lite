import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Ran } from '@omne-harness/goal-contract'

export type Ended = Readonly<{ exit: number | null; tail: string }>
/** Runs one command in a directory until it ends or its time is up. `exit` null: it did not come to an end. */
export type Runner = (
  command: string,
  options: Readonly<{ cwd: string; timeoutMs: number }>,
) => Promise<Ended>
export type RerunPorts = Readonly<{ runner: Runner; timeoutMs: number }>
export type ToRun = Readonly<{ criterion: string; command: string }>

const NOTE_MAX = 400
const TAIL_BYTES = 4096
const KEPT = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL', 'USER'] as const

/** What the command is given of the server's environment: where programs are found and nothing a secret is kept in. */
function environment(): NodeJS.ProcessEnv {
  const kept = KEPT.flatMap(name => {
    const value = process.env[name]
    return value === undefined ? [] : [[name, value] as const]
  })
  return { ...Object.fromEntries(kept), CI: '1' }
}

export const shellRunner: Runner = (command, { cwd, timeoutMs }) =>
  new Promise(resolve => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: environment(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let tail = ''
    const keep = (chunk: Buffer) => void (tail = (tail + chunk.toString('utf8')).slice(-TAIL_BYTES))
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    let late = false
    const timer = setTimeout(() => {
      late = true
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }, timeoutMs)
    const end = (exit: number | null) => {
      clearTimeout(timer)
      resolve({ exit: late ? null : exit, tail })
    }
    child.on('error', () => end(null))
    child.on('close', code => end(code))
  })

function noteOf(ended: Ended, timeoutMs: number): string {
  if (ended.exit === null) return `not finished within ${String(timeoutMs)} ms; stopped`
  const last = ended.tail.trimEnd().split('\n').at(-1) ?? ''
  const head = `exit ${String(ended.exit)}`
  return last === '' ? head : `${head}: ${[...last].slice(-(NOTE_MAX - head.length - 2)).join('')}`
}

/** One command in a copy of its own: the copy is made, the command runs in it, and the copy is removed whatever came of it. */
async function inCopy(ports: RerunPorts, where: string, command: string): Promise<Ended | string> {
  const root = await mkdtemp(join(tmpdir(), 'omne-rerun-'))
  const copy = join(root, 'work')
  try {
    await cp(where, copy, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      verbatimSymlinks: true,
    })
    return await ports.runner(command, { cwd: copy, timeoutMs: ports.timeoutMs })
  } catch (error) {
    return `the working directory could not be copied: ${(error as Error).message}`.slice(
      0,
      NOTE_MAX,
    )
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Runs each command again in a clean copy of the working directory and reads its exit code. Nothing is written in the working directory itself. */
export async function rerunIn(
  ports: RerunPorts,
  where: string | null,
  commands: readonly ToRun[],
): Promise<Ran[]> {
  const results: Ran[] = []
  for (const { criterion, command } of commands) {
    const ended =
      where === null
        ? 'the session has no working directory to run it in'
        : await inCopy(ports, where, command)
    results.push(
      typeof ended === 'string'
        ? ({ criterion, exit: null, note: ended } as Ran)
        : ({ criterion, exit: ended.exit, note: noteOf(ended, ports.timeoutMs) } as Ran),
    )
  }
  return results
}
