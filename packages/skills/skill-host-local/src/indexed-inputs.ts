import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { skillBodyContract } from '@omne-harness/skill-contract'
import type { SkillDecisionInputs, SkillLayerInput } from './decisions.ts'

/** What the official and the tenant layer hold on the point of Skills, name to digest, and the registry value it was read at. */
export type HeldNames = Readonly<{ at: unknown; names: ReadonlyMap<string, string> }>

export type LayerInputs<P, S> = Pick<SkillDecisionInputs<P, S>, 'layers'>
export type ListedInputs<P, S> = Pick<SkillDecisionInputs<P, S>, 'layers' | 'identities'>

type Kept = Readonly<{ digest: string; layers: Promise<readonly SkillLayerInput[]> }>

const SKILL = skillBodyContract().category
const UNKNOWN = Object.freeze(fail('unknown' as const))

function identitiesOf(names: ReadonlyMap<string, string>): readonly CapabilityId[] {
  return [...names.keys()].flatMap(name => {
    const made = capabilityId(SKILL, name)
    return made.ok ? [made.id] : []
  })
}

export function indexedInputs<P, S>(
  inner: LayerInputs<P, S>,
  held: () => HeldNames | undefined,
): ListedInputs<P, S> {
  const kept = new Map<string, Kept>()
  const keep = (name: string, at: unknown, digest: string, read: Kept['layers']) => {
    const entry: Kept = { digest, layers: read }
    kept.set(name, entry)
    const forget = () => {
      if (kept.get(name) === entry) kept.delete(name)
    }
    read.then(layers => {
      if (layers.some(layer => layer.state === 'unavailable') || held()?.at !== at) forget()
    }, forget)
    return read
  }
  return {
    async identities() {
      const now = held()
      if (now === undefined) return UNKNOWN
      for (const name of kept.keys()) if (!now.names.has(name)) kept.delete(name)
      return succeed(identitiesOf(now.names))
    },
    layers(access: Access<P>, scope: S, capability: CapabilityId) {
      const now = held()
      if (now === undefined) return inner.layers(access, scope, capability)
      const digest = now.names.get(capability.name)
      if (digest === undefined) return inner.layers(access, scope, capability)
      const known = kept.get(capability.name)
      if (known?.digest === digest) return known.layers
      return keep(capability.name, now.at, digest, inner.layers(access, scope, capability))
    },
  }
}

export function stackedInputs<P, S>(
  lower: ListedInputs<P, S>,
  upper: ListedInputs<P, S>,
): ListedInputs<P, S> {
  return {
    async layers(access, scope, capability) {
      const [below, above] = await Promise.all([
        lower.layers(access, scope, capability),
        upper.layers(access, scope, capability),
      ])
      return [...below, ...above]
    },
    async identities(access, scope): Promise<Outcome<readonly CapabilityId[], 'unknown'>> {
      const [below, above] = await Promise.all([
        lower.identities(access, scope),
        upper.identities(access, scope),
      ])
      if (!('ok' in below) || !('ok' in above)) return UNKNOWN
      const named = new Map(below.ok.map(each => [each.name, each]))
      for (const each of above.ok) named.set(each.name, each)
      return succeed([...named.values()])
    },
  }
}
