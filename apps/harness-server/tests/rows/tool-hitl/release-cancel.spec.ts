// @module-tag slow
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
const WAIT_FOR_B = JSON.stringify({
  command: 'execute',
  params: { script: 'while [ ! -f go-b ]; do sleep 0.1; done; echo go-b-done' },
})
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

const cardsOf = (world: ReleaseTree, session: string) =>
  world.cards({ sessionRef: session, states: ['pending', 'decided', 'invalidated'] })

const owed = (tasks: readonly string[]) =>
  tasks.filter(task => task.startsWith('wait-registration') || task === 'queue')

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

async function ended(world: ReleaseTree, session: string): Promise<void> {
  await pollUntil(
    'the cancelled execution to end',
    async () => (await world.cli(['read-session-diagnostics', '--session', session])).stdout,
    text => text.includes('reason: no-failure cancelled'),
  )
}

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
        await pollUntil(
          'Ask parked and Shell held',
          () => [stageOf(world, 'Ask'), stageOf(world, 'Shell')],
          stages => stages[0] === 'parked' && stages[1] === 'held',
        )
        await answerCard(world, session, 'Use 8081')
        await pollUntil(
          'the Ask ready',
          () => stageOf(world, 'Ask'),
          stage => stage === 'ready',
        )
        expect(stageOf(world, 'Shell')).toBe('held')
        await cancelRun(world, session)
        await pollUntil(
          'the control to settle the Ask',
          () => askOf(world),
          row => row?.phase === 'settled',
        )
        writeFileSync(join(dirname(world.storageRoot), 'workspace', 'go-b'), '')
        const { ask, calls } = await closed(world)

        expect(ask).toMatchObject(STOPPED_ASK)
        expect(calls.map(row => [row.tool, row.phase])).toEqual([
          ['Ask', 'settled'],
          ['Shell', 'settled'],
        ])
        const cards = await cardsOf(world, session)
        expect(cards.map(item => item.card.kind)).toEqual(['decided'])
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

        const cancelled = await historyOf(world, session)
        expect(toolResults(cancelled)).toEqual([
          'No result of this call is in the conversation: the run was cancelled before the call returned. The tool was asked to stop. It may have had effects before it stopped. Do not assume that the call completed or was approved.',
        ])
        const kinds = cancelled.map(entry => entry.kind)
        expect(kinds.indexOf('message.tool')).toBeLessThan(kinds.indexOf('run.terminal'))

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
        expect(ensured).toHaveLength(1)
      })
      expect(exit).toBe(0)
    },
  )
})
