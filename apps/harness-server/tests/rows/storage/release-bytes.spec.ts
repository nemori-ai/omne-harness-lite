// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { CallContext, SessionRef } from '@omne-harness/dispatch-contract'
import { tenantIdSchema } from '@omne-harness/dispatch-contract'
import { dispatchingKey } from '@omne-harness/dispatch-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { CommitRequestV2, SqlStorage } from '@omne-harness/sql-contract'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { partInput, sessionNamed, systemPart } from '../../support/system-part.ts'
import { providerConfig } from './fixtures/tree.ts'

/** The share of each byte limit of the storage the largest commits may take. */
const LINE = 0.75

/** The limits the release tree runs its storage with. */
const LIMITS = providerConfig('/limits')

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

type Sizes = Readonly<{ command: number; request: number }>

/** One commit by its bytes, as the storage counts them: its largest command and the whole request. */
const sizesOf = (input: CommitRequestV2): Sizes => ({
  command: Math.max(0, ...input.commands.map(bytes)),
  request: bytes(input),
})

/** Every commit the release storage is asked for from here on, by its bytes. */
function measuredCommits(tree: ReleaseTree): Sizes[] {
  const storage = tree.env.readTrusted(storageKey).get(storageKey) as SqlStorage | undefined
  if (storage === undefined) throw new Error('no storage service')
  const commit = storage.commit.bind(storage)
  const sizes: Sizes[] = []
  Object.assign(storage, {
    commit: (input: CommitRequestV2, options?: Parameters<SqlStorage['commit']>[1]) => {
      sizes.push(sizesOf(input))
      return commit(input, options)
    },
  })
  return sizes
}

/** The largest command and the largest request of the commits made while `act` runs. */
async function largest(commits: readonly Sizes[], act: () => Promise<unknown>): Promise<Sizes> {
  const from = commits.length
  await act()
  const made = commits.slice(from)
  return {
    command: Math.max(0, ...made.map(sizes => sizes.command)),
    request: Math.max(0, ...made.map(sizes => sizes.request)),
  }
}

const share = (value: number, limit: number) => `${String(Math.round((value / limit) * 100))}%`

/** The commits of `kind` measured at `sizes` stay at or under the line of each byte limit. */
function underTheLine(kind: string, sizes: Sizes): void {
  const commandLine = Math.floor(LIMITS.maxCommandBytes * LINE)
  const requestLine = Math.floor(LIMITS.maxRequestBytes * LINE)
  console.log(
    `release bytes: ${kind}: command ${String(sizes.command)} ` +
      `(${share(sizes.command, LIMITS.maxCommandBytes)} of ${String(LIMITS.maxCommandBytes)}), ` +
      `request ${String(sizes.request)} ` +
      `(${share(sizes.request, LIMITS.maxRequestBytes)} of ${String(LIMITS.maxRequestBytes)})`,
  )
  expect(sizes.request, `${kind}: no commit was measured`).toBeGreaterThan(0)
  const advice =
    'A create carries the definition of every resident tool twice, so it grows with each ' +
    'resident tool. Make the commit smaller before raising the limit.'
  expect(
    sizes.command,
    `${kind}: its largest command is ${String(sizes.command)} bytes, over the line ` +
      `${String(commandLine)} of maxCommandBytes. ${advice}`,
  ).toBeLessThanOrEqual(commandLine)
  expect(
    sizes.request,
    `${kind}: the request is ${String(sizes.request)} bytes, over the line ` +
      `${String(requestLine)} of maxRequestBytes. ${advice}`,
  ).toBeLessThanOrEqual(requestLine)
}

describe('the bytes of the largest commits on the release tree', () => {
  it(
    'a create with an initial input and the create of a dispatched child stay under 75% of maxCommandBytes and maxRequestBytes',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      await onReleaseTree(
        { script: toolCallsThenText(() => []), permission: 'bypass-permissions' },
        async tree => {
          const commits = measuredCommits(tree)
          const part = systemPart(tree)
          let created: unknown
          const withInput = await largest(commits, async () => {
            created = await part.create(sessionNamed('bytes'), {
              attendance: 'unattended',
              initial: partInput('bytes', 'Read the notes and say what you found.'),
            })
          })
          underTheLine('a create with an initial input', withInput)
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
              call: 'call-bytes',
            })
            if (accepted.kind !== 'done') throw new Error(JSON.stringify(accepted))
            child = await pollUntil(
              'the child session of the dispatch',
              () => dispatching.show(ctx, accepted.value.id),
              answer => answer.kind === 'done' && answer.value.state !== 'accepted',
            )
          })
          underTheLine('the create of a dispatched child', dispatched)
          expect(child).toMatchObject({ kind: 'done', value: { state: 'started' } })
        },
      )
    },
  )
})
