import { describe, expect, it } from 'vitest'
import { readItems } from '../src/cordis/item-read.ts'
import type { Reader } from '../src/cordis/journal-read.ts'

const scope = { tenant: 't', session: 's', execution: 'e' }
const key = (item: string) => ({ family: 'answer', item })
const row = (item: string) => ({ ...key(item), open: false, pub: '1', body: { item } })

// A store that gives one item a page and names the keys it had no room for.
function onePerPage(published: () => string) {
  const asked: string[][] = []
  const read: Reader = async (_handler, input) => {
    const keys = (input as { keys: { item: string }[] }).keys
    asked.push(keys.map(item => item.item))
    const [first, ...rest] = keys
    return {
      kind: 'read',
      output: {
        kind: 'items',
        published: published(),
        items: first === undefined ? [] : [row(first.item)],
        rest: rest.map(item => key(item.item)),
      },
    } as never
  }
  return { read, asked }
}

describe('items read by key across pages', () => {
  it('reads the keys a page had no room for until none is left', async () => {
    const { read, asked } = onePerPage(() => '1')
    const found = await readItems(read, scope, [key('a'), key('b'), key('c')])
    expect(found).toMatchObject({ kind: 'read', published: 1 })
    expect(found.kind === 'read' ? found.items.map(item => item.item) : []).toEqual(['a', 'b', 'c'])
    expect(asked).toEqual([['a', 'b', 'c'], ['b', 'c'], ['c']])
  })

  it('starts over when the head moves between pages, so every item is of one head', async () => {
    let reads = 0
    const { read } = onePerPage(() => ((reads += 1) === 2 ? '2' : reads < 2 ? '1' : '2'))
    const found = await readItems(read, scope, [key('a'), key('b')])
    expect(found).toMatchObject({ kind: 'read', published: 2 })
    expect(found.kind === 'read' ? found.items.map(item => item.item) : []).toEqual(['a', 'b'])
  })

  it('answers unavailable for a page that read none of its keys, instead of asking forever', async () => {
    const read: Reader = async (_handler, input) =>
      ({
        kind: 'read',
        output: {
          kind: 'items',
          published: '1',
          items: [],
          rest: (input as { keys: unknown[] }).keys,
        },
      }) as never
    expect(await readItems(read, scope, [key('a')])).toMatchObject({ kind: 'unavailable' })
  })
})
