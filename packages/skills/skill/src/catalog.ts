import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { sameCapability, type CatalogEntry, type SkillCatalog } from '@omne-harness/skill-contract'
import type { CatalogResolution } from '@omne-harness/skill-contract/provider'
import { buildCorpus, rank, type Corpus, type RankingParameters } from '@omne-harness/text-search'
import { answered, parseLawfulSet, parseVerdict } from './port-answer.ts'
import type { SkillPorts } from './ports.ts'

type Listing = Outcome<readonly CatalogEntry[], 'unknown'>

const UNKNOWN = Object.freeze({ failure: 'unknown' } as const)
const CORPORA_KEPT = 16

function byIdentity(left: CatalogEntry, right: CatalogEntry): number {
  const a = left.capability
  const b = right.capability
  if (a.category !== b.category) return a.category < b.category ? -1 : 1
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return 0
}

function entryOf(answer: CatalogResolution): CatalogEntry {
  switch (answer.kind) {
    case 'adopted': {
      const { ref, declared } = answer
      return {
        kind: 'adopted',
        capability: ref.capability,
        name: declared.name,
        ...(declared.description === undefined ? {} : { description: declared.description }),
        dependencies: declared.tools,
      }
    }
    case 'known-unavailable': {
      const { capability, name, description, reason } = answer
      return {
        kind: 'stand-in',
        capability,
        name,
        ...(description === undefined ? {} : { description }),
        reason,
      }
    }
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

async function lawfulEntries<P, S>(
  ports: Pick<SkillPorts<P, S>, 'resolution'>,
  access: Access<P>,
  scope: S,
): Promise<Listing> {
  const listed = await answered(() => ports.resolution.adopted(access, scope), parseLawfulSet)
  if (listed === undefined || !('ok' in listed)) return UNKNOWN
  const entries: CatalogEntry[] = []
  for (const answer of listed.ok) {
    const entry = entryOf(answer)
    if (!entries.some(item => sameCapability(item.capability, entry.capability)))
      entries.push(entry)
  }
  return succeed(entries.sort(byIdentity))
}

async function grantedOf<P, S>(
  ports: Pick<SkillPorts<P, S>, 'readCheck'>,
  access: Access<P>,
  scope: S,
  entries: readonly CatalogEntry[],
): Promise<Listing> {
  const verdicts = await Promise.all(
    entries.map(async entry => {
      const verdict = await answered(
        () => ports.readCheck.check(access, scope, entry.capability),
        parseVerdict,
      )
      return verdict?.kind ?? 'unknown'
    }),
  )
  if (verdicts.includes('unknown')) return UNKNOWN
  return succeed(entries.filter((_, index) => verdicts[index] === 'granted'))
}

function documentsOf(entries: readonly CatalogEntry[]) {
  return entries.map(entry => ({
    name: entry.capability.name,
    fields: entry.description === undefined ? [entry.name] : [entry.name, entry.description],
  }))
}

/** The corpus of the same documents is built once; the least recently used is let go past a few. */
function corpora(): (entries: readonly CatalogEntry[]) => Corpus {
  const kept = new Map<string, Corpus>()
  return entries => {
    const documents = documentsOf(entries)
    const key = JSON.stringify(documents)
    const known = kept.get(key) ?? buildCorpus(documents)
    kept.delete(key)
    kept.set(key, known)
    for (const oldest of kept.keys()) {
      if (kept.size <= CORPORA_KEPT) break
      kept.delete(oldest)
    }
    return known
  }
}

function ranked(
  corpus: Corpus,
  entries: readonly CatalogEntry[],
  text: string,
  ranking: RankingParameters,
): readonly CatalogEntry[] {
  const order = rank(corpus, text, ranking)
  return order.flatMap(name => entries.filter(entry => entry.capability.name === name))
}

export function createSkillCatalog<P, S>(
  ports: Pick<SkillPorts<P, S>, 'readCheck' | 'resolution'>,
  options: Readonly<{ ranking: RankingParameters }>,
): SkillCatalog<P, S> {
  const ranking = Object.freeze({ ...options.ranking })
  rank(buildCorpus([]), '', ranking)
  const corpusOf = corpora()
  const ordered = (entries: readonly CatalogEntry[], text: string) =>
    ranked(corpusOf(entries), entries, text, ranking)
  const listing = async (
    access: Access<P>,
    scope: S,
    keep: (lawful: readonly CatalogEntry[]) => readonly CatalogEntry[],
  ): Promise<Listing> => {
    const lawful = await lawfulEntries(ports, access, scope)
    if (!('ok' in lawful)) return fail(lawful.failure)
    return grantedOf(ports, access, scope, keep(lawful.ok))
  }
  return {
    async summaries(access, scope, capabilities) {
      if (capabilities?.length === 0) return succeed([])
      return listing(access, scope, lawful =>
        capabilities === undefined
          ? lawful
          : lawful.filter(entry =>
              capabilities.some(item => sameCapability(item, entry.capability)),
            ),
      )
    },
    async search(access, scope, query) {
      const granted = await listing(access, scope, lawful => ordered(lawful, query.text))
      return 'ok' in granted ? succeed(ordered(granted.ok, query.text)) : granted
    },
  }
}
