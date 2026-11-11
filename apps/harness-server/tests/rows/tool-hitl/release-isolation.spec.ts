// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 等人时的会话隔离与排队（切片 07，验收 C8）：
// - 一个会话的 Ask 在等人时，另一个会话照常跑完；答复之后等人的会话也跑完。
// - 等人期间向同一会话再送一条输入：它进入会话的输入队列，不被当作卡片的答复；答复卡片后 Ask 以卡片的答复
//   恢复一次，那条输入不出现在工具结果里。之后这个 Run 不会结束，所以这里不等它结束：Session 还没有实现
//   「续入」（把 Run 进行中受理的输入交给本 Run，session SPEC「实现现状」），而有未交入的输入时 Session 不让
//   Run 收场。见 Tool 运行时行的已知限制「Run 进行中受理的输入」。
// - 同一批里两个 Ask 调用（验收 C2、C5）：两张卡都列出，两个调用都停泊；只答一张时模型读不到任何结果，
//   两张都答了 Run 才继续并结束，两条结果按调用次序排列。
// 脚本按请求体选调用：只有带「start: ask」的会话会调 Ask，其余直接回文本。
// 同一租户的几个 Run 同时继续有已知限制（agent-host-local SPEC「运行失败」，R2-D256），所以等人的会话停在 Ask
// 上之后才开第二个会话，第二个会话跑完之后才答复。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
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
        // The answered call settles; the other one still waits, and the batch gives no result yet.
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
        // The card that is left is the approval; own words are no decision, and the Run goes on.
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
