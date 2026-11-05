/** @module-tag slow */
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { nativeSource } from '../../src/windows-execution/native-source.ts'

it('keeps a failed pipe read distinct from a completely drained output', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-read-fault-')))
  try {
    const source = join(directory, 'bridge.cs')
    const executable = join(directory, 'bridge.exe')
    const injection = 'byte[] data=new byte[chunk];'
    expect(nativeSource.split(injection)).toHaveLength(2)
    await writeFile(
      source,
      nativeSource.replace(injection, `if(stream=="stdout")CloseHandle(pipe); ${injection}`),
    )
    const framework = join(
      process.env['SystemRoot'] ?? 'C:\\Windows',
      'Microsoft.NET',
      'Framework64',
      'v4.0.30319',
    )
    await promisify(execFile)(
      join(framework, 'csc.exe'),
      [
        '/nologo',
        '/target:exe',
        `/out:${executable}`,
        `/reference:${join(framework, 'System.Web.Extensions.dll')}`,
        source,
      ],
      { windowsHide: true },
    )
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const closed = once(child, 'close')
    const deadline = setTimeout(() => child.kill(), 10_000)
    let text = ''
    child.stderr.resume()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (part: string) => {
      text += part
      if (text.includes('"t":"exit"')) child.stdin.end('dispose\n')
    })
    child.stdin.write(
      `${JSON.stringify({
        mode: 'command',
        name: `Local\\omne-command-${randomUUID()}`,
        executable: process.execPath,
        args: ['-e', ''],
        cwd: directory,
        env: {},
        stdin: null,
        maxChunkBytes: 32,
        stopBoundMs: 2000,
      })}\ngo\n`,
    )
    try {
      await closed
      expect(text).toContain('"t":"exit"')
      expect(text).toContain('"complete":false')
    } finally {
      clearTimeout(deadline)
      child.kill()
      await closed
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)
