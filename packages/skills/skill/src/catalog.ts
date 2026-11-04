// `SkillCatalog` over two ports: the current lawful set from `SkillResolution.adopted`, one
// entry per identity, then `SkillReadCheck.check` for each identity that the request or the
// query keeps. Only `granted` identities are listed; a `refused` one is left out without a
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
import { answered, kindOf } from './port-answer.ts'
import type { SkillPorts } from './ports.ts'

type Listing = Outcome<readonly CatalogEntry[], 'unknown'>

const UNKNOWN = Object.freeze({ failure: 'unknown' } as const)
const LAWFUL_KINDS: ReadonlySet<string> = new Set(['adopted', 'known-unavailable'])

/** The canonical text of a capability identity: the sort key of the entries. */
function textOf(capability: CapabilityId): string {
  return `${capability.category}:${capability.name}`
}

function byText(left: CatalogEntry, right: CatalogEntry): number {
  const a = textOf(left.capability)
  const b = textOf(right.capability)
  return a < b ? -1 : a > b ? 1 : 0
}

/** The entry of one answer of the lawful set, by the group page "检查与发现". */
function entryOf(answer: CatalogResolution): CatalogEntry {
  if (answer.kind === 'adopted') {
    const { ref, declared } = answer
    return {
      kind: 'adopted',
      capability: ref.capability,
      name: declared.name,
      ...(declared.description === undefined ? {} : { description: declared.description }),
      dependencies: declared.tools,
    }
  }
  const { capability, name, description, reason } = answer
  return {
    kind: 'stand-in',
    capability,
    name,
    ...(description === undefined ? {} : { description }),
    reason,
  }
}

/** Whether `listed` is an outcome of the lawful set: an array of answers in the closed set, or a failure. */
function isLawfulSet(
  listed: Outcome<readonly CatalogResolution[], 'unknown'> | undefined,
): listed is Outcome<readonly CatalogResolution[], 'unknown'> {
  if (typeof listed !== 'object' || listed === null) return false
  if (!('ok' in listed)) return 'failure' in listed
  return (
    Array.isArray(listed.ok) && listed.ok.every(answer => LAWFUL_KINDS.has(kindOf(answer) ?? ''))
  )
}

/** The current lawful set written out in entries, one per identity, in canonical order; or `unknown`. */
async function lawfulEntries<P, S>(
  ports: Pick<SkillPorts<P, S>, 'resolution'>,
  access: Access<P>,
  scope: S,
): Promise<Listing> {
  const listed = await answered(() => ports.resolution.adopted(access, scope))
  if (!isLawfulSet(listed) || !('ok' in listed)) return UNKNOWN
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
    entries.map(entry =>
      answered(() => ports.readCheck.check(access, scope, entry.capability)).then(kindOf),
    ),
  )
  if (!verdicts.every(kind => kind === 'granted' || kind === 'refused')) return UNKNOWN
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
    summaries(access, scope, capabilities) {
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
