import { spawn } from 'node:child_process'
import { constants, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable, Writable } from 'node:stream'
import { compileNativeProgram } from '../../src/macos-execution/compile.ts'
import { macosFilesSource } from '../../src/macos-files/native-source.ts'

type Before = (fn: string, paths: readonly string[]) => Promise<void>
let program: string | undefined
let preparing: Promise<void> | undefined

/** Only this test executable contains the syscall handshake; production has no fault controls. */
export function prepareNativeHooks(): Promise<void> {
  return (preparing ??= (async () => {
    const helper = await compileNativeProgram(
      {
        cacheRoot: join(tmpdir(), 'omne-macos-files-tests'),
        xcodeSelect: '/usr/bin/xcode-select',
        cc: '/usr/bin/cc',
      },
      'omne-files-test',
      `#define OMNE_FILES_TESTING 1\n${macosFilesSource}`,
    )
    if (helper.kind !== 'ready')
      throw new Error(`native test helper unavailable: ${helper.missing}`)
    program = helper.path
  })())
}

function event(value: unknown): { fn: string; paths: string[] } {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('fn' in value) ||
    typeof value.fn !== 'string' ||
    !('paths' in value) ||
    !Array.isArray(value.paths) ||
    !value.paths.every((path: unknown): path is string => typeof path === 'string')
  )
    throw new Error('invalid native syscall event')
  return { fn: value.fn, paths: value.paths }
}

function errno(error: unknown): number {
  const code = error instanceof Error && 'code' in error ? error.code : 'EIO'
  return Object.entries(constants.errno).find(([name]) => name === code)?.[1] ?? constants.errno.EIO
}

export function spawnWithNativeHooks(executable: string, before: Before) {
  if (process.platform !== 'darwin')
    return spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  if (program === undefined) throw new Error('prepareNativeHooks must run first')
  const child = spawn(program, [], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] })
  const events = child.stdio[3],
    acknowledgements = child.stdio[4]
  if (
    !(events instanceof Readable) ||
    !(acknowledgements instanceof Writable) ||
    child.stdin === null ||
    child.stdout === null ||
    child.stderr === null
  )
    throw new Error('native test pipes missing')
  acknowledgements.on('error', () => undefined)
  void (async () => {
    for await (const line of createInterface({ input: events })) {
      const call = event(JSON.parse(line))
      let code = 0
      try {
        await before(call.fn, call.paths)
      } catch (error) {
        code = errno(error)
      }
      acknowledgements.write(`${code}\n`)
    }
  })().catch(() => child.kill('SIGKILL'))
  return Object.assign(child, { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr })
}
