import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { nativeSource } from './native-source.ts'
import { terminalNativeSource } from './terminal-native-source.ts'

const run = promisify(execFile)
let compilation: Promise<string> | undefined
let terminalCompilation: Promise<string> | undefined

/** Compile only project source with the installed .NET Framework compiler. */
export function windowsBridgeExecutable(): Promise<string> {
  compilation ??= compile(false).catch(error => {
    compilation = undefined
    throw error
  })
  return compilation
}

export function windowsTerminalExecutable(): Promise<string> {
  terminalCompilation ??= compile(true).catch(error => {
    terminalCompilation = undefined
    throw error
  })
  return terminalCompilation
}

async function compile(terminal: boolean): Promise<string> {
  const digest = createHash('sha256')
    .update(nativeSource)
    .update(terminal ? terminalNativeSource : '')
    .digest('hex')
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
    const terminalSource = join(stage, 'terminal.cs')
    if (terminal) await writeFile(terminalSource, terminalNativeSource)
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
        ...(terminal
          ? [
              '/main:OmneTerminalEntry',
              `/reference:${join(process.env['SystemRoot'] ?? 'C:\\Windows', 'Microsoft.NET', 'assembly', 'GAC_MSIL', 'System.Management.Automation', 'v4.0_3.0.0.0__31bf3856ad364e35', 'System.Management.Automation.dll')}`,
              terminalSource,
            ]
          : []),
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
