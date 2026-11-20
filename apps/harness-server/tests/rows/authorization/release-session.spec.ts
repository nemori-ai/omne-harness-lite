// @module-tag slow
// A release for the session: this session stops asking for that tool; nothing else does.
import { expect, it } from 'vitest'
import {
  onReleaseTree,
  pollUntil,
  startAcceptances,
  toolCalls,
  toolResults,
} from '../../support/release-tree.ts'
import {
  ONCE,
  answerCard,
  endedRuns,
  pendingCard,
  perMessageShell,
  sendInput,
  setGate,
  setShell,
} from './release-flow-support.ts'
import { SHELL } from '../../governance/tenant-settings-support.ts'

const options = {
  script: perMessageShell,
  permission: 'auto_permission',
  extraHistoryKinds: [ONCE],
}

it(
  'a call released for the session runs, the next one in this session asks no one, and another session still asks',
  { timeout: 240_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const session = await tree.startSession('start: echo first')
      const card = await pendingCard(tree, session, 'first')
      await answerCard(tree, card, ['--option', 'allow-session'], 'reply-first')
      const first = await endedRuns(tree, session, 1)
      expect(toolResults(first).join('\n')).toContain('first-done')
      const granted = first.filter(entry => entry.kind === ONCE)
      expect(granted).toHaveLength(1)
      expect(granted[0]?.payload).toMatchObject({
        expression: { scope: { kind: 'session', capabilityId: expect.any(String) } },
      })

      await sendInput(tree, session, 'start: echo second')
      const second = await endedRuns(tree, session, 2)
      expect(toolResults(second).join('\n')).toContain('second-done')
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])
      expect(second.filter(entry => entry.kind === ONCE)).toHaveLength(1)
      expect(startAcceptances(tree.storageRoot).filter(row => 'authorizations' in row)).toEqual([])
      // Both starts rest on the one session grant, named by its own source and guarded at acceptance.
      const releases = startAcceptances(tree.storageRoot).map(row => row['release'])
      expect(releases).toEqual([
        { by: 'session', grant: expect.stringContaining('"via":"session-grant"') },
        { by: 'session', grant: expect.stringContaining('"via":"session-grant"') },
      ])

      const other = await tree.startSession('start: echo other')
      await pendingCard(tree, other, 'the other session')
      expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(2)
    })
    expect(exit).toBe(0)
  },
)

it(
  'a release for the session covers one gate: a command of the same tool under another gate still asks',
  { timeout: 240_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      await setGate(tree, SHELL, 'read', 'ask', 'shell-read-asks')
      const session = await tree.startSession('start: echo first')
      const card = await pendingCard(tree, session, 'the run gate')
      expect(card.question).toMatchObject({
        kind: 'release',
        target: { tool: 'Shell', command: 'execute' },
        gateTitle: '执行',
      })
      await answerCard(tree, card, ['--option', 'allow-session'], 'reply-run')
      await endedRuns(tree, session, 1)

      await sendInput(tree, session, 'start: echo second')
      await endedRuns(tree, session, 2)
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])

      await sendInput(tree, session, 'start: info third')
      const other = await pendingCard(tree, session, 'the read gate')
      expect(other.question).toMatchObject({
        kind: 'release',
        target: { tool: 'Shell', command: 'info' },
        gateTitle: '查看',
      })
    })
    expect(exit).toBe(0)
  },
)

it(
  'a release for the session no longer counts once the setting of the tool was changed and changed back',
  { timeout: 240_000 },
  async () => {
    const exit = await onReleaseTree(options, async tree => {
      const session = await tree.startSession('start: echo before')
      const card = await pendingCard(tree, session, 'before')
      await answerCard(tree, card, ['--option', 'allow-session'], 'reply-before')
      await endedRuns(tree, session, 1)

      await setShell(tree, 'deny', 'set-shell-deny')
      await setShell(tree, 'ask', 'set-shell-ask')
      await sendInput(tree, session, 'start: echo after')
      const again = await pendingCard(tree, session, 'after the setting changed')
      await answerCard(tree, again, ['--option', 'deny-once'], 'reply-after')
      const ended = await endedRuns(tree, session, 2)
      expect(toolResults(ended).join('\n')).not.toContain('after-done')
      expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(1)
    })
    expect(exit).toBe(0)
  },
)

it(
  'one answer for the session settles a batch of three calls of the tool: the other two cards are withdrawn',
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
      await answerCard(tree, first, ['--option', 'allow-session'], 'reply-three')
      const ended = await endedRuns(tree, session, 1)
      const results = toolResults(ended).join('\n')
      for (const n of [1, 2, 3]) expect(results).toContain(`three-${String(n)}-done`)
      expect(ended.filter(entry => entry.kind === ONCE)).toHaveLength(1)
      expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])
      expect(toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell')).toHaveLength(3)
    })
    expect(exit).toBe(0)
  },
)
