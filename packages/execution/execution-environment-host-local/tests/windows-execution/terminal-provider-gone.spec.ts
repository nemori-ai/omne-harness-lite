/** @module-tag slow */
// Slow: it starts a provider process that runs a real terminal broker, then kills that provider.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { expect, it } from 'vitest'
import { askBridge } from '../../src/windows-execution/bridge.ts'
import { windowsTerminalExecutable } from '../../src/windows-execution/compile.ts'
import { bundledConpty } from '../../src/windows-execution/terminal.ts'
import { stopWindowsJob } from '../../src/windows-execution/supervision.ts'
import { psString } from './terminal-fixture.ts'

// A provider stand-in: it drives the broker through its private protocol up to one finished
// invocation, reports that, and then waits to be killed.
const provider = String.raw`
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
const { executable, request, script } = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
const broker = spawn(executable, [], {
  stdio: ['pipe', 'pipe', 'ignore'],
  windowsHide: true,
  detached: true,
  env: { SystemRoot: systemRoot, WINDIR: systemRoot },
})
broker.stdin.write(JSON.stringify(request) + '\n')
for await (const line of createInterface({ input: broker.stdout })) {
  const frame = JSON.parse(line)
  if (frame.t === 'ready') broker.stdin.write('go\n')
  else if (frame.t === 'opened')
    broker.stdin.write(JSON.stringify({ c: 'execute', id: 'gone:1', nonce: '0'.repeat(32), script }) + '\n')
  else if (frame.t === 'finished') console.log('finished')
}
`

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const members = (name: string) =>
  askBridge(
    { mode: 'members', name },
    frame => (frame.t === 'members' ? frame.reading : undefined),
    10_000,
  )

it('stops the Job of a terminal and exits when the provider holding its control pipe dies', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-provider-gone-')))
  const system = process.env['SystemRoot'] ?? 'C:\\Windows'
  const file = join(root, 'processes')
  const name = `Local\\omne-terminal-${randomUUID()}`
  const script = `$broker = (Get-WmiObject Win32_Process -Filter "ProcessId=$PID").ParentProcessId; $member = Start-Process -FilePath ping.exe -ArgumentList '-n','300','127.0.0.1' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath ${psString(file)} -Value "$PID $broker $($member.Id)"`
  await writeFile(join(root, 'provider.mjs'), provider)
  await writeFile(
    join(root, 'input.json'),
    JSON.stringify({
      executable: await windowsTerminalExecutable(),
      script,
      request: {
        name,
        conpty: bundledConpty(),
        cwd: root,
        env: {
          SystemRoot: system,
          PATH: join(system, 'System32'),
          PATHEXT: '.COM;.EXE',
          TEMP: root,
          TMP: root,
        },
        columns: 120,
        rows: 30,
        maxChunkBytes: 65536,
        maxControlBytes: 1024 * 1024,
        stopBoundMs: 5000,
      },
    }),
  )
  const child = spawn(process.execPath, [join(root, 'provider.mjs'), join(root, 'input.json')], {
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  })
  try {
    const lines = createInterface({ input: child.stdout })
    const finished = await new Promise<string>((resolve, reject) => {
      lines.once('line', resolve)
      child.once('exit', code => reject(new Error(`provider exited with ${code}`)))
    })
    expect(finished).toBe('finished')
    const [shell, broker, member] = (await readFile(file, 'utf8')).trim().split(' ').map(Number)
    if (shell === undefined || broker === undefined || member === undefined)
      throw new Error('process identities')
    expect([alive(shell), alive(broker), alive(member)]).toEqual([true, true, true])
    expect(await members(name)).not.toBe('gone')
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill()
    await exited
    await expect
      .poll(() => [alive(shell), alive(broker), alive(member)], { timeout: 10_000 })
      .toEqual([false, false, false])
    expect(await members(name)).toBe('gone')
  } finally {
    child.kill()
    await stopWindowsJob(name, 10_000)
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
