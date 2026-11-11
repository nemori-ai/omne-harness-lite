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

/** Where the reader is compiled and with which tools; the tests point these elsewhere. */
export type CompileTools = Readonly<{ cacheRoot: string; xcodeSelect: string; cc: string }>

const hostTools = (): CompileTools => ({
  cacheRoot: join(tmpdir(), 'omne-macos-execution'),
  xcodeSelect: '/usr/bin/xcode-select',
  cc: '/usr/bin/cc',
})

let compilation: Promise<SessionReader> | undefined

/**
 * The session reader's executable, compiled once per content into the user's own temporary
 * directory. `xcode-select -p` is asked first: on a host without the Command Line Tools,
 * `/usr/bin/cc` would open the installer dialog instead of failing. A missing answer is not kept,
 * so a later start finds tools installed meanwhile.
 */
export function sessionReader(): Promise<SessionReader> {
  const running = (compilation ??= compileSessionReader(hostTools()).catch((): SessionReader => ({
    kind: 'missing',
    missing: 'compile',
  })))
  void running.then(reading => {
    if (reading.kind === 'missing' && compilation === running) compilation = undefined
  })
  return running
}

/** Compiles the reader into a content-addressed directory under `tools.cacheRoot`. */
export async function compileSessionReader(tools: CompileTools): Promise<SessionReader> {
  return compileNativeProgram(tools, 'omne-session', sessionReaderSource)
}

/** Compiles a public-API helper using the same tool check and content-addressed cache. */
export async function compileNativeProgram(
  tools: CompileTools,
  name: string,
  sourceText: string,
): Promise<SessionReader> {
  const digest = createHash('sha256').update(sourceText).digest('hex')
  const cache = join(tools.cacheRoot, digest)
  const executable = join(cache, name)
  try {
    await access(executable)
    return { kind: 'ready', path: executable }
  } catch {
    /* Compile the missing content-addressed artifact. */
  }
  try {
    await run(tools.xcodeSelect, ['-p'], { timeout: 10_000 })
  } catch {
    return { kind: 'missing', missing: 'commandLineTools' }
  }
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const stage = await mkdtemp(join(cache, 'compile-'))
  try {
    const source = join(stage, `${name}.c`)
    const result = join(stage, name)
    await writeFile(source, sourceText)
    try {
      await run(tools.cc, ['-O2', '-Wall', '-o', result, source], {
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
