// @module-tag slow
// Between a person's release and the start the gate may change: the start judges again.
import { expect, it } from 'vitest'
import { toolTargetPolicyOf } from '../../../src/rows/authorization/tool-target-policy.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  startAcceptances,
  toolCalls,
  toolResults,
} from '../../support/release-tree.ts'
import { ONCE, answerCard, pendingCard, perMessageShell, setShell } from './release-flow-support.ts'

// The start fence answers through the Tool: the call was released, then its gate was prohibited.
const NOT_PERMITTED = 'the start is not permitted now: permission-policy'

// Releases one Shell call, changes the gate while the Tool is about to start it, then lets it go on.
async function changedBeforeStart(pick: 'deny' | 'auto') {
  let entries: Awaited<ReturnType<typeof historyOf>> = []
  let accepted: ReturnType<typeof startAcceptances> = []
  let shellCalls = 0
  const exit = await onReleaseTree(
    { script: perMessageShell, permission: 'auto_permission', extraHistoryKinds: [ONCE] },
    async tree => {
      const policy = toolTargetPolicyOf(tree.scope)
      if (policy === undefined) throw new Error('no target policy installed')
      const qualify = policy.qualify.bind(policy)
      const changed = Promise.withResolvers<void>()
      let released = false
      let asked = 0
      // Once released, the Tool asks when it takes the call, then again when it would start it.
      Object.assign(policy, {
        qualify: async (input: Parameters<typeof qualify>[0]) => {
          if (released && input.request.availability.definition.name === 'Shell') {
            asked += 1
            if (asked > 1) await changed.promise
          }
          return qualify(input)
        },
      })
      const session = await tree.startSession('start: echo changed')
      const card = await pendingCard(tree, session, 'changed')
      released = true
      await answerCard(tree, card, ['--option', 'allow-once'], 'reply-changed')
      await pollUntil(
        'the Tool to reach the start',
        async () => asked,
        n => n > 1,
      )
      expect(startAcceptances(tree.storageRoot)).toHaveLength(0)
      await setShell(tree, pick, `set-shell-${pick}`)
      changed.resolve()
      entries = await pollUntil(
        'the Run to end',
        () => historyOf(tree, session),
        value => value.some(entry => entry.kind === 'run.terminal'),
      )
      accepted = startAcceptances(tree.storageRoot)
      shellCalls = toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell').length
    },
  )
  expect(exit).toBe(0)
  return { entries, accepted, shellCalls }
}

it(
  'a released call does not start once its gate is prohibited before the start',
  { timeout: 180_000 },
  async () => {
    const { entries, accepted } = await changedBeforeStart('deny')
    expect(entries.filter(entry => entry.kind === ONCE)).toHaveLength(1)
    expect(accepted).toHaveLength(0)
    expect(toolResults(entries).join('\n')).not.toContain('changed-done')
    expect(toolResults(entries).join('\n')).toContain(NOT_PERMITTED)
  },
)

it(
  'a released call starts without consuming its authorization once its gate is automatic before the start',
  { timeout: 180_000 },
  async () => {
    const { entries, accepted, shellCalls } = await changedBeforeStart('auto')
    expect(toolResults(entries).join('\n')).toContain('changed-done')
    expect(shellCalls).toBe(1)
    expect(accepted).toHaveLength(1)
    expect(accepted.filter(row => 'authorizations' in row)).toHaveLength(0)
  },
)
