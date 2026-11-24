import type {
  Adoption,
  Dimension,
  EnabledExtension,
  LoopExtensionDeclaration,
  Position,
} from '@omne-harness/agent-contract'
import type { EnabledExtensionsView, EnabledMember } from '@omne-harness/loop-extension-contract'

/** What the assets and the settings say of one extension the tenant holds. Unavailable is a fact of its own, never a default. */
export type ExtensionFacts = Readonly<{
  capability: string
  assetRef: string
  holding: 'enabled' | 'disabled'
  winner:
    | Readonly<{ kind: 'version'; version: string; declaration: LoopExtensionDeclaration | null }>
    | Readonly<{ kind: 'none' }>
    | Readonly<{ kind: 'unavailable' }>
  run:
    | Readonly<{ kind: 'value'; value: boolean }>
    | Readonly<{ kind: 'absent' }>
    | Readonly<{ kind: 'unavailable' }>
}>

export type EnabledViewResult =
  | Readonly<{ kind: 'view'; view: EnabledExtensionsView }>
  | Readonly<{ kind: 'unavailable'; capability: string }>

type Decision = EnabledMember | 'out' | 'unavailable'

// The four conditions, in the order that reads the least: a disabled holding is out whatever else is unreadable.
function decide(facts: ExtensionFacts): Decision {
  if (facts.holding === 'disabled' || facts.winner.kind === 'none') return 'out'
  if (facts.winner.kind === 'unavailable' || facts.run.kind === 'unavailable') return 'unavailable'
  if (facts.run.kind === 'absent' || !facts.run.value) return 'out'
  const { version, declaration } = facts.winner
  if (declaration === null) return 'unavailable'
  return { capability: facts.capability, assetRef: facts.assetRef, version, declaration }
}

/** The extensions that run for a tenant now. One unreadable fact makes the whole view unavailable: no partial list. */
export function enabledView(
  extensions: readonly ExtensionFacts[],
  basis: EnabledExtensionsView['basis'],
): EnabledViewResult {
  const members: EnabledMember[] = []
  for (const facts of extensions) {
    const decided = decide(facts)
    if (decided === 'unavailable') return { kind: 'unavailable', capability: facts.capability }
    if (decided !== 'out') members.push(decided)
  }
  return { kind: 'view', view: { members, basis } }
}

const OWNER = 'loop-extension'

/** The exact version of a member, as the identity the Agent records with the chain and asks the implementation by. */
export function implementationOf(
  member: Pick<EnabledMember, 'capability' | 'assetRef' | 'version'>,
): Adoption {
  return {
    owner: OWNER,
    name: member.capability,
    revision: member.version,
    digest: member.assetRef,
  }
}

export function memberOfImplementation(
  implementation: Adoption,
): Pick<EnabledMember, 'capability' | 'assetRef' | 'version'> | null {
  if (implementation.owner !== OWNER) return null
  const { name: capability, revision: version, digest: assetRef } = implementation
  return { capability, assetRef, version }
}

const sameDimension = (left: Dimension | null, right: Dimension | null): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** The members of one position, in ascending order of the capability name. */
export function membersAt(
  view: EnabledExtensionsView,
  place: Readonly<{ position: Position; dimension: Dimension | null }>,
): readonly EnabledExtension[] {
  return view.members
    .filter(
      ({ declaration }) =>
        declaration.position === place.position &&
        sameDimension(declaration.dimension ?? null, place.dimension),
    )
    .toSorted((left, right) =>
      left.capability < right.capability ? -1 : left.capability > right.capability ? 1 : 0,
    )
    .map(member => ({ declaration: member.declaration, implementation: implementationOf(member) }))
}
