import { describe, expect, it } from 'vitest'
import { createAssetChangeFeed } from '../../../src/rows/tenant-assets/changes.ts'

function listener(log: string[], name: string) {
  return {
    changed: () => log.push(`${name} changed`),
    closed: () => log.push(`${name} closed`),
  }
}

describe('the change feed of the tenant assets row', () => {
  it('a change of one tenant reaches that tenant’s listeners and no other tenant’s', () => {
    const feed = createAssetChangeFeed()
    const log: string[] = []
    feed.subscribe('tenant-a', listener(log, 'a1'))
    feed.subscribe('tenant-a', listener(log, 'a2'))
    feed.subscribe('tenant-b', listener(log, 'b'))
    feed.changed('tenant-a')
    expect(log).toEqual(['a1 changed', 'a2 changed'])
  })

  it('a released listener hears nothing more', () => {
    const feed = createAssetChangeFeed()
    const log: string[] = []
    const release = feed.subscribe('tenant-a', listener(log, 'a'))
    release()
    release()
    feed.changed('tenant-a')
    expect(log).toEqual([])
  })

  it('releasing one listener of a tenant leaves the others hearing', () => {
    const feed = createAssetChangeFeed()
    const log: string[] = []
    const release = feed.subscribe('tenant-a', listener(log, 'a1'))
    feed.subscribe('tenant-a', listener(log, 'a2'))
    release()
    feed.changed('tenant-a')
    expect(log).toEqual(['a2 changed'])
  })

  it('a stale release after the tenant subscribed again leaves the new listener hearing', () => {
    const feed = createAssetChangeFeed()
    const log: string[] = []
    const release = feed.subscribe('tenant-a', listener(log, 'old'))
    release()
    feed.subscribe('tenant-a', listener(log, 'new'))
    release()
    feed.changed('tenant-a')
    expect(log).toEqual(['new changed'])
  })

  it('a listener that throws does not keep the others from hearing', () => {
    const feed = createAssetChangeFeed()
    const log: string[] = []
    feed.subscribe('tenant-a', {
      changed: () => {
        throw new Error('broken')
      },
      closed: () => {},
    })
    feed.subscribe('tenant-a', listener(log, 'a'))
    feed.changed('tenant-a')
    expect(log).toEqual(['a changed'])
  })

  it('closing tells every listener once, and a later subscription is closed at once', () => {
    const feed = createAssetChangeFeed()
    const log: string[] = []
    feed.subscribe('tenant-a', listener(log, 'a'))
    feed.subscribe('tenant-b', listener(log, 'b'))
    feed.close()
    feed.changed('tenant-a')
    feed.subscribe('tenant-a', listener(log, 'late'))
    expect(log).toEqual(['a closed', 'b closed', 'late closed'])
  })
})
