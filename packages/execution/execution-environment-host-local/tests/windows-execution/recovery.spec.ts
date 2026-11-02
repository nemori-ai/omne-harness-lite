/** @module-tag slow */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import { stopWindowsResource } from '../../src/windows-execution/index.ts'

it('opens the original Job after the controller exits and stops its descendant', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-recovery-')))
  const key = randomUUID()
  const name = `Local\\omne-command-${key}`
  const resource: ManagedResource = {
    key,
    provider: 'test',
    reference: {
      kind: 'object',
      entries: [{ key: 'windowsJob', value: { kind: 'string', value: name } }],
    },
  }
  const marker = join(directory, 'heartbeat')
  const bridgeModule = fileURLToPath(
    new URL('../../src/windows-execution/bridge.ts', import.meta.url),
  )
  const controllerPath = join(directory, 'controller.mjs')
  const childScript = `setInterval(()=>require('fs').appendFileSync(${JSON.stringify(marker)}, 'x'),20)`
  const parentScript = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore',windowsHide:true});setInterval(()=>{},1000)`
  await writeFile(
    controllerPath,
    `import {pathToFileURL} from 'node:url';
const {startBridge}=await import(pathToFileURL(${JSON.stringify(bridgeModule)}));
const bridge=await startBridge({request:${JSON.stringify({ mode: 'command', name, executable: process.execPath, args: ['-e', parentScript], cwd: directory, env: { SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows' }, stdin: null, maxChunkBytes: 1024, stopBoundMs: 5000 })},maxChunkBytes:1024,onFrame(frame){if(frame.t==='ready')bridge.send('go');if(frame.t==='started')process.stdout.write('started\\n')},onClosed(){}});
`,
  )
  const controller = spawn(process.execPath, ['--experimental-strip-types', controllerPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  controller.stderr.resume()
  try {
    const [chunk] = await once(controller.stdout, 'data')
    expect(String(chunk)).toContain('started')
    await expect
      .poll(async () => (await readFile(marker).catch(() => Buffer.alloc(0))).length)
      .toBeGreaterThan(0)
    const exited = once(controller, 'exit')
    controller.kill()
    await exited
    const before = (await readFile(marker)).length
    await expect.poll(async () => (await readFile(marker)).length).toBeGreaterThan(before)
    expect(await stopWindowsResource(resource, 5000)).toBe('confirmed')
    const stopped = (await readFile(marker)).length
    await new Promise(resolve => setTimeout(resolve, 100))
    expect((await readFile(marker)).length).toBe(stopped)
    expect(await stopWindowsResource(resource, 1000)).toBe('unconfirmed')
  } finally {
    controller.kill()
    await stopWindowsResource(resource, 5000)
    await rm(directory, { recursive: true, force: true })
  }
}, 40_000)
