import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  askCommands,
  askExecutor,
  askToolModule,
  askWaitContract,
  type AskArguments,
  type AskCommand,
} from '@omne-harness/tool-definitions'
import type { ToolDecision } from '@omne-harness/tool-contract'

const context = {
  signal: new AbortController().signal,
  emit: () => Promise.reject(new Error('Ask initial emits nothing.')),
}

function parse(command: AskCommand, args: unknown) {
  const entry = askCommands.find(item => item.name === command)
  if (entry === undefined) throw new Error(`Missing command ${command}`)
  const text = JSON.stringify(args)
  return entry.codec.parse({ original: text, effective: text, complete: true })
}
function parsed(command: AskCommand, args: unknown): AskArguments {
  const answer = parse(command, args)
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
async function suspended(args: AskArguments) {
  const segment = await askExecutor.initial(args, null, context)
  if ('failure' in segment) throw new Error(JSON.stringify(segment.failure))
  if (segment.ok.kind !== 'suspended') throw new Error('Ask initial must suspend.')
  return {
    state: JSON.parse(new TextDecoder().decode(segment.ok.state)),
    wait: segment.ok.wait,
    request: JSON.parse(writeJsonText(segment.ok.wait.request)),
  }
}

const twoOptions = [
  { label: '8080 (Recommended)', description: 'The usual one.' },
  { label: '9090', description: 'A spare one.' },
]
const oneQuestion = {
  questions: [
    {
      title: 'Which database?',
      description: 'The service needs one store.',
      options: [
        { label: 'SQLite', description: 'One file, one process.' },
        { label: 'Postgres', description: 'A server.', diagram: 'app -> pg' },
      ],
    },
    {
      title: 'Which port?',
      description: 'The listener needs a port.',
      options: twoOptions,
    },
  ],
}
const options = (count: number) =>
  Array.from({ length: count }, (_, at) => ({ label: `L${at}`, description: 'D' }))
const questions = (count: number) =>
  Array.from({ length: count }, (_, at) => ({
    title: `T${at}`,
    description: 'D',
    options: options(4),
  }))
const approval = {
  action: 'Delete the build directory',
  reason: 'It holds stale output.',
  impact: 'The next build takes longer.',
  reversibility: 'A new build makes it again.',
  fallback: 'I keep the directory and build in place.',
}

describe('ask', () => {
  it('suspends with the whole batch, one question card per question in order', async () => {
    const { request, state, wait } = await suspended(parsed('ask', oneQuestion))
    expect(wait.kind).toBe('ask')
    expect(wait.contract).toBe(askWaitContract)
    expect(request).toEqual({
      questions: [
        {
          cardId: 'q1',
          kind: 'question',
          title: 'Which database?',
          description: 'The service needs one store.',
          options: [
            { id: 'o1', label: 'SQLite', description: 'One file, one process.' },
            { id: 'o2', label: 'Postgres', description: 'A server.\n\napp -> pg' },
          ],
          declineConsequence: '跳过此题，不作答',
        },
        {
          cardId: 'q2',
          kind: 'question',
          title: 'Which port?',
          description: 'The listener needs a port.',
          options: [
            { id: 'o1', label: '8080 (Recommended)', description: 'The usual one.' },
            { id: 'o2', label: '9090', description: 'A spare one.' },
          ],
          declineConsequence: '跳过此题，不作答',
        },
      ],
    })
    expect(state).toEqual({
      command: 'ask',
      questions: [
        {
          cardId: 'q1',
          title: 'Which database?',
          options: [
            { id: 'o1', label: 'SQLite' },
            { id: 'o2', label: 'Postgres' },
          ],
        },
        {
          cardId: 'q2',
          title: 'Which port?',
          options: [
            { id: 'o1', label: '8080 (Recommended)' },
            { id: 'o2', label: '9090' },
          ],
        },
      ],
    })
  })

  it.each([
    ['no questions', { questions: [] }, 'invalid-field:questions'],
    [
      'a question without options',
      { questions: [{ title: 'T', description: 'D', options: [] }] },
      'invalid-field:questions[0].options',
    ],
    [
      'a question with one option',
      { questions: [{ ...oneQuestion.questions[1], options: [twoOptions[0]] }] },
      'invalid-field:questions[0].options',
    ],
    [
      'a question with five options',
      { questions: [{ ...oneQuestion.questions[1], options: options(5) }] },
      'invalid-field:questions[0].options',
    ],
    ['eight questions', { questions: questions(8) }, 'invalid-field:questions'],
    [
      'an empty title',
      { questions: [{ ...oneQuestion.questions[1], title: '' }] },
      'invalid-field:questions[0].title',
    ],
    [
      'a blank description',
      { questions: [{ ...oneQuestion.questions[1], description: ' \n' }] },
      'invalid-field:questions[0].description',
    ],
    [
      'two options with one label',
      {
        questions: [
          {
            title: 'T',
            description: 'D',
            options: [
              { label: 'A', description: 'x' },
              { label: 'A', description: 'y' },
            ],
          },
        ],
      },
      'invalid-field:questions[0].options[1].label',
    ],
    [
      'a title longer than a card allows',
      { questions: [{ ...oneQuestion.questions[1], title: '题'.repeat(257) }] },
      'invalid-field:questions[0].title',
    ],
    [
      'a diagram that makes the option text too long',
      {
        questions: [
          {
            title: 'T',
            description: 'D',
            options: [
              { label: 'A', description: 'x'.repeat(4000), diagram: 'y'.repeat(100) },
              { label: 'B', description: 'z' },
            ],
          },
        ],
      },
      'invalid-field:questions[0].options[0].diagram',
    ],
    [
      'a field that the command does not declare',
      { ...oneQuestion, timeout: 'PT1M' },
      'invalid-field:timeout',
    ],
    [
      'an option that is not text',
      { questions: [{ title: 'T', description: 'D', options: ['A'] }] },
      'invalid-field:questions[0].options[0]',
    ],
  ])('rejects %s before the executor', (_name, args, reason) => {
    expect(parse('ask', args)).toEqual({ failure: { kind: 'invalid', reason } })
  })

  it('accepts the widest batch: 7 questions of 4 options each', async () => {
    const { request } = await suspended(parsed('ask', { questions: questions(7) }))
    expect(request.questions.map((card: { cardId: string }) => card.cardId)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      'q6',
      'q7',
    ])
    expect(request.questions[6].options.map((option: { id: string }) => option.id)).toEqual([
      'o1',
      'o2',
      'o3',
      'o4',
    ])
  })

  it('rejects an invalid batch in initial too, without a wait', async () => {
    const args: AskArguments = {
      command: 'ask',
      questions: [{ title: 'T', description: 'D', options: [] }],
    }
    expect(await askExecutor.initial(args, null, context)).toEqual({
      failure: { kind: 'invalid', reason: 'invalid-field:questions[0].options' },
    })
  })
})

describe('request_approval', () => {
  it('suspends with one approval card that has the two fixed options', async () => {
    const { request, state, wait } = await suspended(parsed('request_approval', approval))
    expect(wait.contract).toBe(askWaitContract)
    expect(request).toEqual({
      questions: [
        {
          cardId: 'approval',
          kind: 'approval',
          title: 'Delete the build directory',
          description:
            '原因：It holds stale output.\n影响：The next build takes longer.\n可逆性：A new build makes it again.\n不同意时的退路：I keep the directory and build in place.',
          options: [
            { id: 'approve', label: '同意', description: '同意执行这个动作。' },
            { id: 'reject', label: '不同意', description: '不同意，这个动作不会执行。' },
          ],
          declineConsequence: '不作准驳，这个动作不会执行',
        },
      ],
    })
    expect(state).toEqual({
      command: 'request_approval',
      questions: [
        {
          cardId: 'approval',
          title: 'Delete the build directory',
          options: [
            { id: 'approve', label: '同意' },
            { id: 'reject', label: '不同意' },
          ],
        },
      ],
    })
  })

  it.each([
    ['an empty action', { ...approval, action: '' }, 'invalid-field:action'],
    ['a blank fallback', { ...approval, fallback: '   ' }, 'invalid-field:fallback'],
    [
      'a missing reversibility',
      { ...approval, reversibility: undefined },
      'invalid-field:reversibility',
    ],
    ['options from the model', { ...approval, options: [] }, 'invalid-field:options'],
  ])('rejects %s', (_name, args, reason) => {
    expect(parse('request_approval', args)).toEqual({ failure: { kind: 'invalid', reason } })
  })
})

describe('wait contract and checkpoint', () => {
  it('forbids expiry, and the cards of both commands pass the declared request schema', async () => {
    expect(askWaitContract.expiry).toBe('forbidden')
    const provider = createSchemaProvider({
      maxSnapshots: 4,
      maxConstructDepth: 16,
      maxConstructNodes: 256,
      failureBackoffMs: 0,
      maxAttempts: 1,
    })
    for (const args of [parsed('ask', oneQuestion), parsed('request_approval', approval)]) {
      const segment = await askExecutor.initial(args, null, context)
      if (!('ok' in segment) || segment.ok.kind !== 'suspended') throw new Error('suspend')
      const { wait, state } = segment.ok
      const read = readJsonText(writeJsonText(wait.request), {
        maxBytes: askWaitContract.request.maxBytes,
        maxDepth: 8,
        maxItems: 32_768,
        maxMembers: 16,
        maxStringLength: 8192,
        maxNumberLength: 32,
      })
      expect((await validate(provider, askWaitContract.request.ref, read)).kind).toBe('valid')
      expect(state.byteLength).toBeLessThanOrEqual(askExecutor.checkpoint.maxBytes)
    }
  })

  it('accepts the batch reply shape that the resume segment will read', async () => {
    const provider = createSchemaProvider({
      maxSnapshots: 4,
      maxConstructDepth: 16,
      maxConstructNodes: 256,
      failureBackoffMs: 0,
      maxAttempts: 1,
    })
    const check = (value: unknown) =>
      validate(
        provider,
        askWaitContract.response.ref,
        readJsonText(JSON.stringify(value), {
          maxBytes: 65536,
          maxDepth: 8,
          maxItems: 1024,
          maxMembers: 16,
          maxStringLength: 8192,
          maxNumberLength: 32,
        }),
      )
    const reply = {
      answers: [
        { cardId: 'q1', kind: 'selection', optionId: 'o2' },
        { cardId: 'q2', kind: 'text', text: 'Use 9090.' },
        { cardId: 'q3', kind: 'no-answer' },
      ],
    }
    expect((await check(reply)).kind).toBe('valid')
    expect((await check({ answers: [{ cardId: 'q1', kind: 'decline' }] })).kind).toBe('invalid')
  })

  it('rejects a checkpoint that it cannot read', async () => {
    const answer = await askExecutor.resume(
      { checkpoint: new Uint8Array([0xff]), response: { kind: 'no-answer' } },
      null,
      context,
    )
    expect(answer).toEqual({ failure: { kind: 'invalid', reason: 'ask-state-unreadable' } })
  })
})

async function checkpointOf(command: AskCommand, args: unknown) {
  const segment = await askExecutor.initial(parsed(command, args), null, context)
  if ('failure' in segment || segment.ok.kind !== 'suspended') throw new Error('must suspend')
  return segment.ok.state
}
async function resumed(checkpoint: Uint8Array, response: ToolDecision<unknown>) {
  return askExecutor.resume({ checkpoint, response }, null, context)
}
const answered = (...answers: readonly object[]): ToolDecision<unknown> => ({
  kind: 'answer',
  value: { answers },
})

describe('resume', () => {
  it('writes one line per question in card order, for each kind of answer', async () => {
    const checkpoint = await checkpointOf('ask', {
      questions: [
        ...oneQuestion.questions,
        { ...oneQuestion.questions[1], title: 'Keep "old" config?' },
      ],
    })
    const answer = await resumed(
      checkpoint,
      answered(
        { cardId: 'q1', kind: 'selection', optionId: 'o2' },
        { cardId: 'q2', kind: 'text', text: 'Use 7070.\nNot 8080.' },
        { cardId: 'q3', kind: 'no-answer' },
      ),
    )
    expect(answer).toEqual({
      ok: {
        kind: 'completed',
        value: [
          'Q1 Which database?: selected "Postgres"',
          'Q2 Which port?: the person wrote: "Use 7070.\\nNot 8080."',
          'Q3 Keep "old" config?: no answer (the person skipped this question)',
        ].join('\n'),
      },
    })
  })

  it.each([
    ['ask', 'no-answer', 'The person did not answer any question.'],
    ['ask', 'declined', 'The person declined to reply.'],
    [
      'request_approval',
      'no-answer',
      'No decision: the person did not approve or reject. This is not permission.',
    ],
    ['request_approval', 'declined', 'The person declined to reply.'],
  ] as const)('answers %s %s without a value', async (command, kind, value) => {
    const checkpoint = await checkpointOf(command, command === 'ask' ? oneQuestion : approval)
    expect(await resumed(checkpoint, { kind })).toEqual({ ok: { kind: 'completed', value } })
  })

  it.each([
    [{ kind: 'selection', optionId: 'approve' }, `Approved: ${approval.action}`],
    [{ kind: 'selection', optionId: 'reject' }, `Not approved: ${approval.action}`],
    [
      { kind: 'text', text: 'Only the cache.' },
      'No decision. The person wrote: "Only the cache.". This is not permission.',
    ],
    [
      { kind: 'no-answer' },
      'No decision: the person did not approve or reject. This is not permission.',
    ],
  ])('projects the approval answer %j', async (reply, value) => {
    const checkpoint = await checkpointOf('request_approval', approval)
    expect(await resumed(checkpoint, answered({ cardId: 'approval', ...reply }))).toEqual({
      ok: { kind: 'completed', value },
    })
  })

  it.each([
    ['fewer answers than cards', [{ cardId: 'q1', kind: 'no-answer' }]],
    [
      'more answers than cards',
      [
        { cardId: 'q1', kind: 'no-answer' },
        { cardId: 'q2', kind: 'no-answer' },
        { cardId: 'q3', kind: 'no-answer' },
      ],
    ],
    [
      'cards out of order',
      [
        { cardId: 'q2', kind: 'no-answer' },
        { cardId: 'q1', kind: 'no-answer' },
      ],
    ],
    [
      'an option that the question does not have',
      [
        { cardId: 'q1', kind: 'selection', optionId: 'o9' },
        { cardId: 'q2', kind: 'no-answer' },
      ],
    ],
  ])('rejects %s', async (_name, answers) => {
    const checkpoint = await checkpointOf('ask', oneQuestion)
    expect(await resumed(checkpoint, answered(...answers))).toEqual({
      failure: { kind: 'invalid', reason: 'ask-response-mismatch' },
    })
  })
})

describe('the Ask command tool', () => {
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
  const slots = (construction: unknown) => {
    const author = askToolModule.createAuthor(json(construction))
    if ('failure' in author) throw new Error(JSON.stringify(author.failure))
    const registration = readToolRegistration(author.ok)
    if (registration?.kind !== 'commands') throw new Error('Ask must be a command tool')
    return new Map(registration.operations)
  }

  it('runs both commands in segments with the one Ask executor and wait protocol', () => {
    const operations = slots({ resultMaxBytes: 64 })
    expect([...operations.keys()]).toEqual(['ask', 'request_approval'])
    for (const [, slot] of operations) {
      expect(slot.segments).toBe(askExecutor)
      expect(slot.author.waits).toEqual([askWaitContract])
    }
  })

  it('keeps a result within resultMaxBytes and refuses a longer one', () => {
    const slot = slots({ resultMaxBytes: 4 }).get('ask')
    if (slot === undefined) throw new Error('no ask command')
    expect(slot.author.output.check({ arguments: null, value: 'abcd' })).toEqual({ ok: 'abcd' })
    expect(slot.author.output.check({ arguments: null, value: 'abcde' })).toMatchObject({
      failure: {},
    })
  })

  it('refuses a construction without resultMaxBytes or with another field', () => {
    for (const construction of [{}, { resultMaxBytes: 64, other: 1 }])
      expect(askToolModule.createAuthor(json(construction))).toMatchObject({
        failure: { field: 'construction' },
      })
  })
})
