import type { Access } from '@omne-harness/legal-identity'
import type {
  EndpointRef,
  McpSkill,
  PeerSkills,
  SkillCatalogView,
  SkillFileFailure,
} from '@omne-harness/mcp-contract'
import { jsonOf } from '@omne-harness/mcp-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  runConformanceCase,
  skillEntrySourceConformance,
} from '@omne-harness/skill-contract/testing'
import { describe, expect, it } from 'vitest'
import { createMcpSkillSource, mcpSkillName } from '../src/index.ts'
import { ref } from './support.ts'
import { alice, mallory, type Principal } from './world.ts'

const BODY = '# Style\nShort sentences.\n'
const style: McpSkill = {
  name: 'style',
  description: { untrusted: 'House style.' },
  uri: 'skill://docs/style/SKILL.md',
  frontmatter: jsonOf({ name: 'style', description: 'House style.' }),
  files: [
    { uri: 'skill://docs/style/SKILL.md', path: 'SKILL.md', digest: 'sha256:x', size: 25 },
    { uri: 'skill://docs/style/ref.md', path: 'ref.md', digest: 'sha256:y', size: 4 },
  ],
}
const acquired = (skills: readonly McpSkill[]): SkillCatalogView => ({
  kind: 'acquired',
  revision: 1 as never,
  freshness: { acquiredAt: '2026-11-28T04:00:00.000Z', changedNotified: false },
  skills,
  refused: [],
})

type Setup = Partial<{
  views: Readonly<Record<string, Outcome<SkillCatalogView, never> | 'refused' | 'unknown'>>
  read: PeerSkills<Principal>['read']
  refreshed: () => Promise<void>
  endpoints: 'unknown'
}>

function sourceOf(setup: Setup = {}) {
  const docs = ref('docs')
  const views = { ...setup.views }
  const asked: unknown[][] = []
  const source = createMcpSkillSource<Principal>({
    endpoints: async (access: Access<Principal>) => {
      if (setup.endpoints === 'unknown') return fail('unknown')
      return succeed(access === alice ? [docs] : [])
    },
    discovery: {
      skills: async (_access, at: EndpointRef) => {
        const view = views[at.name] ?? succeed(acquired([style]))
        if (view === 'refused') return fail({ kind: 'blocked', reason: 'disabled' } as never)
        if (view === 'unknown') return fail({ kind: 'unknown' })
        return view
      },
      refresh: async (_access, request) => {
        asked.push(['refresh', request.ref.name])
        await setup.refreshed?.()
        views[request.ref.name] = succeed(acquired([style]))
        return succeed({ kind: 'published', revision: 2 as never })
      },
    },
    skills: {
      read:
        setup.read ??
        (async (_access, _at, request) => {
          asked.push(['read', request.skill, request.path, request.range])
          if (request.skill !== 'style') return fail({ kind: 'skill-not-found' })
          return succeed({
            text: BODY.slice(request.range.start),
            start: request.range.start,
            total: 25,
          })
        }),
    },
    acquireWaitMs: 50,
    connectBound: 1000 as never,
  })
  return { source, asked }
}

describe('the skills MCP peers bring, as a source of Skills (C401, C404, C405)', () => {
  for (const conformance of skillEntrySourceConformance<Principal>())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const { source } = sourceOf()
      const verdict = await runConformanceCase(conformance, {
        source,
        access: alice,
        stranger: mallory,
        known: 'mcp__docs__style',
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })

  it('names each taken skill by the prefix, the endpoint and its own name, labelled with the endpoint', async () => {
    const { source } = sourceOf()
    expect(await source.list(alice)).toEqual({
      ok: [{ name: 'mcp__docs__style', description: 'House style.', label: 'MCP endpoint docs' }],
    })
    expect(mcpSkillName('team__docs', 'style')).toBe('mcp__team__docs__style')
  })

  it('reads the body and a file through MCP, with the label, and lists the files without a directory', async () => {
    const { source, asked } = sourceOf()
    const signal = new AbortController().signal
    const range = { start: 2, length: 100 }
    expect(await source.read(alice, 'mcp__docs__style', { range, signal })).toEqual({
      ok: { text: BODY.slice(2), start: 2, total: 25, label: 'MCP endpoint docs' },
    })
    await source.readFile(alice, 'mcp__docs__style', 'ref.md', { range, signal })
    expect(asked).toEqual([
      ['read', 'style', 'SKILL.md', range],
      ['read', 'style', 'ref.md', range],
    ])
    expect(await source.listFiles(alice, 'mcp__docs__style', signal)).toEqual({
      ok: {
        files: [
          { path: 'SKILL.md', size: 25 },
          { path: 'ref.md', size: 4 },
        ],
        label: 'MCP endpoint docs',
      },
    })
  })

  it('a skill of an endpoint not acquired yet is listed once the refresh comes in time, and not when it does not', async () => {
    const quick = sourceOf({ views: { docs: succeed({ kind: 'not-acquired' }) } })
    expect(await quick.source.list(alice)).toMatchObject({ ok: [{ name: 'mcp__docs__style' }] })
    expect(quick.asked).toEqual([['refresh', 'docs']])
    const slow = sourceOf({
      views: { docs: succeed({ kind: 'not-acquired' }) },
      refreshed: () => new Promise(resolve => setTimeout(resolve, 500)),
    })
    expect(await slow.source.list(alice)).toEqual({ ok: [] })
  })

  it('a blocked endpoint lists nothing and reads as not found; one that cannot be read now answers unavailable', async () => {
    const signal = new AbortController().signal
    const range = { start: 0, length: 10 }
    const blocked = sourceOf({
      views: { docs: 'refused' },
      read: async () => fail({ kind: 'blocked', reason: 'disabled' } as never),
    })
    expect(await blocked.source.list(alice)).toEqual({ ok: [] })
    expect(await blocked.source.read(alice, 'mcp__docs__style', { range, signal })).toEqual({
      failure: 'not-found',
    })
    expect(await blocked.source.listFiles(alice, 'mcp__docs__style', signal)).toEqual({
      failure: 'not-found',
    })
    const unknown = sourceOf({ read: async () => fail({ kind: 'unknown' }) })
    expect(await unknown.source.read(alice, 'mcp__docs__style', { range, signal })).toEqual({
      failure: 'unavailable',
    })
    const unread = sourceOf({ endpoints: 'unknown' })
    expect(await unread.source.list(alice)).toEqual({ failure: 'unavailable' })
  })

  it.each([
    ['changed', 'changed'],
    ['not-text', 'not-text'],
    ['file-not-found', 'file-not-found'],
    ['skill-not-found', 'not-found'],
  ] as const)('answers a read that MCP answers %s as %s', async (kind, expected) => {
    const failure = { kind } as SkillFileFailure
    const { source } = sourceOf({ read: async () => fail(failure) })
    const signal = new AbortController().signal
    expect(
      await source.readFile(alice, 'mcp__docs__style', 'ref.md', {
        range: { start: 0, length: 1 },
        signal,
      }),
    ).toEqual({ failure: expected })
  })

  it.each(['mcp__style', 'mcp____style', 'mcp__docs__', 'web__docs__style', 'mcp__other__style'])(
    'answers not found for %s, a name that is not one of an adopted endpoint',
    async name => {
      const { source } = sourceOf()
      const signal = new AbortController().signal
      expect(await source.read(alice, name, { range: { start: 0, length: 1 }, signal })).toEqual({
        failure: 'not-found',
      })
    },
  )
})
