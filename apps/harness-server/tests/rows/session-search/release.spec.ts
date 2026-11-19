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

type Searched = Readonly<{
  status: number | null
  outcome: string | undefined
  hits: readonly Readonly<{ session: string; position: string; kind: string }>[]
  complete: boolean | undefined
}>

// Through the command line: the new address, the access plugin and the member's own principal.
async function search(tree: ReleaseTree, ...argv: string[]): Promise<Searched> {
  const ran = await tree.cli(['search', ...argv, '--json'])
  const printed = JSON.parse(ran.stdout || '{}') as {
    outcome?: string
    body?: { hits?: Searched['hits']; complete?: boolean }
  }
  return {
    status: ran.status,
    outcome: printed.outcome,
    hits: printed.body?.hits ?? [],
    complete: printed.body?.complete,
  }
}

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
        // At once: the follower may not have seen the commit yet, the tail scan has.
        const first = await search(tree, '--text', WORD)
        expect(first).toMatchObject({ status: 0, outcome: 'succeeded', complete: true })
        expect(first.hits.map(hit => [hit.session, hit.kind])).toEqual([[session, 'message.user']])
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
          known: null,
        })
        expect(found).toMatchObject({ ok: { rows: [{ session }] } })
        // Searching changes no session: every log stands where it stood.
        const before = await tails(tree)
        const again = await search(tree, '--text', WORD.toUpperCase())
        expect(again.hits).toEqual(first.hits)
        // The position of a hit is the entry of the message, as the history read names it.
        const entries = (await historyOf(tree, session)) as unknown as readonly Readonly<{
          entryId: string
          kind: string
        }>[]
        const position = again.hits[0]!.position
        expect(entries.find(entry => entry.entryId === position)?.kind).toBe('message.user')
        const replies = await search(tree, '--regex', '\\w+', '--kinds', 'assistant')
        expect(replies.hits.length).toBeGreaterThan(0)
        expect(replies.hits.every(hit => hit.kind === 'message.assistant')).toBe(true)
        expect(await search(tree, '--text', 'no such word anywhere')).toMatchObject({
          status: 0,
          hits: [],
          complete: true,
        })
        expect(await search(tree, '--regex', '(')).toMatchObject({ status: 3, outcome: 'invalid' })
        expect(await tails(tree)).toEqual(before)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'takes inputs and ends Runs while the follower of the logs hangs, and a search still finds them',
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
        const found = await search(tree, '--text', WORD)
        expect(found.hits.map(hit => hit.session)).toEqual([session])
        expect(found.complete).toBe(true)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'takes inputs and ends Runs when the index cannot be written at all; a search scans the logs',
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
        const found = await search(tree, '--text', WORD)
        expect(found.hits.map(hit => hit.session)).toEqual([session])
        expect(found.complete).toBe(true)
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
        // No search service: the operation says its basis is unavailable, not "no hits".
        expect(await search(tree, '--text', 'hello')).toMatchObject({
          status: 4,
          outcome: 'basis-unavailable',
        })
      })
      expect(exitCode).toBe(0)
    },
  )
})
