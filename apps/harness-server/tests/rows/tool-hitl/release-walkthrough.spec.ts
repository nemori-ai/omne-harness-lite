// @module-tag slow
// 慢：本进程装发行树（真实 SQLite、真实 Tool 与 Agent 宿主、真实 Identity），每条命令起一个 `omne` 子进程，模型走
// 本进程的脚本网关。先构建 `apps/cli`。
// 手测说明 docs/guides/hitl-walkthrough.md 里的命令，照说明的次序用 `omne` 走一遍：
// - 出卡：`list-cards --session` 与 `list-cards`（待办池）看到同一张卡，`read-card` 读到它。
// - 答复：`submit-reply --option`、`--decline`；同一张卡再提交一次得到 `already-decided`。
// - 叫停：`read-session-diagnostics` 给出 Run 的标识，`cancel-run --urgency force` 之后卡片在
//   `list-cards --state invalidated` 里，迟到的 `submit-reply` 得到 `invalidated`。
// 说明里「等人时停服再重启」那一段由 release-restart.spec.ts 守，这里不重复。一次只让一个 Run 推进。
import { describe, expect, it } from 'vitest'
import type { HitlCardItem } from '@omne-harness/public-contract'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

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
    ],
  },
})
const options = {
  script: toolCallsThenText(() => [{ id: 'call_a', tool: 'Ask', arguments: ASK }]),
  permission: 'bypass-permissions',
}

type Listed = Readonly<{ outcome: string; body: { items: HitlCardItem[] } }>
type Replied = Readonly<{ outcome: string; body: { kind: string } }>

/** Runs one `omne` command that must exit 0 and answers the JSON object it printed. */
async function omne<T>(world: ReleaseTree, args: readonly string[]): Promise<T> {
  const ran = await world.cli(args)
  expect(ran.status, `${args.join(' ')}: ${ran.stderr}`).toBe(0)
  return JSON.parse(ran.stdout) as T
}

/** The cards of `session` in `state`, as `list-cards --session` prints them. */
const listed = async (world: ReleaseTree, session: string, state: string) =>
  (await omne<Listed>(world, ['list-cards', '--session', session, '--state', state])).body.items

/** Waits for the one pending card of `session`, as `list-cards --session` prints it. */
async function pendingCard(world: ReleaseTree, session: string): Promise<HitlCardItem> {
  const [item] = await pollUntil(
    'the pending card of the session',
    () => listed(world, session, 'pending'),
    items => items.length === 1,
  )
  if (item === undefined) throw new Error('no card')
  return item
}

/** The options of `submit-reply` that name `item`, with the revision the person saw. */
const naming = (item: HitlCardItem): string[] => [
  '--request',
  item.card.ref.request.requestId,
  '--card',
  item.card.ref.cardId,
  '--revision',
  item.card.revision,
]

const ended = (world: ReleaseTree, session: string) =>
  pollUntil(
    'the end of the Run of the session',
    () => historyOf(world, session),
    entries => entries.some(entry => entry.kind === 'run.terminal'),
  )

describe('the commands of the HITL walkthrough work on the release tree', () => {
  it(
    'lists a card at both entries, reads it, answers by option and by decline, tells a second reply it is decided, and tells a late reply after cancel-run it is invalidated',
    { timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree(options, async world => {
        // 一、出卡：the same card at the session entry and in the pool, and `read-card` reads it.
        const first = await world.startSession('walkthrough: answer by option')
        const card = await pendingCard(world, first)
        expect(card.origin).toMatchObject({ kind: 'tool', sessionRef: first })
        const pool = (await omne<Listed>(world, ['list-cards'])).body.items
        expect(pool.map(item => item.card.ref.cardId)).toContain(card.card.ref.cardId)
        const read = await omne<{ outcome: string; body: { item: HitlCardItem } }>(world, [
          'read-card',
          ...naming(card).slice(0, 4),
        ])
        expect(read).toMatchObject({ outcome: 'succeeded', body: { item: card } })

        // 二、答复：an option decides the card; the Agent goes on with one Ask result.
        const decided = await omne<Replied>(world, [
          'submit-reply',
          ...naming(card),
          '--option',
          'o2',
        ])
        expect(decided).toMatchObject({ outcome: 'succeeded', body: { kind: 'decided' } })
        const results = toolResults(await ended(world, first))
        expect(results).toHaveLength(1)
        expect(results[0]).toContain('3000')

        // 三、一张卡只有一个决定：another reply is told the card is decided already.
        const again = await omne<Replied>(world, [
          'submit-reply',
          ...naming(card),
          '--text',
          'Use 7000',
        ])
        expect(again).toMatchObject({ outcome: 'succeeded', body: { kind: 'already-decided' } })
        expect(toolResults(await historyOf(world, first))).toEqual(results)

        // 二、答复：a decline decides the card too, and the result says nothing was answered.
        const second = await world.startSession('walkthrough: decline')
        const declined = await omne<Replied>(world, [
          'submit-reply',
          ...naming(await pendingCard(world, second)),
          '--decline',
        ])
        expect(declined).toMatchObject({ outcome: 'succeeded', body: { kind: 'decided' } })
        const skipped = toolResults(await ended(world, second))
        expect(skipped).toHaveLength(1)
        expect(skipped[0]).toMatch(/did not answer/u)

        // 五、叫停：the diagnostics name the Run; after cancel-run the card is invalidated.
        const third = await world.startSession('walkthrough: cancel')
        const waiting = await pendingCard(world, third)
        const diagnostics = await world.cli(['read-session-diagnostics', '--session', third])
        expect(diagnostics.status, diagnostics.stderr).toBe(0)
        const run = /^Run (\S+) /mu.exec(diagnostics.stdout)?.[1]
        expect(run, diagnostics.stdout).toBeDefined()
        await omne(world, [
          'cancel-run',
          '--session',
          third,
          '--run',
          String(run),
          '--urgency',
          'force',
        ])
        const [closed] = await pollUntil(
          'the invalidated card',
          () => listed(world, third, 'invalidated'),
          items => items.length === 1,
        )
        expect(closed?.card.ref.cardId).toBe(waiting.card.ref.cardId)
        const late = await omne<Replied>(world, [
          'submit-reply',
          ...naming(waiting),
          '--text',
          'Too late',
        ])
        expect(late).toMatchObject({ outcome: 'succeeded', body: { kind: 'invalidated' } })
        await ended(world, third)
        await pollUntil(
          'the cancelled execution to end',
          async () => (await world.cli(['read-session-diagnostics', '--session', third])).stdout,
          text => text.includes('reason: no-failure cancelled'),
        )
      })
      expect(exit).toBe(0)
    },
  )
})
