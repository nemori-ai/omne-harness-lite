import type { Principal } from '@omne-harness/access-cordis-contract'
import { describe, expect, it } from 'vitest'
import { combineSources } from '../src/sources.ts'
import type { Asker, FileAt, PluginSource, SourceRead } from '../src/ports.ts'
import { offered } from './fixtures/world.ts'

const ASKER: Asker = { principal: {} as Principal, tenant: 'alice' }
const AT: FileAt = { name: 'notes', version: 'v1', path: 'main.js', offset: 0, limit: 8 }
const PART: SourceRead = { kind: 'read', part: new Uint8Array([1]), next: null, bytes: 1 }
const ABSENT: SourceRead = { kind: 'absent', what: 'plugin' }

type Listed = Awaited<ReturnType<PluginSource['list']>>

function source(listed: Listed | Error, read: SourceRead | Error = ABSENT) {
  const calls: unknown[] = []
  const listeners = new Set<() => void>()
  const made: PluginSource = {
    async list(asker) {
      calls.push(['list', asker])
      if (listed instanceof Error) throw listed
      return listed
    },
    async read(asker, at) {
      calls.push(['read', asker, at])
      if (read instanceof Error) throw read
      return read
    },
    subscribe(tenant, listener) {
      calls.push(['subscribe', tenant])
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return { made, calls, listeners }
}

const notes = offered('notes', 'v1', { client: true })
const board = offered('board', 'v2', { client: true })

describe('several sources as one', () => {
  it('lists what each offers, asking each as it was asked', async () => {
    const dev = source({ kind: 'read', offered: [notes] })
    const held = source({ kind: 'read', offered: [board] })
    expect(await combineSources([dev.made, held.made]).list(ASKER)).toEqual({
      kind: 'read',
      offered: [notes, board],
    })
    expect([dev.calls, held.calls]).toEqual([[['list', ASKER]], [['list', ASKER]]])
  })

  it('offers a name two sources offer twice, so that neither is loaded', async () => {
    const dev = source({ kind: 'read', offered: [notes] })
    const held = source({ kind: 'read', offered: [offered('notes', 'v9', { client: true })] })
    const list = await combineSources([dev.made, held.made]).list(ASKER)
    expect(list.kind === 'read' && list.offered.map(each => each.version)).toEqual(['v1', 'v9'])
  })

  it('is unavailable when one of them is, or throws: what is loaded from it is not taken for gone', async () => {
    const held = source({ kind: 'read', offered: [board] })
    for (const broken of [{ kind: 'unavailable' } as const, new Error('the source broke')])
      expect(await combineSources([source(broken).made, held.made]).list(ASKER)).toEqual({
        kind: 'unavailable',
      })
  })

  it('reads from the first source that has the plugin', async () => {
    const dev = source({ kind: 'read', offered: [] }, ABSENT)
    const held = source({ kind: 'read', offered: [] }, PART)
    const last = source({ kind: 'read', offered: [] }, PART)
    expect(await combineSources([dev.made, held.made, last.made]).read(ASKER, AT)).toBe(PART)
    expect(dev.calls).toEqual([['read', ASKER, AT]])
    expect(last.calls).toEqual([])
  })

  it('gives the answer of the source that has the plugin, whatever it is', async () => {
    const gone: SourceRead = { kind: 'absent', what: 'file' }
    for (const answer of [gone, { kind: 'unavailable' } as const])
      expect(
        await combineSources([source({ kind: 'read', offered: [] }, answer).made]).read(ASKER, AT),
      ).toEqual(answer)
  })

  it('says the plugin is absent when no source has it', async () => {
    expect(await combineSources([source([] as never).made]).read(ASKER, AT)).toEqual(ABSENT)
    expect(await combineSources([]).read(ASKER, AT)).toEqual(ABSENT)
  })

  it('is unavailable when the source asked throws', async () => {
    const broken = source({ kind: 'read', offered: [] }, new Error('the read broke'))
    expect(await combineSources([broken.made]).read(ASKER, AT)).toEqual({ kind: 'unavailable' })
  })

  it('listens to each for the tenant, and stops listening to each', () => {
    const dev = source({ kind: 'read', offered: [] })
    const held = source({ kind: 'read', offered: [] })
    let changes = 0
    const stop = combineSources([dev.made, held.made]).subscribe('alice', () => (changes += 1))
    expect([dev.calls, held.calls]).toEqual([[['subscribe', 'alice']], [['subscribe', 'alice']]])
    for (const listener of [...dev.listeners, ...held.listeners]) listener()
    expect(changes).toBe(2)
    stop()
    expect([dev.listeners.size, held.listeners.size]).toEqual([0, 0])
  })
})
