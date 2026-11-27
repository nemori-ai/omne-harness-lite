import type { CapabilityId } from './identity.ts'
import type { AssetStanding } from './management.ts'
import type { PublishContent } from './publishing.ts'

export type ImpactLine = Readonly<{
  /** + would appear; - would go away; ~ would change state; ! would not take effect or conflicts */
  mark: '+' | '-' | '~' | '!'
  /** The name of another holding this line is about; null when it is about the one asked. */
  of: string | null
  point: string
  key: string
  says: string
}>

/** What a change of one holding would do. The assets do not know it; the assembly adapts this port. */
export type ChangeImpact = Readonly<{
  of(
    input: Readonly<{
      tenant: string
      capability: CapabilityId
      change: 'publish' | 'enable' | 'disable' | 'remove'
      content?: PublishContent
    }>,
  ): Promise<
    | Readonly<{
        kind: 'changes'
        lines: readonly ImpactLine[]
        loads: string | null
        advice: string | null
      }>
    | Readonly<{ kind: 'unavailable'; reason: string }>
  >
}>

export type PlacedLine = Readonly<{
  point: string
  key: string
  standing: string
  says: string
  side?: 'client' | 'server'
}>
export type ClientLine = Readonly<{ label: string; says: string }>

/** Where a holding is placed now and whether each place is in effect. The assembly adapts this port. */
export type Placement = Readonly<{
  of(input: Readonly<{ tenant: string; capability: CapabilityId }>): Promise<
    | Readonly<{
        kind: 'placed'
        places: readonly PlacedLine[]
        clients: readonly ClientLine[] | null
        advice: string | null
      }>
    | Readonly<{ kind: 'unavailable'; reason: string }>
  >
}>

/** What the owner of a category tells of a change of one of its own, and of where a held one stands. */
export type CategoryEffect = Readonly<{ impact: ChangeImpact; placement: Placement }>

export type HeldEffectPorts = Readonly<{
  point(category: string): string | undefined
  standing(capability: CapabilityId): Promise<AssetStanding | undefined>
}>

function stood(standing: AssetStanding): readonly [string, string] {
  if (standing.kind === 'selected') return ['selected', 'sessions of this tenant get this one']
  if (standing.kind === 'unavailable')
    return ['not known', `the ${standing.layer} layer cannot be read now`]
  const { reason, by } = standing
  return ['not in effect', by === undefined ? reason : `${reason} by ${by}`]
}

/** What the assets tell of a category whose owner tells nothing: one line on its point, as the asset rules stand. */
export function heldEffect(ports: HeldEffectPorts): CategoryEffect {
  const pointless = (category: string) =>
    ({ kind: 'unavailable', reason: `category ${category} has no point now` }) as const
  return {
    impact: {
      async of({ capability, change }) {
        const point = ports.point(capability.category)
        if (point === undefined) return pointless(capability.category)
        const going = change === 'disable' || change === 'remove'
        const says = going
          ? '→ no longer held'
          : '→ held; the asset rules pick which one sessions get'
        const line = {
          mark: going ? '-' : '+',
          of: null,
          point,
          key: capability.name,
          says,
        } as const
        return { kind: 'changes', lines: [line], loads: null, advice: null }
      },
    },
    placement: {
      async of({ capability }) {
        const point = ports.point(capability.category)
        if (point === undefined) return pointless(capability.category)
        const standing = await ports.standing(capability)
        if (standing === undefined)
          return { kind: 'unavailable', reason: 'how this one stands cannot be read now' }
        const [word, says] = stood(standing)
        const places = [{ point, key: capability.name, standing: word, says }]
        return { kind: 'placed', places, clients: null, advice: null }
      },
    },
  }
}
