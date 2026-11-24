// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { CallContext, SessionRef } from '@omne-harness/dispatch-contract'
import { tenantIdSchema } from '@omne-harness/dispatch-contract'
import { dispatchingKey } from '@omne-harness/dispatch-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { CommitRequestV2, SqlStorage } from '@omne-harness/sql-contract'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { releaseMaxJsonMembers } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { partInput, sessionNamed, systemPart } from '../../support/system-part.ts'

/** The share of the release maxJsonMembers the largest commits may take. */
const LINE = 0.75

/** The members of a JSON value: every item of an array and every member of an object, at any depth. */
const members = (value: unknown): number =>
  value !== null && typeof value === 'object'
    ? Object.values(value).reduce((sum: number, child) => sum + 1 + members(child), 0)
    : 0

/** The JSON members of one commit, counted as the storage counts them against maxJsonMembers. */
const membersOf = (input: CommitRequestV2): number =>
  input.commands.reduce((sum, command) => sum + members(command.facts), 0)

/** Every commit the release storage is asked for from here on, by its JSON members. */
function measuredCommits(tree: ReleaseTree): number[] {
  const storage = tree.env.readTrusted(storageKey).get(storageKey) as SqlStorage | undefined
  if (storage === undefined) throw new Error('no storage service')
  const commit = storage.commit.bind(storage)
  const members: number[] = []
  Object.assign(storage, {
    commit: (input: CommitRequestV2, options?: Parameters<SqlStorage['commit']>[1]) => {
      members.push(membersOf(input))
      return commit(input, options)
    },
  })
  return members
}

/** The largest commit made while `act` runs. */
async function largest(commits: readonly number[], act: () => Promise<unknown>) {
  const from = commits.length
  await act()
  return Math.max(0, ...commits.slice(from))
}

/** A commit of `kind` measured at `members` stays at or under the line of the release `limit`. */
function underTheLine(kind: string, members: number, limit: number): void {
  const line = Math.floor(limit * LINE)
  const share = `${String(Math.round((members / limit) * 100))}%`
  console.log(
    `release members: ${kind} ${String(members)} (${share}), limit ${String(limit)}, line ${String(line)}`,
  )
  expect(members, `${kind}: no commit was measured`).toBeGreaterThan(0)
  expect(
    members,
    `${kind}: ${String(members)} members, ${share} of the release maxJsonMembers ${String(limit)}, ` +
      `over the line ${String(line)} (${String(LINE * 100)}%). A create carries the definition of ` +
      'every resident tool twice, so it grows with each resident tool. Make the commit smaller ' +
      'before raising the limit: apps/harness-server/SPEC.md, the storage row and maxJsonMembers.',
  ).toBeLessThanOrEqual(line)
}

describe('the JSON members of the largest commits on the release tree', () => {
  it(
    'a create with an initial input and the create of a dispatched child stay under 75% of the release maxJsonMembers',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const limit = releaseMaxJsonMembers()
      await onReleaseTree(
        { script: toolCallsThenText(() => []), permission: 'bypass-permissions' },
        async tree => {
          const commits = measuredCommits(tree)
          const part = systemPart(tree)
          let created: unknown
          const withInput = await largest(commits, async () => {
            created = await part.create(sessionNamed('members'), {
              attendance: 'unattended',
              initial: partInput('members', 'Read the notes and say what you found.'),
            })
          })
          underTheLine('a create with an initial input', withInput, limit)
          expect(created).toHaveProperty('ok')

          const parent = await tree.startSession('Say hello.')
          await pollUntil(
            'the first run of the parent',
            () => historyOf(tree, parent),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )
          const { tenant } = tree.registrar()
          const text = tenantCodec.encode(tenant)
          if (!text.ok) throw new Error('the tenant has no text')
          const issued = await toolRuntimeHolder(tree.scope)
            .workPrincipals()
            ?.forSession({ actor: 'coordinator', tenant, session: parent as never })
          if (issued === undefined || !('ok' in issued)) throw new Error(JSON.stringify(issued))
          const dispatching = tree.scope.get(dispatchingKey)
          if (dispatching === undefined) throw new Error('no dispatching service')
          const ctx: CallContext = {
            tenant: tenantIdSchema.parse(text.value),
            subject: issued.ok,
            session: parent as unknown as SessionRef,
            asking: null,
          }
          let child: unknown
          const dispatched = await largest(commits, async () => {
            const accepted = await dispatching.dispatch(ctx, {
              mode: 'delegate',
              agent: 'coding',
              instruction: 'Summarize this in one line: the sky is blue.',
              expectation: 'One line.',
              call: 'call-members',
            })
            if (accepted.kind !== 'done') throw new Error(JSON.stringify(accepted))
            child = await pollUntil(
              'the child session of the dispatch',
              () => dispatching.show(ctx, accepted.value.id),
              answer => answer.kind === 'done' && answer.value.state !== 'accepted',
            )
          })
          underTheLine('the create of a dispatched child', dispatched, limit)
          expect(child).toMatchObject({ kind: 'done', value: { state: 'started' } })
        },
      )
    },
  )
})
