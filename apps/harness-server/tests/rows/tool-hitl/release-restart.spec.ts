// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 重启接续（切片 06，验收 C7）：同一状态根上把服务停掉再起一次。
// - 答复之前重启：卡片在第二次起服务后仍可答，答复之后原调用恢复一次并收场，结果交给 Agent。
// - 已答未接手时重启：答复已在 HITL 成立，这一次服务里 Tool 看不到这个决定（决策方的 inspect 被挡成「还没有决定」），
//   调用仍在等。停服，第二次起服务后接手、恢复一次并收场。接手因此只可能发生在重启之后。
// - 等待中停服再重启（切片 09，验收 C10）：第一次停服把等待中的执行交接出去，重启后 Run 走到结束。
// - 登记还在途时重启：这一次服务里卡片登记不上（决策方的 ensure 答不可用），等待停在 opening。停服，第二次起服务后
//   登记一次，只有一张卡；答复后调用恢复一次，Run 走到结束。
// 四条都核两次停服的退出码为 0：停服时执行都在等，Agent 把它交接出去。
// 同一租户的几个 Run 同时继续有已知限制（agent-host-local SPEC「运行失败」，R2-D256），所以只让一个 Run 推进。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
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

/** Starts a session whose model calls Ask, and waits until its card is listed and its call parked. */
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

/**
 * Waits until the Ask settled and its result was delivered; checks that it resumed once from the
 * accepted answer and that the card is decided.
 */
async function resumedOnce(world: ReleaseTree, session: string): Promise<void> {
  const ask = await pollUntil(
    'the Ask to settle and its result to reach the Agent',
    () => askOf(world),
    row => row?.phase === 'settled' && row.released && !row.tasks.includes('deliver'),
  )
  expect(ask).toMatchObject({ phase: 'settled', terminal: 'completed', released: true })
  // The only record left is the blocked `clock` task: the call's time began in the first process,
  // and the host clock does not compare a marker of another epoch (tool-host-local G4).
  expect(ask?.tasks).toEqual(['clock'])
  expect(ask?.waits).toEqual([{ phase: 'closed', cause: 'continued' }])
  const cards = await world.cards({ sessionRef: session, states: ['pending', 'decided'] })
  expect(cards.map(item => item.card.kind)).toEqual(['decided'])
}

/** The decision owner of the run, with some of its ports replaced for this run of the service. */
function withBridge(world: ReleaseTree, replace: Partial<ToolDecisionBridge<unknown>>): void {
  const real = world.hitl.bridge
  if (real === null) throw new Error('no decision owner')
  world.hitl.bridge = { ...real, ...replace }
}

/** Waits for the end of the Run of `session` and checks that it ended once. */
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
          // The card is still there after the restart, and the person answers it.
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
          // In this run of the service Tool never sees a decision: the call cannot go on here.
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
          // The Agent took the result under its new attachment, asked the model again and ended.
          await endedOnce(world, session)
        },
      ])
      // Both stops leave nothing unresolved: the first one handed the waiting execution over.
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
          // In this run of the service the decision owner cannot take the registration.
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
