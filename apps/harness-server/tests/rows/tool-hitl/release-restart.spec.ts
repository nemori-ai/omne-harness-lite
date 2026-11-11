// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 重启接续（切片 06，验收 C7）：同一状态根上把服务停掉再起一次。
// - 答复之前重启：卡片在第二次起服务后仍可答，答复之后原调用恢复一次并收场，结果交给 Agent。
// - 答复之后立即重启：答复已在 HITL 成立、原调用还没接手时停服，第二次起服务后接手、恢复一次并收场。
// 第一次停服时 Ask 仍在等人；等待中停服的交接是切片 09 的事，这里只记下两次的退出码，只核第二次。
// 重启后 Run 接着跑完不在 C7 里：Agent 宿主重启后不接续 Run（#502 第 5 阶段），所以只核到 Agent 收下结果。
// 同一租户的几个 Run 同时继续有已知限制（agent-host-local SPEC「运行失败」，R2-D256），所以只让一个 Run 推进。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
import { describe, expect, it } from 'vitest'
import {
  answerCard,
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
      expect(exits.at(-1)).toBe(0)
    },
  )

  it(
    'an answer that holds in HITL just before the stop is taken over after the restart, once',
    { timeout: 300_000 },
    async () => {
      let session = ''
      const exits = await onReleaseTreeRuns(options, [
        async world => {
          session = await parkedAsk(world)
          // The answer holds in HITL; the service stops right after it, before the call goes on.
          await answerCard(world, session, 'Use 8081')
        },
        async world => {
          await resumedOnce(world, session)
        },
      ])
      expect(exits.at(-1)).toBe(0)
    },
  )
})
