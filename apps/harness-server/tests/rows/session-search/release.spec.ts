// @module-tag slow
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@omne-harness/session-contract'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const ROWS = ['session-history-index', 'session-search']
const WORD = 'zebrafinch'

const ended = (tree: ReleaseTree, session: string) =>
  pollUntil(
    'the Run to end',
    () => historyOf(tree, session),
    found => found.some(entry => entry.kind === 'run.terminal'),
  )

async function tails(tree: ReleaseTree): Promise<readonly string[]> {
  const listed = await tree.scope.sessionHistoryLog.log.sessions(tree.registrar().tenant)
  if ('failure' in listed) throw new Error('the log cannot be read')
  return listed.ok.map(item => `${item.session}@${item.tail}`)
}

describe('the release tree and the history search (C10, C11, C15)', () => {
  it(
    'builds the index behind the logs once a session has talked, and keeps it at their heads',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids).toEqual(expect.arrayContaining(ROWS))
        expect(tree.scope.get('sessionSearch')).toBeDefined()
        const session = await tree.startSession(`tell me about the ${WORD}`)
        await ended(tree, session)
        const { tenant } = tree.registrar()
        const { index } = tree.scope.sessionHistoryIndex
        await pollUntil(
          'the index to stand at the head of the log',
          async () => {
            const state = await index.state(tenant)
            if (state.kind !== 'ready') return false
            const covers = await index.covers(tenant, state.generation)
            if ('failure' in covers) return false
            const through = covers.ok.get(session as SessionId)?.through
            return (await tails(tree)).includes(`${session}@${String(through)}`)
          },
          reached => reached,
        )
        const found = await index.candidates({
          tenant,
          generation: 1,
          plan: { kind: 'gram', gram: WORD.slice(0, 3) },
          sessions: null,
          window: { from: null, to: null },
          before: null,
          limit: 10,
        })
        expect(found).toMatchObject({ ok: { rows: [{ session }] } })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'takes inputs and ends Runs while the follower of the logs hangs',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const index = tree.scope.sessionHistoryIndex.index as unknown as Record<string, unknown>
        const never = () => new Promise<never>(() => {})
        for (const write of ['append', 'covers', 'beginRebuild', 'adopt']) index[write] = never
        const session = await tree.startSession(`remember the ${WORD}`)
        const entries = await ended(tree, session)
        expect(JSON.stringify(entries.find(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"completed"',
        )
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'takes inputs and ends Runs when the index cannot be written at all',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = {
        script: toolCallsThenText(() => []),
        // A file where the directory of the index should be: nothing can be built there.
        beforeRun: async (_run: number, storageRoot: string) => {
          mkdirSync(dirname(storageRoot), { recursive: true })
          writeFileSync(join(dirname(storageRoot), 'history-index'), 'not a directory')
        },
      }
      const exitCode = await onReleaseTree(options, async tree => {
        const session = await tree.startSession(`remember the ${WORD}`)
        const entries = await ended(tree, session)
        expect(JSON.stringify(entries.find(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"completed"',
        )
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'starts without the two rows and a session talks: there is no search, and nothing else misses it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: ROWS }
      const exitCode = await onReleaseTree(options, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids.filter(id => ROWS.includes(String(id)))).toEqual([])
        expect(tree.scope.get('sessionSearch')).toBeUndefined()
        const session = await tree.startSession('hello')
        const entries = await ended(tree, session)
        expect(JSON.stringify(entries.find(entry => entry.kind === 'run.terminal'))).toContain(
          '"outcome":"completed"',
        )
      })
      expect(exitCode).toBe(0)
    },
  )
})
