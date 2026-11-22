import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import type { AccessDiagnostic } from '../src/index.ts'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { declare } from '@omne-harness/dynamis'
import { availabilitySource } from '../src/availability/availability.ts'
import { AccessRegistryProvider } from '../src/registry/cordis.ts'
import { protocolsContract } from '../src/registry/table.ts'
import { settleCall } from '../src/settle/settle.ts'
import { manualClock } from './support/manual-clock.ts'
import {
  NOTES,
  notesContribution,
  notesProtocol,
  type NotesProtocol,
} from './support/test-contribution.ts'
import { mustEnter } from './support/enter.ts'

const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

async function assemble(contribution: AccessContribution<NotesProtocol>) {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(AccessRegistryProvider)
  let plugin: Fiber | undefined
  await root.plugin({
    name: 'notes-access',
    inject: ['accessRegistry'],
    apply(ctx: Context) {
      plugin = ctx.fiber
      ctx.accessRegistry.mount(contribution)
    },
  })
  if (plugin === undefined) throw new Error('the access plugin did not load')
  const registry = root.accessRegistry as unknown as AccessRegistryProvider
  return { root, plugin, registry }
}

describe('the registry on real Cordis', () => {
  it('takes the protocol down when the plugin unloads, and the unload waits for the call', async () => {
    let release!: () => void
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    const events: string[] = []
    const contribution: AccessContribution<NotesProtocol> = {
      ...notesContribution('first'),
      operations: {
        ...notesContribution('first').operations,
        'save-note': async call => {
          await released
          events.push(`handler returns, aborted ${call.signal.aborted}`)
          return { outcome: 'succeeded', body: {} }
        },
      },
    }
    const { plugin, registry } = await assemble(contribution)
    const entered = mustEnter(registry, NOTES, 'save-note')
    if (entered === undefined) throw new Error('not mounted')
    const settled = settleCall({
      entered: {
        ...entered,
        leave: () => {
          events.push('leave')
          entered.leave()
        },
      },
      principal: undefined,
      messageId: 'm-1',
      body: { noteId: 'n-1', title: 'Plan' },
      limits,
      config: { graceMs: 1000 },
      clock: manualClock(),
      respond: answer => {
        events.push(`respond ${answer.outcome}`)
      },
    })
    const unloaded = plugin.dispose().then(() => events.push('unload complete'))
    await flush()
    expect(registry.enter(NOTES, 'save-note')).toEqual({ refused: 'not-mounted' })
    expect(entered.signal.aborted).toBe(true)
    expect(events).toEqual([])
    release()
    await settled
    await unloaded
    expect(events).toEqual([
      'handler returns, aborted true',
      'respond succeeded',
      'leave',
      'unload complete',
    ])
  })

  it('两个接入插件挂同一份协议：两个都加载成功，这份协议答冲突；一个卸载后另一个立刻答复', async () => {
    const { root, plugin, registry } = await assemble(notesContribution('first'))
    const second = await root.plugin({
      name: 'notes-access-again',
      inject: ['accessRegistry'],
      apply(ctx: Context) {
        ctx.accessRegistry.mount(notesContribution('second'))
      },
    })
    await flush()
    expect(second.state).toBe(2)
    expect(plugin.state).toBe(2)
    expect(registry.enter(NOTES, 'read-note')).toEqual({
      refused: 'conflict',
      by: ['notes-access#1', 'notes-access-again#1'],
    })
    expect(registry.subscribe(() => {}).protocols).toEqual([])
    await plugin.dispose()
    const entered = mustEnter(registry, NOTES, 'read-note')
    if (entered.member.kind !== 'operation') throw new Error('not an operation')
    expect(
      await entered.member.handler(
        { principal: undefined, messageId: 'm', signal: entered.signal },
        { noteId: 'n-1' },
      ),
    ).toEqual({ outcome: 'succeeded', body: { noteId: 'n-1', title: 'second' } })
    entered.leave()
  })

  it('一个 apply 抛错的接入插件挂的协议从不出现', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(AccessRegistryProvider)
    const registry = root.accessRegistry as unknown as AccessRegistryProvider
    const seen: string[] = []
    registry.subscribe(change => void seen.push(change.change))
    let during: unknown
    await root
      .plugin({
        name: 'notes-access',
        inject: ['accessRegistry'],
        apply(ctx: Context) {
          ctx.accessRegistry.mount(notesContribution('first'))
          during = registry.enter(NOTES, 'read-note')
          throw new Error('apply failed')
        },
      })
      .then(
        () => undefined,
        () => undefined,
      )
    await flush()
    expect(during).toEqual({ refused: 'not-mounted' })
    expect(registry.enter(NOTES, 'read-note')).toEqual({ refused: 'not-mounted' })
    expect(seen).toEqual([])
  })

  it('lets the pipeline follow the registry through the provider', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(AccessRegistryProvider)
    const registry = root.accessRegistry as unknown as AccessRegistryProvider
    const changes: string[] = []
    const subscription = registry.subscribe(change => {
      if (change.change !== 'points')
        changes.push(`${change.revision} ${change.change} ${change.protocol.name}`)
    })
    expect(subscription).toMatchObject({ revision: 0, protocols: [] })
    let plugin: Fiber | undefined
    await root.plugin({
      name: 'notes-access',
      inject: ['accessRegistry'],
      apply(ctx: Context) {
        plugin = ctx.fiber
        ctx.accessRegistry.mount(notesContribution('first'))
      },
    })
    await plugin?.dispose()
    expect(changes).toEqual(['1 mounted notes', '2 unmounted notes'])
  })
})

class NoteStore extends Service {
  readonly title = 'stored'
  constructor(ctx: Context) {
    super(ctx, 'noteStore')
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    noteStore: NoteStore
  }
}

const notesAccess = defineAccessPlugin({
  name: 'notes-access',
  protocol: notesProtocol(),
  handlers: provide => ({
    ...notesContribution('unused'),
    operations: {
      ...notesContribution('unused').operations,
      'read-note': async (_call, body) => {
        const store = provide('noteStore')
        if (store === undefined) return { outcome: 'basis-unavailable' }
        return { outcome: 'succeeded', body: { noteId: body.noteId, title: store.title } }
      },
    },
  }),
})

describe('the points of the tree reach the availability (C10)', () => {
  const tags = { ...protocolsContract, name: 'notes.tags', arity: 'keyed-list', keys: 'public' }
  const tag = (key: string) => ({
    point: 'notes.tags',
    key,
    id: key,
    scope: [],
    rank: 0,
    digest: key,
    item: { contribution: {}, revision: 1, controller: {} },
  })

  it('a point with public keys is declared, gains a key and loses it: each time the snapshot is sent again, at the same revision', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(AccessRegistryProvider)
    const provider = root.accessRegistry as unknown as AccessRegistryProvider
    const opened = await availabilitySource(provider, 4)(
      { principal: undefined as never, messageId: 'm-1', signal: new AbortController().signal },
      {},
    )
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    const next = async () => (await opened.frames.next()).value as { points?: unknown[] }
    const told = (frame: { points?: unknown[] }) =>
      (frame.points as { name: string; keys?: string[] }[]).map(point => [point.name, point.keys])

    const first = await next()
    expect(first).toMatchObject({ kind: 'snapshot', revision: 0, protocols: [], conflicts: [] })
    expect(told(first)).toEqual([['access.protocols', undefined]])

    const host = await root.plugin({
      name: 'notes-host',
      inject: ['dynamis'],
      apply: (ctx: Context) => void ctx.dynamis.put([declare(tags as never), tag('a') as never]),
    })
    const declared = await next()
    expect(declared).toMatchObject({ kind: 'snapshot', revision: 0 })
    expect(told(declared)).toEqual([
      ['access.protocols', undefined],
      ['notes.tags', ['a']],
    ])

    const other = await root.plugin({
      name: 'notes-more',
      inject: ['dynamis'],
      apply: (ctx: Context) => void ctx.dynamis.put([tag('b') as never]),
    })
    expect(told(await next()).at(-1)).toEqual(['notes.tags', ['a', 'b']])
    await other.dispose()
    expect(told(await next()).at(-1)).toEqual(['notes.tags', ['a']])
    await host.dispose()
    expect(told(await next())).toEqual([['access.protocols', undefined]])
  })

  it('a change that does not touch the points sends no snapshot again', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(AccessRegistryProvider)
    const provider = root.accessRegistry as unknown as AccessRegistryProvider
    const seen: string[] = []
    provider.subscribe(change => void seen.push(change.change))
    await root.plugin({
      name: 'notes-access',
      inject: ['accessRegistry'],
      apply: (ctx: Context) => ctx.accessRegistry.mount(notesContribution('first')),
    })
    expect(seen).toEqual(['mounted'])
  })
})

describe('defineAccessPlugin on real Cordis', () => {
  async function readNote(registry: AccessRegistryProvider): Promise<unknown> {
    const entered = mustEnter(registry, NOTES, 'read-note')
    if (entered.member.kind !== 'operation') return 'not mounted'
    const answer = await entered.member.handler(
      { principal: undefined, messageId: 'm', signal: entered.signal },
      { noteId: 'n-1' },
    )
    entered.leave()
    return answer
  }

  it('mounts while loaded, takes the domain service at each call, and comes off when unloaded', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(AccessRegistryProvider)
    const provider = root.accessRegistry as unknown as AccessRegistryProvider
    const mounted = (): string[] =>
      provider.subscribe(() => {}).protocols.map(key => `${key.name}/v${key.major}`)
    let plugin: Fiber | undefined
    await root.plugin({
      name: 'notes-access-host',
      apply(ctx: Context) {
        plugin = ctx.fiber
        ctx.plugin(notesAccess)
      },
    })
    await flush()
    expect(mounted()).toEqual(['notes/v1'])
    expect(await readNote(provider)).toEqual({ outcome: 'basis-unavailable' })
    let store: Fiber | undefined
    await root.plugin({
      name: 'note-store-host',
      apply(ctx: Context) {
        store = ctx.fiber
        ctx.plugin(NoteStore)
      },
    })
    await flush()
    expect(await readNote(provider)).toEqual({
      outcome: 'succeeded',
      body: { noteId: 'n-1', title: 'stored' },
    })
    await store?.dispose()
    expect(await readNote(provider)).toEqual({ outcome: 'basis-unavailable' })
    expect(mounted()).toEqual(['notes/v1'])
    await plugin?.dispose()
    expect(mounted()).toEqual([])
    expect(provider.enter(NOTES, 'read-note')).toEqual({ refused: 'not-mounted' })
  })

  it('leaves one access.listener-fault diagnostic when a subscriber throws, and keeps the registry', async () => {
    const root = new Context()
    const diagnostics: AccessDiagnostic[] = []
    await root.plugin(DynamisService)
    await root.plugin(AccessRegistryProvider, { diagnostics: event => diagnostics.push(event) })
    const provider = root.accessRegistry as unknown as AccessRegistryProvider
    provider.subscribe(() => {
      throw new Error('listener failed')
    })
    const changes: number[] = []
    provider.subscribe(change => changes.push(change.revision))
    await root.plugin({
      name: 'notes-access',
      inject: ['accessRegistry'],
      apply(ctx: Context) {
        ctx.accessRegistry.mount(notesContribution('first'))
      },
    })
    expect(diagnostics).toEqual([{ code: 'access.listener-fault' }])
    expect(changes).toEqual([1])
    expect(await readNote(provider)).toEqual({
      outcome: 'succeeded',
      body: { noteId: 'n-1', title: 'first' },
    })
  })
})
