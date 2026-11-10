/** @module-tag slow */
// H-7: the request reaches the bridge over its private pipe. Neither the bridge nor the anchor
// carries the command's arguments or environment on its command line, where any process can read
// them.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

/** The command lines of the processes whose image is the bridge, as Windows reports them. */
async function bridgeCommandLines(): Promise<string[]> {
  const { stdout } = await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process -Filter "Name=\'bridge.exe\'" | ForEach-Object { $_.CommandLine }',
    ],
    { windowsHide: true },
  )
  return stdout.split(/\r?\n/u).filter(line => line.trim() !== '')
}

it('keeps the arguments and the environment of a command off the bridge and anchor command lines', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-secret-')))
  const secret = `omne-secret-${randomUUID()}`
  const ready = join(root, 'ready')
  const f = commandFixture(root)
  try {
    const command = await f.manager.facility.start({
      ...f.request,
      args: [
        '-e',
        'require("fs").writeFileSync(process.argv[1],"up");setInterval(()=>{},1000)',
        ready,
        secret,
      ],
      env: { ...f.request.env, OMNE_SECRET: secret },
    })
    if (command.kind !== 'done') throw new Error(`start answered ${command.kind}`)
    await expect.poll(() => readFile(ready, 'utf8').catch(() => ''), { timeout: 10_000 }).toBe('up')
    const lines = await bridgeCommandLines()
    // The bridge and its anchor are running for this command.
    expect(lines.some(line => line.includes('anchor'))).toBe(true)
    expect(lines.filter(line => line.includes(secret))).toEqual([])
    expect(await command.value.stop('forced')).toBe('confirmed')
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}, 60_000)
