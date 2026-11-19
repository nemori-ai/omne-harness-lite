// @module-tag slow
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const call = (command: string, params: Record<string, unknown>) =>
  JSON.stringify({ command, params })

/** The owner's side over HTTP with the login the tree saved. */
async function asOwner(tree: ReleaseTree, operation: string, body: Record<string, unknown>) {
  const response = await fetch(
    `http://127.0.0.1:${String(tree.port)}/api/session/v1/${operation}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${savedLoginProof(tree.home)}`,
        'omne-message-id': `m-${operation}-${Math.random()}`,
      },
      body: JSON.stringify({ tenant: savedTenant(tree.home), ...body }),
    },
  )
  return (await response.json()) as { outcome: string; body: Record<string, any> }
}

/** What a session is before and after another one reads it: its log head and its last activity. */
async function standing(tree: ReleaseTree, session: string) {
  const history = await asOwner(tree, 'read-history', {
    session,
    cursor: null,
    direction: 'forward',
    pageBytes: '65536',
  })
  const listed = await asOwner(tree, 'list-sessions', { cursor: null })
  const item = (listed.body['sessions'] as Record<string, any>[]).find(
    row => row['session'] === session,
  )
  return {
    upper: history.body['upper'],
    lastActivityAt: item?.['lastActivityAt'],
    lifecycle: item?.['lifecycle'],
  }
}

async function settled(tree: ReleaseTree, session: string, runs = 1) {
  const entries = await pollUntil(
    `the Run ${String(runs)} of ${session} to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )
  return toolResults(entries).join('\n')
}

describe('the Sessions tool on the release tree', () => {
  it(
    'lets the agent of one session list, show, read and search another of its tenant, answers a missing one as not found, and leaves the read one as it was',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const target = { id: '' }
      let declared = false
      const script = toolCallsByRequest(body => {
        declared ||= body.includes('"name":"Sessions"')
        if (body.includes('"role":"tool"')) return []
        if (body.includes('sessions: find')) {
          const missing = `${target.id.slice(0, -1)}${target.id.endsWith('a') ? 'b' : 'a'}`
          return [
            { id: 'c_list', tool: 'Sessions', arguments: call('list', {}) },
            { id: 'c_show', tool: 'Sessions', arguments: call('show', { session: target.id }) },
            { id: 'c_read', tool: 'Sessions', arguments: call('read', { session: target.id }) },
            { id: 'c_missing', tool: 'Sessions', arguments: call('read', { session: missing }) },
            {
              id: 'c_search',
              tool: 'Sessions',
              arguments: call('search', { text: ['Q7-PELICAN'] }),
            },
          ]
        }
        return []
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        target.id = await tree.startSession('sessions: the code word is Q7-PELICAN')
        await settled(tree, target.id)
        await pollUntil(
          'the history index to hold the code word',
          () =>
            asOwner(tree, 'search-history', {
              content: { kind: 'literals', all: ['Q7-PELICAN'], caseSensitive: false },
              cursor: null,
            }),
          answer => answer.outcome === 'succeeded' && answer.body['hits'].length > 0,
        )
        const before = await standing(tree, target.id)
        expect(before).toEqual({
          upper: expect.any(String),
          lastActivityAt: expect.any(String),
          lifecycle: 'dormant',
        })

        const reader = await tree.startSession('sessions: find')
        const results = await settled(tree, reader)
        expect(declared).toBe(true)
        expect(results).toContain('done Sessions list sessions=')
        expect(results).toContain(target.id)
        expect(results).toContain(`done Sessions show session=${target.id}`)
        expect(results).toContain(`done Sessions read session=${target.id}`)
        expect(results).toMatch(/"material":\{[^\n]*Q7-PELICAN/)
        expect(results).toMatch(/not-found reason=no session [0-9a-f]+ for this user/)
        expect(results).toContain('done Sessions search hits=')
        expect(results).toMatch(/"match":"Q7-PELICAN"/)

        expect(await standing(tree, target.id)).toEqual(before)
      })
      expect(exitCode).toBe(0)
    },
  )
})
