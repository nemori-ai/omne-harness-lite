// @module-tag slow
// A call the Agent handed to the Tool runs even when its gate changes before the Tool starts it.
import { expect, it } from 'vitest'
import { toolStartAuthorityKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import {
  onReleaseTree,
  pollUntil,
  startAcceptances,
  toolCalls,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  ONCE,
  admittedReleases,
  answerCard,
  endedRuns,
  pendingCard,
  perMessageShell,
  sendInput,
  setShell,
  type AdmittedRelease,
} from './release-flow-support.ts'

const PROHIBITED = 'The tool call was denied by a rule or a prohibition and did not run.'

function holdShellConsume(tree: ReleaseTree) {
  const authority = tree.scope.get(toolStartAuthorityKey) as ToolStartAuthority<unknown> | undefined
  if (authority === undefined) throw new Error('no start authority installed')
  const consume = authority.consume.bind(authority)
  const changed = Promise.withResolvers<void>()
  let held = 0
  Object.assign(authority, {
    consume: async (input: Parameters<typeof consume>[0]) => {
      if (held === 0 && input.request.availability.definition.name === 'Shell') {
        held += 1
        await changed.promise
      }
      return consume(input)
    },
  })
  return { held: () => held, go: () => changed.resolve() }
}

async function changedBeforeStart(pick: 'deny' | 'auto') {
  let first = ''
  let after = ''
  let pending = -1
  let accepted: ReturnType<typeof startAcceptances> = []
  let releases: readonly AdmittedRelease[] = []
  let shellCalls = 0
  let expressed = 0
  const exit = await onReleaseTree(
    { script: perMessageShell, permission: 'auto_permission', extraHistoryKinds: [ONCE] },
    async tree => {
      const hold = holdShellConsume(tree)
      const session = await tree.startSession('start: echo changed')
      const card = await pendingCard(tree, session, 'changed')
      await answerCard(tree, card, ['--option', 'allow-once'], 'reply-changed')
      await pollUntil(
        'the Tool to reach the start',
        async () => hold.held(),
        n => n > 0,
      )
      expect(startAcceptances(tree.storageRoot)).toHaveLength(0)
      await setShell(tree, pick, `set-shell-${pick}`)
      hold.go()
      const entries = await endedRuns(tree, session, 1)
      first = toolResults(entries).join('\n')
      expressed = entries.filter(entry => entry.kind === ONCE).length
      accepted = startAcceptances(tree.storageRoot)
      releases = admittedReleases(tree.storageRoot)
      if (pick === 'deny') {
        await sendInput(tree, session, 'start: echo after')
        const next = await endedRuns(tree, session, 2)
        after = toolResults(next).join('\n')
        pending = (await tree.cards({ sessionRef: session, states: ['pending'] })).length
      }
      shellCalls = toolCalls(tree.storageRoot).filter(row => row.tool === 'Shell').length
    },
  )
  expect(exit).toBe(0)
  return { first, after, pending, accepted, releases, shellCalls, expressed }
}

it(
  'a released call runs although its gate is prohibited before the start, and the next call is refused at its admission',
  { timeout: 240_000 },
  async () => {
    const ran = await changedBeforeStart('deny')
    expect(ran.expressed).toBe(1)
    expect(ran.first).toContain('changed-done')
    expect(ran.accepted).toHaveLength(1)
    expect(ran.after).toContain(PROHIBITED)
    expect(ran.after).not.toContain('after-done')
    expect(ran.pending).toBe(0)
    expect(ran.shellCalls).toBe(1)
  },
)

it(
  'a released call whose gate turns automatic before the start runs on the once authorization its admission used',
  { timeout: 180_000 },
  async () => {
    const ran = await changedBeforeStart('auto')
    expect(ran.first).toContain('changed-done')
    expect(ran.shellCalls).toBe(1)
    expect(ran.accepted).toHaveLength(1)
    expect(ran.accepted.filter(row => 'authorizations' in row)).toHaveLength(0)
    expect(ran.releases).toContainEqual(
      expect.objectContaining({
        by: 'once',
        grant: expect.objectContaining({ via: 'once', source: expect.any(Object) }),
      }),
    )
  },
)
