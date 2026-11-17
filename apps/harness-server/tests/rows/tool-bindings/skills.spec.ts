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
import {
  createBoundSkills,
  type SkillsBindingPorts,
} from '../../../src/rows/tool-bindings/skills.ts'
import { fixtureEnv, fixtureTenant, okOf } from '../../entry/support.ts'

const signal = new AbortController().signal

function skill(name: string) {
  const id = capabilityId('skill', name)
  if (!id.ok || !isSkillName(name)) throw new Error(name)
  return { capability: id.id, name }
}

function entries(...names: string[]): CatalogEntry[] {
  return names.map(name => ({ kind: 'adopted', ...skill(name), dependencies: [] }))
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
    callerTenant: 'a' | 'b'
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
      return { ok: entries('alpha', 'beta', 'gamma') }
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
      return { ok: { basis, resources: [], directory: '/skills/weekly-report' } }
    },
  }
  const ports: SkillsBindingPorts = {
    verifier: () =>
      overrides.verifierAbsent === true ? undefined : fixture.root.get('principalVerifier'),
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

  it('refuses a name that is not a Skill name before it asks anyone', async () => {
    const { bound, calls } = await setup()
    expect(
      await bound.read({ skill: 'Weekly Report', offset: 0, maxBytes: 100 }, signal),
    ).toStrictEqual({
      failure: { kind: 'invalid', field: 'skill', reason: 'not a Skill name' },
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

  it('lists the files with the directory', async () => {
    const { bound } = await setup()
    expect(await bound.list({ skill: 'weekly-report' }, signal)).toStrictEqual({
      ok: { files: [], directory: '/skills/weekly-report' },
    })
  })
})

describe('Skills binding: search pages (table 3)', () => {
  it('pages with a cursor and gives none after the last page', async () => {
    const { bound } = await setup()
    const first = await bound.search({ query: 'notes', after: null, limit: 2 }, signal)
    if (!('ok' in first) || first.ok.next === null) throw new Error(JSON.stringify(first))
    expect(first.ok.entries.map(entry => entry.name)).toEqual(['alpha', 'beta'])
    expect(
      await bound.search({ query: 'notes', after: first.ok.next, limit: 2 }, signal),
    ).toStrictEqual({
      ok: { entries: [{ kind: 'available', name: 'gamma' }], next: null },
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
