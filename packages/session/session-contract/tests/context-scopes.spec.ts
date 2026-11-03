// `contextScopesOf` answers the Context scopes of a session from its SE27/SE28 entries alone. What is
// checked: over archive and unarchive cycles it gives the same generations, references and ends as
// the reduced snapshot, whatever the order of the entries; a binding minted for another session, an
// entry of another kind and a payload that does not decode fail the whole; `contextScopeOf` is the
// reference that the reducer mints.
import { describe, expect, it } from 'vitest'
import {
  CONTEXT_SCOPE_KINDS,
  contextScopeOf,
  contextScopesOf,
  type HistoryEntry,
  type SessionId,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { open } from './scene.ts'

async function cycled(cycles: number) {
  const s = await open()
  for (let at = 0; at < cycles; at++) {
    await s.control('archive', `archive-${at}`)
    await s.control('unarchive', `unarchive-${at}`)
  }
  const entries = s.port.controls.entriesOf(s.access.tenant, s.access.session)
  const changing = entries.filter(entry =>
    (CONTEXT_SCOPE_KINDS as readonly string[]).includes(entry.kind),
  )
  return { s, entries, changing, snapshot: await s.read() }
}

function succeeded<T>(outcome: Outcome<T, string>, what: string): T {
  if ('failure' in outcome) throw new Error(`${what}: ${outcome.failure}`)
  return outcome.ok
}

const projected = (scopes: readonly { generation: string; scope: string; ended: unknown }[]) =>
  [...scopes]
    .map(({ generation, scope, ended }) => ({ generation, scope, ended }))
    .sort((left, right) => Number(left.generation) - Number(right.generation))

describe('contextScopesOf', () => {
  it('gives the scopes of the reduced snapshot after archive and unarchive cycles, in any entry order', async () => {
    const { s, changing, snapshot } = await cycled(2)
    const expected = projected(snapshot.contextScopes ?? [])
    expect(expected).toHaveLength(3)
    expect(succeeded(contextScopesOf(s.base, changing), 'forward')).toEqual(expected)
    expect(succeeded(contextScopesOf(s.base, [...changing].reverse()), 'backward')).toEqual(
      expected,
    )
    // The two kinds read apart, as a reader of the kind index reads them, give the same answer.
    const byKind = CONTEXT_SCOPE_KINDS.flatMap(kind => changing.filter(item => item.kind === kind))
    expect(succeeded(contextScopesOf(s.base, byKind), 'by kind')).toEqual(expected)
  })

  it('without any archive the creation mints the one open generation', async () => {
    const { s, changing, snapshot } = await cycled(0)
    expect(changing).toEqual([])
    expect(succeeded(contextScopesOf(s.base, []), 'created')).toEqual(
      projected(snapshot.contextScopes ?? []),
    )
  })

  it('mints the reference the reducer mints', async () => {
    const { s, snapshot } = await cycled(1)
    for (const binding of snapshot.contextScopes ?? [])
      expect(contextScopeOf({ ...s.base, generation: binding.generation })).toBe(binding.scope)
  })

  it('refuses the entries of another session: their references are not minted for this one', async () => {
    const { changing } = await cycled(1)
    const other = (await open()).base
    const answer = contextScopesOf({ ...other, session: 'session-other' as SessionId }, changing)
    expect(answer).toEqual({
      failure: expect.stringContaining('not the one minted for this session'),
    })
  })

  it('refuses an entry of another kind and a payload that does not decode', async () => {
    const { s, entries, changing } = await cycled(1)
    const created = entries.find(entry => entry.kind === 'session.created') as HistoryEntry
    expect(contextScopesOf(s.base, [created])).toHaveProperty('failure')
    const broken = { ...changing[0]!, payload: { kind: 'null' } as const }
    expect(contextScopesOf(s.base, [broken])).toHaveProperty('failure')
  })
})
