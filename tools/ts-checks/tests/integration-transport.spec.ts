import { rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { integrationFixture, commit } from './fixtures/integration.ts'
import {
  atomicUpdate,
  annotatedObject,
  observeUpdates,
  fetchObject,
} from '../src/integration/transport.ts'
import { git, maybeRef } from '../src/integration/git.ts'
const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
describe('actual ref transactions', () => {
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
  it('rejects late Q with expected B even when P is an ancestor of Q', () => {
    const f = integrationFixture()
    homes.push(f.home)
    const b = f.main,
      p = commit(f.root, 'p', 'P'),
      q = commit(f.root, 'q', 'Q')
    atomicUpdate(f.root, f.policy, [{ ref: 'refs/heads/main', old: b, next: p }])
    expect(() =>
      atomicUpdate(f.root, f.policy, [{ ref: 'refs/heads/main', old: b, next: q }]),
    ).toThrow()
    expect(git(f.remote, ['rev-parse', 'main'])).toBe(p)
    expect(() =>
      atomicUpdate(f.root, f.policy, [{ ref: 'refs/heads/main', old: p, next: b }]),
    ).toThrow('Non-fast-forward')
  })
  it('does not move the branch when an immutable tag collides, and observes success after a lost response', () => {
    const f = integrationFixture()
    homes.push(f.home)
    const p = commit(f.root, 'p', 'P'),
      ref = 'refs/tags/omne/integration/checkpoint/test'
    const tag = annotatedObject(f.root, ref.slice(10), p, { candidate: p })
    atomicUpdate(f.root, f.policy, [{ ref, old: null, next: tag }])
    const updates = [
      { ref: 'refs/heads/main', old: f.main, next: p },
      { ref, old: null, next: tag },
    ]
    expect(() => atomicUpdate(f.root, f.policy, updates)).toThrow()
    expect(git(f.remote, ['rev-parse', 'main'])).toBe(f.main)
    expect(observeUpdates(f.root, f.policy, updates).kind).toBe('unknown')
    const fresh = 'refs/tags/omne/integration/checkpoint/fresh',
      freshTag = annotatedObject(f.root, fresh.slice(10), p, { candidate: p })
    const successful = [
      { ref: 'refs/heads/main', old: f.main, next: p },
      { ref: fresh, old: null, next: freshTag },
    ]
    atomicUpdate(f.root, f.policy, successful)
    expect(observeUpdates(f.root, f.policy, successful).kind).toBe('published')
    const q = commit(f.root, 'q', 'Q')
    atomicUpdate(f.root, f.policy, [{ ref: 'refs/heads/main', old: p, next: q }])
    expect(observeUpdates(f.root, f.policy, successful).kind).toBe('published-advanced')
    expect(() =>
      atomicUpdate(f.root, { ...f.policy, transport: { kind: 'local-bare', location: f.root } }, [
        { ref: 'refs/heads/main', old: f.main, next: p },
      ]),
    ).toThrow('bare repository')
  })
})
