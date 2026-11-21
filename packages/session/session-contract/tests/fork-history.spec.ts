import { describe, expect, it } from 'vitest'
import type { HistoryPage } from '@omne-harness/session-contract'
import { refused, succeeded } from '@omne-harness/session-contract/testing'
import {
  asking,
  childOf,
  createWith,
  deliver,
  entryIds,
  pointOf,
  record,
  rows,
  talking,
  type Scene,
} from './fork-scene.ts'

async function pages(s: Scene, inherited: boolean, kinds: readonly string[] = []) {
  const read: HistoryPage[] = []
  let page = succeeded(
    await s.port.history.begin({
      ...s.access,
      kinds,
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
      ...(inherited ? { inherited: true as const } : {}),
    }),
    'begin',
  )
  for (;;) {
    read.push(page)
    if (page.next === null) return read
    page = succeeded(await s.port.history.next({ ...s.access, cursor: page.next }), 'next')
  }
}

const ids = (page: HistoryPage | undefined) => page?.entries.map(entry => entry.id)

async function forked() {
  const parent = await talking()
  const point = await pointOf(parent)
  const prefix = (await rows(parent)).slice(0, 3)
  const child = parent.peer('child-1')
  succeeded(await createWith(child, childOf(parent, point)), 'fork')
  return { parent, child, prefix }
}

describe('a history read can name the prefix of a forked session (C8)', () => {
  it('gives the entries behind the prefix first, under the session they are from, then its own', async () => {
    const { parent, child, prefix } = await forked()
    const [first, ...own] = await pages(child, true)
    expect(first?.from).toBe(parent.base.session)
    expect(ids(first)).toEqual(prefix.map(row => row.entry))
    expect(first?.entries.map(entry => entry.kind)).toEqual([
      'message.delivered',
      'message.assistant',
      'message.tool',
    ])
    expect(own.every(page => page.from === undefined)).toBe(true)
    expect(own.flatMap(page => ids(page))).toEqual(entryIds(child))
  })

  it('reads what it read before when the prefix is not asked for', async () => {
    const { child } = await forked()
    const plain = await pages(child, false)
    expect(plain.every(page => page.from === undefined)).toBe(true)
    expect(plain.flatMap(page => ids(page))).toEqual(entryIds(child))
  })

  it('reads a session without a source as it reads it without the option', async () => {
    const parent = await talking()
    const all = await pages(parent, true)
    expect(all.every(page => page.from === undefined)).toBe(true)
    expect(all.flatMap(page => ids(page))).toEqual(entryIds(parent))
  })

  it('keeps to the kinds asked for in the prefix too, a row being of the kind of its message', async () => {
    const { child, prefix } = await forked()
    const [first] = await pages(child, true, ['message.assistant'])
    expect(ids(first)).toEqual([prefix[1]?.entry])
    const [said] = await pages(child, true, ['message.user'])
    expect(ids(said)).toEqual([prefix[0]?.entry])
    expect(said?.entries[0]?.kind).toBe('message.delivered')
  })

  it('names each source of a session forked from a forked session on a page of its own', async () => {
    const { parent, child, prefix } = await forked()
    await child.accept('first')
    await child.start()
    succeeded(await deliver(child, 'one', ['first']), 'deliver')
    succeeded(await record(child, 'ask-c1', asking('ask-c1', ['c1'])), 'assistant')
    const grand = child.peer('grand-1')
    succeeded(await createWith(grand, childOf(child, await pointOf(child))), 'layer 2')
    const [a, b, ...own] = await pages(grand, true)
    expect(a?.from).toBe(parent.base.session)
    expect(ids(a)).toEqual(prefix.map(row => row.entry))
    expect(b?.from).toBe(child.base.session)
    expect(b?.entries.map(entry => entry.kind)).toEqual(['message.delivered'])
    expect(own.flatMap(page => ids(page))).toEqual(entryIds(grand))
  })

  it('refuses the prefix for a read that goes backward or starts in the middle', async () => {
    const { child } = await forked()
    const ask = { ...child.access, kinds: [], pageBytes: 1000, inherited: true as const }
    const backward = await child.port.history.begin({ ...ask, from: null, direction: 'backward' })
    expect(refused(backward, 'backward')).toEqual({
      kind: 'invalid',
      field: 'inherited',
      reason: 'only forward from the start',
    })
    const from = entryIds(child)[0] as never
    const middle = await child.port.history.begin({ ...ask, from, direction: 'forward' })
    expect(refused(middle, 'middle').kind).toBe('invalid')
  })
})
