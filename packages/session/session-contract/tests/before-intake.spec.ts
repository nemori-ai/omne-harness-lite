import { judgeMessage, type Message } from '@omne-harness/message'
import { describe, expect, it } from 'vitest'
import {
  commandDigest,
  createBeforeIntakeRegistry,
  judgeIntakeBlocks,
  originalContent,
  screenInput,
  type IntakeProcessor,
  type IntakeVerdict,
} from '@omne-harness/session-contract'

const visibility = { toHuman: true, toModel: true }
const text = (id: string, value: string) => ({ kind: 'text', id, visibility, text: value })
const ref = (key: string) => ({
  storage: 'local',
  key,
  mediaType: 'image/png',
  bytes: '11',
  digest: `sha256:${key}`,
})
const image = (id: string, key: string, extra: Record<string, unknown> = {}) => ({
  kind: 'image',
  id,
  visibility,
  ref: ref(key),
  transcript: null,
  ...extra,
})
const FACTS = { kind: 'image', widthPixels: 4, heightPixels: 3 }
const ID = 'msg_0123456789abcdefghjkmnpqrs'
/** A message as the ingress hands it on: judged by the common contract. */
function message(...blocks: unknown[]): Message {
  const judged = judgeMessage({ id: ID, role: 'user', blocks })
  if (!('ok' in judged)) throw new Error(`the fixture is no message: ${judged.rejected}`)
  return judged.ok
}
const ORIGINAL = message(text('b1', 'look at this'), image('b2', 'k1'))
const MEASURED = message(text('b1', 'look at this'), image('b2', 'k1', { facts: FACTS }))

const processor = (
  name: string,
  run: (
    input: Parameters<IntakeProcessor<unknown>['run']>[0],
  ) => Promise<IntakeVerdict> | IntakeVerdict,
): IntakeProcessor<unknown> => ({ name, run: async input => run(input) })
const screen = (processors: readonly IntakeProcessor<unknown>[], original = ORIGINAL) =>
  screenInput({
    processors,
    original,
    source: 'session.member' as never,
    request: { input: 'in-1' as never, operation: 'op-1' as never },
    access: { principal: 'p', tenant: 't' as never, session: 's-1' as never },
  })

describe('the registry of processors before intake', () => {
  it('runs them in the code unit order of their names, whatever the order they came in', () => {
    const registry = createBeforeIntakeRegistry<unknown>()
    for (const name of ['media.references', 'audit.b', 'audit.a2', 'audit.a'])
      registry.register(processor(name, () => ({ kind: 'pass' })))
    expect(registry.current().map(entry => entry.name)).toEqual([
      'audit.a',
      'audit.a2',
      'audit.b',
      'media.references',
    ])
  })

  it('refuses a name that is not <domain>.<name>, a name that is taken and a processor that cannot run', () => {
    const registry = createBeforeIntakeRegistry<unknown>()
    registry.register(processor('media.references', () => ({ kind: 'pass' })))
    expect(() =>
      registry.register(processor('media.references', () => ({ kind: 'pass' }))),
    ).toThrow('already registered')
    for (const name of ['media', 'Media.references', '.x', 'a.b.c'])
      expect(() => registry.register(processor(name, () => ({ kind: 'pass' })))).toThrow(
        'is not a processor name',
      )
    expect(() => registry.register({ name: 'a.b' } as never)).toThrow('cannot run')
  })

  it('withdraws only the registration that is its own', () => {
    const registry = createBeforeIntakeRegistry<unknown>()
    const first = registry.register(processor('a.one', () => ({ kind: 'pass' })))
    first()
    const again = processor('a.one', () => ({ kind: 'pass' }))
    registry.register(again)
    first()
    expect(registry.current()).toEqual([again])
  })
})

describe('screening one input', () => {
  it('with no processor, and with processors that only pass, the effective content is the original', async () => {
    expect(await screen([])).toEqual({ kind: 'screened', effective: ORIGINAL })
    const passing = [
      processor('a.one', () => ({ kind: 'pass' })),
      processor('a.two', () => ({ kind: 'pass' })),
    ]
    expect(await screen(passing)).toEqual({ kind: 'screened', effective: ORIGINAL })
  })

  it('hands each processor the original, what the one before made of it, the source and the request', async () => {
    const seen: unknown[] = []
    const result = await screen([
      processor('a.one', () => ({ kind: 'pass', effective: MEASURED })),
      processor('a.two', input => {
        seen.push(input)
        return { kind: 'pass' }
      }),
    ])
    expect(result).toEqual({ kind: 'screened', effective: MEASURED })
    expect(seen).toEqual([
      {
        original: ORIGINAL,
        effective: MEASURED,
        source: 'session.member',
        request: { input: 'in-1', operation: 'op-1' },
        access: { principal: 'p', tenant: 't', session: 's-1' },
      },
    ])
  })

  it('does not adopt the facts a caller brought: the processors see the original without them', async () => {
    const brought = message(
      text('b1', 'look at this'),
      image('b2', 'k1', { facts: { kind: 'file' } }),
    )
    expect(await screen([], brought)).toEqual({ kind: 'screened', effective: ORIGINAL })
    expect(originalContent(brought)).toEqual(ORIGINAL)
    expect(originalContent(ORIGINAL)).toEqual(ORIGINAL)
  })

  it.each([
    [
      'a block more',
      message(text('b1', 'look at this'), image('b2', 'k1'), text('b3', 'and this')),
    ],
    ['a block less', message(text('b1', 'look at this'))],
    ['another text', message(text('b1', 'look at that'), image('b2', 'k1', { facts: FACTS }))],
    ['another reference', message(text('b1', 'look at this'), image('b2', 'k2', { facts: FACTS }))],
    ['another block id', message(text('b1', 'look at this'), image('b9', 'k1', { facts: FACTS }))],
    [
      'another visibility',
      message(text('b1', 'look at this'), {
        ...image('b2', 'k1'),
        visibility: { toHuman: true, toModel: false },
      }),
    ],
    [
      'another transcript',
      message(text('b1', 'look at this'), image('b2', 'k1', { transcript: 'said' })),
    ],
    ['another message id', { ...MEASURED, id: 'msg_0123456789abcdefghjkmnpqrt' }],
    [
      'facts that are no facts',
      {
        ...ORIGINAL,
        blocks: [text('b1', 'look at this'), image('b2', 'k1', { facts: { kind: 'video' } })],
      },
    ],
    ['something that is no message', { blocks: 'none' }],
  ])(
    'an effective content with %s is out of bounds: the input is unavailable, and the processor is named',
    async (_, effective) => {
      const result = await screen([
        processor('a.one', () => ({ kind: 'pass', effective: effective as never })),
        processor('a.two', () => {
          throw new Error('must not run')
        }),
      ])
      expect(result).toMatchObject({ kind: 'unavailable', processor: 'a.one' })
    },
  )

  it('stops at the first block, names the processor, the block and the reason, and runs nothing after it', async () => {
    const ran: string[] = []
    const result = await screen([
      processor('a.one', () => ({
        kind: 'block',
        block: 'b2' as never,
        reason: 'invalid-reference',
      })),
      processor('a.two', () => {
        ran.push('a.two')
        return { kind: 'pass' }
      }),
    ])
    expect(result).toEqual({
      kind: 'blocked',
      processor: 'a.one',
      block: 'b2',
      reason: 'invalid-reference',
    })
    expect(ran).toEqual([])
  })

  it('a block that names no content block blocks the whole input', async () => {
    const result = await screen([processor('a.one', () => ({ kind: 'block', reason: 'not now' }))])
    expect(result).toEqual({ kind: 'blocked', processor: 'a.one', block: null, reason: 'not now' })
  })

  it.each([
    [
      'answers unavailable',
      () => ({ kind: 'unavailable', diagnostic: 'the store is off' }) as const,
      'the store is off',
    ],
    [
      'throws',
      () => {
        throw new Error('broke')
      },
      'threw: broke',
    ],
    [
      'throws something that is no error',
      () => {
        throw 'a word'
      },
      'threw: a word',
    ],
    ['answers something else', () => ({ kind: 'maybe' }) as never, 'no verdict'],
    ['answers nothing', () => undefined as never, 'no verdict'],
    ['answers a word', () => 'pass' as never, 'no verdict'],
  ])(
    'a processor that %s makes the input unavailable, never passed',
    async (_, run, diagnostic) => {
      const result = await screen([
        processor('a.one', run),
        processor('a.two', () => ({ kind: 'pass' })),
      ])
      expect(result).toEqual({ kind: 'unavailable', processor: 'a.one', diagnostic })
    },
  )
})

describe('what the blocks of an input must be to enter the log', () => {
  it('text only: accepted, with or without facts anywhere', () => {
    expect(judgeIntakeBlocks(message(text('b1', 'hello')))).toBeNull()
  })

  it('a reference block that carries facts is accepted; one without is unmeasured, by its place and id', () => {
    expect(judgeIntakeBlocks(MEASURED)).toBeNull()
    expect(judgeIntakeBlocks(ORIGINAL)).toEqual({ kind: 'unmeasured', index: 1, block: 'b2' })
  })

  it.each(['image', 'voice'])('an inline %s block is refused: upload first', kind => {
    const inline = { kind, id: 'b2', visibility, mediaType: 'image/png', inline: 'aGVsbG8=' }
    expect(judgeIntakeBlocks(message(text('b1', 'x'), inline))).toEqual({
      kind: 'inline',
      index: 1,
      block: 'b2',
    })
  })

  it('an inline block is refused before an unmeasured one is reported', () => {
    const inline = {
      kind: 'image',
      id: 'b3',
      visibility,
      mediaType: 'image/png',
      inline: 'aGVsbG8=',
    }
    expect(judgeIntakeBlocks(message(image('b2', 'k1'), inline))).toMatchObject({
      kind: 'inline',
      block: 'b3',
    })
  })
})

describe('the digest a replay is compared by', () => {
  const accept = (value: unknown) =>
    ({
      kind: 'accept',
      input: {
        tenant: 't',
        session: 's-1',
        operation: 'op-1',
        value: {
          kind: 'ordinary',
          input: 'in-1',
          message: value,
          origin: { owner: 'o' },
          source: 'session.member',
        },
      },
    }) as never
  const interrupt = (value: unknown) =>
    ({
      kind: 'interrupt',
      input: {
        tenant: 't',
        session: 's-1',
        operation: 'op-1',
        run: null,
        decision: { owner: 'o' },
        urgent: {
          kind: 'ordinary',
          input: 'in-1',
          message: value,
          origin: { owner: 'o' },
          source: 'session.member',
        },
      },
    }) as never

  it('is the same for the original content and for the effective content made of it', () => {
    expect(commandDigest(accept(MEASURED))).toBe(commandDigest(accept(ORIGINAL)))
    expect(commandDigest(interrupt(MEASURED))).toBe(commandDigest(interrupt(ORIGINAL)))
  })

  it('still differs for another text, another reference and another input', () => {
    const base = commandDigest(accept(ORIGINAL))
    expect(commandDigest(accept(message(text('b1', 'other'), image('b2', 'k1'))))).not.toBe(base)
    expect(commandDigest(accept(message(text('b1', 'look at this'), image('b2', 'k2'))))).not.toBe(
      base,
    )
    expect(commandDigest(interrupt(ORIGINAL))).not.toBe(base)
  })

  it('is what it was for an input with no reference block', () => {
    expect(commandDigest(accept(message(text('b1', 'hello'))))).toBe(PLAIN_DIGEST)
  })
})

// Measured on the code before this digest left the facts out (b81f4e48f): text alone keeps its digest.
const PLAIN_DIGEST = '729ddea2a0ce2fa95cc5f26b36129580cc9859529b0ac48fe5184cd66b680578'
