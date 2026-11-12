// The edges of the Ask command: how long a card text and a whole request may be, which shapes the
// codec refuses and what it names, which state and replies the resume segment refuses, and what the
// declared schemas close. The cases that `ask.spec.ts` shows by example are not repeated here.
import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import type { ToolDecision } from '@omne-harness/tool-contract'
import {
  askCommands,
  askExecutor,
  askToolModule,
  askWaitContract,
  type AskArguments,
  type AskCommand,
} from '@omne-harness/tool-definitions'
import { askStateSchema } from '../src/ask-protocol.ts'

const context = {
  signal: new AbortController().signal,
  emit: () => Promise.reject(new Error('Ask initial emits nothing.')),
}
const entry = (command: AskCommand) => {
  const found = askCommands.find(item => item.name === command)
  if (found === undefined) throw new Error(`Missing command ${command}`)
  return found
}
const parseText = (command: AskCommand, text: string) =>
  entry(command).codec.parse({ original: text, effective: text, complete: true })
const parse = (command: AskCommand, args: unknown) => parseText(command, JSON.stringify(args))
const reasonOf = (command: AskCommand, args: unknown) => {
  const answer = parse(command, args)
  return 'failure' in answer ? answer.failure.reason : 'accepted'
}

const option = (over: Record<string, unknown> = {}) => ({ label: 'A', description: 'D', ...over })
const question = (over: Record<string, unknown> = {}) => ({
  title: 'T',
  description: 'D',
  options: [option(), option({ label: 'B' })],
  ...over,
})
const ask = (...questions: unknown[]) => ({ questions })
const approval = {
  action: 'Delete it',
  reason: 'r',
  impact: 'i',
  reversibility: 'v',
  fallback: 'f',
}

describe('the limits on the text of a card', () => {
  // A code point outside the BMP takes two UTF-16 units, so these also show that the length is
  // counted in code points, as HITL counts it.
  const wide = (count: number) => '😀'.repeat(count)

  it('takes a title, a description, a label and an approval field of exactly the longest size, and no longer', () => {
    // The long texts go over as one-unit characters, so that the codec's own budget on a string
    // does not refuse them first.
    const cases: [string, (text: string) => unknown, number][] = [
      ['questions[0].title', text => ask(question({ title: text })), 256],
      ['questions[0].description', text => ask(question({ description: text })), 4096],
      [
        'questions[0].options[0].label',
        text => ask(question({ options: [option({ label: text }), option({ label: 'B' })] })),
        256,
      ],
      [
        'questions[0].options[0].description',
        text => ask(question({ options: [option({ description: text }), option({ label: 'B' })] })),
        4096,
      ],
    ]
    for (const [at, build, max] of cases) {
      expect(reasonOf('ask', build(wide(max)))).toBe('accepted')
      expect(reasonOf('ask', build('x'.repeat(max + 1)))).toBe(`invalid-field:${at}`)
    }
    expect(reasonOf('request_approval', { ...approval, action: wide(256) })).toBe('accepted')
    expect(reasonOf('request_approval', { ...approval, action: 'x'.repeat(257) })).toBe(
      'invalid-field:action',
    )
    expect(reasonOf('request_approval', { ...approval, reason: wide(1000) })).toBe('accepted')
    expect(reasonOf('request_approval', { ...approval, reason: 'x'.repeat(1001) })).toBe(
      'invalid-field:reason',
    )
  })

  it('refuses a text that is blank or holds half of a surrogate pair, naming the field', () => {
    for (const text of ['', '   ', '\n\t', 'lone \ud800 half'])
      for (const [at, args] of [
        ['questions[0].title', ask(question({ title: text }))],
        ['questions[0].description', ask(question({ description: text }))],
        [
          'questions[0].options[0].label',
          ask(question({ options: [option({ label: text }), option({ label: 'B' })] })),
        ],
        [
          'questions[0].options[0].description',
          ask(question({ options: [option({ description: text }), option({ label: 'B' })] })),
        ],
        [
          'questions[0].options[0].diagram',
          ask(question({ options: [option({ diagram: text }), option({ label: 'B' })] })),
        ],
      ] as const)
        expect(reasonOf('ask', args)).toBe(`invalid-field:${at}`)
  })

  it('counts the diagram with the description: together they are at most 4096 code points', () => {
    const together = (diagram: number, description: number) =>
      reasonOf(
        'ask',
        ask(
          question({
            options: [
              option({ description: 'd'.repeat(description), diagram: 'g'.repeat(diagram) }),
              option({ label: 'B' }),
            ],
          }),
        ),
      )
    // The two are joined by a blank line, which takes two more.
    expect(together(2000, 2094)).toBe('accepted')
    expect(together(2000, 2095)).toBe('invalid-field:questions[0].options[0].diagram')
    expect(together(4096, 1)).toBe('invalid-field:questions[0].options[0].diagram')
  })

  it('refuses two options of one question with the same label, and says which', () => {
    expect(
      reasonOf('ask', ask(question({ options: [option(), option({ description: 'other' })] }))),
    ).toBe('invalid-field:questions[0].options[1].label')
    expect(
      reasonOf('ask', ask(question(), question({ options: [option(), option({ label: 'B' })] }))),
    ).toBe('accepted')
  })

  it('refuses a batch of no question, of eight, and a question with one option or five', () => {
    expect(reasonOf('ask', ask())).toBe('invalid-field:questions')
    expect(reasonOf('ask', ask(...Array.from({ length: 8 }, () => question())))).toBe(
      'invalid-field:questions',
    )
    expect(reasonOf('ask', ask(...Array.from({ length: 7 }, () => question())))).toBe('accepted')
    const labelled = (count: number) =>
      Array.from({ length: count }, (_, at) => option({ label: `L${at}` }))
    expect(reasonOf('ask', ask(question({ options: labelled(1) })))).toBe(
      'invalid-field:questions[0].options',
    )
    expect(reasonOf('ask', ask(question({ options: labelled(5) })))).toBe(
      'invalid-field:questions[0].options',
    )
    expect(reasonOf('ask', ask(question({ options: labelled(4) })))).toBe('accepted')
  })
})

describe('the size of a whole request', () => {
  const MAX = 196_608
  const FIELDS = 7 * 5
  // Seven questions of four options, every description at its longest. The first `wide` characters
  // over all of them are two-byte ones and the rest are one-byte ones, which tunes the size of the
  // request one byte at a time.
  const batch = (wide: number): AskArguments => {
    let left = wide
    const text = () => {
      const count = Math.min(4096, left)
      left -= count
      return 'é'.repeat(count) + 'e'.repeat(4096 - count)
    }
    return {
      command: 'ask',
      questions: Array.from({ length: 7 }, (_, at) => ({
        title: `T${at}`,
        description: text(),
        options: Array.from({ length: 4 }, (_, index) => ({
          label: `L${index}`,
          description: text(),
        })),
      })),
    }
  }
  const sizeOf = async (wide: number) => {
    const segment = await askExecutor.initial(batch(wide), null, context)
    if ('failure' in segment) {
      expect(segment.failure).toEqual({ kind: 'invalid', reason: 'request-too-large' })
      return null
    }
    if (segment.ok.kind !== 'suspended') throw new Error('must suspend')
    return new TextEncoder().encode(writeJsonText(segment.ok.wait.request)).byteLength
  }

  it('takes a request of exactly the declared bytes and refuses one byte more', async () => {
    expect(await sizeOf(0)).not.toBeNull()
    expect(await sizeOf(FIELDS * 4096)).toBeNull()
    // `taken` stays a size that passes and `refused` one that does not, until they are adjacent.
    let taken = 0
    let refused = FIELDS * 4096
    while (refused - taken > 1) {
      const middle = Math.floor((taken + refused) / 2)
      if ((await sizeOf(middle)) === null) refused = middle
      else taken = middle
    }
    expect(await sizeOf(taken)).toBe(MAX)
    expect(await sizeOf(refused)).toBeNull()
  })
})

describe('the shapes the Ask codec refuses', () => {
  it('names the field of a value that is no object, at the top and in a question and an option', () => {
    expect(reasonOf('ask', null)).toBe('invalid-field:params')
    expect(reasonOf('ask', [])).toBe('invalid-field:params')
    expect(reasonOf('request_approval', 'text')).toBe('invalid-field:params')
    expect(reasonOf('ask', { questions: [null] })).toBe('invalid-field:questions[0]')
    expect(reasonOf('ask', { questions: [[]] })).toBe('invalid-field:questions[0]')
    expect(reasonOf('ask', { questions: [{ ...question(), options: [null, option()] }] })).toBe(
      'invalid-field:questions[0].options[0]',
    )
  })

  it('names the field of an unknown member, a missing one and one of the wrong type, at each level', () => {
    expect(reasonOf('ask', { questions: [question()], extra: 1 })).toBe('invalid-field:extra')
    expect(reasonOf('ask', ask({ ...question(), extra: 1 }))).toBe(
      'invalid-field:questions[0].extra',
    )
    expect(
      reasonOf('ask', ask(question({ options: [option({ extra: 1 }), option({ label: 'B' })] }))),
    ).toBe('invalid-field:questions[0].options[0].extra')
    expect(reasonOf('ask', {})).toBe('invalid-field:questions')
    expect(reasonOf('ask', { questions: 'text' })).toBe('invalid-field:questions')
    expect(reasonOf('ask', ask({ description: 'D', options: [] }))).toBe(
      'invalid-field:questions[0].title',
    )
    expect(reasonOf('ask', ask(question({ title: 5 })))).toBe('invalid-field:questions[0].title')
    expect(reasonOf('ask', ask(question({ options: 'text' })))).toBe(
      'invalid-field:questions[0].options',
    )
    expect(
      reasonOf('ask', ask(question({ options: [option({ diagram: 5 }), option({ label: 'B' })] }))),
    ).toBe('invalid-field:questions[0].options[0].diagram')
    expect(reasonOf('request_approval', { ...approval, fallback: undefined })).toBe(
      'invalid-field:fallback',
    )
    expect(reasonOf('request_approval', { ...approval, impact: 3 })).toBe('invalid-field:impact')
    expect(reasonOf('request_approval', { ...approval, extra: 'x' })).toBe('invalid-field:extra')
  })

  it('answers the failure of the text it cannot read as JSON, without running further', () => {
    for (const text of ['{', '', '{"questions":'])
      expect(parseText('ask', text)).toMatchObject({ failure: { kind: expect.any(String) } })
  })
})

describe('the Ask result and its checkpoint', () => {
  const resume = (state: unknown, response: ToolDecision<unknown>) =>
    askExecutor.resume(
      {
        checkpoint: state instanceof Uint8Array ? state : new TextEncoder().encode(String(state)),
        response,
      },
      null,
      context,
    )
  const unreadable = { failure: { kind: 'invalid', reason: 'ask-state-unreadable' } }
  const good = {
    command: 'ask',
    questions: [{ cardId: 'q1', title: 'T', options: [{ id: 'o1', label: 'A' }] }],
  }

  it('reads no checkpoint that is not a state of the Ask: null, a list, a text, no command or no questions', async () => {
    for (const text of [
      'null',
      '[]',
      '"text"',
      '5',
      JSON.stringify({ questions: good.questions }),
      JSON.stringify({ command: 'ask' }),
      JSON.stringify({ command: 'other', questions: good.questions }),
      JSON.stringify({ command: 'ask', questions: 'text' }),
    ])
      expect(await resume(text, { kind: 'declined' })).toEqual(unreadable)
    expect(await resume(JSON.stringify(good), { kind: 'declined' })).toMatchObject({ ok: {} })
  })

  it('reads no checkpoint whose question has no text id, no text title or no option list', async () => {
    const withQuestion = (over: Record<string, unknown>) =>
      JSON.stringify({ ...good, questions: [{ ...good.questions[0], ...over }] })
    for (const over of [{ cardId: 5 }, { title: 5 }, { options: 'text' }, { cardId: undefined }])
      expect(await resume(withQuestion(over), { kind: 'declined' })).toEqual(unreadable)
    expect(
      await resume(JSON.stringify({ ...good, questions: [null] }), { kind: 'declined' }),
    ).toEqual(unreadable)
  })

  it('reads no checkpoint that is not well-formed UTF-8, even when it would parse with a replacement character', async () => {
    const head = new TextEncoder().encode('{"command":"ask","questions":[{"cardId":"q1","title":"')
    const tail = new TextEncoder().encode('","options":[]}]}')
    const bytes = new Uint8Array([...head, 0xff, ...tail])
    expect(await resume(bytes, { kind: 'declined' })).toEqual(unreadable)
  })

  it('refuses a reply to an approval that is neither of its two options', async () => {
    const state = JSON.stringify({
      command: 'request_approval',
      questions: [
        {
          cardId: 'approval',
          title: 'Delete it',
          options: [
            { id: 'approve', label: 'yes' },
            { id: 'reject', label: 'no' },
          ],
        },
      ],
    })
    const reply = (optionId: string): ToolDecision<unknown> => ({
      kind: 'answer',
      value: { answers: [{ cardId: 'approval', kind: 'selection', optionId }] },
    })
    expect(await resume(state, reply('approve'))).toEqual({
      ok: { kind: 'completed', value: 'Approved: Delete it' },
    })
    expect(await resume(state, reply('reject'))).toEqual({
      ok: { kind: 'completed', value: 'Not approved: Delete it' },
    })
    expect(await resume(state, reply('maybe'))).toEqual({
      failure: { kind: 'invalid', reason: 'ask-response-mismatch' },
    })
  })
})

describe('what the declared schemas close', () => {
  const provider = createSchemaProvider({
    maxSnapshots: 8,
    maxConstructDepth: 16,
    maxConstructNodes: 512,
    failureBackoffMs: 0,
    maxAttempts: 1,
  })
  const limits = {
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 1024,
    maxMembers: 16,
    maxStringLength: 8192,
    maxNumberLength: 32,
  }
  const check = (ref: Parameters<typeof validate>[1], value: unknown) =>
    validate(provider, ref, readJsonText(JSON.stringify(value), limits))

  /** Every object schema of the document, with the path it sits at. */
  function objectSchemas(node: unknown, at = ''): [string, Record<string, unknown>][] {
    if (typeof node !== 'object' || node === null) return []
    const record = node as Record<string, unknown>
    const own: [string, Record<string, unknown>][] =
      record['type'] === 'object' ? [[at, record]] : []
    return [
      ...own,
      ...Object.entries(record).flatMap(([key, value]) => objectSchemas(value, `${at}/${key}`)),
    ]
  }

  it('closes every object of the parameters that the model sees, so no member is silently dropped', () => {
    for (const command of askCommands) {
      const document: unknown = JSON.parse(writeJsonText(command.parameters.schema))
      const objects = objectSchemas(document)
      expect(objects.length).toBeGreaterThanOrEqual(1)
      for (const [at, schema] of objects)
        expect([command.name, at, schema['additionalProperties']]).toEqual([
          command.name,
          at,
          false,
        ])
    }
  })

  it('refuses an extra member in a reply, in one of its answers, and in a state', async () => {
    const answer = { cardId: 'q1', kind: 'selection', optionId: 'o1' }
    const state = { command: 'ask', questions: [{ cardId: 'q1', title: 'T', options: [] }] }
    expect((await check(askWaitContract.response.ref, { answers: [answer] })).kind).toBe('valid')
    expect((await check(askWaitContract.response.ref, { answers: [answer], x: 1 })).kind).toBe(
      'invalid',
    )
    expect(
      (await check(askWaitContract.response.ref, { answers: [{ ...answer, x: 1 }] })).kind,
    ).toBe('invalid')
    const goodState = {
      command: 'ask',
      questions: [
        {
          cardId: 'q1',
          title: 'T',
          options: [
            { id: 'o1', label: 'A' },
            { id: 'o2', label: 'B' },
          ],
        },
      ],
    }
    expect((await check(askStateSchema.ref, goodState)).kind).toBe('valid')
    expect((await check(askStateSchema.ref, { ...goodState, x: 1 })).kind).toBe('invalid')
    expect(
      (
        await check(askStateSchema.ref, {
          ...goodState,
          questions: [{ ...goodState.questions[0], x: 1 }],
        })
      ).kind,
    ).toBe('invalid')
    expect(
      (
        await check(askStateSchema.ref, {
          ...goodState,
          questions: [
            {
              ...goodState.questions[0],
              options: [
                { id: 'o1', label: 'A', x: 1 },
                { id: 'o2', label: 'B' },
              ],
            },
          ],
        })
      ).kind,
    ).toBe('invalid')
    expect(state.questions[0]?.options).toEqual([])
  })
})

describe('the Ask tool as the host binds it', () => {
  const json = (value: unknown) => {
    const read = readJsonText(JSON.stringify(value), {
      maxBytes: 1024,
      maxDepth: 4,
      maxItems: 16,
      maxMembers: 16,
      maxStringLength: 64,
      maxNumberLength: 32,
    })
    if (read.kind !== 'ok') throw new Error('fixture construction')
    return read.value
  }
  const built = () => {
    const author = askToolModule.createAuthor(json({ resultMaxBytes: 64 }))
    if ('failure' in author) throw new Error(JSON.stringify(author.failure))
    const registration = readToolRegistration(author.ok)
    if (registration?.kind !== 'commands') throw new Error('Ask must be a command tool')
    const slot = new Map(registration.operations).get('ask')
    if (slot === undefined) throw new Error('no ask command')
    return { facts: author.ok.facts, slot }
  }

  it('is no background tool', () => {
    expect(built().facts.backgroundAllowed).toBe(false)
  })

  it('keeps its result as UTF-8 text: a text is encoded, anything else refused, and bytes that are no text refused', () => {
    const author = built().slot.author
    if (author.kind !== 'ordinary') throw new Error('Ask returns ordinary text')
    const { codec, renderer } = author
    expect(codec.encode('né')).toEqual({ ok: new TextEncoder().encode('né') })
    expect(codec.encode(5)).toEqual({ failure: { reason: 'text-required' } })
    expect(codec.decode(new TextEncoder().encode('né'))).toEqual({ ok: 'né' })
    expect(codec.decode(new Uint8Array([0xff]))).toEqual({ failure: { reason: 'invalid-utf8' } })
    expect(renderer.render('shown')).toEqual({ ok: 'shown' })
  })

  it('refuses a result that is no text, and counts the limit in bytes', () => {
    const { output } = built().slot.author
    expect(output.check({ arguments: null, value: 5 })).toMatchObject({ failure: {} })
    expect(output.check({ arguments: null, value: 'é'.repeat(32) })).toEqual({
      ok: 'é'.repeat(32),
    })
    expect(output.check({ arguments: null, value: 'é'.repeat(33) })).toMatchObject({ failure: {} })
  })
})
