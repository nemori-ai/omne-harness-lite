import { canonicalDigest } from '@omne-harness/tool'
import { canonicalText } from '@omne-harness/authorization'
import type { AssetsPublicationProjection } from '@omne-harness/assets-local'
import type { GovernanceAdoptionCurrent } from '@omne-harness/governance-local'
import type {
  SettingsOwnerProjection,
  SettingsProjectionBinding,
  StandalonePublicationProjection,
} from '@omne-harness/settings-local'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
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

function sidesOf(
  input: Parameters<typeof currentGovernanceTargets>[0],
  kind: SettingsOwnerProjection['views'][number]['target']['kind'],
) {
  switch (kind) {
    case 'asset':
      return { settings: input.assets, publications: input.assetPublications }
    case 'independent':
      return { settings: input.standalone, publications: input.standalonePublications }
  }
}

function matchTarget(
  input: Parameters<typeof currentGovernanceTargets>[0],
  target: SettingsOwnerProjection['views'][number]['target'],
) {
  const kind = target.kind
  const { settings, publications } = sidesOf(input, kind)
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

/** Of the independent targets, governance owns those whose definition carries a governance item. */
function governed(view: SettingsOwnerProjection['views'][number]): boolean {
  return view.definition.items.some(item => item.category === 'governance')
}

/** Of the asset targets, governance owns those the tool release published, whatever their items. */
function releasedAssets(input: Parameters<typeof currentGovernanceTargets>[0]) {
  const owned: SettingsOwnerProjection['views'][number][] = []
  for (const view of input.assets.views) {
    const publication = only(
      input.assetPublications.views.filter(p => equal(p.target, view.target)),
    )
    if (publication === undefined) return undefined
    if (publication.publicationRef.source === TOOL_GOVERNANCE_OWNER) owned.push(view)
  }
  return owned
}

export function currentGovernanceCatalog(input: Parameters<typeof currentGovernanceTargets>[0]) {
  const sources = [
    input.assets,
    input.assetPublications,
    input.standalone,
    input.standalonePublications,
  ]
  if (sources.some(source => !equal(source.binding, input.capture))) return undefined
  const assets = releasedAssets(input)
  if (assets === undefined) return undefined
  const all = [...assets, ...input.standalone.views.filter(governed)]
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
  const publications = [
    ...input.assetPublications.views.filter(view => view.definitionRef !== null),
    ...input.standalonePublications.views,
  ].filter(publication => all.some(view => equal(view.target, publication.target)))
  if (publications.length !== all.length) return undefined
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
