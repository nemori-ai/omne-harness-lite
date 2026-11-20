// @module-tag slow
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { PoolItem } from '@omne-harness/human-intervention'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsByRequest,
  toolCallsThenText,
  toolRecords,
} from '../../support/release-tree.ts'
import { savedTenant } from '../../r9/support.ts'

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
      {
        title: 'Should the server reload on every file change?',
        description: 'Reloading is fast but restarts open connections.',
        options: [
          { label: 'Yes', description: 'Reload on every change.' },
          { label: 'No', description: 'Reload by hand.' },
        ],
      },
    ],
  },
})
const ASK_INPUT = 'start: ask me'
const askOnce = toolCallsThenText(() => [{ id: 'call_ask', tool: 'Ask', arguments: ASK }])
const options = { script: askOnce, permission: 'bypass-permissions' }

describe('Ask on the release tree puts its cards before a person and parks its call', () => {
  it(
    'ask suspends, its entry parks, and the session and the pool list the same cards with their decline consequences',
    { timeout: 240_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const ask = await world.startSession(ASK_INPUT)
        let asked: readonly PoolItem[] = []
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(500)) {
          asked = await world.cards({ sessionRef: ask })
          if (asked.length === 2) break
        }
        expect(
          asked.map(item => [
            item.card.question.kind,
            item.card.question.title,
            item.card.question.declineConsequence,
          ]),
        ).toEqual([
          ['question', 'Which port should the dev server use?', '跳过此题，不作答'],
          ['question', 'Should the server reload on every file change?', '跳过此题，不作答'],
        ])
        for (const item of asked) {
          expect(item.card.kind).toBe('pending')
          expect(item.origin).toMatchObject({ kind: 'tool', sessionRef: ask })
        }
        expect(await world.cards({})).toEqual(asked)

        let tool = toolRecords(world.storageRoot)
        for (
          const end = Date.now() + 30_000;
          Date.now() < end && !tool.stages.includes('parked');
          await sleep(250)
        )
          tool = toolRecords(world.storageRoot)
        expect(tool.phases).toEqual(['suspended'])
        expect(tool.stages).toEqual(['parked'])

        const entries = await historyOf(world, ask)
        expect(entries.some(entry => entry.kind === 'message.tool')).toBe(false)
        expect(entries.some(entry => entry.kind === 'run.terminal')).toBe(false)
      })
    },
  )

  it(
    'a Run that ended before the registration lands rejects the registration in the same commit: no card, no wait',
    { timeout: 240_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        let reached: (() => void) | undefined
        const atRegistration = new Promise<void>(resolve => {
          reached = resolve
        })
        let release: (() => void) | undefined
        const released = new Promise<void>(resolve => {
          release = resolve
        })
        const answers: unknown[] = []
        const real = world.hitl.bridge
        if (real === null) throw new Error('no decision owner')
        const held: ToolDecisionBridge<unknown> = {
          ...real,
          async ensure(input) {
            reached?.()
            await released
            const answer = await real.ensure(input)
            answers.push(answer)
            return answer
          },
        }
        world.hitl.bridge = held

        const session = await world.startSession(ASK_INPUT)
        await atRegistration
        const started = (await historyOf(world, session)).find(
          entry => entry.kind === 'run.started',
        )
        const run = String(started?.payload['run'])
        const cancelled = await world.cli([
          'cancel-run',
          '--session',
          session,
          '--run',
          run,
          '--urgency',
          'force',
        ])
        expect(cancelled.status, cancelled.stdout).toBe(0)
        for (
          const end = Date.now() + 60_000;
          Date.now() < end &&
          !(await historyOf(world, session)).some(e => e.kind === 'run.terminal');
          await sleep(250)
        );
        expect((await historyOf(world, session)).some(e => e.kind === 'run.terminal')).toBe(true)
        const at = await world.hitl.host?.tenant(savedTenant(world.home))
        if (at?.kind !== 'ready') throw new Error('no HITL application')
        const registered: unknown[] = []
        const register = at.tenant.application.registerRequest
        at.tenant.application.registerRequest = async (access, command) => {
          const answer = await register(access, command)
          registered.push(answer)
          return answer
        }
        release?.()
        for (const end = Date.now() + 30_000; Date.now() < end && answers.length === 0;)
          await sleep(100)

        expect(registered).toMatchObject([{ kind: 'conflict', reason: 'guard-rejected' }])
        expect(answers[0]).toMatchObject({ failure: { kind: 'conflict' } })
        expect(await world.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
        expect(await world.cards({ sessionRef: session })).toEqual([])
        await pollUntil(
          'the cancelled execution to end',
          async () => (await world.cli(['read-session-diagnostics', '--session', session])).stdout,
          text => text.includes('reason: no-failure cancelled'),
        )
      })
      expect(exit).toBe(0)
    },
  )
})

describe('Ask has no gate', () => {
  it(
    'in a session that asks a person, ask puts only its questions before the person: no release card first',
    { timeout: 240_000 },
    async () => {
      await onReleaseTree({ script: askOnce, permission: 'auto_permission' }, async world => {
        const session = await world.startSession(ASK_INPUT)
        const cards = await pollUntil(
          'the cards of the ask call',
          () => world.cards({ sessionRef: session }),
          value => value.length === 2 || value.some(item => item.card.question.kind === 'release'),
        )
        expect(cards.map(item => item.card.question.kind)).toEqual(['question', 'question'])
        expect(cards.map(item => item.origin.kind)).toEqual(['tool', 'tool'])
      })
    },
  )

  it(
    'a yes in an Ask answer is no permission: the Shell run the model makes next still puts a release card first',
    { timeout: 240_000 },
    async () => {
      const MAY_I = 'start: may I run the build'
      const mayI = JSON.stringify({
        command: 'ask',
        params: {
          questions: [
            {
              title: 'May I run the build script?',
              description: 'The build writes into ./dist.',
              options: [
                { label: 'Yes', description: 'Run it.' },
                { label: 'No', description: 'Do not run it.' },
              ],
            },
          ],
        },
      })
      const run = JSON.stringify({
        command: 'execute',
        intent: 'run the build',
        params: { script: 'echo built' },
      })
      const script = toolCallsByRequest(body => {
        const last = (JSON.parse(body) as { messages?: { role: string }[] }).messages?.at(-1)
        if (last?.role === 'user' && body.includes(MAY_I))
          return [{ id: 'call_may_i', tool: 'Ask', arguments: mayI }]
        if (last?.role === 'tool' && !body.includes('call_run'))
          return [{ id: 'call_run', tool: 'Shell', arguments: run }]
        return []
      })
      await onReleaseTree({ script, permission: 'auto_permission' }, async world => {
        const session = await world.startSession(MAY_I)
        const [asked] = await pollUntil(
          'the question of Ask',
          () => world.cards({ sessionRef: session, states: ['pending'] }),
          value => value.length === 1,
        )
        if (asked === undefined) throw new Error('no question')
        expect(asked.card.question.kind).toBe('question')
        const reply = await world.cli([
          'submit-reply',
          '--request',
          asked.card.ref.request.requestId,
          '--card',
          asked.card.ref.cardId,
          '--revision',
          asked.card.revision,
          '--option',
          'o1',
          '--reply-id',
          'reply-yes',
        ])
        expect(reply.status, reply.stderr).toBe(0)
        const released = await pollUntil(
          'the release card of the Shell run',
          () => world.cards({ sessionRef: session, states: ['pending'] }),
          value => value.some(item => item.card.question.kind === 'release'),
        )
        expect(released.map(item => item.card.question)).toMatchObject([
          { kind: 'release', target: { tool: 'Shell', command: 'execute' }, gateTitle: '执行' },
        ])
        expect(toolCalls(world.storageRoot).filter(row => row.tool === 'Shell')).toEqual([])
      })
    },
  )
})
