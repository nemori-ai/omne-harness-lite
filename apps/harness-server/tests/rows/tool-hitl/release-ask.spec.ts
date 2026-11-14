// @module-tag slow
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { PoolItem } from '@omne-harness/human-intervention'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import {
  historyOf,
  onReleaseTree,
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

const ASK_INPUT = 'start: ask me'
const APPROVAL_INPUT = 'start: request approval'
const askOnce = toolCallsThenText(body => [
  body.includes(APPROVAL_INPUT)
    ? { id: 'call_approval', tool: 'Ask', arguments: APPROVAL }
    : { id: 'call_ask', tool: 'Ask', arguments: ASK },
])
const options = { script: askOnce, permission: 'bypass-permissions' }

describe('Ask on the release tree puts its cards before a person and parks its calls (C2)', () => {
  it(
    'ask and request_approval each suspend, their entries park, and the session and the pool list the same cards with their decline consequences',
    { timeout: 240_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const ask = await world.startSession(ASK_INPUT)
        let asked: readonly PoolItem[] = []
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(500)) {
          asked = await world.cards({ sessionRef: ask })
          if (asked.length === 2) break
        }
        const approval = await world.startSession(APPROVAL_INPUT)
        let approving: readonly PoolItem[] = []
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(500)) {
          approving = await world.cards({ sessionRef: approval })
          if (approving.length === 1) break
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
        expect(
          approving.map(item => [
            item.card.question.kind,
            item.card.question.title,
            item.card.question.declineConsequence,
          ]),
        ).toEqual([['approval', 'Delete the build directory', '不作准驳，这个动作不会执行']])
        for (const [session, items] of [
          [ask, asked],
          [approval, approving],
        ] as const)
          for (const item of items) {
            expect(item.card.kind).toBe('pending')
            expect(item.origin).toMatchObject({ kind: 'tool', sessionRef: session })
          }
        const pool = await world.cards({})
        expect(pool).toHaveLength(asked.length + approving.length)
        for (const [session, items] of [
          [ask, asked],
          [approval, approving],
        ] as const)
          expect(pool.filter(item => item.origin.sessionRef === session)).toEqual(items)

        let tool = toolRecords(world.storageRoot)
        for (
          const end = Date.now() + 30_000;
          Date.now() < end && tool.stages.filter(stage => stage === 'parked').length < 2;
          await sleep(250)
        )
          tool = toolRecords(world.storageRoot)
        expect(tool.phases).toEqual(['suspended', 'suspended'])
        expect(tool.stages).toEqual(['parked', 'parked'])

        for (const session of [ask, approval]) {
          const entries = await historyOf(world, session)
          expect(entries.some(entry => entry.kind === 'message.tool')).toBe(false)
          expect(entries.some(entry => entry.kind === 'run.terminal')).toBe(false)
        }
      })
    },
  )

  it(
    'a Run that ended before the registration lands rejects the registration in the same commit: no card, no wait',
    { timeout: 240_000 },
    async () => {
      await onReleaseTree(options, async world => {
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
      })
    },
  )
})
