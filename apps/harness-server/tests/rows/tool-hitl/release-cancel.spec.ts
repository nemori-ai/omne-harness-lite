// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 控制让暂停中的 Ask 收场，以及 HITL 回包丢失时的认回（切片 05 与 09，验收 C6）。
// 叫停、归档与中断单个调用共用一条级联（模型 InterruptCascade）。每条都核：Ask 调用以 interrupted 收场且执行仍是
// suspended（恢复段没有运行），等待以 cancelled 关闭，对 HITL 与队列的待办已清，队列条目已删除，停服退出码为 0。
// - 暂停位置叫停：卡片待答、条目停泊时 `cancel-run`。卡片失效，原因是 cancelled。失效的回包在这里被换成未知，
//   Tool 经 inspectOperation 按原失效认回，不再发第二次。
// - 排队位置叫停：答复已接受、条目 ready 时 `cancel-run`。卡片保持 decided，恢复段不运行，名额空出之后也不运行。
// - 归档：卡片待答时归档会话。卡片失效。
// - 迟到的答复：叫停之后经 HTTP 与 CLI 答这张卡，两者都被告知卡片已失效，历史里没有 Ask 的答案。
// 中断单个工具调用（`stop-call`）不在这里：公开入口对 Tool 目标一律答 unsupported，发行里走不到。它在 Tool 与 Agent
// 的契约测试里。归档那一条不核停服退出码，原因见该用例的注释。
// - 登记的回包丢失：真实登记之后回包换成未知，Tool 经 inspectOperation 认回原登记，不再登记，只有一张卡。答复之后调用
//   恢复一次并收场。
// 恢复前（starting）位置在 Tool 的契约测试里（suspended-control.spec.ts），发行树上不造。同一租户的几个 Run 同时继续
// 有已知限制（agent-host-local SPEC「运行失败」，R2-D256），所以每条只让一个 Run 推进。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { HitlCardItem, HitlReplyResult } from '@omne-harness/public-contract'
import { fail } from '@omne-harness/operation-result'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  answerCard,
  hitlPublic,
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolLedger,
  toolResults,
  type ReleaseTree,
  type ToolCallLedger,
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
/** A Shell call that ends only when the file `go-b` is in the workspace. */
const WAIT_FOR_B = JSON.stringify({
  command: 'execute',
  params: { script: 'while [ ! -f go-b ]; do sleep 0.1; done; echo go-b-done' },
})
/** `start: ask and wait` calls Ask and a Shell that waits for `go-b`; any other input calls Ask. */
const options = {
  script: toolCallsThenText(body =>
    body.includes('start: ask and wait')
      ? [
          { id: 'call_a', tool: 'Ask', arguments: ASK },
          { id: 'call_b', tool: 'Shell', arguments: WAIT_FOR_B },
        ]
      : [{ id: 'call_a', tool: 'Ask', arguments: ASK }],
  ),
  permission: 'bypass-permissions',
}

const askOf = (world: ReleaseTree) => toolLedger(world.storageRoot).find(row => row.tool === 'Ask')
const stageOf = (world: ReleaseTree, tool: string) =>
  toolCalls(world.storageRoot).find(row => row.tool === tool)?.entry?.stage

/** The cards of `session` in any state, read by the registering principal in process. */
const cardsOf = (world: ReleaseTree, session: string) =>
  world.cards({ sessionRef: session, states: ['pending', 'decided', 'invalidated'] })

/** The duties that the Ask still owes to HITL or to the queue (the clock duty is not one of them). */
const owed = (tasks: readonly string[]) =>
  tasks.filter(task => task.startsWith('wait-registration') || task === 'queue')

/** Waits until the Ask of `session` is suspended with its card pending and its entry parked. */
async function suspended(world: ReleaseTree, session: string): Promise<void> {
  await pollUntil(
    'the card',
    () => world.cards({ sessionRef: session }),
    c => c.length === 1,
  )
  await pollUntil(
    'the parked Ask',
    () => askOf(world),
    ask => ask?.phase === 'suspended' && stageOf(world, 'Ask') === 'parked',
  )
}

/** Cancels the Run of `session` through the CLI. */
async function cancelRun(world: ReleaseTree, session: string): Promise<void> {
  const started = (await historyOf(world, session)).find(entry => entry.kind === 'run.started')
  const cancelled = await world.cli([
    'cancel-run',
    '--session',
    session,
    '--run',
    String(started?.payload['run']),
    '--urgency',
    'force',
  ])
  expect(cancelled.status, cancelled.stderr).toBe(0)
}

/**
 * Waits until the Ask closed after a control: settled and released, with no duty to HITL or to the
 * queue left, and every queue entry gone. Answers the Ask and what the Tool calls look like then.
 */
async function closed(world: ReleaseTree) {
  const ask = await pollUntil(
    'the Ask to close',
    () => askOf(world),
    row => row?.phase === 'settled' && row.released && owed(row.tasks).length === 0,
  )
  const calls = await pollUntil(
    'the entries to go',
    () => toolCalls(world.storageRoot),
    rows => rows.every(row => row.entry === null),
  )
  if (ask === undefined) throw new Error('no Ask call')
  return { ask, calls }
}

/**
 * Waits until the Agent ended the cancelled execution of `session`. The Run is terminal in Session
 * from the cancel on; the execution winds down after its calls settled, and a stop of the service
 * before that leaves it unresolved.
 */
async function ended(world: ReleaseTree, session: string): Promise<void> {
  await pollUntil(
    'the cancelled execution to end',
    async () => (await world.cli(['read-session-diagnostics', '--session', session])).stdout,
    text => text.includes('reason: no-failure cancelled'),
  )
}

/** What a control leaves of a suspended Ask: interrupted, never resumed, its wait cancelled. */
const STOPPED_ASK: Partial<ToolCallLedger> = {
  phase: 'settled',
  terminal: 'interrupted',
  execution: 'suspended',
  waits: [{ phase: 'closed', cause: 'cancelled' }],
  released: true,
}

describe('a control ends a suspended Ask on the release tree (C6)', () => {
  it(
    'cancel-run while the card waits: the card is closed as cancelled, the call settles interrupted, the entry goes, and a lost invalidation answer is recalled',
    { timeout: 300_000 },
    async () => {
      const invalidations: unknown[] = []
      const recalls: unknown[] = []
      const exit = await onReleaseTree(options, async world => {
        // The invalidation commits in HITL, and its answer is lost on the way back to Tool.
        const real = world.hitl.bridge
        if (real === null) throw new Error('no decision owner')
        const lossy: ToolDecisionBridge<unknown> = {
          ...real,
          async invalidate(input) {
            invalidations.push(await real.invalidate(input))
            return fail({ kind: 'commit-unknown', operation: input.operation })
          },
          async inspectOperation(input) {
            const recalled = await real.inspectOperation(input)
            recalls.push(recalled)
            return recalled
          },
        }
        world.hitl.bridge = lossy

        const session = await world.startSession('start: ask')
        await suspended(world, session)
        await cancelRun(world, session)
        const { ask } = await closed(world)

        expect(ask).toMatchObject(STOPPED_ASK)
        const cards = await cardsOf(world, session)
        expect(cards.map(item => item.card)).toMatchObject([
          { kind: 'invalidated', reason: 'cancelled' },
        ])
        const entries = await historyOf(world, session)
        expect(entries.some(entry => entry.kind === 'run.terminal')).toBe(true)
        // HITL invalidated the registration once. Tool recalled that very invalidation: the
        // receipt of the recall is the receipt that the lost answer carried.
        expect(invalidations).toHaveLength(1)
        expect(invalidations[0]).toMatchObject({ ok: { record: expect.any(String) } })
        const receipt = (invalidations[0] as { ok: unknown }).ok
        expect(recalls).toEqual([
          { ok: { kind: 'committed', operation: expect.any(String), receipt } },
        ])
        await ended(world, session)
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'cancel-run after the answer was accepted and while the entry is ready: the card stays decided and the resume never runs',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const session = await world.startSession('start: ask and wait')
        // The one slot of the run: the Shell holds it while the Ask is parked.
        await pollUntil(
          'Ask parked and Shell held',
          () => [stageOf(world, 'Ask'), stageOf(world, 'Shell')],
          stages => stages[0] === 'parked' && stages[1] === 'held',
        )
        await answerCard(world, session, 'Use 8081')
        // Answered, the Ask is queued again behind the Shell.
        await pollUntil(
          'the Ask ready',
          () => stageOf(world, 'Ask'),
          stage => stage === 'ready',
        )
        expect(stageOf(world, 'Shell')).toBe('held')
        await cancelRun(world, session)
        // `cancel-run` answers once Session took the control; the Agent stops the calls later. A
        // control and a resume both write the call record, and the record takes the first one
        // (model InterruptCascade). The slot is given back after the control settled the Ask.
        await pollUntil(
          'the control to settle the Ask',
          () => askOf(world),
          row => row?.phase === 'settled',
        )
        // The slot comes free even when the stop does not end the Shell; the Ask still does not resume.
        writeFileSync(join(dirname(world.storageRoot), 'workspace', 'go-b'), '')
        const { ask, calls } = await closed(world)

        expect(ask).toMatchObject(STOPPED_ASK)
        expect(calls.map(row => [row.tool, row.phase])).toEqual([
          ['Ask', 'settled'],
          ['Shell', 'settled'],
        ])
        const cards = await cardsOf(world, session)
        expect(cards.map(item => item.card.kind)).toEqual(['decided'])
        // The model never received the answer: no tool result carries it.
        const entries = await historyOf(world, session)
        expect(toolResults(entries).filter(text => text.includes('Use 8081'))).toEqual([])
        await ended(world, session)
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'archiving the session while the card waits: the card is closed as cancelled and the call settles interrupted',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const session = await world.startSession('start: ask')
        await suspended(world, session)
        expect(await world.archive(session)).toMatchObject({ ok: expect.anything() })
        const { ask } = await closed(world)

        expect(ask).toMatchObject(STOPPED_ASK)
        const cards = await cardsOf(world, session)
        expect(cards.map(item => item.card)).toMatchObject([
          { kind: 'invalidated', reason: 'cancelled' },
        ])
      })
      // The exit code is not checked here: on an archived session the Agent cannot commit the end
      // of the cancelled execution, so the stop finds it unresolved. See docs/rows/tool-runtime.md.
      expect([0, 5]).toContain(exit)
    },
  )

  it(
    'a reply after cancel-run, through HTTP and through the CLI, is told the card is invalidated, and the history has no answer',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const session = await world.startSession('start: ask')
        await suspended(world, session)
        const [pending] = await world.cards({ sessionRef: session })
        if (pending === undefined) throw new Error('no card')
        await cancelRun(world, session)
        const { ask } = await closed(world)
        expect(ask).toMatchObject(STOPPED_ASK)
        await pollUntil(
          'the card to be invalidated',
          () => cardsOf(world, session),
          cards => cards[0]?.card.kind === 'invalidated',
        )

        // The person answers the card as it was listed before the cancellation.
        const tenant = tenantCodec.parse(savedTenant(world.home))
        if (!tenant.ok) throw new Error('the saved tenant does not parse')
        const viaHttp = await hitlPublic(world.port, {
          protocolVersion: 'hitl-public/1',
          messageId: 'm-late',
          operation: 'submit-reply',
          proof: { kind: 'present', value: savedLoginProof(world.home) },
          body: {
            tenant: tenant.value,
            card: pending.card.ref as HitlCardItem['card']['ref'],
            expectedRevision: pending.card.revision,
            reply: { kind: 'selection', optionId: 'o1' },
            replyId: 'late-http',
          },
        })
        expect(viaHttp.status).toBe(200)
        expect(viaHttp.response).toMatchObject({
          outcome: 'succeeded',
          body: { kind: 'invalidated' } satisfies Pick<HitlReplyResult, 'kind'>,
        })
        const viaCli = await world.cli([
          'submit-reply',
          '--request',
          pending.card.ref.request.requestId,
          '--card',
          pending.card.ref.cardId,
          '--revision',
          pending.card.revision,
          '--text',
          'Use 8081',
          '--reply-id',
          'late-cli',
        ])
        expect(viaCli.status, viaCli.stderr).toBe(0)
        expect(JSON.parse(viaCli.stdout)).toMatchObject({
          outcome: 'succeeded',
          body: { kind: 'invalidated' },
        })

        expect((await cardsOf(world, session)).map(item => item.card.kind)).toEqual(['invalidated'])
        const entries = await historyOf(world, session)
        // No answer reached the history: no tool result names the option or the words.
        expect(
          toolResults(entries).filter(text => text.includes('selected') || text.includes('8081')),
        ).toEqual([])
        await ended(world, session)
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'cancel-run answers the open Ask in the history, and the next input of the session is answered',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        const session = await world.startSession('start: ask')
        await suspended(world, session)
        await cancelRun(world, session)
        await closed(world)
        await ended(world, session)

        // The commit that ended the Run wrote the tool message of the Ask before the terminal.
        const cancelled = await historyOf(world, session)
        expect(toolResults(cancelled)).toEqual([
          'No result of this call is in the conversation: the run was cancelled before the call returned. The tool was asked to stop. It may have had effects before it stopped. Do not assume that the call completed or was approved.',
        ])
        const kinds = cancelled.map(entry => entry.kind)
        expect(kinds.indexOf('message.tool')).toBeLessThan(kinds.indexOf('run.terminal'))

        // The history is whole, so the model request of the next Run is taken.
        const sent = await world.cli(['send-input', '--session', session, '--text', 'go on'])
        expect(sent.status, sent.stderr).toBe(0)
        const after = await pollUntil(
          'the next Run to end',
          () => historyOf(world, session),
          entries => entries.filter(entry => entry.kind === 'run.terminal').length === 2,
        )
        expect(
          after
            .filter(entry => entry.kind === 'run.terminal')
            .map(entry => (entry.payload['terminal'] as { outcome: string }).outcome),
        ).toEqual(['cancelled', 'completed'])
        expect(after.at(-2)).toMatchObject({ kind: 'message.assistant' })
      })
      expect(exit).toBe(0)
    },
  )
})

describe('a lost answer of HITL on the release tree is recalled by the original operation (C6)', () => {
  it(
    'a registration whose answer was lost is recalled through inspectOperation: one registration, one card, and the answer resumes the call',
    { timeout: 300_000 },
    async () => {
      const ensured: unknown[] = []
      const recalls: unknown[] = []
      const exit = await onReleaseTree(options, async world => {
        // The registration commits in HITL, and its answer is lost on the way back to Tool.
        const real = world.hitl.bridge
        if (real === null) throw new Error('no decision owner')
        const lossy: ToolDecisionBridge<unknown> = {
          ...real,
          async ensure(input) {
            ensured.push(await real.ensure(input))
            return fail({ kind: 'commit-unknown', operation: input.operation })
          },
          async inspectOperation(input) {
            const recalled = await real.inspectOperation(input)
            recalls.push(recalled)
            return recalled
          },
        }
        world.hitl.bridge = lossy

        const session = await world.startSession('start: ask')
        await pollUntil(
          'the card',
          () => world.cards({ sessionRef: session }),
          c => c.length === 1,
        )
        await pollUntil(
          'the parked Ask',
          () => askOf(world),
          ask => ask?.phase === 'suspended' && stageOf(world, 'Ask') === 'parked',
        )
        // One registration in HITL, recalled with the evidence that the lost answer carried.
        expect(ensured).toHaveLength(1)
        const receipt = (ensured[0] as { ok: unknown }).ok
        expect(receipt).toMatchObject({ record: expect.stringMatching(/^hitl-request\//) })
        expect(recalls).toEqual([
          { ok: { kind: 'committed', operation: expect.any(String), receipt } },
        ])
        expect(await cardsOf(world, session)).toHaveLength(1)

        await answerCard(world, session, 'Use 8081')
        const ask = await pollUntil(
          'the Ask to settle',
          () => askOf(world),
          row => row?.phase === 'settled' && row.released && owed(row.tasks).length === 0,
        )
        expect(ask).toMatchObject({ phase: 'settled', terminal: 'completed', released: true })
        const entries = await pollUntil(
          'the Run to end',
          () => historyOf(world, session),
          seen => seen.some(entry => entry.kind === 'run.terminal'),
        )
        expect(toolResults(entries)).toEqual([`Q1 ${TITLE}: the person wrote: "Use 8081"`])
        expect(toolCalls(world.storageRoot).every(row => row.entry === null)).toBe(true)
        const cards = await cardsOf(world, session)
        expect(cards.map(item => item.card.kind)).toEqual(['decided'])
        // Still one registration: the recall did not register again.
        expect(ensured).toHaveLength(1)
      })
      expect(exit).toBe(0)
    },
  )
})
