import type { Access } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type {
  CatalogEntry,
  RankedDocument,
  SkillEntrySource,
  SkillSourceEntry,
} from '@omne-harness/skill-contract'

const SOURCED = /^[a-z][a-z0-9]*__./u

/** Whether a name is of the shape a source gives: its prefix, then more. Asset Skill names never are. */
export function isSourcedSkillName(name: string): boolean {
  return SOURCED.test(name)
}

/** The one source whose prefix starts this name; none when no source, or two, claim it. */
export function sourceOfSkill<P>(
  sources: readonly SkillEntrySource<P>[],
  name: string,
): SkillEntrySource<P> | undefined {
  const owners = sources.filter(source => name.startsWith(source.prefix))
  return owners.length === 1 ? owners[0] : undefined
}

function keeps(source: SkillEntrySource<unknown>, entries: readonly SkillSourceEntry[]): boolean {
  const names = entries.map(entry => entry.name)
  return (
    new Set(names).size === names.length &&
    names.every(name => name.length > source.prefix.length && name.startsWith(source.prefix))
  )
}

async function listOne<P>(
  source: SkillEntrySource<P>,
  access: Access<P>,
  timeoutMs: number,
): Promise<readonly SkillSourceEntry[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<Outcome<never, 'unavailable'>>(resolve => {
    timer = setTimeout(() => resolve(fail('unavailable')), timeoutMs)
  })
  try {
    const listed = await Promise.race([
      Promise.resolve(access).then(asker => source.list(asker)),
      late,
    ])
    if (!('ok' in listed)) return []
    return keeps(source, listed.ok) ? listed.ok : []
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** What each source lists to this asker now; one that throws, is late, answers unavailable or lists a name outside its prefix gives nothing. */
export async function listSourcedSkills<P>(
  sources: readonly SkillEntrySource<P>[],
  access: Access<P>,
  timeoutMs: number,
): Promise<readonly SkillSourceEntry[]> {
  const sole = sources.filter(source =>
    sources.every(other => other === source || other.prefix !== source.prefix),
  )
  const listed = await Promise.all(sole.map(source => listOne(source, access, timeoutMs)))
  return listed.flat()
}

export type SearchedSkill =
  | Readonly<{ kind: 'asset'; entry: CatalogEntry }>
  | Readonly<{ kind: 'source'; entry: SkillSourceEntry }>

/** Asset Skills as the catalog found them and source Skills in one order; with no source Skill the catalog's order stands. */
export function mergeSearched(
  text: string,
  assets: readonly CatalogEntry[],
  sourced: readonly SkillSourceEntry[],
  order: (text: string, documents: readonly RankedDocument[]) => readonly string[],
): readonly SearchedSkill[] {
  if (sourced.length === 0) return assets.map(entry => ({ kind: 'asset', entry }))
  const byName = new Map<string, SearchedSkill[]>()
  const documents: RankedDocument[] = []
  const add = (name: string, description: string | undefined, item: SearchedSkill) => {
    const known = byName.get(name)
    if (known !== undefined) return void known.push(item)
    byName.set(name, [item])
    documents.push({ name, fields: description === undefined ? [name] : [name, description] })
  }
  for (const entry of assets)
    add(entry.capability.name, entry.description, { kind: 'asset', entry })
  for (const entry of sourced) add(entry.name, entry.description, { kind: 'source', entry })
  return order(text, documents).flatMap(name => byName.get(name) ?? [])
}
