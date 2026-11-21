import { describe, expect, it } from 'vitest'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  isSafeReason,
  isSkillName,
  type CatalogEntry,
  type ReadFailure,
} from '@omne-harness/skill-contract'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
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
  const catalog: SkillCatalog<unknown, unknown> = {
    summaries: async () => ({ ok: [] }),
    search: async (...args) => {
      calls.push(['search', ...args])
      return { ok: overrides.results?.shift() ?? entries('alpha', 'beta', 'gamma') }
    },
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
  }
  const bound = createBoundSkills(
    { principal, tenant, request: {} as FixedToolRequest } as never,
    ports,
  )
  return { bound, calls }
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
      ok: { text: 'body', start: 3, end: 7, total: 10, directory: '/skills/weekly-report' },
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
    ).toStrictEqual({ ok: { text: 'body', start: 0, end: 4, total: 4 } })
    expect(await bound.list({ skill: 'weekly-report' }, signal)).toStrictEqual({
      ok: { files: [] },
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
