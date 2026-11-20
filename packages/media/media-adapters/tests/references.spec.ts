import { describe, expect, it, vi } from 'vitest'
import type { ContentReference, Custody } from '@omne-harness/media-contract'
import { createReferencesProcessor, REFERENCES_PROCESSOR } from '@omne-harness/media-adapters'
import type { IntakeProcessor, IntakeVerdict } from '@omne-harness/session-contract'
import { ok, png, T1, T2, world } from './world.ts'

type Screening = Parameters<IntakeProcessor<string>['run']>[0]
type Message = Screening['effective']

const visibility = { toHuman: true, toModel: true }
const text = (id: string) => ({ kind: 'text', id, visibility, text: 'look at this' })
const image = (id: string, ref: ContentReference) => ({
  kind: 'image',
  id,
  visibility,
  ref,
  transcript: null,
})
function screening(input: string, tenant = T1, ...blocks: unknown[]): Screening {
  const message = { id: 'msg_1', role: 'user', blocks } as unknown as Message
  return {
    original: message,
    effective: message,
    source: 'session.member',
    request: { input, operation: `op-${input}` },
    access: { principal: 'someone', tenant, session: 'session-1' },
  } as unknown as Screening
}
const blocksOf = (verdict: IntakeVerdict): readonly unknown[] =>
  verdict.kind === 'pass' && verdict.effective !== undefined ? verdict.effective.blocks : []
const processorOver = (custody: Pick<Custody, 'hold'> | null) =>
  createReferencesProcessor<string>(() => custody)
const A = png(4, 3, 1)
const B = png(8, 6, 2)

describe('the processor media.references', () => {
  it('holds every medium the input refers to and gives its facts; the words are untouched', async () => {
    const w = world()
    const [a, b] = [await w.staged(T1, 'up-a', A), await w.staged(T1, 'up-b', B)]
    const processor = processorOver(w.media.custody)
    expect(processor.name).toBe(REFERENCES_PROCESSOR)
    const verdict = await processor.run(
      screening('in-1', T1, text('b1'), image('b2', a), image('b3', b)),
    )
    expect(blocksOf(verdict)).toEqual([
      text('b1'),
      { ...image('b2', a), facts: { kind: 'image', widthPixels: 4, heightPixels: 3 } },
      { ...image('b3', b), facts: { kind: 'image', widthPixels: 8, heightPixels: 6 } },
    ])
    for (const ref of [a, b]) {
      expect(ok(await w.media.custody.describe({ tenant: T1, ref })).state).toBe('held')
      expect(await w.holders(T1, ref)).toBe(1)
    }
  })

  it('the same input again holds once; another input of the session is another holder', async () => {
    const w = world()
    const ref = await w.staged(T1, 'up-a', A)
    const processor = processorOver(w.media.custody)
    const first = await processor.run(screening('in-1', T1, image('b1', ref)))
    expect(await processor.run(screening('in-1', T1, image('b1', ref)))).toEqual(first)
    expect(await w.holders(T1, ref)).toBe(1)
    await processor.run(screening('in-2', T1, image('b1', ref)))
    expect(await w.holders(T1, ref)).toBe(2)
  })

  it('the holder is this processor, for the session and the input the reference came in', async () => {
    const hold = vi.fn<Custody['hold']>(async () => ({
      ok: { facts: { kind: 'image', widthPixels: 1, heightPixels: 1 } },
    }))
    const ref = await world().staged(T1, 'up-a', A)
    await processorOver({ hold }).run(screening('in-7', T1, image('b1', ref)))
    expect(hold.mock.calls).toEqual([
      [
        {
          tenant: T1,
          ref,
          holder: {
            owner: 'media.references',
            work: 'session-1',
            position: 'in-7',
            purpose: 'input',
          },
        },
      ],
    ])
  })

  it('an input of words passes as it is, and custody is not asked', async () => {
    const hold = vi.fn<Custody['hold']>()
    expect(await processorOver({ hold }).run(screening('in-1', T1, text('b1')))).toEqual({
      kind: 'pass',
    })
    expect(await processorOver(null).run(screening('in-1', T1, text('b1')))).toEqual({
      kind: 'pass',
    })
    expect(hold).not.toHaveBeenCalled()
  })

  it('a reference to no medium, to a medium of another tenant, or to one still uploading is blocked by name', async () => {
    const w = world()
    const good = await w.staged(T1, 'up-good', A)
    const foreign = await w.staged(T2, 'up-foreign', B)
    await w.begin(T1, 'up-open', png(9, 9))
    expect(ok(await w.media.uploads.status({ tenant: T1, upload: 'up-open' })).kind).toBe(
      'uploading',
    )
    const uploading = { ...good, key: '2'.padStart(32, '0') }
    const unknown = { ...good, key: '9'.repeat(32) }
    const processor = processorOver(w.media.custody)
    for (const bad of [unknown, foreign, uploading]) {
      const verdict = await processor.run(
        screening('in-1', T1, text('b1'), image('b2', good), image('b3', bad)),
      )
      expect(verdict).toEqual({ kind: 'block', block: 'b3', reason: expect.any(String) as unknown })
    }
    expect(ok(await w.media.custody.describe({ tenant: T2, ref: foreign })).state).toBe('staged')
  })

  it.each([
    [{ kind: 'unavailable', dependency: 'index' }, 'unavailable'],
    [{ kind: 'outcome-unknown' }, 'outcome-unknown'],
  ] as const)('custody that answers %o is unavailable, not a block', async (failure, word) => {
    const ref = await world().staged(T1, 'up-a', A)
    const hold: Custody['hold'] = async () => ({ failure })
    expect(await processorOver({ hold }).run(screening('in-1', T1, image('b1', ref)))).toEqual({
      kind: 'unavailable',
      diagnostic: expect.stringContaining(word) as unknown,
    })
  })

  it('custody that is not there is unavailable for an input that refers to media', async () => {
    const ref = await world().staged(T1, 'up-a', A)
    expect(await processorOver(null).run(screening('in-1', T1, image('b1', ref)))).toMatchObject({
      kind: 'unavailable',
    })
  })
})
