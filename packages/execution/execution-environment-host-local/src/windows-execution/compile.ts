import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { nativeSource } from './native-source.ts'

const run = promisify(execFile)
let compilation: Promise<string> | undefined

/** Compile only project source with the installed .NET Framework compiler. */
export function windowsBridgeExecutable(): Promise<string> {
  compilation ??= compile().catch(error => {
    compilation = undefined
    throw error
  })
  return compilation
}

async function compile(): Promise<string> {
  const digest = createHash('sha256').update(nativeSource).digest('hex')
  const cache = join(tmpdir(), 'omne-windows-execution', digest)
  const executable = join(cache, 'bridge.exe')
  try {
    await access(executable)
    return executable
  } catch {
    /* Compile the missing content-addressed artifact. */
  }
  await mkdir(cache, { recursive: true })
  const stage = await mkdtemp(join(cache, 'compile-'))
  try {
    const source = join(stage, 'bridge.cs')
    const result = join(stage, 'bridge.exe')
    await writeFile(source, nativeSource)
    const framework = join(
      process.env['SystemRoot'] ?? 'C:\\Windows',
      'Microsoft.NET',
      'Framework64',
      'v4.0.30319',
    )
    await run(
      join(framework, 'csc.exe'),
      [
        '/nologo',
        '/target:exe',
        `/out:${result}`,
        `/reference:${join(framework, 'System.Web.Extensions.dll')}`,
        source,
      ],
      { windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024 },
    )
    try {
      await rename(result, executable)
    } catch (error) {
      try {
        await access(executable)
      } catch {
        throw error
      }
    }
    return executable
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
