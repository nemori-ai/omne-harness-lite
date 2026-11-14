// @module-tag slow
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import {
  answerCard,
  historyOf,
  onReleaseTreeRuns,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolLedger,
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
const options = {
  script: toolCallsThenText(() => [{ id: 'call_a', tool: 'Ask', arguments: ASK }]),
  permission: 'bypass-permissions',
}

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

async function resumedOnce(world: ReleaseTree, session: string): Promise<void> {
  const ask = await pollUntil(
    'the Ask to settle and its result to reach the Agent',
    () => askOf(world),
    row => row?.phase === 'settled' && row.released && !row.tasks.includes('deliver'),
  )
  expect(ask).toMatchObject({ phase: 'settled', terminal: 'completed', released: true })
  expect(ask?.tasks).toEqual(['clock'])
  expect(ask?.waits).toEqual([{ phase: 'closed', cause: 'continued' }])
  const cards = await world.cards({ sessionRef: session, states: ['pending', 'decided'] })
  expect(cards.map(item => item.card.kind)).toEqual(['decided'])
}

function withBridge(world: ReleaseTree, replace: Partial<ToolDecisionBridge<unknown>>): void {
  const real = world.hitl.bridge
  if (real === null) throw new Error('no decision owner')
  world.hitl.bridge = { ...real, ...replace }
}

async function endedOnce(world: ReleaseTree, session: string): Promise<void> {
  const entries = await pollUntil(
    'the end of the Run of the session',
    () => historyOf(world, session),
    seen => seen.some(entry => entry.kind === 'run.terminal'),
  )
  expect(entries.filter(entry => entry.kind === 'run.terminal')).toHaveLength(1)
}

describe('a waiting Ask goes on after the service restarts on the same state (C7)', () => {
  it(
    'a card that was not answered before the restart is answered after it, and the call resumes once',
    { timeout: 300_000 },
    async () => {
      let session = ''
      const exits = await onReleaseTreeRuns(options, [
        async world => {
          session = await parkedAsk(world)
        },
        async world => {
          expect(await world.cards({ sessionRef: session })).toHaveLength(1)
          await answerCard(world, session, 'Use 8081')
          await resumedOnce(world, session)
        },
      ])
      expect(exits).toEqual([0, 0])
    },
  )

  it(
    'an answer that holds in HITL and that Tool did not see before the stop is taken over after the restart, once',
    { timeout: 300_000 },
    async () => {
      let session = ''
      const exits = await onReleaseTreeRuns(options, [
        async world => {
          const real = world.hitl.bridge
          if (real === null) throw new Error('no decision owner')
          withBridge(world, {
            async inspect(input) {
              const seen = await real.inspect(input)
              return 'ok' in seen ? { ok: { ...seen.ok, decision: null } } : seen
            },
          })
          session = await parkedAsk(world)
          await answerCard(world, session, 'Use 8081')
          const cards = await world.cards({ sessionRef: session, states: ['decided'] })
          expect(cards).toHaveLength(1)
          expect(askOf(world)).toMatchObject({ phase: 'suspended' })
        },
        async world => {
          await resumedOnce(world, session)
        },
      ])
      expect(exits).toEqual([0, 0])
    },
  )

  it(
    'the stop while the Ask waits hands the execution over (exit 0), and after the restart the Run goes on to its end',
    { timeout: 300_000 },
    async () => {
      let session = ''
      const exits = await onReleaseTreeRuns(options, [
        async world => {
          session = await parkedAsk(world)
        },
        async world => {
          expect(await world.cards({ sessionRef: session })).toHaveLength(1)
          await answerCard(world, session, 'Use 8081')
          await resumedOnce(world, session)
          await endedOnce(world, session)
        },
      ])
      expect(exits).toEqual([0, 0])
    },
  )

  it(
    'a registration that did not land before the stop lands once after the restart: one card, and the answer resumes the call',
    { timeout: 300_000 },
    async () => {
      let session = ''
      const exits = await onReleaseTreeRuns(options, [
        async world => {
          withBridge(world, {
            ensure: async () =>
              fail({ kind: 'unavailable', dependency: 'tool-decisions', diagnostic: 'held' }),
          })
          session = await world.startSession('start: ask')
          const ask = await pollUntil(
            'the Ask to suspend with its wait opening',
            () => askOf(world),
            row => row?.phase === 'suspended' && row.waits.some(wait => wait.phase === 'opening'),
          )
          expect(ask?.waits).toEqual([{ phase: 'opening', cause: null }])
          expect(await world.cards({ sessionRef: session })).toEqual([])
        },
        async world => {
          await pollUntil(
            'the card',
            () => world.cards({ sessionRef: session, states: ['pending', 'decided'] }),
            cards => cards.length === 1,
          )
          await answerCard(world, session, 'Use 8081')
          await resumedOnce(world, session)
          await endedOnce(world, session)
        },
      ])
      expect(exits).toEqual([0, 0])
    },
  )
})
