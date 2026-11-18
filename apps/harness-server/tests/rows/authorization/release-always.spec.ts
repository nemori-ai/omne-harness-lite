// @module-tag slow
// The two lasting answers that change the tenant's setting of the tool: for every session, from now on.
import { expect, it } from 'vitest'
import { SHELL, faceOf } from '../../governance/tenant-settings-support.ts'
import { loginAccess } from '../../model/public-stream-support.ts'
import {
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
  const read = await faceOf(tree).describe({ principal, tenant, owner: SHELL, item: 'invoke' })
  if (read.kind !== 'described' || read.item.kind !== 'permission')
    throw new Error(JSON.stringify(read))
  return read.item.own
}

const shellStarts = (tree: ReleaseTree) =>
  toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell').length

it(
  'always allow sets the tool to automatic for the tenant: this call runs and another session asks no one',
  { timeout: 240_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const session = await tree.startSession('start: echo always')
      const card = await pendingCard(tree, session, 'always')
      expect(
        'options' in card.question
          ? card.question.options.flatMap(option =>
              'offered' in option && option.offered ? [option.id] : [],
            )
          : [],
      ).toEqual(['deny-once', 'allow-once', 'allow-session', 'allow-always', 'deny-always'])
      await answerCard(tree, card, ['--option', 'allow-always'], 'reply-always')
      const first = await endedRuns(tree, session, 1)
      expect(toolResults(first).join('\n')).toContain('always-done')
      expect(await shellSetting(tree)).toBe('auto')
      expect(first.filter(entry => entry.kind === ONCE)).toEqual([])

      const other = await tree.startSession('start: echo other')
      const ended = await endedRuns(tree, other, 1)
      expect(toolResults(ended).join('\n')).toContain('other-done')
      expect(await tree.cards({ sessionRef: other, states: ['pending'] })).toEqual([])
      expect(shellStarts(tree)).toBe(2)
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
      expect(shellStarts(tree)).toBe(1)

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
      expect(shellStarts(tree)).toBe(1)
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
