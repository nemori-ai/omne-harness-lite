import type { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const { workers } = vi.hoisted(() => ({ workers: [] as EventEmitter[] }))
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Worker: class extends EventEmitter {
      constructor() {
        super()
        workers.push(this)
      }
    },
  }
})
import { checkPhysicalSnapshot } from '../src/maintenance/physical-check.ts'

function lastWorker(): EventEmitter {
  const worker = workers.at(-1)
  if (worker === undefined) throw new Error('worker was not created')
  return worker
}

describe('D055 the worker result is not resource release', () => {
  it('does not finish on a success message before actual exit', async () => {
    const promise = checkPhysicalSnapshot('/internal/fixture')
    const settled = vi.fn()
    void promise.then(settled, settled)
    lastWorker().emit('message', { status: 'ok' })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    lastWorker().emit('exit', 0)
    await promise
    expect(settled).toHaveBeenCalledOnce()
  })

  it('also waits for exit after an error event', async () => {
    const promise = checkPhysicalSnapshot('/internal/fixture')
    const settled = vi.fn()
    void promise.then(settled, settled)
    lastWorker().emit('error', new Error('synthetic worker failure'))
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    lastWorker().emit('exit', 1)
    await expect(promise).rejects.toMatchObject({ name: 'StorageDefect' })
  })

  it.each(['missing', 'duplicate', 'malformed', 'nonzero'] as const)(
    'refuses %s completion',
    async fault => {
      const promise = checkPhysicalSnapshot('/internal/fixture')
      if (fault !== 'missing') lastWorker().emit('message', { status: 'ok' })
      if (fault === 'duplicate') lastWorker().emit('message', { status: 'ok' })
      if (fault === 'malformed') lastWorker().emit('message', { status: 'ok', extra: true })
      lastWorker().emit('exit', fault === 'nonzero' ? 1 : 0)
      await expect(promise).rejects.toMatchObject({ name: 'StorageDefect' })
    },
  )
})
