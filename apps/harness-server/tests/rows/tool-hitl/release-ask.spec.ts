// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// Ask 在发行树上出卡（切片 02，验收 C2）：一个会话里模型调用 Ask 的 ask（两个问题），另一个会话里调用
// request_approval。两个调用都暂停、队列条目停泊；HITL 按会话列出各自的卡，按池列出全部三张，每张带跳过的后果。
// 卡片经进程内的 HITL 应用读取，读者是决策方自己的登记主体；受众是发行注入的规则。经 HITL 位置的读取见
// `tests/rows/server-entry/release-hitl.spec.ts`。
// 第二条：Run 在登记之前已被取消时，HITL 的登记在同一笔提交里被 Session 的 `session.run-live` 拒绝，整笔回滚，不出卡。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-tool-delivery 相同），只为不让询问策略挡住调用。
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

/** The user input that makes the model call `request_approval`; any other input calls `ask`. */
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
        // 第一个会话的卡列出之后才起第二个会话：同一租户的两个 Run 同时继续有已知限制（agent-host-local SPEC
        // 「运行失败」，R2-D256），负载下第二张卡会出不来。
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
        // The session entry: each session lists the cards of its own Ask call, in card order.
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
        // The pool entry lists the same cards, in the same projection and in card order per session.
        const pool = await world.cards({})
        expect(pool).toHaveLength(asked.length + approving.length)
        for (const [session, items] of [
          [ask, asked],
          [approval, approving],
        ] as const)
          expect(pool.filter(item => item.origin.sessionRef === session)).toEqual(items)

        // Both calls are suspended and their queue entries no longer hold a slot.
        let tool = toolRecords(world.storageRoot)
        for (
          const end = Date.now() + 30_000;
          Date.now() < end && tool.stages.filter(stage => stage === 'parked').length < 2;
          await sleep(250)
        )
          tool = toolRecords(world.storageRoot)
        expect(tool.phases).toEqual(['suspended', 'suspended'])
        expect(tool.stages).toEqual(['parked', 'parked'])

        // The Agent waits at the original action: no tool result, and the Run has not ended.
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
        // Hold the first registration until the Run is cancelled, then let the real bridge commit.
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
        // What HITL answers the registration, seen at its application.
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

        // The Session guard rejected the registration in its commit; the bridge refuses for good.
        expect(registered).toMatchObject([{ kind: 'conflict', reason: 'guard-rejected' }])
        expect(answers[0]).toMatchObject({ failure: { kind: 'conflict' } })
        // Nothing of the registration landed, in any state.
        expect(await world.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
        expect(await world.cards({ sessionRef: session })).toEqual([])
      })
    },
  )
})
