// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 等人时的会话隔离与排队（切片 07，验收 C8）：
// - 一个会话的 Ask 在等人时，另一个会话照常跑完；答复之后等人的会话也跑完。
// - 等人期间向同一会话再送一条输入：它进入会话的输入队列，不被当作卡片的答复；答复卡片后 Ask 以卡片的答复
//   恢复一次，那条输入不出现在工具结果里。之后 Run 不一定跑完：Agent 的等待节点 W0 读会话公共根时若撞上
//   这条输入的提交，答 unavailable，Agent 不重试而让 Run 停在失败上（agent-host-local SPEC「运行失败」，
//   计划波 3），所以这里不等 Run 结束。
// 脚本按请求体选调用：只有带「start: ask」的会话会调 Ask，其余直接回文本。
// 同一租户的几个 Run 同时继续有已知限制（agent-host-local SPEC「运行失败」，R2-D256），所以等人的会话停在 Ask
// 上之后才开第二个会话，第二个会话跑完之后才答复。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
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
const options = {
  script: toolCallsThenText(body =>
    body.includes('start: ask') ? [{ id: 'call_a', tool: 'Ask', arguments: ASK }] : [],
  ),
  permission: 'bypass-permissions',
}
const ANSWER = `Q1 ${TITLE}: the person wrote: "Use 8081"`

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

/** Waits until the Run that `session` started last has ended, and answers its history. */
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
        // The waiting session is still waiting: its card is listed and its call parked.
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
        // The note does not answer the card: the card is still pending and the call still parked.
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
        // The Ask resumed once with the answer of the card, never with the note.
        expect(toolResults(answered)).toEqual([ANSWER])
        expect(askOf(world)).toMatchObject({ phase: 'settled', terminal: 'completed' })
      })
    },
  )
})
