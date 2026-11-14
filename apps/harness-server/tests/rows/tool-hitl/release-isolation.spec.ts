// @module-tag slow
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import {
  answerCard,
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolLedger,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const TITLE = 'Which port should the dev server use?'
const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: TITLE,
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
    ],
  },
})
const APPROVAL = JSON.stringify({
  command: 'request_approval',
  params: {
    action: 'Delete the build directory',
    reason: 'It holds stale artifacts.',
    impact: 'The next build takes longer.',
    reversibility: 'The build directory can be rebuilt.',
    fallback: 'Keep it and build into a new directory.',
  },
})
const options = {
  script: toolCallsThenText(body =>
    body.includes('start: two')
      ? [
          { id: 'call_a', tool: 'Ask', arguments: ASK },
          { id: 'call_b', tool: 'Ask', arguments: APPROVAL },
        ]
      : body.includes('start: ask')
        ? [{ id: 'call_a', tool: 'Ask', arguments: ASK }]
        : [],
  ),
  permission: 'bypass-permissions',
}
const ANSWER = `Q1 ${TITLE}: the person wrote: "Use 8081"`

const askOf = (world: ReleaseTree) => toolLedger(world.storageRoot).find(row => row.tool === 'Ask')

async function parkedAsk(world: ReleaseTree): Promise<string> {
  const session = await world.startSession('start: ask')
  await pollUntil(
    'the card',
    () => world.cards({ sessionRef: session }),
    cards => cards.length === 1,
  )
  await pollUntil(
    'the parked Ask',
    () => askOf(world),
    ask =>
      ask?.phase === 'suspended' &&
      toolCalls(world.storageRoot).find(row => row.tool === 'Ask')?.entry?.stage === 'parked',
  )
  return session
}

const ended = (world: ReleaseTree, session: string, runs = 1) =>
  pollUntil(
    `the Run of ${session} to end`,
    () => historyOf(world, session),
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )

describe('a session that waits for a person does not hold up the others (C8)', () => {
  it(
    'another session runs to its end while the Ask waits, and the waiting session ends once answered',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const waiting = await parkedAsk(world)
        const other = await world.startSession('start: plain')
        const otherHistory = await ended(world, other)
        expect(otherHistory.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
        expect(await world.cards({ sessionRef: waiting })).toHaveLength(1)
        expect(askOf(world)).toMatchObject({ phase: 'suspended' })
        await answerCard(world, waiting, 'Use 8081')
        const answered = await ended(world, waiting)
        expect(toolResults(answered)).toEqual([ANSWER])
        expect(answered.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      })
    },
  )

  it(
    'an input sent to the waiting session is queued and never taken as the answer: the Ask resumes once with the answer of the card',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const waiting = await parkedAsk(world)
        const sent = await world.cli(['send-input', '--session', waiting, '--text', 'a later note'])
        expect(sent.status, sent.stderr).toBe(0)
        await pollUntil(
          'the note in the history',
          () => historyOf(world, waiting),
          seen =>
            seen.some(
              entry =>
                entry.kind === 'message.user' &&
                JSON.stringify(entry.payload).includes('a later note'),
            ),
        )
        expect(await world.cards({ sessionRef: waiting })).toHaveLength(1)
        expect(askOf(world)).toMatchObject({
          phase: 'suspended',
          waits: [{ phase: 'open', cause: null }],
        })
        await answerCard(world, waiting, 'Use 8081')
        const answered = await pollUntil(
          'the result of the Ask in the history',
          () => historyOf(world, waiting),
          seen => seen.some(entry => entry.kind === 'message.tool'),
        )
        expect(toolResults(answered)).toEqual([ANSWER])
        expect(askOf(world)).toMatchObject({ phase: 'settled', terminal: 'completed' })
      })
    },
  )
})

describe('two Ask calls of one batch each wait for a person (C2, C5)', () => {
  it(
    'both cards are listed and both calls park; one answer gives the model nothing, and after both the Run ends with the results in call order',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const asks = () => toolLedger(world.storageRoot).filter(row => row.tool === 'Ask')
        const session = await world.startSession('start: two')
        const cards = await pollUntil(
          'the two cards',
          () => world.cards({ sessionRef: session }),
          found => found.length === 2,
        )
        await pollUntil(
          'both calls parked',
          () => toolCalls(world.storageRoot).filter(row => row.tool === 'Ask'),
          rows => rows.length === 2 && rows.every(row => row.entry?.stage === 'parked'),
        )
        expect(asks().map(row => row.phase)).toEqual(['suspended', 'suspended'])
        const question = cards.find(item => item.card.question.kind === 'question')
        if (question === undefined) throw new Error('no question card')
        const first = await world.cli([
          'submit-reply',
          '--request',
          question.card.ref.request.requestId,
          '--card',
          question.card.ref.cardId,
          '--revision',
          question.card.revision,
          '--text',
          'Use 8081',
          '--reply-id',
          `reply-first-${session}`,
        ])
        expect(first.status, first.stderr).toBe(0)
        await pollUntil('the answered call to settle', asks, rows =>
          rows.some(row => row.phase === 'settled'),
        )
        await sleep(1_000)
        expect(
          asks()
            .map(row => row.phase)
            .sort(),
        ).toEqual(['settled', 'suspended'])
        expect((await historyOf(world, session)).some(entry => entry.kind === 'message.tool')).toBe(
          false,
        )
        await answerCard(world, session, 'Ask me again tomorrow')
        const done = await ended(world, session)
        const results = toolResults(done)
        expect(results).toHaveLength(2)
        expect(results[0]).toBe(ANSWER)
        expect(results[1]).toContain('Ask me again tomorrow')
        expect(done.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      })
    },
  )
})
