import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileNativeProgram, type SessionReader } from '../macos-execution/compile.ts'
import type { Failure } from '../host-paths.ts'
import { macosFilesSource } from './native-source.ts'
import { parseReply, type NativeInput, type NativeReply } from './protocol.ts'
import { spawnFilesHelper } from './launcher.ts'

let compilation: Promise<SessionReader> | undefined

export async function filesHelper(): Promise<SessionReader> {
  const pending = (compilation ??= compileNativeProgram(
    {
      cacheRoot: join(tmpdir(), 'omne-macos-files'),
      xcodeSelect: '/usr/bin/xcode-select',
      cc: '/usr/bin/cc',
    },
    'omne-files',
    macosFilesSource,
  ).catch((): SessionReader => ({ kind: 'missing', missing: 'compile' })))
  const result = await pending
  if (result.kind === 'missing' && compilation === pending) compilation = undefined
  return result
}

/** An exited helper cannot keep descriptors live; its effect may still need recognition. */
export function runHelper(
  executable: string,
  input: NativeInput,
  timeoutMs = 30_000,
): Promise<NativeReply | Failure> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    const child = spawnFilesHelper(executable)
    let failed = false
    const timer = setTimeout(() => {
      failed = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.resume()
    child.stdin.on('error', () => {
      failed = true
    })
    child.on('error', () => {
      failed = true
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (failed || code !== 0) return resolve('unknown')
      try {
        resolve(parseReply(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      } catch {
        resolve('unknown')
      }
    })
    child.stdin.end(JSON.stringify(input))
  })
}

export async function invoke(input: NativeInput): Promise<NativeReply | Failure> {
  const helper = await filesHelper()
  if (helper.kind !== 'ready') return 'unavailable'
  return runHelper(helper.path, input)
}
