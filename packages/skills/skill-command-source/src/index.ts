import { capabilityId } from '@omne-harness/assets'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import type { Asker, CommandEntry, EntrySource, Taken } from '@omne-harness/slash-command-contract'
import {
  type CatalogEntry,
  isSkillName,
  type SkillAccess,
  type SkillCatalog,
  type SkillMaterialBasis,
} from '@omne-harness/skill-contract'

export const SKILL_SPACE = 'skill'

/** Who reads the Skill catalogue for this asker, and in which scope: the session's own work, never wider. */
export type SkillReader<W> = Readonly<{ access: Access<W>; scope: unknown }>

export type SkillEntrySourcePorts<P, W> = Readonly<{
  catalog(): SkillCatalog<W, unknown> | undefined
  access(): SkillAccess<W, unknown> | undefined
  readerOf(asker: Asker<P>): Promise<Outcome<SkillReader<W>, 'unavailable'>>
  changes?(tenant: TenantId, changed: () => void): () => void
}>

const PAGE = 65_536

function entryOf(entry: CatalogEntry): CommandEntry {
  const title = entry.description ?? entry.name
  const base = { space: SKILL_SPACE, name: entry.name, kind: 'reference' as const, title }
  return entry.kind === 'adopted' ? base : { ...base, unavailable: entry.reason }
}

async function bodyOf<W>(
  access: SkillAccess<W, unknown>,
  reader: SkillReader<W>,
  name: string,
  signal: AbortSignal,
): Promise<Outcome<Taken, 'unavailable' | 'not-listed'>> {
  const id = capabilityId('skill', name)
  if (!isSkillName(name) || !id.ok) return fail('not-listed')
  let text = ''
  let start = 0
  let basis: SkillMaterialBasis | undefined
  for (;;) {
    const read = await access.read(
      reader.access,
      reader.scope,
      { capability: id.id, part: { kind: 'body' } },
      { range: { start, length: PAGE }, signal, ...(basis === undefined ? {} : { basis }) },
    )
    if (!('ok' in read))
      return fail(read.failure.kind === 'not-available-to-you' ? 'not-listed' : 'unavailable')
    if (read.ok.content.kind !== 'text') return fail('unavailable')
    basis = read.ok.basis
    text += read.ok.content.text
    start = read.ok.range.start + read.ok.range.length
    if (read.ok.complete) break
  }
  if (basis === undefined) return fail('unavailable')
  return succeed({
    kind: 'text',
    text,
    origin: {
      name: `${SKILL_SPACE}:${name}`,
      layer: basis.layer,
      version: basis.assetVersion ?? '',
      digest: basis.digest,
    },
  })
}

/** The Skill catalogue in the shape of command entries. It adds no fact about any Skill, and reads through the same gate. */
export function createSkillEntrySource<P, W>(ports: SkillEntrySourcePorts<P, W>): EntrySource<P> {
  return {
    name: SKILL_SPACE,
    space: SKILL_SPACE,
    async list(asker) {
      const catalog = ports.catalog()
      const reader = await ports.readerOf(asker)
      if (catalog === undefined || !('ok' in reader)) return fail('unavailable')
      const found = await catalog.summaries(reader.ok.access, reader.ok.scope)
      return 'ok' in found ? succeed(found.ok.map(entryOf)) : fail('unavailable')
    },
    async take(asker, { name }, signal) {
      const access = ports.access()
      const reader = await ports.readerOf(asker)
      if (access === undefined || !('ok' in reader)) return fail('unavailable')
      return bodyOf(access, reader.ok, name, signal)
    },
    ...(ports.changes === undefined ? {} : { watch: ports.changes }),
  }
}
