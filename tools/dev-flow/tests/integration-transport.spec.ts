import { rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { integrationFixture } from './fixtures/integration.ts'
import { fetchObject } from '../src/integration/transport.ts'
const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
describe('remote reads', () => {
  it('bounds a real stalled Git fetch and skips fetching an existing local object', async () => {
    const f = integrationFixture()
    homes.push(f.home)
    const server = spawn(
      process.execPath,
      [
        '-e',
        "const net=require('node:net'); const s=net.createServer(()=>{}); s.listen(0,'127.0.0.1',()=>console.log(s.address().port));",
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    try {
      const port = await new Promise<string>((resolve, reject) => {
        server.once('error', reject)
        server.stdout.once('data', bytes => resolve(String(bytes).trim()))
      })
      const address = `git://127.0.0.1:${port}/unresponsive`
      const started = Date.now()
      expect(() => fetchObject(f.root, address, 'f'.repeat(40), 100)).toThrow('ETIMEDOUT')
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(() => fetchObject(f.root, '/does-not-exist', f.main, 100)).not.toThrow()
      expect(() => fetchObject(f.root, '/does-not-exist', 'f'.repeat(40), 100)).toThrow(
        'fetch failed',
      )
    } finally {
      server.kill()
      await new Promise<void>(resolve => server.once('close', () => resolve()))
    }
  })
})
