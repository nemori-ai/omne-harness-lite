// `SkillCatalog` over two ports: the current lawful set from `SkillResolution.adopted`, one
// entry per identity, then `SkillReadCheck.check` for each identity that the request or the
// query keeps. An empty request calls no port. Only `granted` identities are listed; a `refused` one is left out without a
// trace; one `unknown` makes the whole answer `unknown`. The checks go out together and the
// answer is read in the order of the entries, so the completion order cannot change it. The
// entries are sorted by the canonical text of the capability identity so that one input gives
// one output; the order is not a promise. No bytes are read: the catalog takes no source.
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { sameCapability, type CatalogEntry, type SkillCatalog } from '@omne-harness/skill-contract'
import type { CatalogResolution } from '@omne-harness/skill-contract/provider'
import { matches } from './match.ts'
import { answered, parseLawfulSet, parseVerdict } from './port-answer.ts'
import type { SkillPorts } from './ports.ts'

type Listing = Outcome<readonly CatalogEntry[], 'unknown'>

const UNKNOWN = Object.freeze({ failure: 'unknown' } as const)

/** The canonical text of a capability identity: the sort key of the entries. */
function textOf(capability: CapabilityId): string {
  return `${capability.category}:${capability.name}`
}

function byText(left: CatalogEntry, right: CatalogEntry): number {
  const a = textOf(left.capability)
  const b = textOf(right.capability)
  return a < b ? -1 : a > b ? 1 : 0
}

/** The entry of one parsed answer of the lawful set, by the group page "检查与发现". */
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
      // A kind that `CatalogResolution` gains and this switch lacks fails to compile here.
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

/** The current lawful set written out in entries, one per identity, in canonical order; or `unknown`. */
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
  return succeed(entries.sort(byText))
}

/** The entries that the read check grants, in the given order; `unknown` when one check is unknown. */
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
      // No answer is `unknown`, like the verdict `unknown` itself.
      return verdict?.kind ?? 'unknown'
    }),
  )
  if (verdicts.includes('unknown')) return UNKNOWN
  return succeed(entries.filter((_, index) => verdicts[index] === 'granted'))
}

export function createSkillCatalog<P, S>(
  ports: Pick<SkillPorts<P, S>, 'readCheck' | 'resolution'>,
): SkillCatalog<P, S> {
  /** The lawful entries that `keep` selects, then the read check on those alone. */
  const listing = async (
    access: Access<P>,
    scope: S,
    keep: (entry: CatalogEntry) => boolean,
  ): Promise<Listing> => {
    const lawful = await lawfulEntries(ports, access, scope)
    if (!('ok' in lawful)) return fail(lawful.failure)
    return grantedOf(ports, access, scope, lawful.ok.filter(keep))
  }
  return {
    async summaries(access, scope, capabilities) {
      // An empty request asks about no identity, so no port is asked either: the answer is the
      // empty list even when the lawful set would be unknown now.
      if (capabilities?.length === 0) return succeed([])
      return listing(access, scope, entry =>
        capabilities === undefined
          ? true
          : capabilities.some(item => sameCapability(item, entry.capability)),
      )
    },
    search(access, scope, query) {
      return listing(access, scope, entry => matches(query.text, entry.name, entry.description))
    },
  }
}
