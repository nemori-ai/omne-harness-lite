import { EventEmitter } from 'node:events'

import type { PortFetch } from '../src/port-fetch/index.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Logger } from '../src/main/log.ts'
import { failureStatus } from '../src/main/mapping.ts'
import {
  type ChildLike,
  type PortMainLike,
  type ServerProcessDeps,
  type ServerProcessOptions,
  FALL_LIMIT,
  RESTART_MAX_MS,
  SHUTDOWN_GRACE_MS,
  STABLE_MS,
  startServerProcess,
  STARTUP_TIMEOUT_MS,
} from '../src/main/utility-process.ts'

/** A utility process stand-in: spawns and reports ready on its own unless told otherwise. */
class FakeChild extends EventEmitter implements ChildLike {
  alive = true
  spawned = false
  posted: unknown[] = []
  readonly autoReady: boolean
  constructor(autoSpawn: boolean, autoReady: boolean) {
    super()
    this.autoReady = autoReady
    if (autoSpawn) queueMicrotask(() => this.spawn())
  }
  spawn(): void {
    if (!this.alive) return
    this.spawned = true
    this.emit('spawn')
  }
  postMessage(message: unknown): void {
    this.posted.push(message)
    if (isType(message, 'port') && this.autoReady) queueMicrotask(() => this.ready())
    if (isType(message, 'shutdown')) this.exit(0)
  }
  ready(): void {
    if (this.alive) this.emit('message', { type: 'ready', uptimeMs: 12 })
  }
  exit(code: number): void {
    if (!this.alive) return
    this.alive = false
    this.emit('exit', code)
  }
  // Like Electron's: a child that does not exist yet cannot be killed.
  kill(): boolean {
    if (!this.spawned) return false
    this.exit(-1)
    return true
  }
}

function isType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === type
}

class FakePort implements PortMainLike {
  closed = false
  postMessage(): void {}
  on(): this {
    return this
  }
  off(): this {
    return this
  }
  start(): void {}
  close(): void {
    this.closed = true
  }
}

function harness(
  { autoSpawn = true, autoReady = true, forkThrowsOnAttempt = new Set<number>() } = {},
  onLifecycle?: ServerProcessOptions['onLifecycle'],
) {
  const children: FakeChild[] = []
  const ports: FakePort[] = []
  const logs: string[] = []
  const log: Logger = {
    debug: () => {},
    info: () => {},
    warn: (_d, msg) => logs.push(msg),
    error: (_d, msg) => logs.push(msg),
  }
  let forkAttempts = 0
  const deps: ServerProcessDeps = {
    fork: () => {
      forkAttempts++
      if (forkThrowsOnAttempt.has(forkAttempts)) throw new Error('fork failed')
      const child = new FakeChild(autoSpawn, autoReady)
      children.push(child)
      return child
    },
    channel: () => {
      const port1 = new FakePort()
      const port2 = new FakePort()
      ports.push(port2)
      return { port1, port2 }
    },
    createFetch: (): PortFetch => () => Promise.resolve(new Response('ok')),
  }
  const restarts: number[] = []
  const lifecycle: Parameters<NonNullable<ServerProcessOptions['onLifecycle']>>[0][] = []
  const server = startServerProcess(
    {
      utilityPath: 'utility.mjs',
      log,
      onRestart: () => restarts.push(Date.now()),
      onLifecycle: event => {
        lifecycle.push(event)
        onLifecycle?.(event)
      },
    },
    deps,
  )
  const live = () => children.filter(c => c.alive).length
  return {
    server,
    children,
    ports,
    logs,
    restarts,
    lifecycle,
    live,
    forkAttempts: () => forkAttempts,
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('startServerProcess', () => {
  it('reports restart backoff before requests fail and tags replacement readiness', async () => {
    const h = harness()
    await h.server.ready()
    expect(h.lifecycle).toEqual([
      { generation: 1, state: 'starting', restarted: false },
      { generation: 1, state: 'ready', restarted: false },
    ])
    h.children[0]!.exit(1)
    expect(h.lifecycle.at(-1)).toEqual({ generation: 2, state: 'starting', restarted: true })
    await vi.advanceTimersByTimeAsync(RESTART_MAX_MS)
    expect(h.lifecycle.at(-1)).toEqual({ generation: 2, state: 'ready', restarted: true })
    expect(h.lifecycle.some(event => event.state === 'failed')).toBe(false)
    await h.server.shutdown()
    const count = h.lifecycle.length
    await vi.advanceTimersByTimeAsync(RESTART_MAX_MS)
    expect(h.lifecycle).toHaveLength(count)
  })

  it('reports failed startup generations for native recovery choices', async () => {
    const h = harness({ autoReady: false })
    await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS)
    expect(h.lifecycle).toContainEqual({ generation: 1, state: 'failed', restarted: false })
    expect(h.lifecycle.at(-1)).toEqual({ generation: 2, state: 'starting', restarted: true })
    await h.server.shutdown()
  })

  it.each([false, true])(
    'reports an exit before readiness as a failed startup (spawned: %s)',
    async autoSpawn => {
      const h = harness({ autoSpawn, autoReady: false })
      await flush()
      const ready = h.server.ready()
      h.children[0]!.exit(1)
      await expect(ready).rejects.toThrow('The server exited (code 1)')
      expect(h.lifecycle.slice(-2)).toEqual([
        { generation: 1, state: 'failed', restarted: false },
        { generation: 2, state: 'starting', restarted: true },
      ])

      await vi.advanceTimersByTimeAsync(500)
      h.children[1]!.exit(1)
      expect(h.lifecycle.slice(-2)).toEqual([
        { generation: 2, state: 'failed', restarted: true },
        { generation: 3, state: 'starting', restarted: true },
      ])
      await h.server.shutdown()
    },
  )

  it('falls again and again before it stays up: at the limit it is not started again, and says so', async () => {
    const h = harness()
    await h.server.ready()
    for (let fall = 1; fall <= FALL_LIMIT; fall += 1) {
      h.children.at(-1)!.exit(1)
      await vi.advanceTimersByTimeAsync(RESTART_MAX_MS)
    }
    expect(h.children).toHaveLength(FALL_LIMIT)
    expect(h.lifecycle.at(-1)).toEqual({ generation: FALL_LIMIT, state: 'held', restarted: true })
    expect(h.logs.at(-1)).toBe(
      `server process fell ${String(FALL_LIMIT)} times in a row before it stayed up, not restarting`,
    )
    await vi.advanceTimersByTimeAsync(RESTART_MAX_MS * 10)
    expect(h.children).toHaveLength(FALL_LIMIT)
    await expect(h.server.fetch(new Request('http://app.desktop/'))).rejects.toThrow(
      'stopped restarting',
    )

    // The person asks for one more try: a planned restart starts from nothing.
    await h.server.restart()
    await flush()
    expect(h.server.state).toBe('running')
    expect(h.children).toHaveLength(FALL_LIMIT + 1)
    h.children.at(-1)!.exit(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(h.children).toHaveLength(FALL_LIMIT + 2)
  })

  it('stays up for the stable time: the falls are counted from nothing again', async () => {
    const h = harness()
    await h.server.ready()
    for (let fall = 1; fall < FALL_LIMIT; fall += 1) {
      h.children.at(-1)!.exit(1)
      await vi.advanceTimersByTimeAsync(RESTART_MAX_MS)
    }
    expect(h.children).toHaveLength(FALL_LIMIT)
    await vi.advanceTimersByTimeAsync(STABLE_MS)
    h.children.at(-1)!.exit(1)
    expect(h.lifecycle.at(-1)?.state).toBe('starting')
    // The first backoff of a run, not the fifth.
    await vi.advanceTimersByTimeAsync(500)
    expect(h.children).toHaveLength(FALL_LIMIT + 1)
    expect(h.lifecycle.some(event => event.state === 'held')).toBe(false)
  })

  it('a planned restart replaces the running process: the old one is asked to shut down, the new one serves, nothing failed', async () => {
    const h = harness()
    await h.server.ready()
    await h.server.restart()
    await flush()

    expect(h.children).toHaveLength(2)
    expect(h.children[0]!.posted.at(-1)).toEqual({ type: 'shutdown' })
    expect(h.children[0]!.alive).toBe(false)
    expect(h.server.state).toBe('running')
    expect(h.lifecycle.map(event => event.state)).toEqual([
      'starting',
      'ready',
      'starting',
      'ready',
    ])
    expect(h.logs).toEqual([])
    expect((await h.server.fetch(new Request('http://app.desktop/'))).status).toBe(200)
    // The next crash backs off as the first one of this run: the planned restart did not count.
    h.children[1]!.exit(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(h.children).toHaveLength(3)
  })

  it('a planned restart during the backoff starts at once; after shutdown it is refused', async () => {
    const h = harness()
    await h.server.ready()
    h.children[0]!.exit(1)
    await flush()
    expect(h.children).toHaveLength(1)
    await h.server.restart()
    expect(h.children).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(RESTART_MAX_MS)
    expect(h.children).toHaveLength(2)

    await h.server.shutdown()
    await expect(h.server.restart()).rejects.toThrow('shutting down')
  })

  it('starts one process, becomes ready and serves', async () => {
    const h = harness()
    await h.server.ready()

    expect(h.server.state).toBe('running')
    expect(h.children).toHaveLength(1)
    expect((await h.server.fetch(new Request('http://app.desktop/'))).status).toBe(200)
  })

  it('restarts once after a crash even when requests arrive during backoff', async () => {
    const h = harness()
    await h.server.ready()
    h.children[0]!.exit(1)
    expect(h.server.state).toBe('idle')

    const request = new Request('http://app.desktop/')
    await expect(h.server.fetch(request)).rejects.toThrow('restarting')
    expect(h.children).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.children).toHaveLength(2)
    expect((await h.server.fetch(request)).status).toBe(200)
    expect(h.live()).toBe(1)
    expect(h.ports[0]!.closed).toBe(true)

    await h.server.shutdown()
    expect(h.live()).toBe(0)
    expect(h.server.state).toBe('stopped')
  })

  it('does not restart after a crash once shutdown was called', async () => {
    const h = harness()
    await h.server.ready()
    h.children[0]!.exit(1)
    await h.server.shutdown()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(h.children).toHaveLength(1)
    expect(h.live()).toBe(0)
    await expect(h.server.fetch(new Request('http://app.desktop/'))).rejects.toThrow(
      'shutting down',
    )
  })

  it('stops an instance that has not spawned yet by killing it when it spawns', async () => {
    const h = harness({ autoSpawn: false })
    const stopped = h.server.shutdown()
    await flush()
    h.children[0]!.spawn()
    await stopped

    expect(h.live()).toBe(0)
    expect(h.children[0]!.posted).toEqual([])
    expect(h.server.state).toBe('stopped')
    expect(h.lifecycle.some(event => event.state === 'failed')).toBe(false)
  })

  it('kills and retries a child that never becomes ready, and ignores a late ready from it', async () => {
    const h = harness({ autoReady: false })
    await flush()
    const first = h.children[0]!
    await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS)

    expect(first.alive).toBe(false)
    expect(h.logs).toContain('server process did not become ready in time, killing it')
    // The retry is scheduled with backoff; a `ready` from the dead generation changes nothing.
    first.ready()
    expect(h.server.state).toBe('idle')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(h.children).toHaveLength(2)
    h.children[1]!.ready()
    await flush()
    expect(h.server.state).toBe('running')
    expect(h.restarts).toHaveLength(1)
    expect((await h.server.fetch(new Request('http://app.desktop/'))).status).toBe(200)
  })

  it('kills a child retired at the startup timeout as soon as it spawns', async () => {
    const h = harness({ autoSpawn: false })
    await flush()
    await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS)
    const late = h.children[0]!
    expect(late.alive).toBe(true)
    late.spawn()
    await flush()

    expect(late.alive).toBe(false)
    expect(late.posted).toEqual([])
  })

  it('retries a child that never spawns', async () => {
    const h = harness({ autoSpawn: false })
    await flush()
    await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS + 5_000)

    expect(h.children.length).toBeGreaterThanOrEqual(2)
  })

  it('kills a utility that ignores the shutdown message after the grace period', async () => {
    const h = harness()
    await h.server.ready()
    const child = h.children[0]!
    child.postMessage = () => {} // never exits on its own
    const stopped = h.server.shutdown()
    await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS)
    await stopped

    expect(child.alive).toBe(false)
    expect(h.logs).toContain('server process did not exit in time, killing it')
  })

  it('stays stopping when a ready arrives after shutdown began, and rejects waiting requests', async () => {
    const h = harness({ autoReady: false })
    await flush() // spawned, port posted, no ready yet
    const child = h.children[0]!
    child.postMessage = () => {} // ignores the shutdown message for now
    const request = h.server.fetch(new Request('http://app.desktop/'))
    request.catch(() => {})
    const stopped = h.server.shutdown()
    expect(h.server.state).toBe('stopping')

    child.ready() // late: must not reopen the server
    await flush()
    expect(h.server.state).toBe('stopping')
    await expect(request).rejects.toThrow('shutting down')
    await expect(h.server.fetch(new Request('http://app.desktop/'))).rejects.toThrow(
      'shutting down',
    )

    child.exit(0)
    await stopped
    expect(h.server.state).toBe('stopped')
  })

  it('lets concurrent shutdowns share one stop that ends only when the child is gone', async () => {
    const h = harness()
    await h.server.ready()
    const child = h.children[0]!
    child.postMessage = () => {} // never exits on its own
    let firstDone = false
    let secondDone = false
    const first = h.server.shutdown().then(() => (firstDone = true))
    const second = h.server.shutdown().then(() => (secondDone = true))
    await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS - 1)
    expect([firstDone, secondDone, child.alive]).toEqual([false, false, true])

    await vi.advanceTimersByTimeAsync(1)
    await Promise.all([first, second])
    expect([firstDone, secondDone, child.alive]).toEqual([true, true, false])
    expect(h.server.state).toBe('stopped')
  })

  it('reports 503 during fork backoff and serves requests after the scheduled restart', async () => {
    const h = harness({ forkThrowsOnAttempt: new Set([1]) })
    const request = new Request('http://app.desktop/')
    const results = await Promise.all([
      h.server.fetch(request).catch(failureStatus),
      h.server.fetch(request).catch(failureStatus),
    ])
    expect(results).toEqual(
      Array.from({ length: 2 }, () => ({ status: 503, message: 'Server Restarting' })),
    )
    expect(h.forkAttempts()).toBe(1)
    await vi.advanceTimersByTimeAsync(500)
    expect((await h.server.fetch(request)).status).toBe(200)
    expect(h.forkAttempts()).toBe(2)
  })

  it("retries with backoff when the automatic restart's fork throws synchronously", async () => {
    const h = harness({ forkThrowsOnAttempt: new Set([2]) })
    await h.server.ready()
    h.children[0]!.exit(1)
    // The first restart (250 ms × 2¹) fires; its fork throws; another retry is scheduled instead of giving up.
    await vi.advanceTimersByTimeAsync(600)
    expect(h.forkAttempts()).toBe(2)
    expect(h.logs).toContain('server process failed to fork')
    expect(h.server.state).toBe('idle')
    await vi.advanceTimersByTimeAsync(RESTART_MAX_MS)

    expect(h.forkAttempts()).toBe(3)
    expect(h.children).toHaveLength(2)
    await flush()
    expect(h.server.state).toBe('running')
    expect(h.live()).toBe(1)
    expect((await h.server.fetch(new Request('http://app.desktop/'))).status).toBe(200)
  })

  it('fails a request while the server is away, rather than hanging', async () => {
    const h = harness({ autoReady: false })
    await flush()
    const request = h.server.fetch(new Request('http://app.desktop/'))
    request.catch(() => {}) // settled before the assertion below is attached; not an unhandled rejection
    await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS)

    await expect(request).rejects.toThrow('did not become ready')
  })
})
