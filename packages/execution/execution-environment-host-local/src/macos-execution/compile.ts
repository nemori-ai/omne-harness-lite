import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { sessionReaderSource } from './native-source.ts'

const run = promisify(execFile)

export type SessionReader =
  | Readonly<{ kind: 'ready'; path: string }>
  | Readonly<{ kind: 'missing'; missing: 'commandLineTools' | 'compile' }>

export type CompileTools = Readonly<{ cacheRoot: string; xcodeSelect: string; cc: string }>

const hostTools = (): CompileTools => ({
  cacheRoot: join(tmpdir(), 'omne-macos-execution'),
  xcodeSelect: '/usr/bin/xcode-select',
  cc: '/usr/bin/cc',
})

let compilation: Promise<SessionReader> | undefined

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

export async function compileSessionReader(tools: CompileTools): Promise<SessionReader> {
  return compileNativeProgram(tools, 'omne-session', sessionReaderSource)
}

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
  } catch {}
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
