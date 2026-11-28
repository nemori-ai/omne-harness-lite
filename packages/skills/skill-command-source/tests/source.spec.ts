import { capabilityId } from '@omne-harness/assets'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  CatalogEntry,
  ReadResult,
  SkillAccess,
  SkillCatalog,
} from '@omne-harness/skill-contract'
import { createSkillEntrySource, SKILL_SPACE } from '@omne-harness/skill-command-source'
import { describe, expect, it } from 'vitest'

const tenant = 'tenant-a' as unknown as TenantId
const asker = { principal: 'member', tenant, session: 's1' }
const signal = new AbortController().signal
const id = (name: string) => {
  const made = capabilityId('skill', name)
  if (!made.ok) throw new Error(name)
  return made.id
}
const adopted = (name: string, description?: string): CatalogEntry =>
  ({
    kind: 'adopted',
    capability: id(name),
    name,
    ...(description === undefined ? {} : { description }),
    dependencies: [],
  }) as never
const standIn = (name: string, reason: string): CatalogEntry =>
  ({ kind: 'stand-in', capability: id(name), name, reason }) as never
const reader = { access: { principal: 'work-of-s1', tenant } as never, scope: { key: 'run-1' } }

function ports(
  over: Partial<{
    entries: CatalogEntry[] | 'unknown'
    pages: string[]
    readFailure: string
    reader: boolean
  }> = {},
) {
  const seen: { scope: unknown; principal: unknown; basis: unknown }[] = []
  const catalog: SkillCatalog<string, unknown> = {
    summaries: async (who, scope) => {
      seen.push({ scope, principal: who.principal, basis: undefined })
      return over.entries === 'unknown' ? fail('unknown') : succeed(over.entries ?? [])
    },
    search: async () => fail('unknown'),
    order: () => [],
  }
  const pages = over.pages ?? ['正文']
  const access: SkillAccess<string, unknown> = {
    read: async (who, scope, _target, options) => {
      seen.push({ scope, principal: who.principal, basis: options?.basis })
      if (over.readFailure !== undefined) return fail({ kind: over.readFailure } as never)
      const start = options?.range?.start ?? 0
      const page = pages.findIndex((_, n) => pages.slice(0, n).join('').length === start)
      const text = pages[page] ?? ''
      const result: ReadResult = {
        basis: {
          capability: id('review'),
          layer: 'tenant',
          assetVersion: '3',
          digest: 'sha-1',
        } as never,
        part: { kind: 'body' },
        content: { kind: 'text', text },
        range: { start, length: text.length },
        total: pages.join('').length,
        complete: page === pages.length - 1,
      }
      return succeed(result)
    },
    list: async () => fail({ kind: 'unknown' } as never),
  }
  const source = createSkillEntrySource<string, string>({
    catalog: () => catalog,
    access: () => access,
    readerOf: async () => (over.reader === false ? fail('unavailable') : succeed(reader)),
  })
  return { source, seen }
}

describe('the Skill catalogue as command entries', () => {
  it('hands over every Skill as a reference in the skill namespace, read as the session work and in its scope', async () => {
    const { source, seen } = ports({
      entries: [adopted('review', '评审一份改动'), adopted('tmp'), standIn('old-style', '停用了')],
    })
    expect([source.name, source.space]).toEqual([SKILL_SPACE, 'skill'])
    expect(await source.list(asker, signal)).toEqual({
      ok: [
        { space: 'skill', name: 'review', kind: 'reference', title: '评审一份改动' },
        { space: 'skill', name: 'tmp', kind: 'reference', title: 'tmp' },
        {
          space: 'skill',
          name: 'old-style',
          kind: 'reference',
          title: 'old-style',
          unavailable: '停用了',
        },
      ],
    })
    expect(seen).toEqual([{ scope: { key: 'run-1' }, principal: 'work-of-s1', basis: undefined }])
  })

  it('cannot tell, rather than says empty, when the catalogue or the reader cannot be had', async () => {
    expect(await ports({ entries: 'unknown' }).source.list(asker, signal)).toEqual({
      failure: 'unavailable',
    })
    expect(await ports({ reader: false }).source.list(asker, signal)).toEqual({
      failure: 'unavailable',
    })
  })

  it('hands over the whole body, page by page, pinned to the version of the first page', async () => {
    const { source, seen } = ports({ pages: ['第一页', '第二页'] })
    expect(await source.take(asker, { name: 'review', args: '', request: 'r' }, signal)).toEqual({
      ok: {
        kind: 'text',
        text: '第一页第二页',
        origin: { name: 'skill:review', layer: 'tenant', version: '3', digest: 'sha-1' },
      },
    })
    expect(seen.map(one => one.basis === undefined)).toEqual([true, false])
  })

  it('answers not listed when the reader may not read it, and unavailable for any other failure', async () => {
    expect(
      await ports({ readFailure: 'not-available-to-you' }).source.take(
        asker,
        { name: 'review', args: '', request: 'r' },
        signal,
      ),
    ).toEqual({ failure: 'not-listed' })
    expect(
      await ports({ readFailure: 'source-unavailable' }).source.take(
        asker,
        { name: 'review', args: '', request: 'r' },
        signal,
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(
      await ports({ reader: false }).source.take(
        asker,
        { name: 'review', args: '', request: 'r' },
        signal,
      ),
    ).toEqual({
      failure: 'unavailable',
    })
    expect(
      await ports().source.take(asker, { name: 'Not A Name', args: '', request: 'r' }, signal),
    ).toEqual({
      failure: 'not-listed',
    })
  })
})
