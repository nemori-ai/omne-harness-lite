import { afterEach, describe, expect, it } from 'vitest'
import type {
  IntakeProcessor,
  IntakeVerdict,
  RoutedInput,
  SessionCommand,
  SessionFailure,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import {
  harness,
  UNSCREENED_SOURCE,
  type Harness,
  type HarnessOptions,
} from './fixtures/harness.ts'

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
type Message = Ordinary['message']
type Seen = Parameters<IntakeProcessor<string>['run']>[0]

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})
async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, ...options })
  open.push(h)
  await h.create()
  return h
}
function failureOf(answer: unknown): SessionFailure {
  expect(answer, JSON.stringify(answer)).toHaveProperty('failure')
  return (answer as { failure: SessionFailure }).failure
}

const visibility = { toHuman: true, toModel: true }
const text = (id: string, value: string) => ({ kind: 'text', id, visibility, text: value })
const image = (id: string, extra: Record<string, unknown> = {}) => ({
  kind: 'image',
  id,
  visibility,
  ref: { storage: 'local', key: 'k1', mediaType: 'image/png', bytes: '11', digest: 'sha256:k1' },
  transcript: null,
  ...extra,
})
const inline = (id: string) => ({
  kind: 'image',
  id,
  visibility,
  mediaType: 'image/png',
  inline: 'AAAA',
})
const FACTS = { kind: 'image', widthPixels: 4, heightPixels: 3 }
function withBlocks(input: string, ...blocks: unknown[]): Ordinary {
  const plain = ordinaryInput(input)
  return { ...plain, message: { ...plain.message, blocks } as unknown as Message }
}
const pictured = (input: string, extra: Record<string, unknown> = {}): Ordinary =>
  withBlocks(input, text('b1', 'look at this'), image('b2', extra))

/** The accepts below prove these fixtures are messages: the writer judges each one it commits. */
/** A processor that measures every reference block, and records what it was given. */
function measuring(seen: Seen[] = [], name = 'media.references'): IntakeProcessor<string> {
  return {
    name,
    run: async input => {
      seen.push(input)
      const blocks = input.effective.blocks.map(block =>
        'ref' in block ? { ...block, facts: FACTS } : block,
      )
      return { kind: 'pass', effective: { ...input.effective, blocks } as unknown as Message }
    },
  }
}
const answering = (verdict: IntakeVerdict, name = 'media.references'): IntakeProcessor<string> => ({
  name,
  run: async () => verdict,
})

const accept = (h: Harness, value: Ordinary, operation = `accept-${value.input}`) =>
  h.faces('intake').work.accept({ ...h.access(), operation: operationId(operation), value })

/** The commands this harness committed, in order. */
function commits(h: Harness): SessionCommand[] {
  const committed: SessionCommand[] = []
  h.view.onCommit((input, next) => {
    committed.push(input.command)
    return next()
  })
  return committed
}
const acceptedMessage = (command: SessionCommand | undefined): unknown =>
  command?.kind === 'accept' && command.input.value.kind === 'ordinary'
    ? command.input.value.message
    : null
const revisionOf = async (h: Harness) =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read').revision

describe('the processors before intake, in the pipeline of an accept', () => {
  it('run after the state was read and before the commit, and what is committed is the effective content', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)] })
    const committed = commits(h)
    h.view.reset()
    const brought = pictured('pic')
    succeeded(await accept(h, brought), 'accept')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      original: brought.message,
      effective: brought.message,
      source: brought.source,
      request: { input: brought.input, operation: operationId('accept-pic') },
      access: h.access(),
    })
    expect(acceptedMessage(committed[0])).toEqual(pictured('pic', { facts: FACTS }).message)
    expect(h.view.calls().map(call => call.method)).toEqual([
      'queryOperation',
      'readWork',
      'commit',
    ])
  })

  it('a session whose state refuses the input answers so without running a processor', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)] })
    succeeded(
      await h.faces('intake').work.control({
        ...h.access(),
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      }),
      'archive',
    )
    expect(failureOf(await accept(h, pictured('pic'))).kind).toBe('archived')
    expect(seen).toEqual([])
  })

  it('a block refuses the input and names the block and the processor; nothing is committed', async () => {
    const h = await service({
      admission: [
        answering({ kind: 'block', block: 'b2' as never, reason: 'the reference is not valid' }),
      ],
    })
    const before = await revisionOf(h)
    expect(failureOf(await accept(h, pictured('pic')))).toEqual({
      kind: 'invalid',
      field: 'value.message.blocks[1]',
      reason: 'media.references: the reference is not valid',
    })
    h.setAdmission([answering({ kind: 'block', block: 'b1' as never, reason: 'no such words' })])
    expect(failureOf(await accept(h, pictured('pic')))).toMatchObject({
      field: 'value.message.blocks[0]',
    })
    h.setAdmission([answering({ kind: 'block', reason: 'not now' }, 'audit.words')])
    expect(failureOf(await accept(h, pictured('pic')))).toEqual({
      kind: 'invalid',
      field: 'value.message',
      reason: 'audit.words: not now',
    })
    expect(await revisionOf(h)).toBe(before)
  })

  it.each<[string, IntakeVerdict]>([
    ['is unavailable', { kind: 'unavailable', diagnostic: 'the index is off' }],
    ['rewrites the words', { kind: 'pass', effective: withBlocks('pic', text('b1', 'x')).message }],
  ])(
    'a processor that %s leaves the input unaccepted: unavailable, not a pass',
    async (_, verdict) => {
      const h = await service({ admission: [answering(verdict)] })
      const before = await revisionOf(h)
      expect(failureOf(await accept(h, pictured('pic')))).toMatchObject({
        kind: 'unavailable',
        owner: 'sessionAdmission',
        diagnostic: expect.stringContaining('media.references') as unknown,
      })
      expect(await revisionOf(h)).toBe(before)
    },
  )

  it('words alone pass whatever processors are there; a reference no processor measured is unavailable', async () => {
    const h = await service({ admission: [] })
    succeeded(await accept(h, ordinaryInput('words')), 'words')
    expect(failureOf(await accept(h, pictured('pic')))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
      diagnostic: expect.stringContaining('b2') as unknown,
    })
    h.setAdmission([answering({ kind: 'pass' })])
    succeeded(await accept(h, ordinaryInput('more')), 'more words')
    expect(failureOf(await accept(h, pictured('pic'))).kind).toBe('unavailable')
  })

  it('the facts a sender brought on a reference are not taken: only a processor gives them', async () => {
    const h = await service({ admission: [] })
    const committed = commits(h)
    expect(failureOf(await accept(h, pictured('pic', { facts: FACTS }))).kind).toBe('unavailable')
    const seen: Seen[] = []
    h.setAdmission([measuring(seen)])
    const other = { kind: 'image', widthPixels: 9000, heightPixels: 9000 }
    succeeded(await accept(h, pictured('pic', { facts: other })), 'accept')
    expect(seen[0]?.original).toEqual(pictured('pic').message)
    expect(acceptedMessage(committed.at(-1))).toEqual(pictured('pic', { facts: FACTS }).message)
  })

  it('a block of inline bytes is refused before any processor runs: it is uploaded first', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)] })
    const answer = await accept(h, withBlocks('pic', text('b1', 'see'), inline('b2')))
    expect(failureOf(answer)).toMatchObject({ kind: 'invalid', field: 'value.message.blocks[1]' })
    expect(failureOf(answer)).toHaveProperty('reason', expect.stringContaining('upload'))
    expect(seen).toEqual([])
  })

  it('the list of processors that is not there, or cannot be read, leaves a screened input unaccepted', async () => {
    const h = await service({ admission: null })
    for (const value of [ordinaryInput('words'), pictured('pic')])
      expect(failureOf(await accept(h, value))).toEqual({
        kind: 'unavailable',
        owner: 'sessionAdmission',
        diagnostic: 'the list of processors before intake is absent',
      })
    Object.assign(h.dependencies.admission, {
      current: () => {
        throw new Error('the registry is gone')
      },
    })
    expect(failureOf(await accept(h, ordinaryInput('words')))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
      diagnostic: expect.stringContaining('the registry is gone') as unknown,
    })
  })
})

describe('the source of an input decides whether it is screened', () => {
  it('a source declared unscreened runs no processor: words pass, a reference stays unmeasured', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)], sources: UNSCREENED_SOURCE })
    succeeded(await accept(h, ordinaryInput('words')), 'words')
    expect(failureOf(await accept(h, pictured('pic')))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
    })
    expect(seen).toEqual([])
    h.setAdmission(null)
    succeeded(await accept(h, ordinaryInput('more')), 'no list is needed')
  })

  it('a source that is not registered, or a registry that is not there, is unavailable', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)], sources: { kind: 'absent' } })
    const before = await revisionOf(h)
    const words = ordinaryInput('words')
    expect(failureOf(await accept(h, words))).toEqual({
      kind: 'unavailable',
      owner: 'sessionInputSources',
      diagnostic: `the input source ${words.source} is not registered`,
    })
    h.setSources(null)
    expect(failureOf(await accept(h, words))).toEqual({
      kind: 'unavailable',
      owner: 'sessionInputSources',
      diagnostic: 'the registry of input sources is absent',
    })
    expect([seen, await revisionOf(h)]).toEqual([[], before])
  })

  it('with no processor registered the registry of sources is not asked here: the commit judges the source', async () => {
    const h = await service({ admission: [], sources: null })
    succeeded(await accept(h, ordinaryInput('words')), 'words')
    expect(failureOf(await accept(h, pictured('pic')))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
    })
  })

  it('a source whose name is no source name is unavailable, whatever the registry would say', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)] })
    const nameless = { ...ordinaryInput('words'), source: 'Not A Name' as never }
    expect(failureOf(await accept(h, nameless))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionInputSources',
    })
    expect(seen).toEqual([])
  })
})

describe('the same submission again', () => {
  it('once committed it is recalled with no processor run, with or without the facts in hand', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)] })
    const first = succeeded(await accept(h, pictured('pic')), 'accept')
    h.setAdmission(null)
    for (const again of [pictured('pic'), pictured('pic', { facts: FACTS })])
      expect(succeeded(await accept(h, again), 'again')).toEqual({ ...first, recovered: true })
    expect(seen).toHaveLength(1)
    const other = withBlocks('pic', text('b1', 'something else'), image('b2'))
    expect(failureOf(await accept(h, other)).kind).toBe('conflict')
  })

  it('refused once, it runs the processors again and is accepted when they pass', async () => {
    const h = await service({ admission: [answering({ kind: 'unavailable', diagnostic: 'off' })] })
    expect(failureOf(await accept(h, pictured('pic'))).kind).toBe('unavailable')
    h.setAdmission([measuring()])
    expect(succeeded(await accept(h, pictured('pic')), 'again').recovered).toBe(false)
  })
})

describe('the other ways an ordinary input comes in', () => {
  it('an urgent input is screened the same way, and its effective content is what is committed', async () => {
    const seen: Seen[] = []
    const h = await service({ admission: [measuring(seen)] })
    const committed = commits(h)
    const urgent = pictured('pic')
    const interrupt = (operation: string) =>
      h.faces('intake').management.interrupt({
        ...h.access(),
        operation: operationId(operation),
        run: null,
        urgent,
        decision: evidence('interrupt/decision'),
      })
    succeeded(await interrupt('urgent'), 'interrupt')
    expect(seen[0]?.request).toEqual({ input: urgent.input, operation: operationId('urgent') })
    const command = committed[0]
    expect(command?.kind === 'interrupt' ? command.input.urgent.message : null).toEqual(
      pictured('pic', { facts: FACTS }).message,
    )
    h.setAdmission([answering({ kind: 'block', block: 'b2' as never, reason: 'gone' })])
    expect(failureOf(await interrupt('urgent-2'))).toMatchObject({
      kind: 'invalid',
      field: 'urgent.message.blocks[1]',
    })
  })

  it('the first input of a new session carries words only', async () => {
    const h = await service({ admission: [measuring()] })
    const create = (session: string, initial: Ordinary) =>
      h.faces('intake').management.create({
        ...h.access(session),
        operation: operationId(`create-${session}`),
        creation: creation({ initial }),
      })
    expect(failureOf(await create('session-2', pictured('pic', { facts: FACTS })))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
    })
    expect(failureOf(await create('session-3', withBlocks('pic', inline('b1'))))).toMatchObject({
      kind: 'invalid',
      field: 'creation.initial.message.blocks[0]',
    })
    succeeded(await create('session-4', ordinaryInput('words')), 'create with words')
  })
})

describe('the resolver of a member words', () => {
  const origin = { name: 'skill:review', layer: 'tenant', version: '3', digest: 'sha-1' }
  const resolverOf = (answer: (words: string) => Promise<unknown>, read: string[] = []) => ({
    name: 'test',
    resolve: async ({ original }: { original: Message }) => {
      const words = (original.blocks[0] as unknown as { text: string }).text
      read.push(words)
      return answer(words) as never
    },
  })
  const appendNamed = async () => ({ kind: 'input', effective: null })

  it('appends the named text after the words, and the processors and the log see it', async () => {
    const read: string[] = []
    const resolver = {
      name: 'test',
      resolve: async ({ original }: { original: Message }) => {
        read.push((original.blocks[0] as unknown as { text: string }).text)
        return {
          kind: 'input',
          effective: {
            ...original,
            blocks: [...original.blocks, { ...text('named-1', '先读改动。'), origin }],
          },
        } as never
      },
    }
    const h = await service({ resolver })
    const committed = commits(h)
    succeeded(await accept(h, withBlocks('in-1', text('b1', '用 /review'))), 'accepted')
    expect(read).toEqual(['用 /review'])
    expect(acceptedMessage(committed.at(-1))).toMatchObject({
      blocks: [text('b1', '用 /review'), { ...text('named-1', '先读改动。'), origin }],
    })
  })

  it('refuses what the resolver refuses, commits nothing, and keeps the reason', async () => {
    const h = await service({
      resolver: resolverOf(async () => ({ kind: 'refused', reason: 'no such command: /nope' })),
    })
    const committed = commits(h)
    expect(failureOf(await accept(h, withBlocks('in-2', text('b1', '/nope'))))).toEqual({
      kind: 'invalid',
      field: 'value.message',
      reason: 'no such command: /nope',
    })
    expect(committed).toEqual([])
  })

  it('answers unavailable when the resolver changed the words, threw, or is declared and not there', async () => {
    const changed = await service({
      resolver: resolverOf(async () => ({
        kind: 'input',
        effective: withBlocks('x', text('b1', '改了')).message,
      })),
    })
    expect(failureOf(await accept(changed, withBlocks('in-3', text('b1', '原话'))))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionUtteranceResolver',
    })
    const threw = await service({
      resolver: resolverOf(async () => {
        throw new Error('down')
      }),
    })
    expect(failureOf(await accept(threw, withBlocks('in-4', text('b1', '原话'))))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionUtteranceResolver',
    })
    const absent = await service({ resolver: null })
    expect(failureOf(await accept(absent, withBlocks('in-5', text('b1', '原话'))))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionUtteranceResolver',
    })
    const declared = await service({ resolver: 'none' })
    succeeded(await accept(declared, withBlocks('in-6', text('b1', '原话'))), 'none declared')
  })

  it('hands the resolver what the sender saw and which request this is, and says why it could not tell', async () => {
    const given: unknown[] = []
    const h = await service({
      resolver: {
        name: 'test',
        resolve: async (words: unknown) => {
          given.push(words)
          return { kind: 'unavailable', diagnostic: 'list down' } as never
        },
      },
    })
    const seen = { command: null, references: ['skill:review'] }
    const value = withBlocks('in-10', text('b1', '用 /review'))
    expect(
      failureOf(
        await h
          .faces('intake')
          .work.accept({ ...h.access(), operation: operationId('accept-10'), value, seen }),
      ),
    ).toEqual({ kind: 'unavailable', owner: 'sessionUtteranceResolver', diagnostic: 'list down' })
    expect(given).toMatchObject([
      { seen, request: { input: value.input, operation: operationId('accept-10') } },
    ])
    const threw = await service({
      resolver: resolverOf(async () => {
        throw new Error('down')
      }),
    })
    expect(failureOf(await accept(threw, withBlocks('in-11', text('b1', 'x'))))).toMatchObject({
      diagnostic: 'threw: down',
    })
  })

  it('asks the registry of sources first, and reads no words of the first input of a new session', async () => {
    const read: string[] = []
    const unknown = await service({
      sources: { kind: 'absent' },
      resolver: resolverOf(appendNamed, read),
    })
    expect(failureOf(await accept(unknown, withBlocks('in-12', text('b1', '/x'))))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionInputSources',
    })
    const h = await service({ resolver: resolverOf(appendNamed, read) })
    succeeded(
      await h.faces('intake').management.create({
        ...h.access('session-9'),
        operation: operationId('create-session-9'),
        creation: creation({ initial: withBlocks('first', text('b1', '用 /review')) }),
      }),
      'create',
    )
    expect(read).toEqual([])
  })

  it('an operation is no message: it is handed back as the request, with nothing committed', async () => {
    const h = await service({
      resolver: resolverOf(async () => ({
        kind: 'operation',
        name: 'omne-official:archive',
        operation: 'archive',
        args: '',
      })),
    })
    const committed = commits(h)
    expect(failureOf(await accept(h, withBlocks('in-7', text('b1', '/archive'))))).toEqual({
      kind: 'unsupported',
      request: { name: 'omne-official:archive', operation: 'archive', args: '' },
    })
    expect(committed).toEqual([])
  })

  it('reads no words of a system source, and refuses a sender who brings a named text', async () => {
    const read: string[] = []
    const system = await service({
      sources: UNSCREENED_SOURCE,
      resolver: resolverOf(appendNamed, read),
    })
    succeeded(await accept(system, withBlocks('in-8', text('b1', '用 /review'))), 'system words')
    expect(read).toEqual([])
    const member = await service({ resolver: resolverOf(appendNamed, read) })
    expect(
      failureOf(
        await accept(
          member,
          withBlocks('in-9', text('b1', '用'), { ...text('b2', '冒充'), origin }),
        ),
      ),
    ).toMatchObject({ kind: 'invalid', field: 'value.message' })
    expect(read).toEqual([])
  })
})
