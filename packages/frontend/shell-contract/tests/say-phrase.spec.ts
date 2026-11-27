import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { Scope } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { lookScope, tenantScope } from '@omne-harness/shell-contract'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const POINT = 'shell.say-phrase'
const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const alice = tenantScope(ALICE)
const ink = lookScope(ALICE, 'ink')

class Showing extends ReferenceShell {
  show(tenant: string | undefined): void {
    this.tenant = tenant
    this.rescope()
  }
}

const SHIPPED = [
  { key: 'shell.expand', label: '展开讲讲', words: '展开讲讲' },
  { key: 'shell.todo', label: '记成待办', words: '记成待办' },
  { key: 'shell.keep', label: '收藏下来', words: '收藏下来' },
]

type Put = readonly [key: string, item: object, scope?: Scope]

/** Puts phrases as a module puts data on a point: each with its content for a digest. */
function place(root: Context, name: string, ...puts: readonly Put[]): Fiber {
  return root.plugin({
    name,
    inject: ['dynamis'],
    apply: (ctx: Context) =>
      void ctx.dynamis.put(
        puts.map(([key, item, scope = alice]) => ({
          point: POINT,
          key,
          id: '',
          scope,
          rank: 0,
          digest: JSON.stringify(item),
          item,
        })),
      ),
  })
}

async function world() {
  const started = await startShellOf(Showing)
  started.shell.show(ALICE)
  return started
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))

describe('the ready phrases beside the note', () => {
  it('with nothing put, are the three the shell ships, by their order, and nothing is refused', async () => {
    const { shell } = await world()
    expect(shell.phrases()).toEqual(SHIPPED)
    expect(shell.changes().refused).toEqual([])
    expect(shell.changes().conflicts).toEqual([])
    shell.show(undefined)
    expect(shell.phrases()).toEqual(SHIPPED)
  })

  it('one a tenant puts on a key the shell ships takes its place for that tenant only', async () => {
    const { root, shell } = await world()
    await place(root, 'brand', [
      'shell.todo',
      { label: '待办', words: '把这个记成待办', order: 20 },
    ])
    expect(shell.phrases()).toEqual([
      SHIPPED[0],
      { key: 'shell.todo', label: '待办', words: '把这个记成待办' },
      SHIPPED[2],
    ])
    shell.show(BOB)
    expect(shell.phrases()).toEqual(SHIPPED)
  })

  it('one put for a look takes the place of the tenant one while the shell wears that look', async () => {
    const { root, shell } = await world()
    await place(
      root,
      'brand',
      ['shell.expand', { label: '说说看', words: '说说看', order: 10 }],
      ['shell.expand', { label: '墨里讲讲', words: '墨里讲讲', order: 10 }, ink],
    )
    expect(shell.phrases()[0]).toMatchObject({ key: 'shell.expand', label: '说说看' })
    shell.wear('ink')
    expect(shell.phrases()[0]).toMatchObject({ key: 'shell.expand', label: '墨里讲讲' })
    shell.wear(undefined)
    expect(shell.phrases()[0]).toMatchObject({ key: 'shell.expand', label: '说说看' })
  })

  it('two different ones on a key at one scope are a conflict: that key does not count, both are named, the other keys stand', async () => {
    const { root, shell } = await world()
    await place(root, 'a', ['shell.keep', { label: '存下', words: '存下' }])
    const second = await place(root, 'b', ['shell.keep', { label: '收好', words: '收好' }])
    expect(shell.phrases()).toEqual([SHIPPED[0], SHIPPED[1]])
    expect(shell.changes().conflicts).toEqual([{ point: POINT, key: 'shell.keep', by: ['a', 'b'] }])
    await second.dispose()
    await settle()
    expect(shell.phrases()[2]).toEqual({ key: 'shell.keep', label: '存下', words: '存下' })
    expect(shell.changes().conflicts).toEqual([])
  })

  it('one put for the whole deployment on a key the shell ships is a conflict with what shipped', async () => {
    const { root, shell } = await world()
    await place(root, 'operator', ['shell.expand', { label: '讲讲', words: '讲讲' }, []])
    expect(shell.phrases().map(phrase => phrase.key)).toEqual(['shell.todo', 'shell.keep'])
    expect(shell.changes().conflicts).toEqual([
      { point: POINT, key: 'shell.expand', by: ['Showing', 'operator'] },
    ])
  })

  it.each([
    ['an empty label', { label: '', words: '好' }, 'the label is empty'],
    [
      'a label of 13 characters',
      { label: '一二三四五六七八九十一二三', words: '好' },
      'the label is longer than 12 characters',
    ],
    [
      'a label of two lines',
      { label: '记成\n待办', words: '好' },
      'the label is more than one line',
    ],
    ['a label of blank space', { label: ' \u3000 ', words: '好' }, 'the label is only blank space'],
    ['empty words', { label: '好', words: '' }, 'the words are empty'],
    ['words of blank space', { label: '好', words: ' \n\t ' }, 'the words are only blank space'],
    [
      'words of 401 characters',
      { label: '好', words: 'x'.repeat(401) },
      'the words are longer than 400 characters',
    ],
    [
      'an order of 1.5',
      { label: '好', words: '好', order: 1.5 },
      'the order is not a whole number',
    ],
    [
      'an order as text',
      { label: '好', words: '好', order: '5' },
      'the order is not a whole number',
    ],
    ['no words', { label: '好', order: 5 }, 'the item lacks words (string)'],
  ])(
    'one with %s does not count, and the answer of the shell names who put it and why',
    async (_, item, reason) => {
      const { root, shell } = await world()
      await place(
        root,
        'brand',
        ['shell.todo', item],
        ['brand.ask', { label: '问', words: '问一下' }],
      )
      expect(shell.phrases()).toEqual([
        ...SHIPPED,
        { key: 'brand.ask', label: '问', words: '问一下' },
      ])
      expect(shell.changes().refused).toEqual([
        { point: POINT, key: 'shell.todo', by: 'brand', scope: alice, reason },
      ])
    },
  )

  it('takes a label of twelve characters counted as a person counts them, and words of four hundred', async () => {
    const { root, shell } = await world()
    const label = '🌊'.repeat(12)
    await place(root, 'brand', ['brand.sea', { label, words: 'y'.repeat(400), order: 1 }])
    expect(shell.changes().refused).toEqual([])
    expect(shell.phrases()[0]).toEqual({ key: 'brand.sea', label, words: 'y'.repeat(400) })
  })

  it('of six that count, gives the first four by order, and by key where the order is the same; no order is 100', async () => {
    const { root, shell } = await world()
    await place(
      root,
      'brand',
      ['brand.b', { label: 'b', words: 'b', order: 20 }],
      ['brand.a', { label: 'a', words: 'a', order: 20 }],
      ['brand.last', { label: 'z', words: 'z' }],
    )
    expect(shell.phrases().map(phrase => phrase.key)).toEqual([
      'shell.expand',
      'brand.a',
      'brand.b',
      'shell.todo',
    ])
    await place(root, 'early', ['brand.first', { label: 'f', words: 'f', order: 99 }])
    expect(shell.phrases().map(phrase => phrase.key)).toEqual([
      'shell.expand',
      'brand.a',
      'brand.b',
      'shell.todo',
    ])
  })

  it('of those with the same order, answers by key whatever order they were put in, and keeps the smaller key at the fourth place', async () => {
    const { root, shell } = await world()
    for (const [key, label] of [
      ['notes.e', 'a'],
      ['notes.d', 'b'],
      ['notes.c', 'c'],
      ['notes.b', 'd'],
      ['notes.a', 'e'],
    ] as const)
      await place(root, label, [key, { label, words: label, order: 5 }])
    expect(shell.phrases().map(phrase => phrase.key)).toEqual([
      'notes.a',
      'notes.b',
      'notes.c',
      'notes.d',
    ])
  })

  it('a phrase with no order comes after one with order 99 and before one with order 101', async () => {
    const { root, shell } = await world()
    await place(
      root,
      'brand',
      ['shell.expand', { label: 'e', words: 'e', order: 101 }],
      ['shell.todo', { label: 't', words: 't', order: 99 }],
      ['shell.keep', { label: 'k', words: 'k', order: 102 }],
      ['brand.plain', { label: 'p', words: 'p' }],
    )
    expect(shell.phrases().map(phrase => phrase.key)).toEqual([
      'shell.todo',
      'brand.plain',
      'shell.expand',
      'shell.keep',
    ])
  })

  it('tells who watches the changes when one is put and when it is taken back, and the answer follows', async () => {
    const { root, shell } = await world()
    let told = 0
    shell.watchChanges(() => (told += 1))
    const brand = await place(root, 'brand', [
      'brand.ask',
      { label: '问', words: '问一下', order: 1 },
    ])
    expect(told).toBeGreaterThan(0)
    expect(shell.phrases()[0]?.key).toBe('brand.ask')
    const before = told
    await brand.dispose()
    await settle()
    expect(told).toBeGreaterThan(before)
    expect(shell.phrases()).toEqual(SHIPPED)
  })

  describe('put through the shell, as the loader of a plugin puts data', () => {
    const shelled = (root: Context, name: string, put: (ctx: Context) => void): Fiber =>
      root.plugin({ name, inject: ['shell'], apply: put })

    it('stands while it is put, and is gone once the function it gave back is called', async () => {
      const { root, shell } = await world()
      let take: (() => unknown) | undefined
      await shelled(root, 'notes', ctx => {
        take = ctx.shell.putPhrase('notes.ask', { label: '问', words: '问一下', order: 1 }, alice)
      })
      expect(shell.phrases()[0]).toEqual({ key: 'notes.ask', label: '问', words: '问一下' })
      await take?.()
      await settle()
      expect(shell.phrases()).toEqual(SHIPPED)
    })

    it('is gone once the plugin that put it unloads', async () => {
      const { root, shell } = await world()
      const notes = await shelled(root, 'notes', ctx => {
        ctx.shell.putPhrase('notes.ask', { label: '问', words: '问一下', order: 1 }, alice)
      })
      expect(shell.phrases()[0]?.key).toBe('notes.ask')
      await notes.dispose()
      await settle()
      expect(shell.phrases()).toEqual(SHIPPED)
    })

    it('put on a key the shell ships for a tenant, takes the place of what shipped; with no scope it is for everyone, a conflict with what shipped', async () => {
      const { root, shell } = await world()
      await shelled(root, 'notes', ctx => {
        ctx.shell.putPhrase('shell.expand', { label: '细说', words: '细说一下', order: 10 }, alice)
        ctx.shell.putPhrase('shell.keep', { label: '存', words: '存' })
      })
      expect(shell.phrases()).toEqual([
        { key: 'shell.expand', label: '细说', words: '细说一下' },
        SHIPPED[1],
      ])
      expect(shell.changes().conflicts).toEqual([
        { point: POINT, key: 'shell.keep', by: ['Showing', 'notes'] },
      ])
    })

    it('is put even when the rule refuses it, and then does not count and is named with why', async () => {
      const { root, shell } = await world()
      await shelled(root, 'notes', ctx => {
        ctx.shell.putPhrase('notes.ask', { label: '', words: '问一下' }, alice)
      })
      expect(shell.phrases()).toEqual(SHIPPED)
      expect(shell.changes().refused).toEqual([
        { point: POINT, key: 'notes.ask', by: 'notes', scope: alice, reason: 'the label is empty' },
      ])
    })
  })

  it('is a point of the shell on the client tree, one data item on each key, the most specific standing', async () => {
    const { shell } = await world()
    const told = shell.described().points.find(point => point.name === POINT)
    expect(told?.contract).toMatchObject({
      name: POINT,
      tree: 'client',
      arity: 'keyed-one',
      keyFrom: null,
      item: { kind: 'data', fields: { label: 'string', words: 'string' } },
      resolve: 'most-specific',
      binding: 'run',
      version: 1,
      revision: 1,
    })
  })
})
