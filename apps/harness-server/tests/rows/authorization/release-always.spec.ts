// @module-tag slow
// The two lasting answers that change the tenant's setting of the tool: for every session, from now on.
import { expect, it } from 'vitest'
import { SHELL, faceOf } from '../../governance/tenant-settings-support.ts'
import { loginAccess } from '../../model/public-stream-support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  ONCE,
  answerCard,
  endedRuns,
  pendingCard,
  perMessageShell,
  sendInput,
} from './release-flow-support.ts'

const PROHIBITED =
  'The tool call did not run: the person prohibited this capability, so later calls to it are denied too.'
const options = {
  script: perMessageShell,
  permission: 'auto_permission',
  extraHistoryKinds: [ONCE],
}

async function shellSetting(tree: ReleaseTree) {
  const { principal, tenant } = await loginAccess(tree)
  const read = await faceOf(tree).describe({ principal, tenant, owner: SHELL, item: 'run' })
  if (read.kind !== 'described' || read.item.kind !== 'permission')
    throw new Error(JSON.stringify(read))
  return read.item.own
}

const offeredOn = (card: Awaited<ReturnType<typeof pendingCard>>) =>
  'options' in card.question
    ? card.question.options.flatMap(option =>
        'offered' in option && option.offered ? [option.id] : [],
      )
    : []
// The ledger lets go of a call after its result was taken, so a late count is an upper bound.
const shellStarts = (tree: ReleaseTree) =>
  toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell').length

it(
  'always allow sets the tool to automatic for the tenant: this call runs and another session asks no one',
  { timeout: 240_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const session = await tree.startSession('start: echo always')
      const card = await pendingCard(tree, session, 'always')
      expect(offeredOn(card)).toEqual([
        'deny-once',
        'allow-once',
        'allow-session',
        'allow-always',
        'deny-always',
      ])
      await answerCard(tree, card, ['--option', 'allow-always'], 'reply-always')
      const first = await endedRuns(tree, session, 1)
      expect(toolResults(first).join('\n')).toContain('always-done')
      expect(await shellSetting(tree)).toBe('auto')
      expect(first.filter(entry => entry.kind === ONCE)).toEqual([])

      const other = await tree.startSession('start: echo other')
      const ended = await endedRuns(tree, other, 1)
      expect(toolResults(ended).join('\n')).toContain('other-done')
      expect(await tree.cards({ sessionRef: other, states: ['pending'] })).toEqual([])
    })
    expect(exit).toBe(0)
  },
)

it(
  'always deny sets the tool to prohibited for the tenant: no session starts it or asks, and an earlier release for the session no longer counts',
  { timeout: 300_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const released = await tree.startSession('start: echo kept')
      const kept = await pendingCard(tree, released, 'kept')
      await answerCard(tree, kept, ['--option', 'allow-session'], 'reply-kept')
      await endedRuns(tree, released, 1)
      expect(shellStarts(tree)).toBeLessThanOrEqual(1)

      const session = await tree.startSession('start: echo never')
      const card = await pendingCard(tree, session, 'never')
      await answerCard(tree, card, ['--option', 'deny-always'], 'reply-never')
      const first = await endedRuns(tree, session, 1)
      expect(toolResults(first).join('\n')).toBe(PROHIBITED)
      expect(await shellSetting(tree)).toBe('deny')

      await sendInput(tree, released, 'start: echo later')
      const later = await endedRuns(tree, released, 2)
      expect(toolResults(later).join('\n')).not.toContain('later-done')
      expect(await tree.cards({ sessionRef: released, states: ['pending'] })).toEqual([])

      const other = await tree.startSession('start: echo other')
      const ended = await endedRuns(tree, other, 1)
      expect(toolResults(ended).join('\n')).toContain('did not run')
      expect(await tree.cards({ sessionRef: other, states: ['pending'] })).toEqual([])
      expect(shellStarts(tree)).toBeLessThanOrEqual(1)
    })
    expect(exit).toBe(0)
  },
)

it(
  'one always deny settles a batch of three calls of the tool: the other two cards are withdrawn and none runs',
  { timeout: 240_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const session = await tree.startSession('start: batch three')
      const cards = await pollUntil(
        'the three release cards of the batch',
        () => tree.cards({ sessionRef: session, states: ['pending'] }),
        value => value.length === 3,
      )
      const first = cards[0]?.card
      if (first === undefined) throw new Error('no card')
      await answerCard(tree, first, ['--option', 'deny-always'], 'reply-three')
      const ended = await endedRuns(tree, session, 1)
      expect(toolResults(ended).join('\n')).not.toContain('-done')
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])
      expect(shellStarts(tree)).toBe(0)
    })
    expect(exit).toBe(0)
  },
)

it('always deny does not interrupt a call that already started', { timeout: 240_000 }, async () => {
  const exit = await onReleaseTree(options, async tree => {
    const running = await tree.startSession('start: echo slow-one')
    const session = await tree.startSession('start: echo never')
    const slow = await pendingCard(tree, running, 'slow-one')
    const card = await pendingCard(tree, session, 'never')
    await answerCard(tree, slow, ['--option', 'allow-once'], 'reply-slow')
    await pollUntil(
      'the slow call to start',
      async () => shellStarts(tree),
      n => n === 1,
    )
    await answerCard(tree, card, ['--option', 'deny-always'], 'reply-never')
    const denied = await endedRuns(tree, session, 1)
    expect(toolResults(denied).join('\n')).toBe(PROHIBITED)
    expect(await shellSetting(tree)).toBe('deny')
    const before = await historyOf(tree, running)
    expect(before.some(entry => entry.kind === 'run.terminal')).toBe(false)
    const ended = await endedRuns(tree, running, 1)
    expect(toolResults(ended).join('\n')).toContain('slow-one-done')
    expect(shellStarts(tree)).toBeLessThanOrEqual(1)
  })
  expect(exit).toBe(0)
})

const NOT_ALLOWED = 'The tool call did not run: the person did not allow it this time.'

it(
  'a lasting option the tenant setting cannot take is not on the card, and one that cannot be written when answered counts for this call only',
  { timeout: 300_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const face = faceOf(tree)
      const describe = face.describe.bind(face)
      let bound: readonly string[] | null = ['deny', 'ask']
      Object.assign(face, {
        describe: async (input: Parameters<typeof describe>[0]) => {
          const read = await describe(input)
          return read.kind === 'described' && read.item.kind === 'permission'
            ? { ...read, item: { ...read.item, bound } }
            : read
        },
        set: async () => ({ kind: 'not-writable', reason: 'locked' }),
      })
      const session = await tree.startSession('start: echo bound')
      const narrowed = await pendingCard(tree, session, 'bound')
      expect(offeredOn(narrowed)).toEqual([
        'deny-once',
        'allow-once',
        'allow-session',
        'deny-always',
      ])
      await answerCard(tree, narrowed, ['--option', 'deny-once'], 'reply-bound')
      await endedRuns(tree, session, 1)

      bound = null
      await sendInput(tree, session, 'start: echo locked')
      const locked = await pendingCard(tree, session, 'locked')
      expect(offeredOn(locked)).toContain('allow-always')
      await answerCard(tree, locked, ['--option', 'allow-always'], 'reply-locked')
      const second = await endedRuns(tree, session, 2)
      expect(toolResults(second).join('\n')).toContain('locked-done')
      expect(second.filter(entry => entry.kind === ONCE)).toHaveLength(1)
      expect(await shellSetting(tree)).toBe(null)

      await sendInput(tree, session, 'start: echo again')
      const again = await pendingCard(tree, session, 'again')
      await answerCard(tree, again, ['--option', 'deny-always'], 'reply-again')
      const third = await endedRuns(tree, session, 3)
      expect(toolResults(third).at(-1)).toBe(NOT_ALLOWED)
      expect(await shellSetting(tree)).toBe(null)
      expect(third.filter(entry => entry.kind === ONCE)).toHaveLength(1)
      expect(shellStarts(tree)).toBeLessThanOrEqual(1)
    })
    expect(exit).toBe(0)
  },
)
