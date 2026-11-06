import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { sessionReaderSource } from './native-source.ts'

const run = promisify(execFile)

/** The session reader, or why it is missing; the provider reports the latter as a prerequisite. */
export type SessionReader =
  | Readonly<{ kind: 'ready'; path: string }>
  | Readonly<{ kind: 'missing'; missing: 'commandLineTools' | 'compile' }>

let compilation: Promise<SessionReader> | undefined

/**
 * The session reader's executable, compiled once per content into the user's own temporary
 * directory. `xcode-select -p` is asked first: on a host without the Command Line Tools,
 * `/usr/bin/cc` would open the installer dialog instead of failing. A missing answer is not kept,
 * so a later start finds tools installed meanwhile.
 */
export function sessionReader(): Promise<SessionReader> {
  const running = (compilation ??= compile().catch((): SessionReader => ({
    kind: 'missing',
    missing: 'compile',
  })))
  void running.then(reading => {
    if (reading.kind === 'missing' && compilation === running) compilation = undefined
  })
  return running
}

async function compile(): Promise<SessionReader> {
  const digest = createHash('sha256').update(sessionReaderSource).digest('hex')
  const cache = join(tmpdir(), 'omne-macos-execution', digest)
  const executable = join(cache, 'omne-session')
  try {
    await access(executable)
    return { kind: 'ready', path: executable }
  } catch {
    /* Compile the missing content-addressed artifact. */
  }
  try {
    await run('/usr/bin/xcode-select', ['-p'], { timeout: 10_000 })
  } catch {
    return { kind: 'missing', missing: 'commandLineTools' }
  }
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const stage = await mkdtemp(join(cache, 'compile-'))
  try {
    const source = join(stage, 'omne-session.c')
    const result = join(stage, 'omne-session')
    await writeFile(source, sessionReaderSource)
    try {
      await run('/usr/bin/cc', ['-O2', '-Wall', '-o', result, source], {
        timeout: 60_000,
        maxBuffer: 256 * 1024,
      })
    } catch {
      return { kind: 'missing', missing: 'compile' }
    }
    try {
      await rename(result, executable)
    } catch (error) {
      try {
        await access(executable)
      } catch {
        throw error
      }
    }
    return { kind: 'ready', path: executable }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
