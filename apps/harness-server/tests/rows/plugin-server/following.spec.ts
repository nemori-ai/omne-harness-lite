import type { HeldPlugin } from '@omne-harness/plugin-host-local'
import { describe, expect, it } from 'vitest'
import { followTenants, type FollowingPorts } from '../../../src/rows/plugin-server/following.ts'

const plugin = (name: string) => ({ name }) as HeldPlugin

function world(read: FollowingPorts['read']) {
  const converged: string[] = []
  const warned: string[] = []
  const changes = new Map<string, () => void>()
  const stopped: string[] = []
  const following = followTenants({
    read,
    converge: (tenant, plugins) =>
      void converged.push(`${tenant}: ${plugins.map(each => each.name).join(',')}`),
    subscribe(tenant, changed) {
      changes.set(tenant, changed)
      return () => void stopped.push(tenant)
    },
    warn: message => void warned.push(message),
  })
  return { following, converged, warned, changes, stopped }
}

describe('following what each tenant holds', () => {
  it('reads a tenant once when taken up, and again when its assets change', async () => {
    let held = ['tidy']
    const w = world(async () => held.map(plugin))
    await w.following.follow('alice')
    await w.following.follow('alice')
    expect(w.converged).toEqual(['alice: tidy'])
    held = ['tidy', 'pill']
    w.changes.get('alice')?.()
    await w.following.follow('alice')
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(w.converged).toEqual(['alice: tidy', 'alice: tidy,pill'])
  })

  it('a change while a read runs is read once more after it, not twice at once', async () => {
    let running = 0
    let most = 0
    let release: () => void = () => undefined
    const w = world(async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise<void>(resolve => (release = resolve))
      running -= 1
      return [plugin('tidy')]
    })
    const first = w.following.follow('alice')
    w.changes.get('alice')?.()
    w.changes.get('alice')?.()
    release()
    await new Promise(resolve => setTimeout(resolve, 0))
    release()
    await first
    expect(most).toBe(1)
    expect(w.converged).toEqual(['alice: tidy', 'alice: tidy'])
  })

  it('what cannot be read changes nothing loaded, and says so', async () => {
    const w = world(async () => undefined)
    await w.following.follow('alice')
    expect(w.converged).toEqual([])
    expect(w.warned).toEqual([
      'tenant alice: its plugins cannot be read now; the server keeps what it loaded',
    ])
  })

  it('closing stops following every tenant and takes up no more', async () => {
    const w = world(async () => [plugin('tidy')])
    await w.following.follow('alice')
    w.following.close()
    await w.following.follow('bob')
    w.changes.get('alice')?.()
    expect(w.stopped).toEqual(['alice'])
    expect(w.converged).toEqual(['alice: tidy'])
  })
})
