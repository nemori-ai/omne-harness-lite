import { canonicalDigest } from '@omne-harness/tool'
import { canonicalText } from '@omne-harness/authorization'
import type { AssetsPublicationProjection } from '@omne-harness/assets-local'
import type { GovernanceAdoptionCurrent } from '@omne-harness/governance-local'
import type {
  SettingsOwnerProjection,
  SettingsProjectionBinding,
  StandalonePublicationProjection,
} from '@omne-harness/settings-local'
import type { GovernancePublication } from './current-publications.ts'

const equal = (a: unknown, b: unknown) => canonicalText(a) === canonicalText(b)
const only = <T>(values: readonly T[]): T | undefined =>
  values.length === 1 ? values[0] : undefined
type PublicationView =
  | AssetsPublicationProjection['views'][number]
  | StandalonePublicationProjection['views'][number]

function targetEvidence(
  view: SettingsOwnerProjection['views'][number],
  publication: PublicationView,
  released: GovernancePublication,
): GovernanceAdoptionCurrent['targets'][number] | undefined {
  if (
    view.ownerRevision !== publication.ownerRevision ||
    !equal(view.definitionRef, publication.definitionRef)
  )
    return undefined
  const declaration = released.declaration
  const definition = declaration.settings.find(
    value =>
      value.providerId === view.definitionRef.providerId &&
      value.definitionId === view.definitionRef.definitionId &&
      value.version === view.definitionRef.version,
  )
  if (
    definition === undefined ||
    !equal(definition, view.definition) ||
    canonicalDigest(definition).slice(7) !== view.definitionRef.digest
  )
    return undefined
  if (declaration.origin.kind !== released.publication.kind) return undefined
  return {
    target: view.target,
    origin: declaration.origin,
    definitionRef: view.definitionRef,
    definition: view.definition,
    enabled: view.enabled,
    ownerRevision: view.ownerRevision,
  }
}

/** Joins only owner-produced facts captured for this exact transaction request. */
export function currentGovernanceTargets(input: {
  capture: SettingsProjectionBinding
  assets: SettingsOwnerProjection
  assetPublications: AssetsPublicationProjection
  standalone: SettingsOwnerProjection
  standalonePublications: StandalonePublicationProjection
  released: readonly GovernancePublication[]
}): GovernanceAdoptionCurrent['targets'] | undefined {
  const { capture } = input
  const sources = [
    input.assets,
    input.assetPublications,
    input.standalone,
    input.standalonePublications,
  ]
  if (sources.some(source => !equal(source.binding, capture))) return undefined
  const targets: GovernanceAdoptionCurrent['targets'] = []
  const seen = new Set<string>()
  for (const target of capture.request.targets) {
    const key = canonicalText(target)
    if (seen.has(key)) return undefined
    seen.add(key)
    const matched = matchTarget(input, target)
    if (matched === undefined || (capture.request.mode === 'runtime' && !matched.enabled))
      return undefined
    targets.push(matched)
  }
  if (
    input.assets.views.length + input.standalone.views.length !== targets.length ||
    input.assetPublications.views.filter(view => view.definitionRef !== null).length +
      input.standalonePublications.views.length !==
      targets.length
  )
    return undefined
  return targets
}

function matchTarget(
  input: Parameters<typeof currentGovernanceTargets>[0],
  target: SettingsOwnerProjection['views'][number]['target'],
) {
  const kind = target.policyId
  if (kind !== 'asset' && kind !== 'independent') return undefined
  const settings = kind === 'asset' ? input.assets : input.standalone
  const publications = kind === 'asset' ? input.assetPublications : input.standalonePublications
  const view = only(settings.views.filter(view => equal(view.target, target)))
  const publication = only(publications.views.filter(view => equal(view.target, target)))
  if (view === undefined || publication === undefined) return undefined
  const released = only(
    input.released.filter(
      release =>
        release.publication.kind === kind &&
        equal(release.publication.reference, publication.publicationRef),
    ),
  )
  return released === undefined ? undefined : targetEvidence(view, publication, released)
}

/** A catalog preserves known disabled targets and identifies unresolved publication owners. */
export function currentGovernanceCatalog(input: Parameters<typeof currentGovernanceTargets>[0]) {
  const sources = [
    input.assets,
    input.assetPublications,
    input.standalone,
    input.standalonePublications,
  ]
  if (sources.some(source => !equal(source.binding, input.capture))) return undefined
  const all = [...input.assets.views, ...input.standalone.views]
  const targets: GovernanceAdoptionCurrent['targets'] = []
  const unavailableOwners = new Set<string>()
  const seen = new Set<string>()
  for (const view of all) {
    const key = canonicalText(view.target)
    if (seen.has(key)) return undefined
    seen.add(key)
    const found = matchTarget(input, view.target)
    if (found === undefined) unavailableOwners.add(unavailableOwner(input, view))
    else targets.push(found)
  }
  if (
    input.assetPublications.views.filter(view => view.definitionRef !== null).length +
      input.standalonePublications.views.length !==
    all.length
  )
    return undefined
  return { targets, unavailableOwners: [...unavailableOwners].sort() }
}

function unavailableOwner(
  input: Parameters<typeof currentGovernanceTargets>[0],
  view: SettingsOwnerProjection['views'][number],
) {
  const owners = new Set(
    input.released
      .filter(release =>
        release.declaration.settings.some(
          definition =>
            definition.providerId === view.definitionRef.providerId &&
            definition.definitionId === view.definitionRef.definitionId,
        ),
      )
      .map(release => release.declaration.reference.ownerId),
  )
  return owners.size === 1
    ? ([...owners][0] ?? 'harness.governance-publications')
    : 'harness.governance-publications'
}
