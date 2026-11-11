// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 暂停中的 Ask 在发行树上的故障注入（切片 05，验收 C6）。
// - 登记的回包丢失：真实登记之后回包换成未知，Tool 经 inspectOperation 认回原登记，不再登记，只有一张卡。答复之后调用
//   恢复一次并收场，条目删除，Run 结束，停服退出码为 0。
// 叫停（`cancel-run`）与归档的场景不在本文件：在发行树上，Session 结束 Run 之后 Agent 的推进在 E2 以 stale-advance 停下，
// 不向 Tool 发 stop，暂停中的 Ask 不收场。见 docs/rows/tool-runtime.md「具名缺件与已知限制」。
// 同一租户的几个 Run 同时继续有已知限制（agent-host-local SPEC「运行失败」，R2-D256），所以只让一个 Run 推进。
// 发行的 `coding` 定义在本文件里跳过权限询问（与 release-ask 相同），只为不让询问策略挡住调用。
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
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
  script: toolCallsThenText(() => [{ id: 'call_a', tool: 'Ask', arguments: ASK }]),
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
