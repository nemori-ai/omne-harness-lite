import { canonicalText } from '@omne-harness/authorization'
import type {
  GovernanceTargetBinding,
  GovernanceTargetProjection,
} from '@omne-harness/governance-local'
import type { SettingsValueProjection } from '@omne-harness/settings-local'
import type { z } from 'zod'
import { currentGovernanceTargets } from './current-targets.ts'
import { targetCapture, type TargetSnapshot } from './target-snapshot.ts'
import type { permissionSupportSchema } from './permission-support-participant.ts'

type Input = Parameters<typeof currentGovernanceTargets>[0] & {
  binding: GovernanceTargetBinding
  governance: GovernanceTargetProjection
  values: SettingsValueProjection
  supported: z.infer<typeof permissionSupportSchema>
}
const equal = (left: unknown, right: unknown) => canonicalText(left) === canonicalText(right)

function withoutState(
  view: Extract<
    SettingsValueProjection['views'][number],
    { presence: 'absent' | 'present' }
  >['view'],
) {
  const { state: _state, ...target } = view
  return target
}

function exactValues(input: Input) {
  if (!equal(input.values.binding, input.capture) || input.values.views.length !== 1)
    return undefined
  const values = input.values.views[0]!
  const valueTarget = values.presence === 'unavailable' ? values.view : withoutState(values.view)
  const native = [...input.assets.views, ...input.standalone.views]
  return native.length === 1 && equal(native[0], valueTarget) ? values : undefined
}

function publishedDeclaration(input: Input, declaration: TargetSnapshot['declaration']) {
  const publications = [...input.assetPublications.views, ...input.standalonePublications.views]
  if (publications.length !== 1) return false
  return input.released.some(
    released =>
      released.publication.kind === input.binding.target.policyId &&
      equal(released.publication.reference, publications[0]!.publicationRef) &&
      equal(released.declaration, declaration),
  )
}

export function joinTargetSnapshot(input: Input): TargetSnapshot | undefined {
  if (
    !equal(input.governance.binding, input.binding) ||
    !equal(input.capture, targetCapture(input.binding))
  )
    return undefined
  const observation = input.governance.observation
  if (observation.kind !== 'available') return undefined
  if (currentGovernanceTargets(input)?.length !== 1) return undefined
  const values = exactValues(input)
  if (values === undefined || !publishedDeclaration(input, observation.declaration))
    return undefined
  const supported = new Set(input.supported.map(value => canonicalText(value.binding)))
  const enforcementBindings = observation.declaration.enforcementBindings
  if (!enforcementBindings.every(binding => supported.has(canonicalText(binding)))) return undefined
  return {
    binding: input.binding,
    declaration: observation.declaration,
    declarationRevision: observation.declarationRevision,
    adoptionRevision: observation.adoptionRevision,
    declarationSetDigest: observation.declarationSetDigest,
    values,
    enforcementBindings,
  }
}
