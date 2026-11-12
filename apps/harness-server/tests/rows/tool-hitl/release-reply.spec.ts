// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// Ask 在发行树上答复与恢复（切片 03，验收 C3、C4）。模型调用 Ask 暂停出卡，人经真实 HTTP 的 `/hitl-public/1` 列卡并
// `submit-reply`，Tool 接受决定、从检查点恢复一次，Ask 的结果文字回到原动作槽位，模型再走一轮，Run 完成。
// - 从会话入口（`list-cards` 带 `sessionRef`）和从待办池（不带）各答一次：两个会话的继续路径与历史相同，各只有一条
//   Ask 工具结果。
// - 选项、自由作答与跳过在 question 与 approval 上的结果文字与 tool-definitions SPEC「段」一致。
// - 两个入口并发提交同一张卡：只有一方成立，另一方得到 already-decided 与成立的那个决定；原调用只恢复一次。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
import { setTimeout as sleep } from 'node:timers/promises'
import type { PoolItem } from '@omne-harness/human-intervention'
import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { HitlCardItem, HitlReply, HitlReplyResult } from '@omne-harness/public-contract'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import {
  hitlPublic,
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
  type HitlExchange,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const question = (title: string) => ({
  title,
  description: `About: ${title}`,
  options: [
    { label: '8081 (Recommended)', description: 'The next free port.' },
    { label: '3000', description: 'The default port of the framework.' },
  ],
})
const ask = (...titles: string[]) =>
  JSON.stringify({ command: 'ask', params: { questions: titles.map(question) } })
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

/**
 * The model calls Ask once per session: `request_approval` when the user input names `approval`,
 * three questions when it names `three`, else one question. The tool result ends the turn with
 * `done`. Every request body is kept, so a scenario counts what the model received.
 */
function recordedScript(): Readonly<{ script: GatewayScript; bodies: string[] }> {
  const bodies: string[] = []
  const answer = toolCallsThenText(body => [
    body.includes('start: approval')
      ? { id: 'call_approval', tool: 'Ask', arguments: APPROVAL }
      : body.includes('start: three')
        ? {
            id: 'call_three',
            tool: 'Ask',
            arguments: ask('Which port?', 'Which host?', 'Which protocol?'),
          }
        : { id: 'call_one', tool: 'Ask', arguments: ask('Which port should the dev server use?') },
  ])
  return {
    bodies,
    script: request => {
      bodies.push(request.body)
      return answer(request)
    },
  }
}

const tenantOf = (text: string): TenantId => {
  const parsed = tenantCodec.parse(text)
  if (!parsed.ok) throw new Error('the saved tenant does not parse')
  return parsed.value
}
const proofOf = (world: ReleaseTree) =>
  ({ kind: 'present', value: savedLoginProof(world.home) }) as const

function itemsOf(exchange: HitlExchange): readonly HitlCardItem[] {
  const response = exchange.response
  if (response?.outcome !== 'succeeded') return []
  return (response.body as { items: readonly HitlCardItem[] }).items
}

/** Lists cards through the public location: the session entry with `session`, else the pool. */
function listing(
  world: ReleaseTree,
  states: readonly ('pending' | 'decided')[],
  session?: string,
): Promise<HitlExchange> {
  return hitlPublic(world.port, {
    protocolVersion: 'hitl-public/1',
    messageId: 'm-list',
    operation: 'list-cards',
    proof: proofOf(world),
    body: {
      tenant: tenantOf(savedTenant(world.home)),
      filter: { states: [...states], ...(session === undefined ? {} : { sessionRef: session }) },
      cursor: null,
      limit: 50,
    },
  })
}

/**
 * The pending cards of `session`: through the session entry, or picked from the pool by their
 * origin, as a person sees them there. Waits until `count` cards are there.
 */
async function pending(
  world: ReleaseTree,
  session: string,
  entry: 'session' | 'pool',
  count: number,
): Promise<readonly HitlCardItem[]> {
  let items: readonly HitlCardItem[] = []
  for (const end = Date.now() + 120_000; Date.now() < end; await sleep(250)) {
    const listed = itemsOf(
      await listing(world, ['pending'], entry === 'session' ? session : undefined),
    )
    items = listed.filter(item => item.origin.sessionRef === session)
    if (items.length >= count) return items
  }
  throw new Error(
    `the ${String(count)} cards of the session did not come: ${JSON.stringify(items)}`,
  )
}

type Submitted = Readonly<{ status: number; outcome?: string; body?: HitlReplyResult }>

/** One `submit-reply` through the public location. */
async function submit(
  world: ReleaseTree,
  item: HitlCardItem,
  reply: HitlReply,
  replyId: string,
): Promise<Submitted> {
  const answer = await hitlPublic(world.port, {
    protocolVersion: 'hitl-public/1',
    messageId: `m-${replyId}`,
    operation: 'submit-reply',
    proof: proofOf(world),
    body: {
      tenant: tenantOf(savedTenant(world.home)),
      card: item.card.ref,
      expectedRevision: item.card.revision,
      reply,
      replyId,
    },
  })
  return {
    status: answer.status,
    ...(answer.response === undefined
      ? {}
      : { outcome: answer.response.outcome, body: answer.response.body as HitlReplyResult }),
  }
}

/** The history of `session` once its Run has ended. */
const settled = (world: ReleaseTree, session: string) =>
  pollUntil(
    'the end of the Run of the session',
    () => historyOf(world, session),
    entries => entries.some(entry => entry.kind === 'run.terminal'),
  )

/** The cards of `session` in any state, read by the registering principal in process. */
async function cardsOf(world: ReleaseTree, session: string): Promise<readonly PoolItem[]> {
  return world.cards({ sessionRef: session, states: ['pending', 'decided', 'invalidated'] })
}

/** What one session shows after its Ask was answered: the history and the model requests. */
async function outcomeOf(
  world: ReleaseTree,
  bodies: readonly string[],
  session: string,
  input: string,
) {
  const entries = await settled(world, session)
  return {
    kinds: entries.map(entry => entry.kind),
    results: toolResults(entries),
    // The model requests of this session that carry a tool result: one per resume.
    continued: bodies.filter(body => body.includes(input) && body.includes('"role":"tool"')).length,
  }
}

const ONE = 'Which port should the dev server use?'
const ACTION = 'Delete the build directory'

describe('a person answers an Ask on the release tree and the call resumes once (C3, C4)', () => {
  it(
    'an answer from the session entry and one from the pool resume their calls the same way, once each',
    { timeout: 300_000 },
    async () => {
      const { script, bodies } = recordedScript()
      const exit = await onReleaseTree(
        { script, permission: 'bypass-permissions' },
        async world => {
          const bySession = await world.startSession('start: one by session')
          const byPool = await world.startSession('start: one by pool')
          const [first] = await pending(world, bySession, 'session', 1)
          const [second] = await pending(world, byPool, 'pool', 1)
          // The same card is in both entries, in the same projection.
          expect(itemsOf(await listing(world, ['pending']))).toContainEqual(first)
          for (const [item, replyId, session] of [
            [first, 'reply-session', bySession],
            [second, 'reply-pool', byPool],
          ] as const) {
            const answered = await submit(
              world,
              item!,
              { kind: 'selection', optionId: 'o1' },
              replyId,
            )
            expect(answered).toMatchObject({
              status: 200,
              outcome: 'succeeded',
              body: { kind: 'decided', decisionRef: { card: item!.card.ref } },
            })
            // 一个 Run 结束再答下一个，理由同下一条用例。
            await settled(world, session)
          }
          const one = await outcomeOf(world, bodies, bySession, 'start: one by session')
          const other = await outcomeOf(world, bodies, byPool, 'start: one by pool')
          // The result of the Ask is the text of the original action slot, once; the model went on.
          expect(one.results).toEqual([`Q1 ${ONE}: selected "8081 (Recommended)"`])
          expect(one.kinds).toEqual([
            'message.user',
            'run.started',
            'message.assistant',
            'message.tool',
            'message.assistant',
            'run.terminal',
          ])
          expect(one.continued).toBe(1)
          // The entry does not change the way on: the same history, the same result.
          expect(other).toEqual(one)
          // Each card holds its one decision, and the call took it over.
          for (const session of [bySession, byPool])
            expect(
              (await cardsOf(world, session)).map(item => [
                item.card.kind,
                'delivery' in item.card && item.card.delivery.kind,
              ]),
            ).toEqual([['decided', 'accepted']])
        },
      )
      expect(exit).toBe(0)
    },
  )

  it(
    'an option, own words and a skip give the result texts of the spec on question and approval cards',
    { timeout: 300_000 },
    async () => {
      const { script, bodies } = recordedScript()
      const exit = await onReleaseTree(
        { script, permission: 'bypass-permissions' },
        async world => {
          const cases: readonly Readonly<{
            input: string
            replies: readonly HitlReply[]
            result: string
          }>[] = [
            {
              input: 'start: three mixed',
              replies: [
                { kind: 'selection', optionId: 'o2' },
                { kind: 'text', text: 'Only "localhost", please' },
                { kind: 'decline' },
              ],
              result: [
                'Q1 Which port?: selected "3000"',
                'Q2 Which host?: the person wrote: "Only \\"localhost\\", please"',
                'Q3 Which protocol?: no answer (the person skipped this question)',
              ].join('\n'),
            },
            {
              input: 'start: three skipped',
              replies: [{ kind: 'decline' }, { kind: 'decline' }, { kind: 'decline' }],
              result: 'The person did not answer any question.',
            },
            {
              input: 'start: approval approved',
              replies: [{ kind: 'selection', optionId: 'approve' }],
              result: `Approved: ${ACTION}`,
            },
            {
              input: 'start: approval rejected',
              replies: [{ kind: 'selection', optionId: 'reject' }],
              result: `Not approved: ${ACTION}`,
            },
            {
              input: 'start: approval words',
              replies: [{ kind: 'text', text: 'Only after the release' }],
              result:
                'No decision. The person wrote: "Only after the release". This is not permission.',
            },
            {
              input: 'start: approval skipped',
              replies: [{ kind: 'decline' }],
              result: 'No decision: the person did not approve or reject. This is not permission.',
            },
          ]
          const sessions: string[] = []
          for (const item of cases) sessions.push(await world.startSession(item.input))
          for (const [at, item] of cases.entries()) {
            const session = sessions[at]!
            const cards = await pending(world, session, 'session', item.replies.length)
            for (const [index, card] of cards.entries()) {
              const answered = await submit(
                world,
                card,
                item.replies[index]!,
                `${session}-${String(index)}`,
              )
              expect(answered.outcome, JSON.stringify(answered)).toBe('succeeded')
            }
            // 等这个会话的 Run 结束再答下一个。同一租户的几个 Run 同时继续，会撞上 Agent、agent-context 与模型
            // 发行份额的已知限制（agent-host-local SPEC「运行失败」，R2-D256），那不是本场景要核的事。
            await settled(world, session)
          }
          for (const [at, item] of cases.entries()) {
            const seen = await outcomeOf(world, bodies, sessions[at]!, item.input)
            expect(seen.results, item.input).toEqual([item.result])
            expect(seen.continued, item.input).toBe(1)
            expect(seen.kinds.at(-1), item.input).toBe('run.terminal')
          }
        },
      )
      expect(exit).toBe(0)
    },
  )

  it(
    'two entries that submit the same card at once: one decision holds, the other is told it, and the call resumes once',
    { timeout: 300_000 },
    async () => {
      const { script, bodies } = recordedScript()
      const exit = await onReleaseTree(
        { script, permission: 'bypass-permissions' },
        async world => {
          const session = await world.startSession('start: one raced')
          const [viaSession] = await pending(world, session, 'session', 1)
          const [viaPool] = await pending(world, session, 'pool', 1)
          expect(viaPool).toEqual(viaSession)
          const answers = await Promise.all([
            submit(world, viaSession!, { kind: 'selection', optionId: 'o1' }, 'race-session'),
            submit(world, viaPool!, { kind: 'selection', optionId: 'o2' }, 'race-pool'),
          ])
          for (const answer of answers)
            expect(answer).toMatchObject({ status: 200, outcome: 'succeeded' })
          const decided = answers.filter(answer => answer.body?.kind === 'decided')
          const told = answers.filter(answer => answer.body?.kind === 'already-decided')
          expect([decided.length, told.length]).toEqual([1, 1])
          const winner = decided[0]!.body as Extract<HitlReplyResult, { kind: 'decided' }>
          const loser = told[0]!.body as Extract<HitlReplyResult, { kind: 'already-decided' }>
          // The other entry is told the decision that holds.
          expect(loser.decision.ref).toEqual(winner.decisionRef)
          const option =
            loser.decision.reply.kind === 'selection' ? loser.decision.reply.optionId : ''
          const label = option === 'o1' ? '8081 (Recommended)' : '3000'
          const seen = await outcomeOf(world, bodies, session, 'start: one raced')
          expect(seen.results).toEqual([`Q1 ${ONE}: selected "${label}"`])
          expect(seen.continued).toBe(1)
          const cards = await cardsOf(world, session)
          expect(cards).toHaveLength(1)
          expect(cards[0]?.card).toMatchObject({
            kind: 'decided',
            decision: { ref: winner.decisionRef },
          })
        },
      )
      expect(exit).toBe(0)
    },
  )

  it(
    'the CLI lists the cards of a session, reads one and answers it, and the call resumes',
    { timeout: 300_000 },
    async () => {
      const { script, bodies } = recordedScript()
      const exit = await onReleaseTree(
        { script, permission: 'bypass-permissions' },
        async world => {
          const session = await world.startSession('start: one by cli')
          await pending(world, session, 'session', 1)
          const listed = await world.cli(['list-cards', '--session', session])
          expect(listed.status, listed.stderr).toBe(0)
          const page = JSON.parse(listed.stdout) as {
            outcome: string
            body: { items: HitlCardItem[] }
            request: { tenant: string }
          }
          expect(page.outcome).toBe('succeeded')
          expect(page.request.tenant).toBe(savedTenant(world.home))
          const [item] = page.body.items
          expect(item?.origin).toMatchObject({ kind: 'tool', sessionRef: session })
          const ref = [
            '--request',
            item!.card.ref.request.requestId,
            '--card',
            item!.card.ref.cardId,
          ]
          const read = await world.cli(['read-card', ...ref])
          expect(read.status, read.stderr).toBe(0)
          expect(JSON.parse(read.stdout)).toMatchObject({ outcome: 'succeeded', body: { item } })
          const answered = await world.cli([
            'submit-reply',
            ...ref,
            '--revision',
            item!.card.revision,
            '--text',
            'Use 9000',
            '--reply-id',
            'cli-reply-1',
          ])
          expect(answered.status, answered.stderr).toBe(0)
          expect(JSON.parse(answered.stdout)).toMatchObject({
            outcome: 'succeeded',
            body: { kind: 'decided' },
            request: { replyId: 'cli-reply-1' },
          })
          // The same reply id again recalls the original submission.
          const again = await world.cli([
            'submit-reply',
            ...ref,
            '--revision',
            item!.card.revision,
            '--text',
            'Use 9000',
            '--reply-id',
            'cli-reply-1',
          ])
          expect(JSON.parse(again.stdout).body).toEqual(JSON.parse(answered.stdout).body)
          const seen = await outcomeOf(world, bodies, session, 'start: one by cli')
          expect(seen.results).toEqual([`Q1 ${ONE}: the person wrote: "Use 9000"`])
          expect(seen.continued).toBe(1)
        },
      )
      expect(exit).toBe(0)
    },
  )
})
