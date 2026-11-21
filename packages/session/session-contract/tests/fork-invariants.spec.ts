import { describe, expect, it } from 'vitest'
import { refused, succeeded } from '@omne-harness/session-contract/testing'
import {
  answering,
  asking,
  childOf,
  compact,
  createWith,
  deliver,
  entryIds,
  pointOf,
  record,
  remind,
  rows,
  talking,
  view,
  type Scene,
} from './fork-scene.ts'

async function forked(name = 'child-1') {
  const parent = await talking()
  const point = await pointOf(parent)
  const prefix = (await rows(parent)).slice(0, 3)
  const child = parent.peer(name)
  succeeded(await createWith(child, childOf(parent, point)), 'fork')
  return { parent, child, point, prefix }
}

/** Puts the forked session in a step of its own. Its input has the identity the input of the source has:
 * what is open in one session is told from its own entries, not from the entries behind its prefix. */
async function stepping(child: Scene, call = 'c1') {
  await child.accept('first')
  await child.start()
  succeeded(await deliver(child, 'one', ['first']), 'deliver')
  succeeded(await record(child, `ask-${call}`, asking(`ask-${call}`, [call])), 'assistant')
}

const shown = async (s: Scene) => ({ epoch: (await view(s)).basis.epoch, rows: await rows(s) })

describe('the prefix of a forked session stays as it was at the point (SF-1)', () => {
  it('does not move while the source goes on, compacts and is archived', async () => {
    const { parent, child, point, prefix } = await forked()
    succeeded(await record(parent, 'answer-2', answering('k2')), 'tool')
    succeeded(await remind(parent, 'later'), 'remind')
    expect(await rows(child)).toEqual(prefix)
    const [origin, last] = [entryIds(parent)[0], entryIds(parent).at(-1)] as [string, string]
    succeeded(await compact(parent, 'summary', origin, last), 'compact')
    expect((await view(parent)).basis.epoch).not.toBe(point.epoch)
    expect(await rows(child)).toEqual(prefix)
    await parent.control('archive')
    expect(await rows(child)).toEqual(prefix)
  })
})

describe('a fork copies nothing and writes nothing into its source (SF-2)', () => {
  it('leaves in the log of the source what any child leaves, and no row of the prefix in its own', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const before = { ids: entryIds(parent), view: await shown(parent) }
    const plain = parent.peer('child-0')
    succeeded(await createWith(plain, childOf(parent, null)), 'plain child')
    const afterPlain = entryIds(parent).length - before.ids.length
    const child = parent.peer('child-1')
    succeeded(await createWith(child, childOf(parent, point)), 'fork')
    expect(entryIds(parent).length - before.ids.length - afterPlain).toBe(afterPlain)
    expect(await shown(parent)).toEqual(before.view)
    const own = child.port.controls.entriesOf(child.base.tenant, child.base.session)
    expect(own.filter(entry => entry.kind.startsWith('message.'))).toEqual([])
    expect(own.length).toBe(
      plain.port.controls.entriesOf(plain.base.tenant, plain.base.session).length,
    )
  })

  it('lets each of the two sessions change its own log and view only', async () => {
    const { parent, child } = await forked()
    const source = { ids: entryIds(parent), view: await shown(parent) }
    await stepping(child)
    succeeded(await remind(child, 'own'), 'remind')
    expect({ ids: entryIds(parent), view: await shown(parent) }).toEqual(source)
    const mine = { ids: entryIds(child), view: await shown(child) }
    succeeded(await record(parent, 'answer-2', answering('k2')), 'tool')
    expect({ ids: entryIds(child), view: await shown(child) }).toEqual(mine)
  })
})

describe('each of the two compacts for itself, and a reference names one entry (SF-3)', () => {
  it('compacts the prefix of the forked session into an epoch of its own', async () => {
    const { parent, child, point, prefix } = await forked()
    await stepping(child)
    const source = await shown(parent)
    const origin = entryIds(parent)[0] as string
    const context = succeeded(
      await child.port.history.readCompactionContext({
        ...child.access,
        basis: (await view(child)).basis,
        coverTo: prefix[2]?.entry as never,
      }),
      'context',
    )
    if (context.kind !== 'context') throw new Error('a compaction context is expected')
    expect(context.value.origin).toBe(origin)
    expect(context.value.base.pairings).toContainEqual({
      result: prefix[2]?.entry,
      call: prefix[1]?.entry,
    })
    const own = (await rows(child)).slice(3)
    succeeded(await compact(child, 'summary', origin, prefix[2]?.entry as string), 'compact')
    const after = await rows(child)
    expect(after.map(row => row.message.role)).toEqual(['compaction', 'user', 'assistant'])
    expect(after.slice(1).map(row => row.entry)).toEqual(own.map(row => row.entry))
    expect(BigInt(after[0]?.entry as string)).toBeGreaterThan(BigInt(point.position))
    expect(new Set(after.map(row => row.entry)).size).toBe(after.length)
    expect(await shown(parent)).toEqual(source)
  })

  it('leaves the forked session as it was when the source compacts', async () => {
    const { parent, child, point } = await forked()
    await stepping(child)
    const mine = await shown(child)
    const origin = entryIds(parent)[0] as string
    succeeded(await compact(parent, 'summary', origin, point.position), 'compact')
    expect(await shown(child)).toEqual(mine)
  })

  it('refuses a summary of the forked session that starts at its own first entry', async () => {
    const { child, prefix } = await forked()
    await stepping(child)
    const first = entryIds(child)[0] as string
    const answer = await compact(child, 'summary', first, prefix[2]?.entry as string)
    expect(refused(answer, 'own origin')).toMatchObject({ kind: 'invalid' })
  })
})

describe('a session forked from a forked session reads no deeper than its layer (SF-5)', () => {
  it('sees the rows of both sources, then its own', async () => {
    const { child, prefix } = await forked()
    await stepping(child)
    const point = await pointOf(child)
    expect(point.upper).toBe('4')
    const expected = (await rows(child)).slice(0, 4)
    expect(expected.slice(0, 3)).toEqual(prefix)
    const grand = child.peer('grand-1')
    succeeded(await createWith(grand, childOf(child, point)), 'fork of a fork')
    expect(await rows(grand)).toEqual(expected)
    expect(entryIds(grand).every(id => BigInt(id) > BigInt(point.position))).toBe(true)
    succeeded(await remind(grand, 'own'), 'remind')
    expect((await rows(grand)).map(row => row.seq)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('names no point in a forked session that has asked nothing itself', async () => {
    const { child } = await forked()
    expect(succeeded(await child.port.history.readForkPoint(child.access), 'point')).toEqual({
      kind: 'none',
    })
  })

  it('goes no deeper than the layers a session may stand at', async () => {
    const { child } = await forked()
    await stepping(child)
    const grand = child.peer('grand-1')
    succeeded(await createWith(grand, childOf(child, await pointOf(child))), 'layer 2')
    await stepping(grand)
    const deeper = grand.peer('deeper-1')
    const answer = await createWith(deeper, childOf(grand, await pointOf(grand)))
    expect(refused(answer, 'layer 3')).toMatchObject({
      kind: 'invalid',
      field: 'creation.relation',
    })
  })
})
