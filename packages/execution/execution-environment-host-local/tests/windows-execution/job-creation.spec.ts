/** @module-tag slow */
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { stopWindowsResource } from '../../src/windows-execution/index.ts'
import { nativeSource } from '../../src/windows-execution/native-source.ts'

it('keeps the child suspended and stoppable by Job name when the bridge crashes right after CreateProcessW returns', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-job-create-')))
  const source = join(directory, 'bridge.cs')
  const executable = join(directory, 'bridge.exe')
  const creation =
    'Check(CreateProcessW(r.executable,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08080604,env,r.cwd,ref sx,out child));'
  expect(nativeSource.split(creation)).toHaveLength(2)
  await writeFile(
    source,
    nativeSource.replace(
      creation,
      `${creation} Emit(new {t="created",pid=child.pid});Thread.Sleep(Timeout.Infinite);`,
    ),
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
  const bridge = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const bridgeClosed = once(bridge, 'close')
  bridge.stderr.resume()
  const watchdog = setTimeout(() => bridge.kill(), 15_000)
  const key = randomUUID()
  const name = `Local\\omne-command-${key}`
  const sentinel = join(directory, 'ran')
  try {
    const created = once(bridge.stdout, 'data')
    bridge.stdin.write(
      `${JSON.stringify({
        mode: 'command',
        name,
        executable: process.execPath,
        args: ['-e', 'require("fs").writeFileSync(process.argv[1], "ran")', sentinel],
        cwd: directory,
        env: {},
        stdin: null,
        maxChunkBytes: 32,
        stopBoundMs: 2000,
      })}\n`,
    )
    const [bytes] = await created
    const frame: unknown = JSON.parse(String(bytes).trim())
    if (
      typeof frame !== 'object' ||
      frame === null ||
      !('pid' in frame) ||
      typeof frame.pid !== 'number'
    )
      throw new Error('native create observation missing')
    const script = `$p=[Diagnostics.Process]::GetProcessById(${frame.pid}); $h=$p.Handle; [Console]::WriteLine('watching'); $stopped=$p.WaitForExit(10000); [Console]::WriteLine($stopped); if(-not $stopped){$p.Kill();$p.WaitForExit()}; $p.Dispose()`
    const watcher = spawn(
      join(
        process.env['SystemRoot'] ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    )
    const watched = once(watcher, 'close')
    let text = ''
    watcher.stderr.resume()
    watcher.stdout.setEncoding('utf8')
    watcher.stdout.on('data', (chunk: string) => {
      text += chunk
      if (text.includes('watching')) bridge.kill()
    })
    await bridgeClosed
    // The anchor keeps the Job: the child outlives the bridge, still suspended, so no user code ran.
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(text).not.toContain('True')
    await expect(readFile(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
    const resource = {
      key,
      provider: 'test',
      reference: {
        kind: 'object' as const,
        entries: [{ key: 'windowsJob', value: { kind: 'string' as const, value: name } }],
      },
    }
    expect(await stopWindowsResource(resource, 5_000)).toBe('confirmed')
    await watched
    expect(text).toContain('True')
    await expect(readFile(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    clearTimeout(watchdog)
    bridge.kill()
    await bridgeClosed
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
