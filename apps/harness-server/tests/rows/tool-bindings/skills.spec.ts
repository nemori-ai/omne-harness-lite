import { describe, expect, it } from 'vitest'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  isSafeReason,
  isSkillName,
  type CatalogEntry,
  type ReadFailure,
} from '@omne-harness/skill-contract'
import { orderDocuments } from '@omne-harness/skill'
import type { SkillAccess, SkillCatalog, SkillEntrySource } from '@omne-harness/skill-contract'
import { createMemorySkillEntrySource } from '@omne-harness/skill-contract/testing'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import { capabilityId } from '@omne-harness/assets'
import { decodeCursor, encodeCursor } from '@omne-harness/text-search'
import {
  principalIssuer,
  principalVerifier,
  sessionWorkIssuerOf,
} from '../../../src/entry/principals.ts'
import { succeed } from '@omne-harness/operation-result'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import {
  createBoundSkills,
  turnScopeOf,
  type SkillsBindingPorts,
} from '../../../src/rows/tool-bindings/skills.ts'
import { fixtureEnv, fixtureTenant, okOf } from '../../entry/support.ts'
import { readWorkNowhere } from '../../skills/support.ts'

const signal = new AbortController().signal

function skill(name: string) {
  const id = capabilityId('skill', name)
  if (!id.ok || !isSkillName(name)) throw new Error(name)
  return { capability: id.id, name }
}

function entries(...names: string[]): CatalogEntry[] {
  return names.map(name => ({
    kind: 'adopted',
    ...skill(name),
    description: `${name} notes.`,
    dependencies: [],
  }))
}

const basis = {
  capability: skill('weekly-report').capability,
  layer: 'tenant',
  digest: 'x',
} as never

async function setup(
  overrides: Partial<{
    catalog: SkillCatalog<unknown, unknown> | undefined
    access: SkillAccess<unknown, unknown> | undefined
    verifierAbsent: boolean
    readWork: SkillsBindingPorts['readWork']
    callerTenant: 'a' | 'b'
    results: CatalogEntry[][]
    /** The tools each Skill declares it needs, by Skill name. */
    needs: Readonly<Record<string, readonly string[]>>
    missingTools: SkillsBindingPorts['missingTools']
    sources: readonly SkillEntrySource<unknown>[]
  }> = {},
) {
  const fixture = fixtureEnv([principalIssuerKey])
  await fixture.install(principalVerifier)
  await fixture.install(principalIssuer)
  const tenant = fixtureTenant('a')
  const principal = okOf(
    sessionWorkIssuerOf(fixture.env)({
      tenant: fixtureTenant(overrides.callerTenant ?? 'a'),
      session: 'skills-binding',
    }),
    'principal',
  )
  const calls: unknown[][] = []
  const toolAsks: unknown[][] = []
  const needing = (entry: CatalogEntry): CatalogEntry =>
    entry.kind === 'adopted'
      ? {
          ...entry,
          dependencies: (overrides.needs?.[entry.name] ?? []).map(name => {
            const id = capabilityId('tool', name)
            if (!id.ok) throw new Error(name)
            return id.id
          }),
        }
      : entry
  const catalog: SkillCatalog<unknown, unknown> = {
    summaries: async (...args) => {
      const asked = args[2] ?? []
      return { ok: asked.map(id => needing(entries(id.name)[0]!)) }
    },
    search: async (...args) => {
      calls.push(['search', ...args])
      return {
        ok: (overrides.results?.shift() ?? entries('alpha', 'beta', 'gamma')).map(needing),
      }
    },
    order: (text, documents) => orderDocuments(text, documents, { k1: 1.2, b: 0.75 }),
  }
  const access: SkillAccess<unknown, unknown> = {
    read: async (...args) => {
      calls.push(['read', ...args])
      return {
        ok: {
          basis,
          part: { kind: 'body' },
          content: { kind: 'text', text: 'body' },
          range: { start: 3, length: 4 },
          total: 10,
          complete: false,
          directory: '/skills/weekly-report',
        },
      }
    },
    list: async (...args) => {
      calls.push(['list', ...args])
      return {
        ok: {
          basis,
          resources: [
            { path: 'SKILL.md' as never, encoding: 'text', size: 120, digest: 'd1' as never },
            {
              path: 'scripts/collect.mjs' as never,
              encoding: 'text',
              size: 40,
              mediaType: 'text/javascript' as never,
              digest: 'd2' as never,
            },
          ],
          directory: '/skills/weekly-report',
        },
      }
    },
  }
  const ports: SkillsBindingPorts = {
    verifier: () =>
      overrides.verifierAbsent === true ? undefined : fixture.root.get('principalVerifier'),
    readWork: overrides.readWork ?? readWorkNowhere,
    catalog: () => ('catalog' in overrides ? overrides.catalog : catalog),
    access: () => ('access' in overrides ? overrides.access : access),
    missingTools:
      overrides.missingTools ??
      (async (asker, names) => (toolAsks.push([asker, names]), new Set<string>())),
    sources: asker => (calls.push(['sources', asker]), overrides.sources ?? []),
  }
  const bound = createBoundSkills(
    { principal, tenant, request: {} as FixedToolRequest } as never,
    ports,
  )
  return { bound, calls, toolAsks, tenant }
}

function failingRead(failure: ReadFailure): SkillAccess<unknown, unknown> {
  return { read: async () => ({ failure }), list: async () => ({ failure: failure as never }) }
}

describe('Skills binding: Skill answers become tool answers (table 2)', () => {
  const standIn = {
    capability: skill('weekly-report').capability,
    name: skill('weekly-report').name as never,
    reason: (() => {
      const reason = 'This Skill is disabled.'
      if (!isSafeReason(reason)) throw new Error('reason')
      return reason
    })(),
  }
  const cases: readonly [ReadFailure, unknown][] = [
    [{ kind: 'not-available-to-you' }, { kind: 'not-found' }],
    [
      { kind: 'unavailable-stand-in', standIn },
      { kind: 'disabled', reason: 'This Skill is disabled.' },
    ],
    [
      { kind: 'bad-path' },
      { kind: 'invalid', field: 'path', reason: 'not a path inside the Skill' },
    ],
    [
      { kind: 'outside-package' },
      { kind: 'invalid', field: 'path', reason: 'resolves outside the Skill' },
    ],
    [{ kind: 'resource-missing' }, { kind: 'file-not-found' }],
    [{ kind: 'adopted-material-changed' }, { kind: 'changed' }],
    [{ kind: 'version-changed' }, { kind: 'changed' }],
    [
      { kind: 'source-unavailable' },
      { kind: 'unavailable', reason: 'the Skill store cannot be read now' },
    ],
    [{ kind: 'unknown' }, { kind: 'unavailable', reason: 'the Skill store cannot be read now' }],
    [
      { kind: 'basis-unavailable' },
      { kind: 'unavailable', reason: 'the Skill store cannot be read now' },
    ],
    [
      { kind: 'unsupported', what: 'no-readable-package' },
      { kind: 'unavailable', reason: 'the Skill store cannot be read now' },
    ],
  ]
  it.each(cases)('answers %j as %j for read, read_file and list', async (failure, expected) => {
    const { bound } = await setup({ access: failingRead(failure) })
    expect(
      await bound.read({ skill: 'weekly-report', offset: 0, maxBytes: 100 }, signal),
    ).toStrictEqual({
      failure: expected,
    })
    expect(
      await bound.readFile(
        { skill: 'weekly-report', path: 'a.md', offset: 0, maxBytes: 100 },
        signal,
      ),
    ).toStrictEqual({ failure: expected })
    expect(await bound.list({ skill: 'weekly-report' }, signal)).toStrictEqual({
      failure: expected,
    })
  })

  it('leaves a cancelled read to the tool runtime as an abort', async () => {
    const { bound } = await setup({ access: failingRead({ kind: 'aborted' }) })
    await expect(
      bound.read({ skill: 'weekly-report', offset: 0, maxBytes: 100 }, signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('answers not-found for a principal of another tenant, and unavailable without a verifier or services', async () => {
    expect(
      await (
        await setup({ callerTenant: 'b' })
      ).bound.read({ skill: 'weekly-report', offset: 0, maxBytes: 100 }, signal),
    ).toStrictEqual({ failure: { kind: 'not-found' } })
    expect(
      await (
        await setup({ callerTenant: 'b' })
      ).bound.search({ query: '', after: null, limit: 5 }, signal),
    ).toStrictEqual({ failure: { kind: 'not-found' } })
    expect(
      await (await setup({ verifierAbsent: true })).bound.list({ skill: 'weekly-report' }, signal),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(
      await (await setup({ access: undefined })).bound.list({ skill: 'weekly-report' }, signal),
    ).toStrictEqual({
      failure: { kind: 'unavailable', reason: 'the Skill reader is not available' },
    })
    expect(
      await (
        await setup({ catalog: undefined })
      ).bound.search({ query: '', after: null, limit: 5 }, signal),
    ).toStrictEqual({
      failure: { kind: 'unavailable', reason: 'the Skill catalog is not available' },
    })
  })

  it('answers unavailable when the catalog cannot tell', async () => {
    const { bound } = await setup({
      catalog: {
        summaries: async () => ({ failure: 'unknown' }),
        search: async () => ({ failure: 'unknown' }),
        order: () => [],
      },
    })
    expect(await bound.search({ query: '', after: null, limit: 5 }, signal)).toStrictEqual({
      failure: { kind: 'unavailable', reason: 'the Skill store cannot be read now' },
    })
  })

  it('answers unavailable when the session cannot be read, and asks no Skill service', async () => {
    const asked: unknown[] = []
    const catalog = {
      summaries: async () => ({ failure: 'unknown' as const }),
      search: async (...args: unknown[]) => void asked.push(args) as never,
      order: () => [],
    }
    for (const readWork of [() => undefined, async () => ({ failure: { kind: 'unavailable' } })]) {
      const { bound } = await setup({ catalog, readWork: readWork as never })
      expect(await bound.search({ query: '', after: null, limit: 5 }, signal)).toStrictEqual({
        failure: { kind: 'unavailable', reason: 'the session cannot be read now' },
      })
    }
    expect(asked).toEqual([])
  })

  it('names the turn it runs in to the Skill services, once the session has stood at a workspace', async () => {
    const scopes: unknown[] = []
    const catalog = {
      summaries: async () => ({ failure: 'unknown' as const }),
      search: async (_: unknown, scope: unknown) => {
        scopes.push(scope)
        return { ok: [] }
      },
      order: () => [],
    }
    const read: unknown[] = []
    const standing = async (access: unknown) => {
      read.push(access)
      return succeed({
        creation: { workspace: 'somewhere' },
        changes: [],
        run: { kind: 'active', run: 'run_1' },
      } as unknown as WorkSnapshot)
    }
    const { bound } = await setup({ catalog, readWork: standing })
    await bound.search({ query: '', after: null, limit: 5 }, signal)
    expect(scopes).toEqual([{ key: 'run_1' }])
    expect(read).toEqual([expect.objectContaining({ session: expect.any(String) })])
    expect(Object.keys(read[0] as object).sort()).toEqual(['principal', 'session', 'tenant'])
  })

  it('refuses a name that is not a Skill name before it asks anyone', async () => {
    const { bound, calls } = await setup()
    expect(
      await bound.read({ skill: 'Weekly Report', offset: 0, maxBytes: 100 }, signal),
    ).toStrictEqual({
      failure: { kind: 'invalid', field: 'skill', reason: 'not a Skill name' },
    })
    expect(
      await bound.readFile(
        { skill: 'Weekly Report', path: 'a.md', offset: 0, maxBytes: 100 },
        signal,
      ),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'skill' } })
    expect(await bound.list({ skill: 'Weekly Report' }, signal)).toMatchObject({
      failure: { kind: 'invalid', field: 'skill' },
    })
    expect(calls).toEqual([])
  })

  it('reads one page of the body with the directory, within the 64 KiB page of a Skill read', async () => {
    const { bound, calls } = await setup()
    expect(
      await bound.read({ skill: 'weekly-report', offset: 3, maxBytes: 1_000_000 }, signal),
    ).toStrictEqual({
      ok: {
        text: 'body',
        start: 3,
        end: 7,
        total: 10,
        source: { layer: 'tenant', version: 'x' },
        directory: '/skills/weekly-report',
      },
    })
    expect(calls[0]?.[3]).toStrictEqual({
      capability: skill('weekly-report').capability,
      part: { kind: 'body' },
    })
    expect(calls[0]?.[4]).toMatchObject({ range: { start: 3, length: 65_536 } })
    await bound.readFile(
      { skill: 'weekly-report', path: 'scripts/a.mjs', offset: 0, maxBytes: 100 },
      signal,
    )
    expect(calls[1]?.[3]).toMatchObject({ part: { kind: 'resource', path: 'scripts/a.mjs' } })
    expect(calls[1]?.[4]).toMatchObject({ range: { start: 0, length: 100 } })
  })

  it('answers not-text for a file read as bytes', async () => {
    const { bound } = await setup({
      access: {
        read: async () => ({
          ok: {
            basis,
            part: { kind: 'resource', path: 'logo.png' as never },
            content: { kind: 'bytes', bytes: new Uint8Array([1]) },
            range: { start: 0, length: 1 },
            total: 1,
            complete: true,
          },
        }),
        list: async () => ({ failure: { kind: 'unknown' } }),
      },
    })
    expect(
      await bound.readFile(
        { skill: 'weekly-report', path: 'logo.png', offset: 0, maxBytes: 100 },
        signal,
      ),
    ).toStrictEqual({ failure: { kind: 'not-text' } })
  })

  it('lists the files with the directory, and hands the cancellation signal to the reader', async () => {
    const { bound, calls } = await setup()
    expect(await bound.list({ skill: 'weekly-report' }, signal)).toStrictEqual({
      ok: {
        files: [
          { path: 'SKILL.md', size: 120 },
          { path: 'scripts/collect.mjs', size: 40, mediaType: 'text/javascript' },
        ],
        source: { layer: 'tenant', version: 'x' },
        directory: '/skills/weekly-report',
      },
    })
    expect(calls[0]?.[4]).toStrictEqual({ signal })
  })

  it('gives no directory when the reader has none', async () => {
    const { bound } = await setup({
      access: {
        read: async () => ({
          ok: {
            basis,
            part: { kind: 'body' },
            content: { kind: 'text', text: 'body' },
            range: { start: 0, length: 4 },
            total: 4,
            complete: true,
          },
        }),
        list: async () => ({ ok: { basis, resources: [] } }),
      },
    })
    expect(
      await bound.read({ skill: 'weekly-report', offset: 0, maxBytes: 100 }, signal),
    ).toStrictEqual({
      ok: { text: 'body', start: 0, end: 4, total: 4, source: { layer: 'tenant', version: 'x' } },
    })
    expect(await bound.list({ skill: 'weekly-report' }, signal)).toStrictEqual({
      ok: { files: [], source: { layer: 'tenant', version: 'x' } },
    })
  })
})

describe('Skills binding: search pages (table 3)', () => {
  it('pages with a cursor, ignores spaces around the query, and gives none after the last page', async () => {
    const { bound, calls } = await setup()
    const first = await bound.search({ query: 'notes', after: null, limit: 2 }, signal)
    if (!('ok' in first) || first.ok.next === null) throw new Error(JSON.stringify(first))
    expect(first.ok.entries.map(entry => entry.name)).toEqual(['alpha', 'beta'])
    expect(calls[0]?.[3]).toStrictEqual({ text: 'notes' })
    expect(
      await bound.search({ query: ' notes ', after: first.ok.next, limit: 2 }, signal),
    ).toStrictEqual({
      ok: {
        entries: [{ kind: 'available', name: 'gamma', description: 'gamma notes.' }],
        next: null,
      },
    })
    expect(await bound.search({ query: 'notes', after: null, limit: 3 }, signal)).toMatchObject({
      ok: { next: null },
    })
  })

  it('refuses a cursor of another search, one past the end, and text that is not a cursor', async () => {
    const { bound } = await setup()
    const first = await bound.search({ query: 'notes', after: null, limit: 2 }, signal)
    if (!('ok' in first) || first.ok.next === null) throw new Error(JSON.stringify(first))
    const invalid = { failure: { kind: 'invalid-cursor' } }
    expect(
      await bound.search({ query: 'other', after: first.ok.next, limit: 2 }, signal),
    ).toStrictEqual(invalid)
    expect(
      await bound.search({ query: 'notes', after: 'garbage', limit: 2 }, signal),
    ).toStrictEqual(invalid)
    const issued = decodeCursor(first.ok.next)
    if (issued === null) throw new Error('cursor')
    const pastEnd = encodeCursor({ binding: issued.binding, offset: 3 })
    expect(await bound.search({ query: 'notes', after: pastEnd, limit: 2 }, signal)).toStrictEqual(
      invalid,
    )
  })

  it('refuses a cursor once the results change, though their number stays the same', async () => {
    const { bound } = await setup({
      results: [entries('alpha', 'beta', 'gamma'), entries('alpha', 'beta', 'delta')],
    })
    const first = await bound.search({ query: 'notes', after: null, limit: 2 }, signal)
    if (!('ok' in first) || first.ok.next === null) throw new Error(JSON.stringify(first))
    expect(
      await bound.search({ query: 'notes', after: first.ok.next, limit: 2 }, signal),
    ).toStrictEqual({ failure: { kind: 'invalid-cursor' } })
  })

  it('marks a disabled Skill with its reason', async () => {
    const { bound } = await setup({
      catalog: {
        order: () => [],
        summaries: async () => ({ ok: [] }),
        search: async () => ({
          ok: [
            {
              kind: 'stand-in',
              ...skill('meeting-notes'),
              reason: 'This Skill is disabled.' as never,
            },
          ],
        }),
      },
    })
    expect(await bound.search({ query: '', after: null, limit: 5 }, signal)).toStrictEqual({
      ok: {
        entries: [{ kind: 'disabled', name: 'meeting-notes', reason: 'This Skill is disabled.' }],
        next: null,
      },
    })
  })
})

describe('Skills binding: where a Skill comes from and the tools it needs (table 5.4)', () => {
  const read = { skill: 'weekly-report', offset: 3, maxBytes: 100 }

  it('R1: a read, a listing and a file read carry the layer and the version they come from; a Skill that needs no tool asks Tool nothing', async () => {
    const { bound, toolAsks } = await setup()
    const source = { layer: 'tenant', version: 'x' }
    expect(await bound.read(read, signal)).toMatchObject({ ok: { source } })
    expect(await bound.list({ skill: 'weekly-report' }, signal)).toMatchObject({ ok: { source } })
    const file = await bound.readFile({ ...read, path: 'scripts/a.mjs' }, signal)
    expect(file).toMatchObject({ ok: { source } })
    expect('ok' in file && 'missingTools' in file.ok).toBe(false)
    expect(toolAsks).toEqual([])
  })

  it('R2: the tools a Skill declares that the session does not have are named, asked as the caller, tools only', async () => {
    const { bound, toolAsks, tenant } = await setup({
      needs: { 'weekly-report': ['Browser', 'Files'] },
      missingTools: async (asker, names) => (
        toolAsks.push([asker.tenant, names]),
        new Set(['Browser'])
      ),
    })
    expect(await bound.read(read, signal)).toMatchObject({
      ok: { text: 'body', missingTools: ['Browser'] },
    })
    expect(toolAsks).toEqual([[tenant, ['Browser', 'Files']]])
  })

  it('R3: when Tool cannot tell, the read still gives the text and says it does not know', async () => {
    const { bound } = await setup({
      needs: { 'weekly-report': ['Browser'] },
      missingTools: async () => 'unknown',
    })
    expect(await bound.read(read, signal)).toMatchObject({
      ok: { text: 'body', missingTools: 'unknown' },
    })
  })

  it('R4: a search asks once for every tool the page needs and marks each Skill with what it lacks', async () => {
    let asked: readonly string[] = []
    const { bound } = await setup({
      needs: { alpha: ['Browser'], gamma: ['Mail', 'Browser'] },
      missingTools: async (_asker, names) => ((asked = names), new Set(['Browser'])),
    })
    const page = await bound.search({ query: '', after: null, limit: 3 }, signal)
    expect(asked).toEqual(['Browser', 'Mail'])
    expect('ok' in page && page.ok.entries).toEqual([
      { kind: 'available', name: 'alpha', description: 'alpha notes.', needs: ['Browser'] },
      { kind: 'available', name: 'beta', description: 'beta notes.' },
      { kind: 'available', name: 'gamma', description: 'gamma notes.', needs: ['Browser'] },
    ])
  })
})

describe('Skills binding: Skills from an entry source (C401, C404, C405)', () => {
  const docs = () =>
    createMemorySkillEntrySource<unknown>({
      prefix: 'mcp__',
      label: 'docs-server',
      skills: {
        mcp__docs__style: {
          description: 'House style notes.',
          body: '# Style\nShort sentences.',
          files: { 'ref.md': 'see\n' },
        },
        mcp__docs__deploy: { description: 'How to deploy.', body: '# Deploy\n' },
      },
    })
  const late: SkillEntrySource<unknown> = {
    ...docs(),
    prefix: 'slow__',
    list: () => new Promise(() => undefined),
  }

  it('search ranks source Skills with the asset ones, marks where they come from, and pages over both', async () => {
    const { bound } = await setup({ sources: [docs()] })
    const first = await bound.search({ query: 'notes', after: null, limit: 3 }, signal)
    if (!('ok' in first) || first.ok.next === null) throw new Error(JSON.stringify(first))
    const rest = await bound.search({ query: 'notes', after: first.ok.next, limit: 3 }, signal)
    if (!('ok' in rest)) throw new Error(JSON.stringify(rest))
    const all = [...first.ok.entries, ...rest.ok.entries]
    expect(all.map(entry => entry.name).toSorted()).toEqual([
      'alpha',
      'beta',
      'gamma',
      'mcp__docs__style',
    ])
    expect(all.find(entry => entry.name === 'mcp__docs__style')).toStrictEqual({
      kind: 'available',
      name: 'mcp__docs__style',
      description: 'House style notes.',
      origin: 'docs-server',
    })
    expect(rest.ok.next).toBeNull()
  })

  it('a source that throws, is late, or lists a name outside its prefix leaves the asset Skills as they are', async () => {
    const throws: SkillEntrySource<unknown> = {
      ...docs(),
      prefix: 'bad__',
      list: () => {
        throw new Error('boom')
      },
    }
    const strays = createMemorySkillEntrySource<unknown>({
      prefix: 'odd__',
      label: 'odd',
      skills: {
        odd__a: { description: 'notes', body: 'x' },
        other: { description: 'notes', body: 'x' },
      },
    })
    const { bound } = await setup({ sources: [throws, strays] })
    expect(await bound.search({ query: 'notes', after: null, limit: 10 }, signal)).toStrictEqual({
      ok: {
        entries: ['alpha', 'beta', 'gamma'].map(name => ({
          kind: 'available',
          name,
          description: `${name} notes.`,
        })),
        next: null,
      },
    })
  }, 10_000)

  it('a late source is left out of the search after the bound', async () => {
    const { bound } = await setup({ sources: [late, docs()] })
    const found = await bound.search({ query: 'style', after: null, limit: 10 }, signal)
    expect(found).toMatchObject({ ok: { entries: [{ name: 'mcp__docs__style' }] } })
  }, 10_000)

  it('read, read_file and list go to the source, carry its label as external, and have no directory', async () => {
    const { bound, calls } = await setup({ sources: [docs()] })
    const skill = 'mcp__docs__style'
    expect(await bound.read({ skill, offset: 0, maxBytes: 100 }, signal)).toStrictEqual({
      ok: {
        text: '# Style\nShort sentences.',
        start: 0,
        end: 24,
        total: 24,
        source: { external: 'docs-server' },
      },
    })
    expect(
      await bound.readFile({ skill, path: 'ref.md', offset: 1, maxBytes: 100 }, signal),
    ).toStrictEqual({
      ok: { text: 'ee\n', start: 1, end: 4, total: 4, source: { external: 'docs-server' } },
    })
    expect(await bound.list({ skill }, signal)).toStrictEqual({
      ok: {
        files: [
          { path: 'SKILL.md', size: 24 },
          { path: 'ref.md', size: 4 },
        ],
        source: { external: 'docs-server' },
      },
    })
    expect(calls.filter(call => call[0] === 'read' || call[0] === 'list')).toEqual([])
  })

  it('a name no source owns, or one its source does not know, is not found; a file it lacks is file-not-found', async () => {
    const { bound } = await setup({ sources: [docs()] })
    const notFound = { failure: { kind: 'not-found' } }
    expect(
      await bound.read({ skill: 'web__docs__style', offset: 0, maxBytes: 10 }, signal),
    ).toStrictEqual(notFound)
    expect(
      await bound.read({ skill: 'mcp__docs__gone', offset: 0, maxBytes: 10 }, signal),
    ).toStrictEqual(notFound)
    expect(
      await bound.readFile(
        { skill: 'mcp__docs__style', path: 'nope.md', offset: 0, maxBytes: 10 },
        signal,
      ),
    ).toStrictEqual({ failure: { kind: 'file-not-found' } })
  })

  it('a source that throws answers unavailable for that read; a cancelled read is an abort', async () => {
    const throws: SkillEntrySource<unknown> = {
      ...docs(),
      read: () => Promise.reject(new Error('boom')),
    }
    const { bound } = await setup({ sources: [throws] })
    const input = { skill: 'mcp__docs__style', offset: 0, maxBytes: 10 }
    expect(await bound.read(input, signal)).toStrictEqual({
      failure: { kind: 'unavailable', reason: 'the source of this Skill cannot be read now' },
    })
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(bound.read(input, cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('answers every source failure as the Skills failure of the same name', async () => {
    for (const failure of ['not-text', 'changed', 'unavailable'] as const) {
      const answering: SkillEntrySource<unknown> = {
        ...docs(),
        read: async () => ({ failure }),
      }
      const { bound } = await setup({ sources: [answering] })
      const answer = await bound.read(
        { skill: 'mcp__docs__style', offset: 0, maxBytes: 10 },
        signal,
      )
      expect(answer).toMatchObject({ failure: { kind: failure } })
    }
  })

  it('a caller the verifier refuses asks no source', async () => {
    const { bound, calls } = await setup({ sources: [docs()], callerTenant: 'b' })
    expect(
      await bound.read({ skill: 'mcp__docs__style', offset: 0, maxBytes: 10 }, signal),
    ).toStrictEqual({ failure: { kind: 'not-found' } })
    expect(calls.filter(call => call[0] === 'sources')).toEqual([])
  })
})

describe('the scope a Skills call names', () => {
  const snapshot = (over: Record<string, unknown>) =>
    ({
      creation: { workspace: null },
      changes: [],
      run: { kind: 'active', run: 'run_1' },
      ...over,
    }) as unknown as WorkSnapshot
  const at = { kind: 'workspace', value: 'somewhere' }
  const away = { kind: 'workspace', value: null }

  it('is the key of the running turn once the session has stood at a workspace, and none before', () => {
    expect(turnScopeOf(snapshot({}))).toBeNull()
    expect(turnScopeOf(snapshot({ changes: [away] }))).toBeNull()
    expect(turnScopeOf(snapshot({ changes: [{ kind: 'model', value: 'x' }] }))).toBeNull()
    expect(turnScopeOf(snapshot({ creation: { workspace: 'somewhere' } }))).toEqual({
      key: 'run_1',
    })
    expect(turnScopeOf(snapshot({ changes: [at, away] }))).toEqual({ key: 'run_1' })
    expect(turnScopeOf(snapshot({ changes: [at], run: { kind: 'none' } }))).toBeNull()
  })
})
