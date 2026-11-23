import { Context, type Fiber } from '@deepseek-ai/cordis'
import { CATALOG, list, type Contract } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { SourceDeclaration } from '@omne-harness/notification-contract'
import {
  NOTIFICATION_SOURCES_POINT,
  NotificationSourcesService,
  notificationSourcesKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

class Sources extends NotificationSourcesService {
  readonly held = new Set<string>()
  readonly lookup = () => ({ kind: 'absent' }) as const

  protected contribute(declaration: SourceDeclaration): () => void {
    if (this.held.has(declaration.name)) throw new Error(`${declaration.name} is registered`)
    this.held.add(declaration.name)
    return () => void this.held.delete(declaration.name)
  }
}

const source = (name: string): SourceDeclaration =>
  ({ name, label: name, types: [] }) as unknown as SourceDeclaration

async function world() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(Sources)
  const sources = root.get(notificationSourcesKey) as Sources
  const registering = (name: string, declared: string): Fiber =>
    root.plugin({
      name,
      inject: [notificationSourcesKey],
      apply(ctx: Context) {
        ;(ctx.get(notificationSourcesKey) as Sources).register(source(declared))
      },
    })
  return { root, sources, registering }
}

function keysOn(root: Context): string[] {
  const read = list(root.dynamis.registry(), NOTIFICATION_SOURCES_POINT, null, [])
  if (read.kind !== 'read') throw new Error(`the sources point is ${read.kind}`)
  return read.items.map(({ entry }) => entry.key).sort()
}

describe('the notification sources as keys on the registry of the tree', () => {
  it('declares the point notification.sources with public keys, put by the service itself', async () => {
    const { root } = await world()
    expect(NOTIFICATION_SOURCES_POINT).toBe('notification.sources')
    const declared = list<Contract>(root.dynamis.registry(), CATALOG, null, [])
    if (declared.kind !== 'read') throw new Error('the catalog is not read')
    const point = declared.items.find(({ entry }) => entry.key === NOTIFICATION_SOURCES_POINT)
    expect(point?.entry.item).toMatchObject({ tree: 'server', arity: 'keyed-one', keys: 'public' })
    expect(point?.entry.item.item).toEqual({ kind: 'data', fields: { source: 'string' } })
    const texts = Object.values(point?.entry.item ?? {}).filter(value => typeof value === 'string')
    expect(texts.every(text => text !== '')).toBe(true)
    expect(keysOn(root)).toEqual([])
  })

  it('a source is a key for exactly as long as it is registered, put as the one who registers it', async () => {
    const { root, sources, registering } = await world()
    const calendar = registering('calendar-row', 'calendar.events')
    const posts = registering('posts-row', 'owner.posts')
    await Promise.all([calendar, posts])
    expect(keysOn(root)).toEqual(['calendar.events', 'owner.posts'])
    expect([...sources.held].sort()).toEqual(['calendar.events', 'owner.posts'])
    const by = root.dynamis
      .registry()
      .placed.filter(placed => placed.point === NOTIFICATION_SOURCES_POINT)
      .map(placed => [placed.key, placed.instance.fiber, placed.item])
      .sort()
    expect(by).toEqual([
      ['calendar.events', 'calendar-row', { source: 'calendar.events' }],
      ['owner.posts', 'posts-row', { source: 'owner.posts' }],
    ])
    await calendar.dispose()
    expect(keysOn(root)).toEqual(['owner.posts'])
    expect([...sources.held]).toEqual(['owner.posts'])
    await posts.dispose()
    expect(keysOn(root)).toEqual([])
  })

  it('a source the registry of the domain refuses is not a key', async () => {
    const { root, registering } = await world()
    await registering('first', 'owner.posts')
    const second = registering('second', 'owner.posts')
    await second.await().catch(() => undefined)
    const holders = root.dynamis
      .registry()
      .placed.filter(placed => placed.point === NOTIFICATION_SOURCES_POINT)
      .map(placed => placed.instance.fiber)
    expect(holders).toEqual(['first'])
  })
})
