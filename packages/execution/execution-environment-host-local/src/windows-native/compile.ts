import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** One C# program compiled by the installed .NET Framework compiler. */
export type WindowsNativeProgram = Readonly<{
  /** Directory under the user's temporary directory that holds the content-addressed builds. */
  cacheName: string
  executableName: string
  sources: readonly Readonly<{ fileName: string; text: string }>[]
  /** The class whose `Main` runs, when the sources hold more than one. */
  main?: string
  references: readonly string[]
}>

const systemRoot = (): string => process.env['SystemRoot'] ?? 'C:\\Windows'

const framework = (): string => join(systemRoot(), 'Microsoft.NET', 'Framework64', 'v4.0.30319')

/** A .NET Framework assembly next to `csc.exe`, for example `System.Web.Extensions.dll`. */
export const frameworkAssembly = (fileName: string): string => join(framework(), fileName)

/** The Windows PowerShell 5.1 engine assembly in the global assembly cache. */
export const powershellAssembly = (): string =>
  join(
    systemRoot(),
    'Microsoft.NET',
    'assembly',
    'GAC_MSIL',
    'System.Management.Automation',
    'v4.0_3.0.0.0__31bf3856ad364e35',
    'System.Management.Automation.dll',
  )

/**
 * The program's executable, compiled once per content and process. A failed compile is not kept,
 * so the next call compiles again.
 */
export function windowsNativeExecutable(program: WindowsNativeProgram): () => Promise<string> {
  let compilation: Promise<string> | undefined
  return () => {
    compilation ??= compile(program).catch(error => {
      compilation = undefined
      throw error
    })
    return compilation
  }
}

async function compile(program: WindowsNativeProgram): Promise<string> {
  const hash = createHash('sha256')
  for (const part of [
    program.executableName,
    program.main ?? '',
    ...program.references,
    ...program.sources.flatMap(source => [source.fileName, source.text]),
  ])
    hash.update(part).update('\0')
  const cache = join(tmpdir(), program.cacheName, hash.digest('hex'))
  const executable = join(cache, program.executableName)
  try {
    await access(executable)
    return executable
  } catch {
    /* Compile the missing content-addressed artifact. */
  }
  await mkdir(cache, { recursive: true })
  const stage = await mkdtemp(join(cache, 'compile-'))
  try {
    const result = join(stage, program.executableName)
    const sources = await Promise.all(
      program.sources.map(async source => {
        const path = join(stage, source.fileName)
        await writeFile(path, source.text)
        return path
      }),
    )
    await run(
      join(framework(), 'csc.exe'),
      [
        '/nologo',
        '/target:exe',
        `/out:${result}`,
        ...(program.main === undefined ? [] : [`/main:${program.main}`]),
        ...program.references.map(reference => `/reference:${reference}`),
        ...sources,
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
