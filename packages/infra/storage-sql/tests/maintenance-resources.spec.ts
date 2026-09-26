import { describe, expect, it } from 'vitest'
import { SnapshotResources } from '../src/maintenance/resources.ts'

describe('D055 failed cleanup retains explicit resource ownership', () => {
  it('keeps a still-open resource after close throws, and only settles after a real close', async () => {
    const scope = new SnapshotResources()
    let open = true
    let fail = true
    scope.own(
      () => {
        if (fail) throw new Error('injected close failure')
        open = false
      },
      () => !open,
    )
    await expect(scope.close()).rejects.toThrow('injected close failure')
    expect(scope.settled).toBe(false)
    expect(open).toBe(true)
    fail = false
    await scope.close()
    expect(scope.settled).toBe(true)
    expect(() => scope.own(() => undefined)).toThrow('scope has ended')
  })

  it('reports a failure after actual close without falsely retaining an open resource', async () => {
    const scope = new SnapshotResources()
    let open = true
    scope.own(
      () => {
        open = false
        throw new Error('after close')
      },
      () => !open,
    )
    await expect(scope.close()).rejects.toThrow('after close')
    expect(scope.settled).toBe(true)
  })

  it('waits for asynchronous close and still attempts independent earlier resources', async () => {
    const scope = new SnapshotResources()
    let end!: () => void
    const order: string[] = []
    scope.own(() => {
      order.push('first')
    })
    scope.own(async () => {
      await new Promise<void>(resolve => {
        end = resolve
      })
      order.push('last')
    })
    const closing = scope.close()
    expect(scope.settled).toBe(false)
    expect(order).toEqual([])
    end()
    await closing
    expect(order).toEqual(['last', 'first'])
    expect(scope.settled).toBe(true)
  })
})
