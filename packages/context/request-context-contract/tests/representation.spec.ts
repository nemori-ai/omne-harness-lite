import { describe, expect, it } from 'vitest'
import { assemble, fixture, rowWith } from './fixtures.js'
import { judgeMessage, type Message } from '@omne-harness/message'
import {
  chooseRepresentations,
  nativeRequirement,
  unmetBy,
  type NativeCapability,
  type RepresentationResult,
} from '@omne-harness/request-context-contract'
import {
  createScriptedRepresentationPolicy,
  FIXTURE_REPRESENTATION_CONFIG,
} from '@omne-harness/request-context-contract/testing'

type Chosen = Extract<RepresentationResult, { kind: 'chosen' }>

const visibility = { toHuman: true, toModel: true }
const words = (id: string, value = 'look at this') => ({
  kind: 'text',
  id,
  visibility,
  text: value,
})
const refTo = (key: string, mediaType: string) => ({
  storage: 'local',
  key,
  mediaType,
  bytes: '11',
  digest: `sha256:${key}`,
})
const KIND = { image: 'image', audio: 'voice' } as Record<string, string>
const medium = (id: string, mediaType: string, extra: Record<string, unknown> = {}) => ({
  kind: KIND[mediaType.split('/')[0] ?? ''] ?? 'file',
  id,
  visibility,
  ref: refTo(`k-${id}`, mediaType),
  transcript: null,
  ...extra,
})
const SOURCE = {
  definition: { name: 'to-text', revision: '3' },
  engine: { name: 'reader', revision: '7' },
}
const converted = (others: unknown[] = [], text: unknown = null) => ({
  snapshot: { outcome: 'converted', ...SOURCE, text, others },
})
const INCONVERTIBLE = { snapshot: { outcome: 'inconvertible', ...SOURCE } }

const ID = 'msg_0123456789abcdefghjkmnpqr'
function message(blocks: unknown[], n = 0, role = 'user'): Message {
  const judged = judgeMessage({ id: `${ID}${String(n)}`, role, blocks })
  if (!('ok' in judged)) throw new Error(`the fixture is no message: ${judged.rejected}`)
  return judged.ok
}

const TEXT: NativeCapability = { input: ['text'] }
const VISION: NativeCapability = { input: ['text', 'image'] }
const HEARING: NativeCapability = { input: ['text', 'voice'] }
const READS_PDF: NativeCapability = { input: ['text'], fileTypes: ['application/pdf'] }

const policy = createScriptedRepresentationPolicy()
const choose = (capability: NativeCapability, ...messages: Message[]) =>
  chooseRepresentations({ messages, capability, policy })
function chosen(result: RepresentationResult): Chosen {
  if (result.kind !== 'chosen') throw new Error(`not chosen: ${JSON.stringify(result)}`)
  return result
}

describe('the decision table of one block (T5)', () => {
  it('words are sent as they are', () => {
    const history = message([words('b1')])
    const result = chosen(choose(TEXT, history))
    expect(result.messages).toEqual([history])
    expect(result.choices).toMatchObject([{ block: 'b1', choice: 'original', source: null }])
    expect(result.deferred).toEqual([])
  })

  it.each([
    ['an image', 'image/png', VISION, { modalities: ['text', 'image'] }],
    ['a voice', 'audio/wav', HEARING, { modalities: ['text', 'voice'] }],
    [
      'a PDF',
      'application/pdf',
      READS_PDF,
      { modalities: ['text'], fileTypes: ['application/pdf'] },
    ],
  ])(
    '%s the model takes natively is sent as the original, whatever else the block carries',
    (_, mediaType, capability, needs) => {
      const other = refTo('k-other', 'image/webp')
      const block = medium('b2', mediaType, { transcript: 'said', ...converted([other]) })
      const history = message([words('b1'), block])
      const result = chosen(choose(capability, history))
      expect(result.messages).toEqual([history])
      expect(result.choices[1]).toEqual({
        message: history.id,
        block: 'b2',
        choice: 'original',
        source: null,
        mediaType,
      })
      expect(result.deferred).toEqual([block.ref])
      expect(result.modality).toMatchObject(needs)
    },
  )

  it('otherwise the first other representation the model takes is sent in its place', () => {
    const [sound, picture] = [refTo('k-sound', 'audio/mp3'), refTo('k-picture', 'image/png')]
    const block = medium('b2', 'application/pdf', {
      transcript: 'said',
      ...converted([sound, picture, refTo('k-later', 'image/webp')]),
    })
    const result = chosen(choose(VISION, message([words('b1'), block])))
    expect(result.choices[1]).toMatchObject({ block: 'b2', choice: 'derived', source: SOURCE })
    expect(result.messages[0]?.blocks[1]).toMatchObject({
      kind: 'image',
      ref: picture,
      transcript: null,
      visibility,
    })
    expect(result.messages[0]?.blocks[1]?.id).not.toBe('b2')
    expect(result.deferred).toEqual([picture])
    expect(result.modality?.modalities).toEqual(['text', 'image'])
  })

  it('with no other representation the model takes, the inline words stand in', () => {
    const block = medium('b2', 'image/png', {
      transcript: 'a red circle',
      ...converted([refTo('k-sound', 'audio/mp3')]),
    })
    const result = chosen(choose(TEXT, message([words('b1'), block])))
    expect(result.choices[1]).toMatchObject({ block: 'b2', choice: 'transcript', source: SOURCE })
    expect(result.messages[0]?.blocks[1]).toMatchObject({ kind: 'text', text: 'a red circle' })
    expect(result.deferred).toEqual([])
    expect(result.modality?.modalities).toEqual(['text'])
  })

  it('words kept in a content reference stand in as that reference, read when the request is sent', () => {
    const long = refTo('k-long', 'text/plain')
    const block = medium('b2', 'application/pdf', converted([], long))
    const result = chosen(choose(TEXT, message([block])))
    expect(result.choices[0]).toMatchObject({ choice: 'transcript', source: SOURCE })
    expect(result.messages[0]?.blocks[0]).toMatchObject({ kind: 'file', ref: long })
    expect(result.deferred).toEqual([long])
  })

  it('words on a block nobody converted stand in too: the inline text is the block own', () => {
    const block = medium('b2', 'image/png', { transcript: 'a red circle' })
    const result = chosen(choose(TEXT, message([block])))
    expect(result.choices[0]).toMatchObject({ choice: 'transcript', source: null })
  })

  it.each([
    ['nothing else', {}],
    ['empty inline words', { transcript: '' }],
    ['a medium that cannot be converted', INCONVERTIBLE],
    ['only representations the model does not take', converted([refTo('k-s', 'audio/mp3')])],
  ])(
    'a block with %s that the model does not take leaves the request unavailable and is named, not skipped',
    (_, extra) => {
      const first = message([words('b1')], 1)
      const second = message([words('b1'), medium('b2', 'image/png', extra), words('b3')], 2)
      expect(choose(TEXT, first, second)).toEqual({
        kind: 'unavailable',
        reason: 'modality',
        message: second.id,
        block: 'b2',
      })
    },
  )

  it('a file of no modality is judged by its media type, never by a modality', () => {
    const zip = medium('b1', 'application/zip')
    expect(choose(VISION, message([zip])).kind).toBe('unavailable')
    expect(choose(READS_PDF, message([zip])).kind).toBe('unavailable')
    const pdf = medium('b1', 'application/pdf')
    expect(choose(VISION, message([pdf])).kind).toBe('unavailable')
    expect(chosen(choose(READS_PDF, message([pdf]))).choices[0]?.choice).toBe('original')
  })

  it('a reference in a tool message goes through the same table', () => {
    const result = { kind: 'tool_result', id: 'marker', visibility, callId: 'c' }
    const tool = message([result, medium('shot', 'image/png')], 3, 'tool')
    const seen = chosen(choose(VISION, tool))
    expect(seen.choices.at(-1)).toMatchObject({ block: 'shot', choice: 'original' })
    expect(seen.messages).toEqual([tool])
    expect(choose(TEXT, tool)).toMatchObject({ kind: 'unavailable', block: 'shot' })
  })

  it('a block of inline bytes has only its original', () => {
    const inline = { kind: 'image', id: 'b1', visibility, mediaType: 'image/png', inline: 'AAAA' }
    const result = chosen(choose(VISION, message([inline])))
    expect(result.choices[0]).toMatchObject({ choice: 'original' })
    expect(result.deferred).toEqual([])
    expect(choose(TEXT, message([inline])).kind).toBe('unavailable')
  })

  it('the order of the three is the configuration of the policy', () => {
    const wordsFirst = createScriptedRepresentationPolicy({
      preferences: {
        ...FIXTURE_REPRESENTATION_CONFIG.preferences,
        image: ['transcript', 'original'],
      },
    })
    const history = message([medium('b1', 'image/png', { transcript: 'a red circle' })])
    const result = chooseRepresentations({
      messages: [history],
      capability: VISION,
      policy: wordsFirst,
    })
    expect(chosen(result).choices[0]?.choice).toBe('transcript')
  })
})

describe('what a chosen request records and asks of its model', () => {
  const SOURCE_OF_REQUIREMENT = {
    owner: 'request-context-contract',
    record: 'representation',
    revision: '1',
    digest: policy.identity.digest,
  }

  it('asks for words when words stand in for a medium, inline or kept in a reference', () => {
    const inline = medium('b1', 'image/png', { transcript: 'a red circle' })
    expect(chosen(choose(TEXT, message([inline]))).modality).toEqual({
      modalities: ['text'],
      source: SOURCE_OF_REQUIREMENT,
    })
    const kept = medium('b1', 'application/pdf', converted([], refTo('k-long', 'text/plain')))
    expect(chosen(choose(TEXT, message([kept]))).modality?.modalities).toEqual(['text'])
  })

  it('asks for the file type of an original of no modality, on top of words', () => {
    const result = chosen(choose(READS_PDF, message([medium('b1', 'application/pdf')])))
    expect(result.modality).toEqual({
      modalities: ['text'],
      fileTypes: ['application/pdf'],
      source: SOURCE_OF_REQUIREMENT,
    })
    expect(
      Object.hasOwn(chosen(choose(TEXT, message([words('b1')]))).modality ?? {}, 'fileTypes'),
    ).toBe(false)
  })

  it('asks nothing when no part of the history is a content block', () => {
    const marker = { kind: 'tool_result', id: 'marker', visibility, callId: 'c' }
    const result = chosen(choose(TEXT, message([marker], 4, 'tool')))
    expect([result.modality, result.choices, result.deferred]).toEqual([null, [], []])
  })

  it('a tool message asks for what its blocks need and defers their references', () => {
    const marker = { kind: 'tool_result', id: 'marker', visibility, callId: 'c' }
    const shot = medium('shot', 'image/png')
    const result = chosen(choose(VISION, message([marker, shot], 5, 'tool')))
    expect(result.deferred).toEqual([shot.ref])
    expect(result.modality?.modalities).toEqual(['image'])
  })

  it('records the media type of the block the choice was made for, and none for words', () => {
    const inline = { kind: 'image', id: 'b2', visibility, mediaType: 'image/png', inline: 'AAAA' }
    const result = chosen(choose(VISION, message([words('b1'), inline])))
    expect(result.choices.map(choice => choice.mediaType)).toEqual([null, 'image/png'])
  })

  it('thinking is words: sent as it is, and asked of no model', () => {
    const thinking = { kind: 'thinking', id: 'b1', visibility, text: 'hm' }
    const history = message([thinking, words('b2')], 6, 'assistant')
    const result = chosen(choose(TEXT, history))
    expect(result.choices.map(choice => choice.choice)).toEqual(['original', 'original'])
    expect(nativeRequirement([history]).blocks).toEqual([])
  })

  it('a media type that is none is a file type of its own text: no model takes it unless it lists it', () => {
    const odd = medium('b1', 'not a media type')
    expect(choose(VISION, message([odd])).kind).toBe('unavailable')
    expect(nativeRequirement([message([odd])]).fileTypes).toEqual(['not a media type'])
  })
})

describe('what a history needs of a model natively', () => {
  it('a block of inline bytes has nothing else: it asks for its modality', () => {
    const inline = { kind: 'image', id: 'b1', visibility, mediaType: 'image/png', inline: 'AAAA' }
    expect(nativeRequirement([message([inline])])).toMatchObject({
      modalities: ['image'],
      blocks: [{ block: 'b1', needs: { modality: 'image' } }],
    })
  })

  it('names the modality or the file type of each block that has no other representation and no words', () => {
    const history = [
      message([words('b1'), medium('b2', 'image/png')], 1),
      message([medium('b3', 'application/pdf'), medium('b4', 'audio/wav', INCONVERTIBLE)], 2),
      message([medium('b5', 'image/webp')], 3),
    ]
    expect(nativeRequirement(history)).toEqual({
      modalities: ['image', 'voice'],
      fileTypes: ['application/pdf'],
      blocks: [
        { message: history[0]?.id, block: 'b2', needs: { modality: 'image' } },
        { message: history[1]?.id, block: 'b3', needs: { fileType: 'application/pdf' } },
        { message: history[1]?.id, block: 'b4', needs: { modality: 'voice' } },
        { message: history[2]?.id, block: 'b5', needs: { modality: 'image' } },
      ],
    })
  })

  it.each([
    ['inline words', { transcript: 'a red circle' }],
    ['words in a content reference', converted([], refTo('k-long', 'text/plain'))],
    ['another representation', converted([refTo('k-p', 'image/png')])],
  ])('asks nothing for a block that has %s', (_, extra) => {
    const history = [message([words('b1'), medium('b2', 'application/pdf', extra)])]
    expect(nativeRequirement(history)).toEqual({ modalities: [], fileTypes: [], blocks: [] })
  })

  it('asks nothing for words, and nothing for a block the model does not read', () => {
    const hidden = { ...medium('b2', 'image/png'), visibility: { toHuman: true, toModel: false } }
    expect(nativeRequirement([message([words('b1'), hidden])]).blocks).toEqual([])
  })

  it('the blocks a model does not cover are the ones to name', () => {
    const history = [message([medium('b1', 'image/png'), medium('b2', 'application/pdf')])]
    const requirement = nativeRequirement(history)
    const names = (capability: NativeCapability) =>
      unmetBy(requirement, capability).map(position => position.block)
    expect(names(TEXT)).toEqual(['b1', 'b2'])
    expect(names(VISION)).toEqual(['b2'])
    expect(names(READS_PDF)).toEqual(['b1'])
    expect(names({ input: ['text', 'image'], fileTypes: ['application/pdf'] })).toEqual([])
  })
})

/** A seeded generator: the same seed gives the same history and the same capability. */
function generator(seed: number) {
  let state = seed * 2654435761 + 1
  const int = (below: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % below
  }
  const pick = <T>(items: readonly T[]): T => items[int(items.length)] as T
  const TYPES = ['image/png', 'audio/wav', 'application/pdf', 'application/zip', 'text/csv']
  const block = (id: string): unknown => {
    if (int(4) === 0) return words(id)
    const others = [
      [],
      [refTo(`o-${id}`, pick(TYPES))],
      [refTo(`o1-${id}`, pick(TYPES)), refTo(`o2-${id}`, pick(TYPES))],
    ]
    const snapshot = pick([
      {},
      INCONVERTIBLE,
      converted(pick(others), pick([null, refTo(`t-${id}`, 'text/plain')])),
    ])
    return medium(id, pick(TYPES), { transcript: pick([null, '', 'said']), ...snapshot })
  }
  const history = Array.from({ length: 1 + int(3) }, (_, n) =>
    message(
      Array.from({ length: 1 + int(4) }, (__, at) => block(`b${String(n)}-${String(at)}`)),
      n,
    ),
  )
  const capability: NativeCapability = {
    input: ['text', ...(['image', 'voice'] as const).filter(() => int(2) === 0)],
    ...(int(2) === 0
      ? {}
      : { fileTypes: pick([['application/pdf'], ['application/zip', 'application/pdf']]) }),
  }
  return { history, capability }
}

type Block = Message['blocks'][number]
/** The table of T5, written down a second time and only for this test. */
function expected(block: Block, capability: NativeCapability): string {
  if (block.kind === 'text') return 'original'
  const referring = block as unknown as {
    ref: { mediaType: string }
    transcript: string | null
    snapshot?: { outcome: string; text?: unknown; others?: { mediaType: string }[] }
  }
  const takes = (mediaType: string): boolean => {
    const top = mediaType.split('/')[0]
    if (top === 'image' || top === 'text') return capability.input.includes(top)
    if (top === 'audio') return capability.input.includes('voice')
    return (capability.fileTypes ?? []).includes(mediaType)
  }
  if (takes(referring.ref.mediaType)) return 'original'
  if ((referring.snapshot?.others ?? []).some(other => takes(other.mediaType))) return 'derived'
  const worded = (referring.transcript ?? '') !== '' || (referring.snapshot?.text ?? null) !== null
  return worded ? 'transcript' : 'none'
}

type Chooser = typeof chooseRepresentations
function counterexample(chooser: Chooser, runs: number): string | null {
  for (let seed = 1; seed <= runs; seed += 1) {
    const { history, capability } = generator(seed)
    const run = () =>
      chooser({ messages: structuredClone(history) as Message[], capability, policy })
    const [first, second] = [run(), run()]
    if (JSON.stringify(first) !== JSON.stringify(second))
      return `seed ${String(seed)}: the same history and capability chose differently`
    const table = history.flatMap(each => each.blocks.map(block => expected(block, capability)))
    const stop = table.indexOf('none')
    if (first.kind === 'unavailable') {
      const all = history.flatMap(each => each.blocks.map(block => block.id))
      if (stop < 0 || all[stop] !== first.block)
        return `seed ${String(seed)}: named ${first.block}, the table stops at ${String(all[stop])}`
      continue
    }
    const made = first.choices.map(choice => choice.choice)
    if (stop >= 0 || JSON.stringify(made) !== JSON.stringify(table))
      return `seed ${String(seed)}: chose ${made.join(',')}, the table says ${table.join(',')}`
  }
  return null
}

describe('CX-48: the choice is a function of the history and the capability', () => {
  it('holds on generated histories, and each choice is the row of the table', () => {
    expect(counterexample(chooseRepresentations, 400)).toBeNull()
  })

  it('finds a counterexample when the choice depends on whether something else is there', () => {
    let there = false
    const depending: Chooser = input => {
      there = !there
      return chooseRepresentations(there ? input : { ...input, capability: { input: ['text'] } })
    }
    expect(counterexample(depending, 400)).toMatch(/chose differently/u)
  })

  it('finds a counterexample when a block that cannot be sent is skipped', () => {
    const skipping: Chooser = input => {
      const result = chooseRepresentations(input)
      return result.kind === 'unavailable'
        ? { kind: 'chosen', choices: [], messages: [], modality: null, deferred: [] }
        : result
    }
    expect(counterexample(skipping, 400)).toMatch(/the table says/u)
  })
})

describe('an assembly whose history holds a block the model cannot take', () => {
  it('is unavailable, names the block, and says the reason is the modality', async () => {
    const f = fixture()
    const pictured = message([words('b1'), medium('b2', 'image/png')], 7)
    const history = {
      ...f.ports.history,
      read: async () => ({
        kind: 'page' as const,
        page: { rows: [rowWith(0, pictured)], next: null },
      }),
    }
    const result = await assemble(f.input, { ...f.ports, history }, f.policies)
    expect(result).toEqual({
      kind: 'unavailable',
      owner: 'representation',
      block: { message: pictured.id, block: 'b2' },
      diagnostic: `modality: the model takes no representation of block b2 of message ${pictured.id}`,
    })
  })
})
